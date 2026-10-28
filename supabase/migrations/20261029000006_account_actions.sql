-- Phase 2: account actions (PRD 3, 4, 13, 15). Each runs in one transaction: change, audit
-- event, notification. Service role only; the server action has already checked the caller.

create function public.require_admin(p_admin uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select is_admin from public.profiles where id = p_admin), false) then
    raise exception 'not_admin: Only an Admin can do this.';
  end if;
end;
$$;

-- Onboarding and resubmission (PRD 4): one pending request per user.
create function public.submit_verification(
  p_user uuid, p_full_name text, p_department text, p_year smallint, p_roll text, p_phone text, p_id_path text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.profiles;
begin
  select * into v from public.profiles where id = p_user for update;
  if not found then raise exception 'not_found: Profile not found.'; end if;
  if v.status <> 'pending_verification' then
    raise exception 'invalid_state: Your account is already %.', replace(v.status::text, '_', ' ');
  end if;
  if v.verification_submitted_at is not null then
    raise exception 'duplicate: Your verification is already waiting for review.';
  end if;
  if split_part(p_id_path, '/', 1) <> p_user::text then
    raise exception 'invalid_path: Upload the ID card photo from this account.';
  end if;
  update public.profiles set
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    department = trim(p_department), year = p_year, roll_number = trim(p_roll),
    phone = nullif(trim(p_phone), ''), id_proof_path = p_id_path,
    verification_submitted_at = public.app_now(), status_reason = null, onboarding_complete = true
  where id = p_user;
  perform public.log_event(p_user, 'student', 'VERIFICATION_SUBMITTED', 'profile', p_user::text,
    null, p_user, null, 'pending_verification');
end;
$$;

-- Admin verify / reject (PRD 4). Returns the ID photo path so the caller deletes the file.
create function public.decide_verification(p_admin uuid, p_user uuid, p_approve boolean, p_reason text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v public.profiles;
  v_event bigint;
begin
  perform public.require_admin(p_admin);
  if not p_approve and coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required: Give the student a reason for the rejection.';
  end if;
  select * into v from public.profiles where id = p_user for update;
  if not found or v.status <> 'pending_verification' or v.verification_submitted_at is null then
    raise exception 'invalid_state: This verification request is no longer pending.';
  end if;
  update public.profiles set
    status = case when p_approve then 'verified'::public.account_status else status end,
    status_reason = case when p_approve then null else trim(p_reason) end,
    id_proof_path = null, verification_submitted_at = null
  where id = p_user;
  v_event := public.log_event(p_admin, 'admin',
    case when p_approve then 'VERIFICATION_APPROVED' else 'VERIFICATION_REJECTED' end,
    'profile', p_user::text, null, p_user, 'pending_verification',
    case when p_approve then 'verified' else 'pending_verification' end, p_reason);
  perform public.queue_notifications(v_event);
  return v.id_proof_path;
end;
$$;

-- Grant or revoke Owner/Manager for one organisation (PRD 3, 12). An org's last Manager can be
-- removed only by naming a replacement, who is granted in the same transaction.
create function public.set_membership(
  p_admin uuid, p_user uuid, p_org uuid, p_role public.membership_role, p_grant boolean,
  p_reason text, p_replacement uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb := (select coalesce(jsonb_agg(role order by role), '[]') from public.memberships
                     where user_id = p_user and org_id = p_org);
  v_event bigint;
begin
  perform public.require_admin(p_admin);
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required: A reason is required.'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'not_found: User not found.';
  end if;

  if p_grant then
    insert into public.memberships (user_id, org_id, role, granted_by, reason)
    values (p_user, p_org, p_role, p_admin, trim(p_reason))
    on conflict (user_id, org_id, role) do nothing;
    if not found then raise exception 'duplicate: This user already has that role.'; end if;
  else
    if not public.has_org_role(p_user, p_org, p_role) then
      raise exception 'not_found: This user does not have that role.';
    end if;
    if p_role = 'manager'
       and (select count(*) from public.memberships where org_id = p_org and role = 'manager') = 1 then
      if p_replacement is null or p_replacement = p_user then
        raise exception 'last_manager: Name a replacement before removing the last Manager.';
      end if;
      perform public.set_membership(p_admin, p_replacement, p_org, 'manager', true,
        'Replacement for the last Manager: ' || trim(p_reason));
    end if;
    delete from public.memberships where user_id = p_user and org_id = p_org and role = p_role;
  end if;

  v_event := public.log_event(p_admin, 'admin', case when p_grant then 'ROLE_GRANTED' else 'ROLE_REVOKED' end,
    'membership', p_user::text, p_org, p_user, null, p_role::text, p_reason,
    jsonb_build_object('role', p_role, 'previous', v_before,
      'new', (select coalesce(jsonb_agg(role order by role), '[]') from public.memberships
              where user_id = p_user and org_id = p_org)));
  perform public.queue_notifications(v_event);
end;
$$;

-- Notification rules (PRD 13): Phase 1 booking skeleton plus verification and role events.
create or replace function public.queue_notifications(p_event_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.audit_events;
begin
  select * into e from public.audit_events where id = p_event_id;
  if e.entity_type = 'booking' and e.subject_user_id is not null then
    insert into public.notifications (user_id, type, title, body, link, dedupe_key, urgent)
    values (
      e.subject_user_id,
      e.action,
      case e.to_state
        when 'pending_allocation' then 'Request received: allocation pending'
        when 'pending_approval' then 'Request sent for approval'
        when 'waitlisted' then 'You are on the waitlist'
        when 'offered' then 'A slot is offered to you'
        when 'approved' then 'Booking approved'
        when 'checked_out' then 'Pickup recorded'
        when 'overdue' then 'Your booking is overdue'
        when 'returned' then 'Return recorded'
        when 'under_review' then 'Damage reported: your response is needed'
        when 'completed' then 'Booking completed'
        when 'rejected' then 'Request rejected'
        when 'cancelled' then 'Booking cancelled'
        when 'no_show' then 'No-show recorded'
        when 'expired' then 'Request expired'
        else 'Booking updated'
      end,
      coalesce(e.reason, ''),
      '/student/bookings/' || e.entity_id,
      e.action || ':' || e.entity_id || ':' || e.subject_user_id || ':' || e.id,
      e.to_state in ('offered', 'overdue', 'under_review')
    )
    on conflict (dedupe_key) do nothing;
  elsif e.action in ('VERIFICATION_APPROVED', 'VERIFICATION_REJECTED', 'ROLE_GRANTED', 'ROLE_REVOKED') then
    insert into public.notifications (user_id, type, title, body, link, dedupe_key)
    values (
      e.subject_user_id,
      e.action,
      case e.action
        when 'VERIFICATION_APPROVED' then 'Your account is verified'
        when 'VERIFICATION_REJECTED' then 'Verification not approved'
        when 'ROLE_GRANTED' then 'You are now ' || e.to_state || ' of ' ||
          coalesce((select name from public.organizations where id = e.org_id), 'an organisation')
        else 'Your ' || e.to_state || ' role in ' ||
          coalesce((select name from public.organizations where id = e.org_id), 'an organisation') || ' was removed'
      end,
      coalesce(e.reason, ''),
      case e.action
        when 'VERIFICATION_APPROVED' then '/student'
        when 'VERIFICATION_REJECTED' then '/pending'
        when 'ROLE_GRANTED' then '/' || e.to_state
        else '/student'
      end,
      e.action || ':' || e.entity_id || ':' || e.subject_user_id || ':' || e.id
    )
    on conflict (dedupe_key) do nothing;
  end if;
end;
$$;

-- Recipients mark their own notifications read (that column only).
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "mark own read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke execute on function public.require_admin, public.submit_verification, public.decide_verification,
  public.set_membership from public, anon, authenticated;
grant execute on function public.require_admin, public.submit_verification, public.decide_verification,
  public.set_membership to service_role;
