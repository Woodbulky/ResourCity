-- Phase 1: role helpers, append-only audit log, new-user trigger, profile column locking,
-- booking transition table and transition_booking() (PRD 3, 4, 5, 15).

-- ---------------------------------------------------------------------------
-- Role helpers. The auth.uid() variants are for RLS; has_org_role takes an explicit user
-- so service-role code paths (transition_booking) can check the acting user.
-- ---------------------------------------------------------------------------
create function public.has_org_role(p_user uuid, p_org uuid, p_role public.membership_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships where user_id = p_user and org_id = p_org and role = p_role
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create function public.is_owner_of(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_org_role(auth.uid(), p_org, 'owner');
$$;

create function public.is_manager_of(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_org_role(auth.uid(), p_org, 'manager');
$$;

create function public.is_staff_of(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner_of(p_org) or public.is_manager_of(p_org);
$$;

create function public.current_policy_version_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.policy_versions order by version desc limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Audit log: inserts only through log_event(); no role may update or delete (PRD 15).
-- org_id / policy_version_id are plain columns, not foreign keys, so history never
-- blocks a delete elsewhere (demo reset) and never cascades away.
-- ---------------------------------------------------------------------------
alter table public.audit_events drop constraint audit_events_org_id_fkey;
alter table public.audit_events drop constraint audit_events_policy_version_id_fkey;

revoke insert, update, delete, truncate on public.audit_events from public, anon, authenticated, service_role;

create function public.audit_events_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;
create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function public.audit_events_immutable();

create function public.log_event(
  p_actor_id uuid,
  p_actor_role text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_org_id uuid default null,
  p_subject_user_id uuid default null,
  p_from_state text default null,
  p_to_state text default null,
  p_reason text default null,
  p_metadata jsonb default '{}',
  p_policy_version_id uuid default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  insert into public.audit_events (
    actor_id, actor_role, action, entity_type, entity_id, org_id, subject_user_id,
    from_state, to_state, reason, metadata, policy_version_id
  ) values (
    p_actor_id, p_actor_role, p_action, p_entity_type, p_entity_id, p_org_id, p_subject_user_id,
    p_from_state, p_to_state, nullif(trim(p_reason), ''), coalesce(p_metadata, '{}'),
    coalesce(p_policy_version_id, public.current_policy_version_id())
  ) returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- New users (PRD 4): domain check in the database, profile row from Google metadata.
-- Password sign-ups through the Auth API are refused; seeded demo accounts are inserted
-- directly in SQL (not through the Auth API), so they pass.
-- ---------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_domain text := lower(split_part(new.email, '@', 2));
  v_demo boolean := coalesce((select demo_mode from public.app_settings where id), false);
begin
  if session_user = 'supabase_auth_admin' and coalesce(new.raw_app_meta_data ->> 'provider', '') = 'email' then
    raise exception 'Password sign-up is disabled. Continue with Google.';
  end if;
  if not v_demo and not exists (select 1 from public.allowed_domains where domain = v_domain) then
    raise exception 'Use your @% Google account',
      coalesce((select domain from public.allowed_domains order by domain limit 1), 'college');
  end if;
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profile column locking (PRD 15): users edit only these columns; status/is_admin are server-side.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, department, year, roll_number, phone, onboarding_complete) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Booking state machine (PRD 5). This table is the database copy of
-- src/lib/contracts/booking.ts BOOKING_TRANSITIONS; keep the two identical.
-- from_status 'new' rows are used by the submit path (Phase 3).
-- ---------------------------------------------------------------------------
create table public.booking_transitions (
  from_status text not null,
  event text not null,
  to_status public.booking_status not null,
  actors text[] not null,
  reason_required boolean not null default false,
  primary key (from_status, event)
);

insert into public.booking_transitions (from_status, event, to_status, actors, reason_required) values
  ('new', 'submit_auto', 'approved', '{system}', false),
  ('new', 'submit_approval', 'pending_approval', '{system}', false),
  ('new', 'submit_waitlist', 'waitlisted', '{system}', false),
  ('new', 'submit_batch', 'pending_allocation', '{system}', false),
  ('pending_allocation', 'allocate', 'approved', '{system}', false),
  ('pending_allocation', 'allocate_for_approval', 'pending_approval', '{system}', false),
  ('pending_allocation', 'allocate_waitlist', 'waitlisted', '{system}', false),
  ('pending_allocation', 'allocate_drop', 'rejected', '{system}', true),
  ('pending_allocation', 'cancel', 'cancelled', '{student,owner,manager,admin,system}', true),
  ('pending_approval', 'approve', 'approved', '{owner,manager}', false),
  ('pending_approval', 'reject', 'rejected', '{owner,manager}', true),
  ('pending_approval', 'waitlist', 'waitlisted', '{owner,manager}', true),
  ('pending_approval', 'cancel', 'cancelled', '{student,owner,manager,admin,system}', true),
  ('pending_approval', 'lapse', 'expired', '{system}', true),
  ('waitlisted', 'offer', 'offered', '{system}', false),
  ('waitlisted', 'cancel', 'cancelled', '{student,admin,system}', true),
  ('waitlisted', 'lapse', 'expired', '{system}', true),
  ('offered', 'accept', 'approved', '{student}', false),
  ('offered', 'offer_expire', 'expired', '{system}', true),
  ('offered', 'cancel', 'cancelled', '{student,admin,system}', true),
  ('approved', 'cancel', 'cancelled', '{student,owner,manager,admin,system}', true),
  ('approved', 'handover', 'checked_out', '{owner,manager}', false),
  ('approved', 'door_checkin', 'checked_out', '{student}', false),
  ('approved', 'no_show', 'no_show', '{system}', true),
  ('checked_out', 'mark_overdue', 'overdue', '{system}', false),
  ('checked_out', 'auto_complete', 'completed', '{system}', false),
  ('checked_out', 'return', 'returned', '{owner,manager}', false),
  ('overdue', 'return', 'returned', '{owner,manager}', false),
  ('returned', 'complete', 'completed', '{owner,manager}', false),
  ('returned', 'report_damage', 'under_review', '{owner,manager}', true),
  ('under_review', 'decide_dispute', 'completed', '{manager,admin}', true);

-- Statuses in which a booking's credit hold is on the ledger.
create function public.booking_holds_credits(p_status public.booking_status) returns boolean
language sql immutable set search_path = '' as $$
  select p_status in ('approved', 'checked_out', 'overdue', 'returned', 'under_review');
$$;

-- Notification rules (PRD 13). Phase 1 skeleton: the booking's student hears about every
-- transition. Phase 4 replaces the body with the full Section 13 matrix.
create function public.queue_notifications(p_event_id bigint) returns void
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
  end if;
end;
$$;

-- The only way a booking changes status (PRD 0, 5): validate → update → ledger → audit → notify,
-- in one transaction. Called by src/lib/server/booking.ts transitionBooking() with the service role.
create function public.transition_booking(
  p_booking_id uuid,
  p_event text,
  p_actor_id uuid,
  p_actor_role text,
  p_reason text default null,
  p_payload jsonb default '{}'
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  t public.booking_transitions;
  v_org uuid;
  v_now timestamptz := public.app_now();
  v_reason text := nullif(trim(p_reason), '');
  v_payload jsonb := coalesce(p_payload, '{}');
  v_charge integer;
  v_available integer;
  v_event_id bigint;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking_not_found: %', p_booking_id;
  end if;
  select org_id into v_org from public.resources where id = b.resource_id;

  select * into t from public.booking_transitions where from_status = b.status::text and event = p_event;
  if not found then
    raise exception 'invalid_transition: % cannot %', b.status, p_event;
  end if;
  if not (p_actor_role = any (t.actors)) then
    raise exception 'actor_not_allowed: % cannot % a % booking', p_actor_role, p_event, b.status;
  end if;
  if t.reason_required and v_reason is null then
    raise exception 'reason_required: % needs a reason', p_event;
  end if;

  -- The acting user must actually hold the role they act in.
  if p_actor_role = 'system' and p_actor_id is not null then
    raise exception 'actor_mismatch: system actions have no actor id';
  elsif p_actor_role = 'student' and p_actor_id is distinct from b.user_id then
    raise exception 'actor_mismatch: not this booking''s student';
  elsif p_actor_role = 'owner' and not public.has_org_role(p_actor_id, v_org, 'owner') then
    raise exception 'actor_mismatch: not an owner of this organisation';
  elsif p_actor_role = 'manager' and not public.has_org_role(p_actor_id, v_org, 'manager') then
    raise exception 'actor_mismatch: not a manager of this organisation';
  elsif p_actor_role = 'admin' and not coalesce((select is_admin from public.profiles where id = p_actor_id), false) then
    raise exception 'actor_mismatch: not an admin';
  end if;
  if p_event in ('approve', 'reject', 'waitlist') and b.approver_role = 'manager' and p_actor_role = 'owner' then
    raise exception 'actor_not_allowed: this request needs a Manager';
  end if;

  -- Fields the caller may set alongside the transition (computed by src/lib/domain).
  b.unit_id := coalesce((v_payload ->> 'unit_id')::uuid, b.unit_id);
  b.grace_minutes := coalesce((v_payload ->> 'grace_minutes')::integer, b.grace_minutes);
  b.waitlist_position := case when t.to_status = 'waitlisted'
    then coalesce((v_payload ->> 'waitlist_position')::integer, b.waitlist_position) else null end;
  b.offer_expires_at := case when t.to_status = 'offered'
    then (v_payload ->> 'offer_expires_at')::timestamptz else null end;
  b.priority_score := coalesce((v_payload ->> 'priority_score')::numeric, b.priority_score);
  b.score_breakdown := coalesce(v_payload -> 'score_breakdown', b.score_breakdown);
  b.allocation_rule := coalesce(v_payload ->> 'allocation_rule', b.allocation_rule);

  -- Credit ledger (PRD 9). Holds are negative deltas; available = sum(delta).
  if t.to_status = 'approved' and b.credit_hold > 0 then
    select coalesce(sum(delta), 0) into v_available from public.credit_ledger where user_id = b.user_id;
    if v_available < b.credit_hold then
      raise exception 'insufficient_credits: needs %, has % available', b.credit_hold, v_available;
    end if;
    insert into public.credit_ledger (user_id, delta, kind, booking_id, note)
    values (b.user_id, -b.credit_hold, 'hold', b.id, 'Hold for booking');
  elsif public.booking_holds_credits(b.status) and not public.booking_holds_credits(t.to_status) and b.credit_hold > 0 then
    insert into public.credit_ledger (user_id, delta, kind, booking_id, note)
    values (b.user_id, b.credit_hold, 'release', b.id, 'Hold released');
    if t.to_status = 'completed' then
      v_charge := coalesce((v_payload ->> 'charge')::integer, b.credit_hold);
      if v_charge < 0 or v_charge > b.credit_hold then
        raise exception 'invalid_charge: % outside 0..%', v_charge, b.credit_hold;
      end if;
      if v_charge > 0 then
        insert into public.credit_ledger (user_id, delta, kind, booking_id, note)
        values (b.user_id, -v_charge, 'charge', b.id, 'Charged for actual use');
      end if;
      b.credit_charged := v_charge;
    elsif t.to_status = 'no_show' and coalesce((v_payload ->> 'forfeit')::boolean, false) then
      insert into public.credit_ledger (user_id, delta, kind, booking_id, note)
      values (b.user_id, -b.credit_hold, 'forfeit', b.id, 'Hold forfeited: no-show limit exceeded');
      b.credit_charged := b.credit_hold;
    end if;
  end if;

  if p_event in ('handover', 'door_checkin') then
    b.picked_up_at := v_now;
  elsif p_event = 'return' then
    b.returned_at := v_now;
  elsif p_event = 'auto_complete' then
    b.returned_at := coalesce(b.returned_at, b.end_at);
  end if;
  if p_actor_role in ('owner', 'manager', 'admin') and p_event in ('approve', 'reject', 'waitlist', 'decide_dispute') then
    b.decided_by := p_actor_id;
  end if;

  update public.bookings set
    status = t.to_status,
    status_reason = coalesce(v_reason, status_reason),
    unit_id = b.unit_id,
    grace_minutes = b.grace_minutes,
    waitlist_position = b.waitlist_position,
    offer_expires_at = b.offer_expires_at,
    priority_score = b.priority_score,
    score_breakdown = b.score_breakdown,
    allocation_rule = b.allocation_rule,
    credit_charged = b.credit_charged,
    picked_up_at = b.picked_up_at,
    returned_at = b.returned_at,
    decided_by = b.decided_by,
    updated_at = v_now
  where id = b.id
  returning * into b;

  v_event_id := public.log_event(
    p_actor_id, p_actor_role, 'BOOKING_' || upper(p_event), 'booking', b.id::text, v_org, b.user_id,
    t.from_status, t.to_status::text, v_reason, v_payload, b.policy_version_id
  );
  perform public.queue_notifications(v_event_id);
  return b;
end;
$$;

-- Privileged functions run only from the server (service role).
revoke execute on function public.log_event, public.queue_notifications, public.transition_booking
  from public, anon, authenticated;
grant execute on function public.log_event, public.queue_notifications, public.transition_booking
  to service_role;
