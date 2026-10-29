-- Phase 5: trust workflows (PRD 8, 11, 13). Damage cases with the student's response and
-- conflict-of-interest routing, penalty decisions and no-show appeals, Manager overrides, safety
-- incidents, resource status changes (unsafe / maintenance / restore) and training-certificate
-- verification. Each runs in one transaction with its audit event and notifications. Service role
-- only; the server actions check the caller first and these check again.

-- ---------------------------------------------------------------------------- offer_next
-- Unchanged except that a resource that is not active offers nothing (an unsafe or paused
-- resource cancels its bookings; those cancellations must not offer the slot to the waitlist).
create or replace function public.offer_next(p_resource uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  w public.bookings;
  v_now timestamptz := public.app_now();
  pol jsonb := public.policy_values();
  v_window int;
  v_expires timestamptz;
  v_grace int;
  v_count int := 0;
begin
  if (select status from public.resources where id = p_resource) <> 'active' then
    return 0;
  end if;
  for w in
    select * from public.bookings
    where resource_id = p_resource and status = 'waitlisted' and end_at > v_now + interval '15 minutes'
    order by start_at, waitlist_position nulls last, created_at
  loop
    continue when public.free_units(p_resource, w.start_at, w.end_at) <= (
      select count(*) from public.bookings p
      where p.resource_id = p_resource and p.status = 'pending_approval'
        and tstzrange(p.start_at, p.end_at, '[)') && tstzrange(w.start_at, w.end_at, '[)'));
    v_window := case
      when extract(epoch from w.end_at - w.start_at) / 60 <= (pol #>> '{offer_windows,short_slot_max_minutes}')::numeric
      then (pol #>> '{offer_windows,short_minutes}')::int
      else (pol #>> '{offer_windows,long_minutes}')::int end;
    v_grace := coalesce(w.grace_minutes, 15);
    v_expires := least(v_now + make_interval(mins => v_window), w.end_at - interval '15 minutes');
    if v_expires > w.start_at + make_interval(mins => v_grace) then
      v_grace := least(
        ceil(extract(epoch from v_expires - w.start_at) / 60)::int + v_grace,
        floor(extract(epoch from w.end_at - w.start_at) / 60)::int);
    end if;
    perform public.transition_booking(w.id, 'offer', null, 'system', null,
      jsonb_build_object('offer_expires_at', v_expires, 'grace_minutes', v_grace));
    v_count := v_count + 1;
  end loop;

  update public.bookings x set waitlist_position = r.rn
  from (
    select id, row_number() over (partition by start_at, end_at order by waitlist_position nulls last, created_at) as rn
    from public.bookings where resource_id = p_resource and status = 'waitlisted'
  ) r
  where x.id = r.id and x.waitlist_position is distinct from r.rn;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------- notifications (PRD 13)
-- Phase 4 matrix plus damage cases, penalty decisions and appeals, incidents, resource status and
-- badges. Links go to each recipient's own page; nobody hears about another person's private case.
create or replace function public.queue_notifications(p_event_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.audit_events;
  b public.bookings;
  v_name text;
  v_ev text;
  v_key text;
  v_tail text;
  v_body text;
  v_staff text;
  v_level int;
  v_to uuid;
begin
  select * into e from public.audit_events where id = p_event_id;
  v_key := e.action || ':' || e.entity_id || ':' || e.id;
  v_body := coalesce(e.reason, '');

  if e.entity_type = 'booking' then
    select * into b from public.bookings where id = e.entity_id::uuid;
    select name into v_name from public.resources where id = b.resource_id;
    v_tail := '/bookings/' || e.entity_id;

    if e.action like 'BOOKING\_%' and e.to_state is not null then
      v_ev := lower(substr(e.action, 9));
      perform public.notify(e.subject_user_id, e.action,
        case e.to_state
          when 'pending_allocation' then 'Request received: allocation pending'
          when 'pending_approval' then 'Request sent for approval'
          when 'waitlisted' then 'You are on the waitlist'
          when 'offered' then 'A slot is offered to you: accept by ' || public.ist(b.offer_expires_at)
          when 'approved' then 'Booking approved'
          when 'checked_out' then 'Pickup recorded'
          when 'overdue' then 'Your booking is overdue'
          when 'returned' then 'Return recorded'
          when 'under_review' then 'Damage reported: your response is needed'
          when 'completed' then case when v_ev = 'decide_dispute' then 'Damage case decided' else 'Booking completed' end
          when 'rejected' then 'Request rejected'
          when 'cancelled' then 'Booking cancelled'
          when 'no_show' then 'No-show recorded'
          when 'expired' then 'Request expired'
          else 'Booking updated'
        end || ' · ' || v_name,
        v_body, '/student' || v_tail, v_key, e.to_state in ('offered', 'overdue', 'under_review'));

      v_staff := case
        when v_ev like 'submit%' then 'New request'
        when v_ev like 'allocate%' then 'Batch allocation result'
        when v_ev = 'approve' then 'Approved'
        when v_ev = 'reject' then 'Rejected'
        when v_ev = 'waitlist' then 'Waitlisted'
        when v_ev = 'accept' then 'Waitlist offer accepted'
        when v_ev = 'cancel' and e.from_state = 'approved' then 'Booking cancelled'
        when v_ev = 'no_show' then 'No-show recorded'
        when v_ev = 'mark_overdue' then 'Overdue'
        when v_ev = 'report_damage' then 'Damage reported'
        when v_ev = 'decide_dispute' then 'Dispute decided'
      end;
      if v_staff is not null then
        perform public.notify_staff(e.org_id, 'owner', e.actor_id, e.action, v_staff || ': ' || v_name, v_body, v_tail, v_key);
        if (b.approver_role = 'manager' and (v_ev like 'submit%' or v_ev like 'allocate%' or v_ev in ('approve', 'reject', 'waitlist')))
          or v_ev = 'decide_dispute' then
          perform public.notify_staff(e.org_id, 'manager', e.actor_id, e.action, v_staff || ': ' || v_name, v_body, v_tail, v_key);
        end if;
      end if;

    elsif e.action = 'APPROVAL_ESCALATED' then
      if (e.metadata ->> 'level')::int = 1 then
        perform public.notify_staff(e.org_id, 'manager', null, e.action, 'Escalated to you: ' || v_name, v_body, v_tail, v_key, true);
      else
        perform public.notify_admins(e.action, 'Escalation: no Manager decision on ' || v_name, v_body, '/admin', v_key, true);
      end if;

    elsif e.action = 'OVERDUE_ALERT' then
      v_level := (e.metadata ->> 'level')::int;
      if v_level = 1 then
        perform public.notify(e.subject_user_id, e.action, 'Please return ' || v_name, v_body, '/student' || v_tail, v_key, true);
        perform public.notify_staff(e.org_id, 'owner', null, e.action, 'Still not returned: ' || v_name, v_body, v_tail, v_key);
      else
        perform public.notify_staff(e.org_id, 'manager', null, e.action,
          case when v_level = 3 then 'Overdue 24 h: ' else 'Overdue 6 h: ' end || v_name, v_body, v_tail, v_key, v_level = 3);
      end if;

    elsif e.action like 'EXTENSION\_%' then
      if e.action <> 'EXTENSION_REQUESTED' then
        perform public.notify(e.subject_user_id, e.action,
          case e.action when 'EXTENSION_APPROVED' then 'Extension approved' else 'Extension declined' end || ' · ' || v_name,
          v_body, '/student' || v_tail, v_key);
      end if;
      v_staff := case e.action when 'EXTENSION_REQUESTED' then 'Extension requested: ' when 'EXTENSION_APPROVED' then 'Extension approved: ' else 'Extension declined: ' end;
      perform public.notify_staff(e.org_id, 'owner', e.actor_id, e.action, v_staff || v_name, v_body, v_tail, v_key);
      if b.approver_role = 'manager' then
        perform public.notify_staff(e.org_id, 'manager', e.actor_id, e.action, v_staff || v_name, v_body, v_tail, v_key);
      end if;

    elsif e.action = 'PENALTY_PROPOSED' then
      perform public.notify(e.subject_user_id, e.action, 'Late penalty proposed · ' || v_name, v_body, '/student' || v_tail, v_key);
      perform public.notify_staff(e.org_id, 'owner', null, e.action, 'Late penalty proposed: ' || v_name, v_body, v_tail, v_key);
      perform public.notify_staff(e.org_id, 'manager', null, e.action, 'Penalty to confirm: ' || v_name, v_body, v_tail, v_key);

    elsif e.action = 'PENALTY_DECIDED' then
      perform public.notify(e.subject_user_id, e.action, 'Penalty decision · ' || v_name, v_body, '/student' || v_tail, v_key);
      perform public.notify_staff(e.org_id, 'owner', e.actor_id, e.action, 'Penalty ' || e.to_state || ': ' || v_name, v_body, v_tail, v_key);
      perform public.notify_staff(e.org_id, 'manager', e.actor_id, e.action, 'Penalty ' || e.to_state || ': ' || v_name, v_body, v_tail, v_key);

    elsif e.action in ('PENALTY_APPEALED', 'PENALTY_EXPLAINED') then
      perform public.notify_staff(e.org_id, 'manager', null, e.action,
        case e.action when 'PENALTY_APPEALED' then 'No-show appeal: ' else 'Student explained a penalty: ' end || v_name,
        v_body, v_tail, v_key, e.action = 'PENALTY_APPEALED');

    elsif e.action in ('DAMAGE_CASE_ASSIGNED', 'DAMAGE_RESPONSE_SUBMITTED') then
      v_to := (e.metadata ->> 'assigned_to')::uuid;
      perform public.notify(v_to, e.action,
        case e.action when 'DAMAGE_CASE_ASSIGNED' then 'Damage case to decide: ' else 'Student responded: ' end || v_name, v_body,
        case when coalesce((e.metadata ->> 'admin')::boolean, false) then '/admin' else '/manager' end || v_tail, v_key,
        e.action = 'DAMAGE_CASE_ASSIGNED');
      if e.action = 'DAMAGE_RESPONSE_SUBMITTED' then
        perform public.notify_staff(e.org_id, 'owner', null, e.action, 'Student responded to the damage report: ' || v_name, v_body, v_tail, v_key);
      end if;

    elsif e.action = 'DAMAGE_MORE_EVIDENCE' then
      perform public.notify(e.subject_user_id, e.action, 'More evidence requested · ' || v_name, v_body, '/student' || v_tail, v_key, true);

    elsif e.action = 'OWNER_NOT_PRESENT' then
      perform public.notify_staff(e.org_id, 'owner', null, e.action, 'Owner not present at pickup: ' || v_name, v_body, v_tail, v_key);
      perform public.notify_staff(e.org_id, 'manager', null, e.action, 'Owner not present at pickup: ' || v_name, v_body, v_tail, v_key);
    end if;

  elsif e.entity_type = 'incident' then
    select r.name into v_name from public.incidents i join public.resources r on r.id = i.resource_id where i.id = e.entity_id::uuid;
    if e.action = 'INCIDENT_REPORTED' then
      perform public.notify_staff(e.org_id, 'owner', e.actor_id, e.action, 'Safety incident reported: ' || v_name, v_body, '', v_key);
      perform public.notify_staff(e.org_id, 'manager', e.actor_id, e.action, 'Safety incident: ' || v_name, v_body,
        '/cases#incident-' || e.entity_id, v_key, true);
      if e.metadata ->> 'severity' = 'high' then
        perform public.notify_admins(e.action, 'High-severity incident: ' || v_name, v_body, '/admin/cases', v_key, true);
      end if;
      if e.subject_user_id is distinct from e.actor_id then
        perform public.notify(e.subject_user_id, e.action, 'A safety incident was reported on your booking · ' || v_name, v_body,
          '/student', v_key);
      end if;
    else
      perform public.notify((select reported_by from public.incidents where id = e.entity_id::uuid), e.action,
        'Incident ' || replace(e.to_state, '_', ' ') || ' · ' || v_name, v_body, null, v_key);
    end if;

  elsif e.action = 'RESOURCE_STATUS_CHANGED' then
    select name into v_name from public.resources where id = e.entity_id::uuid;
    perform public.notify_staff(e.org_id, 'owner', e.actor_id, e.action,
      v_name || ' is now ' || replace(e.to_state, '_', ' '), v_body, '/resources', v_key, e.to_state = 'unsafe');
    perform public.notify_staff(e.org_id, 'manager', e.actor_id, e.action,
      v_name || ' is now ' || replace(e.to_state, '_', ' '), v_body, '/cases', v_key, e.to_state = 'unsafe');

  elsif e.action in ('BADGE_SUBMITTED', 'BADGE_VERIFIED', 'BADGE_REJECTED') then
    select bt.name into v_name from public.user_badges ub join public.badge_types bt on bt.id = ub.badge_type_id
    where ub.id = e.entity_id::uuid;
    if e.action = 'BADGE_SUBMITTED' then
      perform public.notify_staff(e.org_id, 'owner', null, e.action, 'Certificate to verify: ' || v_name, v_body, '/badges', v_key);
    else
      perform public.notify(e.subject_user_id, e.action,
        case e.action when 'BADGE_VERIFIED' then v_name || ' verified' else v_name || ' certificate not accepted' end,
        v_body, '/student/wallet#badges', v_key);
    end if;

  elsif e.action in ('VERIFICATION_APPROVED', 'VERIFICATION_REJECTED', 'ROLE_GRANTED', 'ROLE_REVOKED') then
    perform public.notify(
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
      v_body,
      case e.action
        when 'VERIFICATION_APPROVED' then '/student'
        when 'VERIFICATION_REJECTED' then '/pending'
        when 'ROLE_GRANTED' then '/' || e.to_state
        else '/student'
      end,
      v_key);

  elsif e.action = 'EMERGENCY_CREDITS_REQUESTED' then
    perform public.notify_admins(e.action, 'Emergency credits requested', v_body, '/admin', v_key,
      coalesce(e.metadata ->> 'urgency', '') = 'high');

  elsif e.action = 'EMERGENCY_CREDITS_DECIDED' then
    perform public.notify(e.subject_user_id, e.action,
      case e.to_state when 'approved' then 'Emergency credits granted'
        when 'partial' then 'Emergency credits partly granted' else 'Emergency credits not granted' end,
      v_body, '/student/wallet', v_key);

  elsif e.action = 'POLICY_CHANGED' then
    insert into public.notifications (user_id, type, title, body, link, dedupe_key)
    select distinct m.user_id, e.action, 'Campus policy updated to ' || e.to_state, v_body, null, v_key || ':' || m.user_id
    from public.memberships m
    on conflict (dedupe_key) do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------- resource status (PRD 6, 11)
-- Unsafe is set and cleared only by a Manager or Admin (the incident flow); Owners may pause, set
-- maintenance and reactivate their own resources. Leaving "active" cancels every booking that has
-- not started being used (credits released, students notified); borrowed items are still returned.
create function public.set_resource_status(
  p_resource uuid, p_actor uuid, p_role text, p_status public.resource_status, p_reason text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r public.resources;
  x record;
  n int := 0;
begin
  select * into r from public.resources where id = p_resource for update;
  if not found then raise exception 'not_found: Resource not found.'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'reason_required: Give a reason.'; end if;
  if r.status = p_status then raise exception 'no_change: The resource is already %.', replace(p_status::text, '_', ' '); end if;
  if p_role = 'manager' then
    if not public.has_org_role(p_actor, r.org_id, 'manager') then raise exception 'actor_mismatch: not a manager of this organisation'; end if;
  elsif p_role = 'admin' then
    perform public.require_admin(p_actor);
  elsif p_role = 'owner' then
    if not public.has_org_role(p_actor, r.org_id, 'owner') then raise exception 'actor_mismatch: not an owner of this organisation'; end if;
    if p_status = 'unsafe' or r.status = 'unsafe' then
      raise exception 'actor_not_allowed: Only a Manager marks a resource unsafe or confirms it is safe again. Report an incident instead.';
    end if;
  else
    raise exception 'actor_not_allowed: % cannot change a resource', p_role;
  end if;

  update public.resources set status = p_status, updated_at = public.app_now() where id = p_resource;
  perform public.queue_notifications(public.log_event(
    p_actor, p_role, 'RESOURCE_STATUS_CHANGED', 'resource', p_resource::text, r.org_id, null,
    r.status::text, p_status::text, trim(p_reason)));

  if p_status <> 'active' then
    for x in
      select id from public.bookings
      where resource_id = p_resource and end_at > public.app_now()
        and status in ('pending_allocation', 'pending_approval', 'waitlisted', 'offered', 'approved')
      order by start_at
    loop
      perform public.transition_booking(x.id, 'cancel', null, 'system',
        format('%s was marked %s: %s. Any held credits are released.', r.name, replace(p_status::text, '_', ' '), trim(p_reason)));
      n := n + 1;
    end loop;
  else
    perform public.offer_next(p_resource);
  end if;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------- damage cases (PRD 11)
-- Raise damage at return. The case goes to a Manager of the organisation other than the reporter
-- (the one with the fewest open cases); if there is none, to an Admin (conflict of interest).
create function public.report_damage(
  p_booking uuid, p_actor uuid, p_role text, p_description text, p_severity public.damage_severity, p_ai_flags jsonb
) returns public.damage_cases
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  v_org uuid;
  v_to uuid;
  v_admin boolean := false;
  v_hours numeric;
  c public.damage_cases;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception 'not_found: Booking not found.'; end if;
  select org_id into v_org from public.resources where id = b.resource_id;
  if coalesce(length(trim(p_description)), 0) < 10 then
    raise exception 'reason_required: Describe the damage in a sentence.';
  end if;

  select m.user_id into v_to from public.memberships m
  where m.org_id = v_org and m.role = 'manager' and m.user_id <> p_actor
  order by (select count(*) from public.damage_cases d where d.assigned_to = m.user_id and d.status <> 'decided'), m.created_at
  limit 1;
  if v_to is null then
    select p.id into v_to from public.profiles p where p.is_admin and p.id <> p_actor order by p.created_at limit 1;
    v_admin := true;
  end if;
  if v_to is null then raise exception 'no_decider: Nobody other than you can decide this case.'; end if;

  -- The transition checks the actor's role and that the booking is returned.
  perform public.transition_booking(p_booking, 'report_damage', p_actor, p_role, trim(p_description),
    jsonb_build_object('severity', p_severity));

  v_hours := coalesce((public.policy_values(b.policy_version_id) ->> 'dispute_response_hours')::numeric, 48);
  insert into public.damage_cases (booking_id, reported_by, description, severity, ai_flags, response_deadline, assigned_to)
  values (p_booking, p_actor, trim(p_description), p_severity, p_ai_flags,
    public.app_now() + v_hours * interval '1 hour', v_to)
  returning * into c;

  perform public.queue_notifications(public.log_event(
    null, 'system', 'DAMAGE_CASE_ASSIGNED', 'booking', p_booking::text, v_org, b.user_id, null, 'awaiting_response',
    case when v_admin then 'Conflict of interest: no other Manager in this organisation, so an Admin decides.'
      else 'Assigned to a Manager who did not file the report.' end,
    jsonb_build_object('case_id', c.id, 'assigned_to', v_to, 'admin', v_admin, 'response_hours', v_hours),
    b.policy_version_id));
  return c;
end;
$$;

-- The student's response (text and photos under condition-photos/{booking}/) within the window.
create function public.respond_damage(p_user uuid, p_case uuid, p_text text, p_photos text[]) returns public.damage_cases
language plpgsql security definer set search_path = '' as $$
declare
  c public.damage_cases;
  b public.bookings;
  v_path text;
begin
  select * into c from public.damage_cases where id = p_case for update;
  if not found then raise exception 'not_found: Case not found.'; end if;
  select * into b from public.bookings where id = c.booking_id;
  if b.user_id <> p_user then raise exception 'not_found: Case not found.'; end if;
  if c.status not in ('awaiting_response', 'more_evidence_requested') then
    raise exception 'invalid_state: This case is not waiting for your response.';
  end if;
  if public.app_now() > c.response_deadline then
    raise exception 'too_late: The response window closed %.', public.ist(c.response_deadline);
  end if;
  if coalesce(length(trim(p_text)), 0) < 10 then raise exception 'reason_required: Write your side in a sentence or two.'; end if;
  foreach v_path in array coalesce(p_photos, '{}') loop
    if split_part(v_path, '/', 1) <> b.id::text then raise exception 'invalid_path: Photos must be uploaded for this booking.'; end if;
  end loop;

  update public.damage_cases set
    student_response = case when c.student_response is null then trim(p_text)
      else c.student_response || E'\n\nFurther evidence: ' || trim(p_text) end,
    student_response_photos = student_response_photos || coalesce(p_photos, '{}'),
    responded_at = public.app_now(),
    status = 'ready_for_decision'
  where id = p_case returning * into c;

  perform public.queue_notifications(public.log_event(
    p_user, 'student', 'DAMAGE_RESPONSE_SUBMITTED', 'booking', b.id::text,
    (select org_id from public.resources where id = b.resource_id), p_user, null, 'ready_for_decision', trim(p_text),
    jsonb_build_object('case_id', c.id, 'assigned_to', c.assigned_to, 'photos', coalesce(array_length(p_photos, 1), 0),
      'admin', coalesce((select is_admin from public.profiles where id = c.assigned_to), false)),
    b.policy_version_id));
  return c;
end;
$$;

-- The decision (PRD 11): whoever filed the report never decides; an Admin decides only cases
-- assigned to an Admin. 'more_evidence' reopens the response window; every other outcome closes
-- the case, completes the booking (p_charge = credits for actual use, computed by the domain) and
-- applies the outcome: a confirmed damage penalty, or a restriction in this organisation.
create function public.decide_damage(
  p_case uuid, p_actor uuid, p_role text, p_outcome text, p_reason text,
  p_credits integer, p_restriction_days integer, p_charge integer, p_maintenance boolean
) returns public.damage_cases
language plpgsql security definer set search_path = '' as $$
declare
  c public.damage_cases;
  b public.bookings;
  v_org uuid;
  v_now timestamptz := public.app_now();
  v_hours numeric;
  v_outcome public.damage_outcome;
begin
  select * into c from public.damage_cases where id = p_case for update;
  if not found then raise exception 'not_found: Case not found.'; end if;
  select * into b from public.bookings where id = c.booking_id;
  select org_id into v_org from public.resources where id = b.resource_id;
  if c.status = 'decided' then raise exception 'invalid_state: This case is already decided.'; end if;
  if p_actor = c.reported_by then
    raise exception 'conflict_of_interest: You filed this report, so another Manager decides it.';
  end if;
  if p_role = 'manager' then
    if not public.has_org_role(p_actor, v_org, 'manager') then raise exception 'actor_mismatch: not a manager of this organisation'; end if;
  elsif p_role = 'admin' then
    perform public.require_admin(p_actor);
    if not coalesce((select is_admin from public.profiles where id = c.assigned_to), false) then
      raise exception 'actor_not_allowed: Admins decide only conflict-of-interest cases.';
    end if;
  else
    raise exception 'actor_not_allowed: Only a Manager decides damage cases.';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'reason_required: Give the reason for your decision.'; end if;
  if c.status in ('awaiting_response', 'more_evidence_requested') and v_now <= c.response_deadline then
    raise exception 'too_early: The student can respond until %.', public.ist(c.response_deadline);
  end if;

  if p_outcome = 'more_evidence' then
    v_hours := coalesce((public.policy_values(b.policy_version_id) ->> 'dispute_response_hours')::numeric, 48);
    update public.damage_cases set status = 'more_evidence_requested', response_deadline = v_now + v_hours * interval '1 hour'
    where id = p_case returning * into c;
    perform public.queue_notifications(public.log_event(
      p_actor, p_role, 'DAMAGE_MORE_EVIDENCE', 'booking', b.id::text, v_org, b.user_id, 'ready_for_decision',
      'more_evidence_requested', trim(p_reason), jsonb_build_object('case_id', c.id, 'until', c.response_deadline),
      b.policy_version_id));
    return c;
  end if;

  v_outcome := p_outcome::public.damage_outcome; -- raises on an unknown outcome
  if v_outcome = 'credit_deduction' and (p_credits is null or p_credits < 1 or p_credits > 1000) then
    raise exception 'invalid_amount: Deduct between 1 and 1000 credits.';
  end if;
  if v_outcome = 'restriction' and (p_restriction_days is null or p_restriction_days < 1 or p_restriction_days > 180) then
    raise exception 'invalid_amount: Restrict for 1 to 180 days.';
  end if;

  update public.damage_cases set
    status = 'decided', outcome = v_outcome, decision_reason = trim(p_reason), decided_by = p_actor, decided_at = v_now,
    credits_deducted = case when v_outcome = 'credit_deduction' then p_credits end,
    restriction_until = case when v_outcome = 'restriction' then v_now + make_interval(days => p_restriction_days) end
  where id = p_case returning * into c;

  perform public.transition_booking(b.id, 'decide_dispute', p_actor, p_role,
    format('%s: %s', initcap(replace(v_outcome::text, '_', ' ')), trim(p_reason)),
    jsonb_build_object('charge', p_charge, 'case_id', c.id, 'outcome', v_outcome, 'credits_deducted', c.credits_deducted,
      'restriction_until', c.restriction_until,
      'student_responded', c.responded_at is not null));

  if v_outcome = 'credit_deduction' then
    insert into public.penalties (booking_id, user_id, kind, proposed_amount, final_amount, status, policy_version_id, decided_by, reason, decided_at)
    values (b.id, b.user_id, 'damage', p_credits, p_credits, 'confirmed', b.policy_version_id, p_actor, trim(p_reason), v_now);
    insert into public.credit_ledger (user_id, delta, kind, booking_id, note)
    values (b.user_id, -p_credits, 'penalty', b.id, 'Damage deduction decided by a Manager');
  elsif v_outcome = 'restriction' then
    insert into public.org_restrictions (user_id, org_id, until, reason, created_by)
    values (b.user_id, v_org, c.restriction_until, 'Damage case: ' || trim(p_reason), p_actor);
  end if;
  if coalesce(p_maintenance, false) then
    perform public.set_resource_status(b.resource_id, p_actor, p_role, 'under_maintenance', 'Damage case: ' || trim(p_reason));
  end if;
  return c;
end;
$$;

-- ---------------------------------------------------------------------------- penalties (PRD 11)
-- A Manager confirms, reduces or waives a proposed penalty (nothing is deducted before), or decides
-- an appeal of an auto-applied no-show forfeit (upheld, reduced or reversed, refunding the rest).
create function public.decide_penalty(
  p_penalty uuid, p_actor uuid, p_decision text, p_amount integer, p_reason text
) returns public.penalties
language plpgsql security definer set search_path = '' as $$
declare
  p public.penalties;
  b public.bookings;
  v_org uuid;
  v_final int;
  v_status public.penalty_status;
  v_from text;
begin
  select * into p from public.penalties where id = p_penalty for update;
  if not found then raise exception 'not_found: Penalty not found.'; end if;
  select * into b from public.bookings where id = p.booking_id;
  select org_id into v_org from public.resources where id = b.resource_id;
  if not public.has_org_role(p_actor, v_org, 'manager') then raise exception 'actor_mismatch: not a manager of this organisation'; end if;
  if p_actor = p.user_id then raise exception 'conflict_of_interest: You cannot decide your own penalty.'; end if;
  if p.status not in ('proposed', 'appealed') then raise exception 'invalid_state: This penalty is already decided.'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'reason_required: Give the student a reason.'; end if;
  v_from := p.status::text;

  -- What the student finally pays: the proposal for a late return, the forfeit for an appeal.
  v_final := case p_decision
    when 'confirm' then coalesce(p.final_amount, p.proposed_amount)
    when 'waive' then 0
    when 'reduce' then p_amount end;
  if p_decision not in ('confirm', 'reduce', 'waive') then raise exception 'invalid_decision: Confirm, reduce or waive.'; end if;
  if p_decision = 'reduce' and (v_final is null or v_final < 1 or v_final >= coalesce(p.final_amount, p.proposed_amount)) then
    raise exception 'invalid_amount: A reduced penalty is between 1 and % credits.', coalesce(p.final_amount, p.proposed_amount) - 1;
  end if;
  v_status := case p_decision when 'confirm' then 'confirmed' when 'reduce' then 'reduced' else 'waived' end;

  if p.status = 'proposed' then
    if v_final > 0 then
      insert into public.credit_ledger (user_id, delta, kind, booking_id, note)
      values (p.user_id, -v_final, 'penalty', b.id, format('%s penalty %s by a Manager', initcap(p.kind::text), v_status));
    end if;
  elsif p.final_amount > v_final then
    insert into public.credit_ledger (user_id, delta, kind, booking_id, note)
    values (p.user_id, p.final_amount - v_final, 'release', b.id, 'Forfeit refunded on appeal');
  end if;

  update public.penalties set status = v_status, final_amount = v_final, decided_by = p_actor,
    reason = trim(p_reason), decided_at = public.app_now()
  where id = p_penalty returning * into p;
  perform public.queue_notifications(public.log_event(
    p_actor, 'manager', 'PENALTY_DECIDED', 'booking', b.id::text, v_org, p.user_id, v_from, v_status::text,
    format('%s credits: %s', v_final, trim(p_reason)),
    jsonb_build_object('penalty_id', p.id, 'kind', p.kind, 'proposed', p.proposed_amount, 'final', v_final,
      'appeal', v_from = 'appealed', 'policy_version', (select version from public.policy_versions where id = p.policy_version_id)),
    p.policy_version_id));
  return p;
end;
$$;

-- The student's side: appeal an auto-applied no-show forfeit, or explain a proposed penalty
-- before the Manager decides it.
create function public.appeal_penalty(p_user uuid, p_penalty uuid, p_text text) returns public.penalties
language plpgsql security definer set search_path = '' as $$
declare
  p public.penalties;
  b public.bookings;
begin
  select * into p from public.penalties where id = p_penalty for update;
  if not found or p.user_id <> p_user then raise exception 'not_found: Penalty not found.'; end if;
  if coalesce(length(trim(p_text)), 0) < 10 then raise exception 'reason_required: Explain what happened in a sentence or two.'; end if;
  if p.status not in ('proposed', 'auto_applied') or p.appeal_text is not null then
    raise exception 'invalid_state: You have already responded, or this penalty is decided.';
  end if;
  select * into b from public.bookings where id = p.booking_id;
  update public.penalties set appeal_text = trim(p_text),
    status = case when p.status = 'auto_applied' then 'appealed'::public.penalty_status else p.status end
  where id = p_penalty returning * into p;
  perform public.queue_notifications(public.log_event(
    p_user, 'student', case when p.status = 'appealed' then 'PENALTY_APPEALED' else 'PENALTY_EXPLAINED' end,
    'booking', b.id::text, (select org_id from public.resources where id = b.resource_id), p_user,
    null, p.status::text, trim(p_text), jsonb_build_object('penalty_id', p.id, 'kind', p.kind), p.policy_version_id));
  return p;
end;
$$;

-- ---------------------------------------------------------------------------- overrides (PRD 8)
-- A Manager gives a waitlisted request priority over the system's recommendation. The weakest
-- overlapping recommendation still pending approval moves to the top of the waitlist (its student
-- sees only the reason category); the chosen request is offered the place like any waitlist offer.
-- MANAGER_OVERRIDE keeps the original recommendation, the final decision and the reason; it has no
-- subject user, so neither student can read the other's score.
create function public.override_allocation(p_actor uuid, p_chosen uuid, p_category text, p_reason text) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  c public.bookings;
  d public.bookings;
  v_org uuid;
begin
  select * into c from public.bookings where id = p_chosen for update;
  if not found then raise exception 'not_found: Booking not found.'; end if;
  select org_id into v_org from public.resources where id = c.resource_id;
  if not public.has_org_role(p_actor, v_org, 'manager') then raise exception 'actor_mismatch: not a manager of this organisation'; end if;
  if c.status <> 'waitlisted' then raise exception 'invalid_state: Only a waitlisted request can be given priority.'; end if;
  if coalesce(length(trim(p_category)), 0) = 0 or coalesce(length(trim(p_reason)), 0) < 10 then
    raise exception 'reason_required: Choose a category and explain the override.';
  end if;

  select * into d from public.bookings
  where resource_id = c.resource_id and status = 'pending_approval' and id <> c.id
    and tstzrange(start_at, end_at, '[)') && tstzrange(c.start_at, c.end_at, '[)')
  order by priority_score nulls first, created_at desc
  limit 1;
  if d.id is not null then
    update public.bookings set waitlist_position = waitlist_position + 1
    where resource_id = c.resource_id and status = 'waitlisted' and id <> c.id
      and tstzrange(start_at, end_at, '[)') && tstzrange(c.start_at, c.end_at, '[)');
    perform public.transition_booking(d.id, 'waitlist', p_actor, 'manager',
      'A Manager gave priority to another request: ' || trim(p_category), jsonb_build_object('waitlist_position', 1));
  end if;
  update public.bookings set waitlist_position = 0 where id = c.id;
  perform public.offer_next(c.resource_id);
  select * into c from public.bookings where id = p_chosen;
  if c.status <> 'offered' then
    raise exception 'no_capacity: Every place for this slot is already approved, so there is no recommendation to override.';
  end if;

  perform public.log_event(p_actor, 'manager', 'MANAGER_OVERRIDE', 'booking', c.id::text, v_org, null,
    'waitlisted', 'offered', trim(p_category) || ': ' || trim(p_reason),
    jsonb_build_object(
      'category', trim(p_category),
      'original_recommendation', case when d.id is null then null
        else jsonb_build_object('booking_id', d.id, 'status', 'pending_approval', 'priority_score', d.priority_score) end,
      'final_decision', jsonb_build_object('booking_id', c.id, 'status', 'offered', 'priority_score', c.priority_score)),
    c.policy_version_id);
  return c;
end;
$$;

-- ---------------------------------------------------------------------------- incidents (PRD 11)
create function public.report_incident(
  p_user uuid, p_resource uuid, p_booking uuid, p_occurred_at timestamptz, p_location text, p_description text,
  p_severity public.incident_severity, p_evidence text[]
) returns public.incidents
language plpgsql security definer set search_path = '' as $$
declare
  r public.resources;
  b public.bookings;
  i public.incidents;
  v_path text;
begin
  select * into r from public.resources where id = p_resource;
  if not found then raise exception 'not_found: Resource not found.'; end if;
  if p_booking is not null then
    select * into b from public.bookings where id = p_booking and resource_id = p_resource;
    if not found or not (b.user_id = p_user or public.has_org_role(p_user, r.org_id, 'owner')
      or public.has_org_role(p_user, r.org_id, 'manager')) then
      raise exception 'not_found: Booking not found.';
    end if;
  end if;
  if coalesce(length(trim(p_description)), 0) < 10 then raise exception 'reason_required: Describe what happened in a sentence or two.'; end if;
  if p_occurred_at is null or p_occurred_at > public.app_now() + interval '5 minutes' then
    raise exception 'invalid_time: When did it happen? It cannot be in the future.';
  end if;
  foreach v_path in array coalesce(p_evidence, '{}') loop
    if split_part(v_path, '/', 1) <> p_user::text then raise exception 'invalid_path: Evidence must be uploaded by you.'; end if;
  end loop;

  insert into public.incidents (resource_id, booking_id, reported_by, occurred_at, location, description, evidence, severity)
  values (p_resource, p_booking, p_user, p_occurred_at, coalesce(nullif(trim(p_location), ''), r.location), trim(p_description),
    coalesce(p_evidence, '{}'), p_severity)
  returning * into i;
  perform public.queue_notifications(public.log_event(
    p_user, case when public.has_org_role(p_user, r.org_id, 'manager') then 'manager'
      when public.has_org_role(p_user, r.org_id, 'owner') then 'owner'
      when coalesce((select is_admin from public.profiles where id = p_user), false) then 'admin' else 'student' end,
    'INCIDENT_REPORTED', 'incident', i.id::text, r.org_id, coalesce(b.user_id, p_user), null, 'open', trim(p_description),
    jsonb_build_object('severity', p_severity, 'resource_id', p_resource, 'booking_id', p_booking,
      'evidence', coalesce(array_length(p_evidence, 1), 0))));
  return i;
end;
$$;

-- A Manager (or Admin) investigates and closes. Closing never restores the resource; an optional
-- access restriction in this organisation applies to the booking's student.
create function public.update_incident(
  p_incident uuid, p_actor uuid, p_role text, p_status public.incident_status, p_note text, p_restrict_days integer
) returns public.incidents
language plpgsql security definer set search_path = '' as $$
declare
  i public.incidents;
  v_org uuid;
  v_student uuid;
  v_until timestamptz;
begin
  select * into i from public.incidents where id = p_incident for update;
  if not found then raise exception 'not_found: Incident not found.'; end if;
  select org_id into v_org from public.resources where id = i.resource_id;
  if p_role = 'manager' then
    if not public.has_org_role(p_actor, v_org, 'manager') then raise exception 'actor_mismatch: not a manager of this organisation'; end if;
  elsif p_role = 'admin' then
    perform public.require_admin(p_actor);
  else
    raise exception 'actor_not_allowed: Only a Manager handles incidents.';
  end if;
  if i.status = 'closed' then raise exception 'invalid_state: This incident is closed.'; end if;
  if p_status = 'open' then raise exception 'invalid_state: Mark it investigating or closed.'; end if;
  if coalesce(length(trim(p_note)), 0) < 3 then
    raise exception 'reason_required: Record the actions taken%.', case when p_status = 'closed' then ' and the resolution' else '' end;
  end if;

  if coalesce(p_restrict_days, 0) > 0 then
    select user_id into v_student from public.bookings where id = i.booking_id;
    if v_student is null then raise exception 'invalid_state: Only an incident linked to a booking can restrict its student.'; end if;
    v_until := public.app_now() + make_interval(days => least(p_restrict_days, 180));
    insert into public.org_restrictions (user_id, org_id, until, reason, created_by)
    values (v_student, v_org, v_until, 'Safety incident: ' || trim(p_note), p_actor);
  end if;

  update public.incidents set
    status = p_status,
    actions = concat_ws(E'\n', actions, trim(p_note)),
    resolution = case when p_status = 'closed' then trim(p_note) else resolution end,
    closed_by = case when p_status = 'closed' then p_actor end,
    closed_at = case when p_status = 'closed' then public.app_now() end
  where id = p_incident returning * into i;
  perform public.queue_notifications(public.log_event(
    p_actor, p_role, case when p_status = 'closed' then 'INCIDENT_CLOSED' else 'INCIDENT_UPDATED' end, 'incident', i.id::text,
    v_org, v_student, null, p_status::text, trim(p_note),
    jsonb_build_object('restricted_until', v_until, 'resource_restored', false)));
  return i;
end;
$$;

-- ---------------------------------------------------------------------------- training badges (PRD 6, 14)
-- The student uploads a certificate (certificates/{user}/...); an Owner or Manager of the issuing
-- organisation verifies it (the AI extraction is a suggestion next to the image) or rejects it.
create function public.submit_badge(p_user uuid, p_badge_type uuid, p_path text) returns public.user_badges
language plpgsql security definer set search_path = '' as $$
declare
  t public.badge_types;
  x public.user_badges;
begin
  select * into t from public.badge_types where id = p_badge_type;
  if not found then raise exception 'not_found: Badge type not found.'; end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> p_user::text then raise exception 'invalid_path: Upload your certificate first.'; end if;
  if exists (select 1 from public.user_badges where user_id = p_user and badge_type_id = p_badge_type
             and (status = 'pending' or (status = 'verified' and (expires_at is null or expires_at > public.app_now())))) then
    raise exception 'duplicate: This badge is already verified or waiting for review.';
  end if;
  insert into public.user_badges (user_id, badge_type_id, certificate_path) values (p_user, p_badge_type, p_path) returning * into x;
  perform public.queue_notifications(public.log_event(
    p_user, 'student', 'BADGE_SUBMITTED', 'user_badge', x.id::text, t.issuing_org_id, p_user, null, 'pending',
    t.name || ' certificate'));
  return x;
end;
$$;

create function public.decide_badge(
  p_badge uuid, p_actor uuid, p_role text, p_approve boolean, p_issued date, p_reason text
) returns public.user_badges
language plpgsql security definer set search_path = '' as $$
declare
  x public.user_badges;
  t public.badge_types;
begin
  select * into x from public.user_badges where id = p_badge for update;
  if not found then raise exception 'not_found: Certificate not found.'; end if;
  select * into t from public.badge_types where id = x.badge_type_id;
  if p_role not in ('owner', 'manager') then raise exception 'actor_not_allowed: Only issuing-organisation staff verify badges.'; end if;
  if not public.has_org_role(p_actor, t.issuing_org_id, p_role::public.membership_role) then
    raise exception 'actor_mismatch: Only staff of the issuing organisation verify this badge.';
  end if;
  if p_actor = x.user_id then raise exception 'conflict_of_interest: You cannot verify your own badge.'; end if;
  if x.status <> 'pending' then raise exception 'invalid_state: This certificate is already decided.'; end if;
  if not p_approve and coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'reason_required: Tell the student why.'; end if;
  if p_approve and (p_issued is null or p_issued > (public.app_now() at time zone 'Asia/Kolkata')::date) then
    raise exception 'invalid_date: Enter the issue date printed on the certificate.';
  end if;

  update public.user_badges set
    status = case when p_approve then 'verified'::public.badge_status else 'rejected'::public.badge_status end,
    issued_at = case when p_approve then p_issued end,
    expires_at = case when p_approve then (p_issued + t.validity_days)::timestamp at time zone 'Asia/Kolkata' end,
    verified_by = p_actor, verified_at = public.app_now(), decision_reason = nullif(trim(p_reason), '')
  where id = p_badge returning * into x;
  perform public.queue_notifications(public.log_event(
    p_actor, p_role, case when p_approve then 'BADGE_VERIFIED' else 'BADGE_REJECTED' end, 'user_badge', x.id::text,
    t.issuing_org_id, x.user_id, 'pending', x.status::text,
    coalesce(nullif(trim(p_reason), ''), format('Valid until %s', to_char(x.expires_at at time zone 'Asia/Kolkata', 'FMDD Mon YYYY'))),
    jsonb_build_object('badge', t.name, 'issued_at', x.issued_at, 'expires_at', x.expires_at)));
  return x;
end;
$$;

revoke execute on function public.set_resource_status, public.report_damage, public.respond_damage, public.decide_damage,
  public.decide_penalty, public.appeal_penalty, public.override_allocation, public.report_incident, public.update_incident,
  public.submit_badge, public.decide_badge
  from public, anon, authenticated;
grant execute on function public.set_resource_status, public.report_damage, public.respond_damage, public.decide_damage,
  public.decide_penalty, public.appeal_penalty, public.override_allocation, public.report_incident, public.update_incident,
  public.submit_badge, public.decide_badge
  to service_role;
