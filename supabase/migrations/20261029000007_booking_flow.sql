-- Phase 3: core happy path (PRD 5, 7, 9, 10). Submit, unit assignment on approval, handover and
-- return with a condition record, student acknowledgement and door check-in. Each runs in one
-- transaction with its audit event and notification. Service role only; the server action has
-- already run the eligibility engine and checked the caller.

-- A unit of the resource with no slot-holding booking overlapping [start, end).
create function public.free_unit(p_resource uuid, p_start timestamptz, p_end timestamptz) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from public.resource_units u
  where u.resource_id = p_resource and u.status = 'active'
    and not exists (
      select 1 from public.bookings b
      where b.unit_id = u.id and b.status in ('approved', 'offered', 'checked_out', 'overdue')
        and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start, p_end, '[)')
    )
  order by u.label
  limit 1;
$$;

-- New request (the 'new' rows of booking_transitions). p_fields carries what the domain computed:
-- purpose_category, purpose_text, is_exception, exception_reason, approver_role, credit_hold,
-- grace_minutes, cutoff_at, eligibility_snapshot.
create function public.submit_booking(
  p_user uuid, p_resource uuid, p_start timestamptz, p_end timestamptz, p_event text, p_fields jsonb
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  t public.booking_transitions;
  p public.profiles;
  r public.resources;
  b public.bookings;
  v_now timestamptz := public.app_now();
  v_unit uuid;
  v_position integer;
  v_hold integer := coalesce((p_fields ->> 'credit_hold')::integer, 0);
  v_available integer;
  v_event bigint;
begin
  select * into t from public.booking_transitions where from_status = 'new' and event = p_event;
  if not found then raise exception 'invalid_transition: new cannot %', p_event; end if;

  select * into p from public.profiles where id = p_user;
  if not found or p.status <> 'verified' then
    raise exception 'not_verified: Only verified students can request bookings.';
  end if;
  select * into r from public.resources where id = p_resource;
  if not found or r.status <> 'active' then
    raise exception 'unavailable: This resource is not taking bookings right now.';
  end if;
  if p_end <= p_start then raise exception 'invalid_slot: The end must be after the start.'; end if;
  if p_start < v_now - interval '15 minutes' then raise exception 'invalid_slot: That slot has already started.'; end if;
  if exists (
    select 1 from public.bookings
    where user_id = p_user and resource_id = p_resource
      and status in ('pending_allocation', 'pending_approval', 'waitlisted', 'offered', 'approved', 'checked_out', 'overdue')
      and tstzrange(start_at, end_at, '[)') && tstzrange(p_start, p_end, '[)')
  ) then
    raise exception 'duplicate: You already have a request for this resource at that time.';
  end if;

  if t.to_status = 'approved' then
    v_unit := public.free_unit(p_resource, p_start, p_end);
    if v_unit is null then raise exception 'slot_taken: That slot was just taken. Pick another time.'; end if;
  elsif t.to_status = 'waitlisted' then
    select count(*) + 1 into v_position from public.bookings
    where resource_id = p_resource and status = 'waitlisted'
      and tstzrange(start_at, end_at, '[)') && tstzrange(p_start, p_end, '[)');
  end if;

  insert into public.bookings (
    resource_id, unit_id, user_id, start_at, end_at, status, purpose_category, purpose_text,
    is_exception, exception_reason, eligibility_snapshot, cutoff_at, waitlist_position,
    policy_version_id, credit_hold, grace_minutes, approver_role, allocation_rule
  ) values (
    p_resource, v_unit, p_user, p_start, p_end, t.to_status,
    coalesce((p_fields ->> 'purpose_category')::public.purpose_category, 'personal'),
    coalesce(p_fields ->> 'purpose_text', ''),
    coalesce((p_fields ->> 'is_exception')::boolean, false),
    nullif(trim(p_fields ->> 'exception_reason'), ''),
    p_fields -> 'eligibility_snapshot',
    (p_fields ->> 'cutoff_at')::timestamptz,
    v_position,
    public.current_policy_version_id(),
    v_hold,
    (p_fields ->> 'grace_minutes')::integer,
    coalesce((p_fields ->> 'approver_role')::public.approver_role, 'owner'),
    case when r.allocation_mode = 'batch' then 'Batch allocation' else 'Instant: first valid request' end
  ) returning * into b;

  if t.to_status = 'approved' and v_hold > 0 then
    select coalesce(sum(delta), 0) into v_available from public.credit_ledger where user_id = p_user;
    if v_available < v_hold then
      raise exception 'insufficient_credits: needs %, has % available', v_hold, v_available;
    end if;
    insert into public.credit_ledger (user_id, delta, kind, booking_id, note)
    values (p_user, -v_hold, 'hold', b.id, 'Hold for booking');
  end if;

  v_event := public.log_event(
    p_user, 'student', 'BOOKING_' || upper(p_event), 'booking', b.id::text, r.org_id, p_user,
    'new', t.to_status::text, b.exception_reason,
    jsonb_build_object('credit_hold', v_hold, 'approver_role', b.approver_role, 'is_exception', b.is_exception),
    b.policy_version_id
  );
  perform public.queue_notifications(v_event);
  return b;
end;
$$;

-- transition_booking(): unchanged except that approving or offering a request that has no unit yet
-- assigns a free one (pending requests do not hold a unit, PRD 5 double-booking guard).
create or replace function public.transition_booking(
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
  if t.to_status in ('approved', 'offered') and b.unit_id is null then
    b.unit_id := public.free_unit(b.resource_id, b.start_at, b.end_at);
    if b.unit_id is null then
      raise exception 'slot_taken: That slot is no longer free. Waitlist or reject the request instead.';
    end if;
  end if;
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

-- Handover or return (PRD 10): the Owner's signed condition record and the transition together.
-- p_checklist = [{item, ok, note}], p_photos = [{shot, path}] under condition-photos/{booking_id}/.
create function public.record_condition(
  p_booking uuid, p_actor uuid, p_actor_role text, p_phase public.condition_phase,
  p_checklist jsonb, p_photos jsonb, p_notes text, p_supervisor text
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_photo jsonb;
begin
  if p_actor_role not in ('owner', 'manager') then
    raise exception 'actor_not_allowed: Only the Owner or a Manager records a handover.';
  end if;
  if jsonb_array_length(coalesce(p_photos, '[]')) < 3 then
    raise exception 'photos_required: Take at least 3 guided photos.';
  end if;
  for v_photo in select * from jsonb_array_elements(p_photos) loop
    if split_part(v_photo ->> 'path', '/', 1) <> p_booking::text then
      raise exception 'invalid_path: Photos must be uploaded for this booking.';
    end if;
  end loop;
  if exists (
    select 1 from public.bookings b join public.resources r on r.id = b.resource_id
    where b.id = p_booking and coalesce((r.safety_rules ->> 'supervision_required')::boolean, false)
  ) and p_phase = 'checkout' and coalesce(trim(p_supervisor), '') = '' then
    raise exception 'supervisor_required: Name the supervisor present at handover.';
  end if;

  insert into public.condition_reports (
    booking_id, phase, checklist_results, photos, notes, supervisor_name, owner_signed_by, owner_signed_at
  ) values (
    p_booking, p_phase, coalesce(p_checklist, '[]'), p_photos, nullif(trim(p_notes), ''),
    nullif(trim(p_supervisor), ''), p_actor, public.app_now()
  )
  on conflict (booking_id, phase) do nothing;
  if not found then raise exception 'duplicate: This condition record is already signed.'; end if;

  return public.transition_booking(
    p_booking, case p_phase when 'checkout' then 'handover' else 'return' end, p_actor, p_actor_role, null,
    jsonb_build_object('condition_phase', p_phase, 'photos', jsonb_array_length(p_photos),
      'issues', (select count(*) from jsonb_array_elements(coalesce(p_checklist, '[]')) i where not (i ->> 'ok')::boolean))
  );
end;
$$;

-- The student's half of the two-party sign-off (PRD 10).
create function public.acknowledge_condition(p_user uuid, p_booking uuid, p_phase public.condition_phase)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or b.user_id <> p_user then raise exception 'not_found: Booking not found.'; end if;
  update public.condition_reports set student_ack_at = public.app_now()
  where booking_id = p_booking and phase = p_phase and student_ack_at is null;
  if not found then raise exception 'invalid_state: Nothing to acknowledge.'; end if;
  perform public.log_event(p_user, 'student', 'CONDITION_ACKNOWLEDGED', 'booking', p_booking::text,
    (select org_id from public.resources where id = b.resource_id), p_user, null, null, null,
    jsonb_build_object('phase', p_phase), b.policy_version_id);
end;
$$;

-- Door QR self check-in for spaces (PRD 10): the student's approved booking for this space whose
-- pickup window (15 min before start until the end of grace) contains app_now().
create function public.door_checkin(p_user uuid, p_token text) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_resource uuid;
  v_booking uuid;
  v_now timestamptz := public.app_now();
begin
  select id into v_resource from public.resources
  where door_qr_token = p_token and form_template in ('space', 'lab');
  if not found then raise exception 'not_found: This door code is not recognised.'; end if;
  select id into v_booking from public.bookings
  where user_id = p_user and resource_id = v_resource and status = 'approved'
    and v_now >= start_at - interval '15 minutes'
    and v_now <= start_at + make_interval(mins => coalesce(grace_minutes, 15))
  order by start_at limit 1;
  if not found then
    raise exception 'no_booking: You have no approved booking for this space right now.';
  end if;
  return public.transition_booking(v_booking, 'door_checkin', p_user, 'student');
end;
$$;

revoke execute on function public.free_unit, public.submit_booking, public.record_condition,
  public.acknowledge_condition, public.door_checkin from public, anon, authenticated;
grant execute on function public.free_unit, public.submit_booking, public.record_condition,
  public.acknowledge_condition, public.door_checkin to service_role;
