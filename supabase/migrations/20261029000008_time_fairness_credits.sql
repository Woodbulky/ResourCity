-- Phase 4: time, fairness, credits (PRD 2, 8, 9, 10, 12, 13). The scheduler jobs, waitlist offers,
-- no-shows and strikes, overdue alerts, escalation, extensions, the weekly allowance, emergency
-- credits, versioned policy changes, the demo clock and the full Section 13 notification matrix.
-- Batch allocation scoring runs in TypeScript (src/lib/server/scheduler.ts, domain priorityScore);
-- everything else the tick does is scheduler_tick() below. Service role only.

-- ---------------------------------------------------------------------------- helpers
-- Values of a policy version (default: the current one).
create function public.policy_values(p_version uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select "values" from public.policy_versions
  where p_version is null or id = p_version
  order by version desc limit 1;
$$;

create function public.ist(p timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p at time zone 'Asia/Kolkata', 'FMDD Mon, FMHH12:MI AM');
$$;

-- Indian academic year (June → May), e.g. '2026-27'.
create function public.academic_year(p timestamptz) returns text
language sql immutable set search_path = '' as $$
  select case when extract(month from p at time zone 'Asia/Kolkata') >= 6
    then y || '-' || lpad(((y + 1) % 100)::text, 2, '0')
    else (y - 1) || '-' || lpad((y % 100)::text, 2, '0') end
  from (select extract(year from p at time zone 'Asia/Kolkata')::int as y) t;
$$;

-- Active units of a resource with no slot-holding booking overlapping [start, end).
create function public.free_units(p_resource uuid, p_start timestamptz, p_end timestamptz) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.resource_units u
  where u.resource_id = p_resource and u.status = 'active'
    and not exists (
      select 1 from public.bookings b
      where b.unit_id = u.id and b.status in ('approved', 'offered', 'checked_out', 'overdue')
        and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start, p_end, '[)')
    );
$$;

-- ---------------------------------------------------------------------------- notifications (PRD 13)
create function public.notify(
  p_user uuid, p_type text, p_title text, p_body text, p_link text, p_key text, p_urgent boolean default false
) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, link, dedupe_key, urgent)
  select p_user, p_type, p_title, coalesce(p_body, ''), p_link, p_key || ':' || p_user, p_urgent
  where p_user is not null
  on conflict (dedupe_key) do nothing;
$$;

-- Every Owner or Manager of an organisation except the actor; links go to their own booking page.
create function public.notify_staff(
  p_org uuid, p_role public.membership_role, p_except uuid, p_type text, p_title text, p_body text,
  p_link_tail text, p_key text, p_urgent boolean default false
) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, link, dedupe_key, urgent)
  select m.user_id, p_type, p_title, coalesce(p_body, ''), '/' || p_role || p_link_tail, p_key || ':' || m.user_id, p_urgent
  from public.memberships m
  where m.org_id = p_org and m.role = p_role and m.user_id is distinct from p_except
  on conflict (dedupe_key) do nothing;
$$;

create function public.notify_admins(p_type text, p_title text, p_body text, p_link text, p_key text, p_urgent boolean default false)
returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, link, dedupe_key, urgent)
  select p.id, p_type, p_title, coalesce(p_body, ''), p_link, p_key || ':' || p.id, p_urgent
  from public.profiles p where p.is_admin
  on conflict (dedupe_key) do nothing;
$$;

-- One rules function decides who hears about an audit event (PRD 13). Nobody hears about
-- another person's private case.
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
          when 'completed' then 'Booking completed'
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
        if b.approver_role = 'manager' and (v_ev like 'submit%' or v_ev like 'allocate%' or v_ev in ('approve', 'reject', 'waitlist')) then
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

    elsif e.action = 'OWNER_NOT_PRESENT' then
      perform public.notify_staff(e.org_id, 'owner', null, e.action, 'Owner not present at pickup: ' || v_name, v_body, v_tail, v_key);
      perform public.notify_staff(e.org_id, 'manager', null, e.action, 'Owner not present at pickup: ' || v_name, v_body, v_tail, v_key);
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

-- ---------------------------------------------------------------------------- waitlist offers (PRD 8)
-- Offer freed capacity to waitlisted requests in order. Pending approvals keep their claim on a unit
-- (they ranked higher), so only capacity beyond them is offered. Accept window: 10 min for slots of
-- 2 h or less, 60 min otherwise. An offer made after the pickup grace moves that booking's pickup
-- deadline to the offer expiry plus its grace, so an accepted late offer is still collectable.
create function public.offer_next(p_resource uuid) returns integer
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

-- ---------------------------------------------------------------------------- transition_booking
-- Phase 3 version plus: an expired offer cannot be accepted; overdue alerts restart at level 0;
-- a late return proposes a late penalty under the booking's own policy version (PRD 10, 11);
-- whenever a booking stops claiming a slot, the waitlist is offered the freed capacity (PRD 8).
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
  r public.resources;
  v_org uuid;
  v_now timestamptz := public.app_now();
  v_reason text := nullif(trim(p_reason), '');
  v_payload jsonb := coalesce(p_payload, '{}');
  v_charge integer;
  v_available integer;
  v_event_id bigint;
  v_units integer;
  v_amount integer;
  v_mult numeric;
  v_penalty uuid;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking_not_found: %', p_booking_id;
  end if;
  select * into r from public.resources where id = b.resource_id;
  v_org := r.org_id;

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
  if p_event = 'accept' and b.offer_expires_at is not null and b.offer_expires_at <= v_now then
    raise exception 'offer_expired: This offer has expired.';
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
    then (v_payload ->> 'offer_expires_at')::timestamptz
    when t.to_status = 'approved' and p_event = 'accept' then b.offer_expires_at else null end;
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
    escalation_level = case when t.to_status = 'overdue' then 0 else escalation_level end,
    escalated_at = case when t.to_status = 'overdue' then null else escalated_at end,
    updated_at = v_now
  where id = b.id
  returning * into b;

  v_event_id := public.log_event(
    p_actor_id, p_actor_role, 'BOOKING_' || upper(p_event), 'booking', b.id::text, v_org, b.user_id,
    t.from_status, t.to_status::text, v_reason, v_payload, b.policy_version_id
  );
  perform public.queue_notifications(v_event_id);

  -- Late return: propose a penalty under the booking's policy version; a Manager decides (PRD 10, 11).
  if p_event = 'return' and v_now > b.end_at and r.base_rate > 0 then
    v_mult := coalesce((public.policy_values(b.policy_version_id) ->> 'late_penalty_multiplier')::numeric, 2);
    v_units := ceil(extract(epoch from v_now - b.end_at) / case when r.rate_unit = 'day' then 86400 else 3600 end)::int;
    v_amount := ceil(v_units * r.base_rate * v_mult)::int;
    if v_amount > 0 then
      insert into public.penalties (booking_id, user_id, kind, proposed_amount, status, policy_version_id, reason)
      values (b.id, b.user_id, 'late', v_amount, 'proposed', b.policy_version_id,
        format('Returned %s h late with no approved extension: %s started %s × %s credits × %s (policy v%s).',
          round(extract(epoch from v_now - b.end_at) / 3600, 1), v_units, r.rate_unit, r.base_rate, v_mult,
          (select version from public.policy_versions where id = b.policy_version_id)))
      returning id into v_penalty;
      perform public.queue_notifications(public.log_event(
        null, 'system', 'PENALTY_PROPOSED', 'booking', b.id::text, v_org, b.user_id, null, 'proposed',
        (select reason from public.penalties where id = v_penalty),
        jsonb_build_object('penalty_id', v_penalty, 'kind', 'late', 'amount', v_amount), b.policy_version_id));
    end if;
  end if;

  if t.to_status in ('cancelled', 'no_show', 'expired', 'rejected', 'returned', 'completed') then
    perform public.offer_next(b.resource_id);
  end if;
  return b;
end;
$$;

-- ---------------------------------------------------------------------------- the tick (PRD 2)
-- Runs after batch allocation, in PRD order: expired offers, no-shows, lapses, overdue marking and
-- alerts, reminders, escalation timeouts, dispute response expiry, weekly credit reset. Every job
-- reads app_now(), so the demo clock works. Each item runs in its own subtransaction: one bad row
-- is reported and skipped, never blocks the rest.
create function public.scheduler_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := public.app_now();
  pol jsonb := public.policy_values();
  r record;
  v_out jsonb := '{}';
  v_errors text[] := '{}';
  n int;
  v_strikes int;
  v_limit int;
  v_window int;
  v_forfeit boolean;
  v_target int;
  v_week date;
  v_avail int;
  v_version int := (select max(version) from public.policy_versions);
begin
  if not pg_try_advisory_xact_lock(hashtext('scheduler_tick')) then
    return jsonb_build_object('skipped', 'Another scheduler run is in progress.');
  end if;

  -- 1. Offers not accepted in time; each expiry offers the next student.
  n := 0;
  for r in select id from public.bookings where status = 'offered' and offer_expires_at <= v_now order by offer_expires_at loop
    begin
      perform public.transition_booking(r.id, 'offer_expire', null, 'system', 'The offer was not accepted in time.');
      n := n + 1;
    exception when others then v_errors := v_errors || ('offer_expire ' || r.id || ': ' || sqlerrm);
    end;
  end loop;
  v_out := v_out || jsonb_build_object('offers_expired', n);

  -- 2. No-shows: grace over without a pickup. Strikes and the forfeit rule come from the booking's
  -- own policy version (the rule was announced when it was requested).
  n := 0;
  for r in
    select b.id, b.user_id, b.policy_version_id, b.credit_hold from public.bookings b
    where b.status = 'approved' and b.start_at + make_interval(mins => coalesce(b.grace_minutes, 15)) <= v_now
    order by b.start_at
  loop
    v_limit := coalesce((public.policy_values(r.policy_version_id) #>> '{strikes,limit}')::int, 3);
    v_window := coalesce((public.policy_values(r.policy_version_id) #>> '{strikes,window_days}')::int, 30);
    select count(*) into v_strikes from public.bookings
    where user_id = r.user_id and status = 'no_show'
      and start_at > v_now - make_interval(days => v_window) and start_at <= v_now;
    v_forfeit := v_strikes + 1 > v_limit and r.credit_hold > 0;
    begin
      perform public.transition_booking(r.id, 'no_show', null, 'system',
        format('Not collected within the grace period. No-show %s in %s days (limit %s)%s.', v_strikes + 1, v_window, v_limit,
          case when v_forfeit then ': the hold is forfeited, appealable to a Manager' else '; the hold is released' end),
        jsonb_build_object('forfeit', v_forfeit, 'strike', v_strikes + 1));
      if v_forfeit then
        insert into public.penalties (booking_id, user_id, kind, proposed_amount, final_amount, status, policy_version_id, reason)
        values (r.id, r.user_id, 'no_show', r.credit_hold, r.credit_hold, 'auto_applied', r.policy_version_id,
          format('Pre-announced rule: no-show %s in %s days forfeits the hold.', v_strikes + 1, v_window));
      end if;
      n := n + 1;
    exception when others then v_errors := v_errors || ('no_show ' || r.id || ': ' || sqlerrm);
    end;
  end loop;
  v_out := v_out || jsonb_build_object('no_shows', n);

  -- 3. Lapses: undecided requests whose slot started; waitlists that can no longer be offered.
  n := 0;
  for r in
    select id, status from public.bookings
    where (status = 'pending_approval' and start_at <= v_now)
       or (status = 'waitlisted' and end_at <= v_now + interval '15 minutes')
  loop
    begin
      perform public.transition_booking(r.id, 'lapse', null, 'system',
        case r.status when 'pending_approval' then 'The slot started before a decision was made.'
          else 'No place opened up before the slot ended.' end);
      n := n + 1;
    exception when others then v_errors := v_errors || ('lapse ' || r.id || ': ' || sqlerrm);
    end;
  end loop;
  v_out := v_out || jsonb_build_object('lapsed', n);

  -- 4. End passed: handed-over items become overdue; door check-ins complete on their own.
  n := 0;
  for r in
    select b.id, exists (select 1 from public.condition_reports c where c.booking_id = b.id and c.phase = 'checkout') as handed
    from public.bookings b where b.status = 'checked_out' and b.end_at <= v_now
  loop
    begin
      perform public.transition_booking(r.id, case when r.handed then 'mark_overdue' else 'auto_complete' end, null, 'system');
      n := n + 1;
    exception when others then v_errors := v_errors || ('end ' || r.id || ': ' || sqlerrm);
    end;
  end loop;
  v_out := v_out || jsonb_build_object('ended', n);

  -- Overdue alerts at +1 h (student, Owner), +6 h (Manager), +24 h (Manager, urgent).
  n := 0;
  for r in
    select b.id, b.user_id, b.end_at, b.escalation_level, b.policy_version_id, rs.org_id
    from public.bookings b join public.resources rs on rs.id = b.resource_id where b.status = 'overdue'
  loop
    v_target := case
      when v_now >= r.end_at + interval '24 hours' then 3
      when v_now >= r.end_at + interval '6 hours' then 2
      when v_now >= r.end_at + interval '1 hour' then 1
      else 0 end;
    if v_target > r.escalation_level then
      for lvl in r.escalation_level + 1 .. v_target loop
        perform public.queue_notifications(public.log_event(
          null, 'system', 'OVERDUE_ALERT', 'booking', r.id::text, r.org_id, r.user_id, null, null,
          format('Not returned %s h after the end time (%s).', (array[1, 6, 24])[lvl], public.ist(r.end_at)),
          jsonb_build_object('level', lvl, 'hours', (array[1, 6, 24])[lvl]), r.policy_version_id));
        n := n + 1;
      end loop;
      update public.bookings set escalation_level = v_target, escalated_at = v_now where id = r.id;
    end if;
  end loop;
  v_out := v_out || jsonb_build_object('overdue_alerts', n);

  -- 5. Reminders: pickup within 30 min; return 24 h and 2 h before for loans over a day, else 30 min.
  insert into public.notifications (user_id, type, title, body, link, dedupe_key)
  select b.user_id, 'REMINDER', 'Pickup soon · ' || rs.name, 'Your slot starts ' || public.ist(b.start_at) || '. Have your QR ready.',
    '/student/bookings/' || b.id, 'reminder:pickup:' || b.id
  from public.bookings b join public.resources rs on rs.id = b.resource_id
  where b.status = 'approved' and b.start_at > v_now and b.start_at <= v_now + interval '30 minutes'
  on conflict (dedupe_key) do nothing;
  insert into public.notifications (user_id, type, title, body, link, dedupe_key)
  select b.user_id, 'REMINDER', 'Return due · ' || rs.name, 'Due back ' || public.ist(b.end_at) || '.',
    '/student/bookings/' || b.id, 'reminder:return:' || x.k || ':' || b.id
  from public.bookings b
  join public.resources rs on rs.id = b.resource_id
  cross join (values ('24h', interval '24 hours', true), ('2h', interval '2 hours', true), ('30m', interval '30 minutes', false)) x(k, lead, long)
  where b.status = 'checked_out' and b.end_at > v_now and b.end_at <= v_now + x.lead
    and (b.end_at - b.start_at > interval '24 hours') = x.long
  on conflict (dedupe_key) do nothing;

  -- 6. Escalation (PRD 10): no Owner decision in 24 h (or by 2 h before the start) → Manager;
  -- no Manager decision in the next 24 h → Admin alert. Never decides on its own.
  n := 0;
  for r in
    select b.id, b.user_id, b.start_at, b.updated_at, b.escalation_level, b.escalated_at, b.approver_role,
      b.policy_version_id, rs.org_id
    from public.bookings b join public.resources rs on rs.id = b.resource_id where b.status = 'pending_approval'
  loop
    if r.approver_role = 'owner' and r.escalation_level = 0 and (
      v_now >= r.updated_at + (pol #>> '{escalation,owner_hours}')::numeric * interval '1 hour'
      or v_now >= r.start_at - (pol #>> '{escalation,owner_before_start_hours}')::numeric * interval '1 hour'
    ) then
      update public.bookings set approver_role = 'manager', escalation_level = 1, escalated_at = v_now where id = r.id;
      perform public.queue_notifications(public.log_event(
        null, 'system', 'APPROVAL_ESCALATED', 'booking', r.id::text, r.org_id, r.user_id, 'owner', 'manager',
        case when v_now >= r.updated_at + (pol #>> '{escalation,owner_hours}')::numeric * interval '1 hour'
          then format('No Owner decision within %s h: assigned to the Manager.', pol #>> '{escalation,owner_hours}')
          else format('The slot starts within %s h and the Owner has not decided: assigned to the Manager.',
            pol #>> '{escalation,owner_before_start_hours}') end,
        jsonb_build_object('level', 1), r.policy_version_id));
      n := n + 1;
    elsif r.approver_role = 'manager' and r.escalation_level < 2
      and v_now >= coalesce(r.escalated_at, r.updated_at) + (pol #>> '{escalation,manager_hours}')::numeric * interval '1 hour' then
      update public.bookings set escalation_level = 2, escalated_at = v_now where id = r.id;
      perform public.queue_notifications(public.log_event(
        null, 'system', 'APPROVAL_ESCALATED', 'booking', r.id::text, r.org_id, r.user_id, 'manager', 'admin',
        format('No Manager decision within %s h: Admin alerted.', pol #>> '{escalation,manager_hours}'),
        jsonb_build_object('level', 2), r.policy_version_id));
      n := n + 1;
    end if;
  end loop;
  v_out := v_out || jsonb_build_object('escalations', n);

  -- 7. Dispute response window closed: the Manager may decide without it (PRD 11).
  n := 0;
  for r in
    select d.id, d.booking_id, b.user_id, b.policy_version_id, rs.org_id
    from public.damage_cases d join public.bookings b on b.id = d.booking_id join public.resources rs on rs.id = b.resource_id
    where d.status = 'awaiting_response' and d.response_deadline <= v_now
  loop
    update public.damage_cases set status = 'ready_for_decision' where id = r.id;
    perform public.log_event(null, 'system', 'DISPUTE_RESPONSE_EXPIRED', 'booking', r.booking_id::text, r.org_id, r.user_id,
      'awaiting_response', 'ready_for_decision',
      format('Student did not respond within %s h', pol ->> 'dispute_response_hours'),
      jsonb_build_object('case_id', r.id), r.policy_version_id);
    n := n + 1;
  end loop;
  v_out := v_out || jsonb_build_object('disputes_ready', n);

  -- 8. Weekly allowance, Monday 00:00 IST (PRD 9): unused credits expire (holds are already
  -- outside the balance), then the allowance is granted. A debt is not expired; the allowance pays it.
  -- Newly verified students get the full allowance at the next tick.
  v_week := date_trunc('week', v_now at time zone 'Asia/Kolkata')::date;
  n := 0;
  for r in
    select p.id from public.profiles p
    where p.status = 'verified' and not p.is_admin
      and not exists (select 1 from public.credit_ledger l where l.user_id = p.id and l.kind = 'allowance' and l.week_start = v_week)
  loop
    select coalesce(sum(delta), 0) into v_avail from public.credit_ledger where user_id = r.id;
    if v_avail > 0 then
      insert into public.credit_ledger (user_id, delta, kind, week_start, note)
      values (r.id, -v_avail, 'reset_expiry', v_week, 'Unused credits expired at the Monday reset');
    end if;
    insert into public.credit_ledger (user_id, delta, kind, week_start, note)
    values (r.id, (pol ->> 'weekly_allowance')::int, 'allowance', v_week, format('Weekly allowance (policy v%s)', v_version));
    n := n + 1;
  end loop;
  if n > 0 then
    perform public.log_event(null, 'system', 'CREDITS_WEEKLY_RESET', 'credits', v_week::text, null, null, null, null,
      format('Weekly allowance of %s credits for %s students', pol ->> 'weekly_allowance', n),
      jsonb_build_object('students', n, 'allowance', (pol ->> 'weekly_allowance')::int, 'week_start', v_week));
  end if;
  v_out := v_out || jsonb_build_object('allowances', n);

  return v_out || jsonb_build_object('now', v_now, 'errors', to_jsonb(v_errors));
end;
$$;

-- ---------------------------------------------------------------------------- student actions
-- "Owner not present" (PRD 10): during the pickup window; no strike for the student, logged against
-- the organisation, the booking is cancelled and its credits released.
create function public.report_owner_absent(p_user uuid, p_booking uuid) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  v_now timestamptz := public.app_now();
begin
  select * into b from public.bookings where id = p_booking;
  if not found or b.user_id <> p_user then raise exception 'not_found: Booking not found.'; end if;
  if b.status <> 'approved' or v_now < b.start_at or v_now > b.start_at + make_interval(mins => coalesce(b.grace_minutes, 15)) then
    raise exception 'invalid_state: You can report this only during the pickup window of an approved booking.';
  end if;
  perform public.queue_notifications(public.log_event(
    p_user, 'student', 'OWNER_NOT_PRESENT', 'booking', p_booking::text,
    (select org_id from public.resources where id = b.resource_id), p_user, null, null,
    'The student reported that nobody was at the pickup point.', '{}', b.policy_version_id));
  return public.transition_booking(p_booking, 'cancel', p_user, 'student', 'Owner not present at pickup: no strike, credits released.');
end;
$$;

-- Extensions (PRD 10). The server action computed the extra cost and whether the resource
-- auto-approves; this checks ownership, conflicts with the next booking on the unit and credits.
create function public.decide_extension(
  p_ext uuid, p_actor uuid, p_role text, p_approve boolean, p_reason text, p_extra integer
) returns public.extension_requests
language plpgsql security definer set search_path = '' as $$
declare
  x public.extension_requests;
  b public.bookings;
  v_org uuid;
  v_available int;
  v_prev timestamptz;
begin
  select * into x from public.extension_requests where id = p_ext for update;
  if not found or x.status <> 'pending' then raise exception 'invalid_state: This extension request is no longer pending.'; end if;
  select * into b from public.bookings where id = x.booking_id for update;
  select org_id into v_org from public.resources where id = b.resource_id;
  if p_role = 'system' then
    if p_actor is not null then raise exception 'actor_mismatch: system actions have no actor id'; end if;
  elsif p_role = 'owner' then
    if not public.has_org_role(p_actor, v_org, 'owner') then raise exception 'actor_mismatch: not an owner of this organisation'; end if;
    if b.approver_role = 'manager' then raise exception 'actor_not_allowed: This resource needs a Manager to decide.'; end if;
  elsif p_role = 'manager' then
    if not public.has_org_role(p_actor, v_org, 'manager') then raise exception 'actor_mismatch: not a manager of this organisation'; end if;
  else
    raise exception 'actor_not_allowed: % cannot decide extensions', p_role;
  end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required: Give the student a reason.';
  end if;

  v_prev := b.end_at;
  if p_approve then
    if b.status not in ('approved', 'checked_out') then
      raise exception 'invalid_state: The booking can no longer be extended.';
    end if;
    if coalesce(p_extra, 0) > 0 then
      select coalesce(sum(delta), 0) into v_available from public.credit_ledger where user_id = b.user_id;
      if v_available < p_extra then
        raise exception 'insufficient_credits: The extension needs % more credits; % available.', p_extra, v_available;
      end if;
      insert into public.credit_ledger (user_id, delta, kind, booking_id, note)
      values (b.user_id, -p_extra, 'hold', b.id, 'Extra hold for the extension');
    end if;
    update public.bookings set end_at = x.new_end_at, credit_hold = credit_hold + greatest(coalesce(p_extra, 0), 0),
      updated_at = public.app_now()
    where id = b.id; -- the double-booking constraint refuses a clash with the next booking
  end if;

  update public.extension_requests set
    status = case when p_approve then 'approved'::public.decision_status else 'rejected'::public.decision_status end,
    decided_by = p_actor, decision_reason = nullif(trim(p_reason), ''), decided_at = public.app_now()
  where id = p_ext returning * into x;

  perform public.queue_notifications(public.log_event(
    p_actor, p_role, case when p_approve then 'EXTENSION_APPROVED' else 'EXTENSION_REJECTED' end, 'booking', b.id::text,
    v_org, b.user_id, 'pending', x.status::text, p_reason,
    jsonb_build_object('extension_id', x.id, 'previous_end', v_prev, 'new_end', x.new_end_at, 'extra_credits', coalesce(p_extra, 0)),
    b.policy_version_id));
  return x;
end;
$$;

create function public.request_extension(
  p_user uuid, p_booking uuid, p_new_end timestamptz, p_reason text, p_note text, p_extra integer, p_auto boolean
) returns public.extension_requests
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  x public.extension_requests;
  v_next timestamptz;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.user_id <> p_user then raise exception 'not_found: Booking not found.'; end if;
  if b.status not in ('approved', 'checked_out') then
    raise exception 'invalid_state: Only an approved or borrowed booking can be extended.';
  end if;
  if p_new_end <= b.end_at then raise exception 'invalid_slot: Pick a new end after the current one.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required: Say why you need more time.'; end if;
  if exists (select 1 from public.extension_requests where booking_id = p_booking and status = 'pending') then
    raise exception 'duplicate: An extension request is already waiting.';
  end if;
  select min(start_at) into v_next from public.bookings
  where unit_id = b.unit_id and id <> b.id and status in ('approved', 'offered', 'checked_out', 'overdue')
    and tstzrange(start_at, end_at, '[)') && tstzrange(b.end_at, p_new_end, '[)');
  if v_next is not null then
    raise exception 'conflict: The next booking of this unit starts %. Pick an earlier end.', public.ist(v_next);
  end if;

  insert into public.extension_requests (booking_id, new_end_at, reason, note)
  values (p_booking, p_new_end, trim(p_reason), nullif(trim(p_note), '')) returning * into x;
  perform public.queue_notifications(public.log_event(
    p_user, 'student', 'EXTENSION_REQUESTED', 'booking', p_booking::text,
    (select org_id from public.resources where id = b.resource_id), p_user, null, 'pending', trim(p_reason),
    jsonb_build_object('extension_id', x.id, 'new_end', p_new_end, 'extra_credits', p_extra), b.policy_version_id));
  if p_auto then
    return public.decide_extension(x.id, null, 'system', true, 'Within the limits and no conflict: approved automatically.', p_extra);
  end if;
  return x;
end;
$$;

-- ---------------------------------------------------------------------------- emergency credits (PRD 9)
create function public.request_emergency_credits(
  p_user uuid, p_booking uuid, p_amount integer, p_reason text, p_urgency text
) returns public.emergency_credit_requests
language plpgsql security definer set search_path = '' as $$
declare
  v_year text := public.academic_year(public.app_now());
  v_cap int := (public.policy_values() ->> 'emergency_grant_cap')::int;
  x public.emergency_credit_requests;
begin
  if not exists (select 1 from public.profiles where id = p_user and status = 'verified') then
    raise exception 'not_verified: Only verified students can request emergency credits.';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > v_cap then
    raise exception 'invalid_amount: Ask for between 1 and % credits.', v_cap;
  end if;
  if coalesce(length(trim(p_reason)), 0) < 10 then
    raise exception 'reason_required: Explain the deadline or need in a sentence.';
  end if;
  if p_booking is not null and not exists (select 1 from public.bookings where id = p_booking and user_id = p_user) then
    raise exception 'not_found: Booking not found.';
  end if;
  if exists (select 1 from public.emergency_credit_requests where user_id = p_user and academic_year = v_year and status = 'pending') then
    raise exception 'duplicate: Your emergency request is already waiting for an Admin.';
  end if;
  if exists (select 1 from public.emergency_credit_requests
             where user_id = p_user and academic_year = v_year and status in ('approved', 'partial')) then
    raise exception 'duplicate: Emergency credits are granted once per academic year, and you already had yours for %.', v_year;
  end if;

  insert into public.emergency_credit_requests (user_id, booking_id, amount, reason, urgency, academic_year)
  values (p_user, p_booking, p_amount, trim(p_reason), case when p_urgency = 'high' then 'high' else 'normal' end, v_year)
  returning * into x;
  perform public.queue_notifications(public.log_event(
    p_user, 'student', 'EMERGENCY_CREDITS_REQUESTED', 'emergency_credit_request', x.id::text, null, p_user, null, 'pending',
    format('%s credits: %s', p_amount, trim(p_reason)), jsonb_build_object('amount', p_amount, 'urgency', x.urgency)));
  return x;
end;
$$;

-- Admin grants fully, partly or not at all. Free credits, not an advance; the booking still goes
-- through normal eligibility and approval (no queue jumping).
create function public.decide_emergency_credits(p_admin uuid, p_request uuid, p_grant integer, p_reason text)
returns public.emergency_credit_requests
language plpgsql security definer set search_path = '' as $$
declare
  x public.emergency_credit_requests;
  v_cap int := (public.policy_values() ->> 'emergency_grant_cap')::int;
  v_status public.decision_status;
begin
  perform public.require_admin(p_admin);
  select * into x from public.emergency_credit_requests where id = p_request for update;
  if not found or x.status <> 'pending' then raise exception 'invalid_state: This request is no longer pending.'; end if;
  if p_grant is null or p_grant < 0 or p_grant > least(x.amount, v_cap) then
    raise exception 'invalid_amount: Grant between 0 and % credits.', least(x.amount, v_cap);
  end if;
  v_status := case when p_grant = 0 then 'rejected' when p_grant = x.amount then 'approved' else 'partial' end;
  if v_status <> 'approved' and coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required: Give the student a reason.';
  end if;
  if p_grant > 0 then
    insert into public.credit_ledger (user_id, delta, kind, booking_id, note)
    values (x.user_id, p_grant, 'emergency_grant', x.booking_id, 'Emergency credits granted by an Admin');
  end if;
  update public.emergency_credit_requests set status = v_status, granted_amount = p_grant,
    decided_by = p_admin, decision_reason = nullif(trim(p_reason), ''), decided_at = public.app_now()
  where id = p_request returning * into x;
  perform public.queue_notifications(public.log_event(
    p_admin, 'admin', 'EMERGENCY_CREDITS_DECIDED', 'emergency_credit_request', x.id::text, null, x.user_id, 'pending',
    v_status::text, coalesce(nullif(trim(p_reason), ''), format('%s credits granted', p_grant)),
    jsonb_build_object('requested', x.amount, 'granted', p_grant)));
  return x;
end;
$$;

-- ---------------------------------------------------------------------------- policy versions (PRD 12)
-- A change creates a new version; bookings keep the version they were requested under. p_diff is
-- {previous: {...}, new: {...}} of the changed keys, computed and validated by the server action.
create function public.change_policy(p_admin uuid, p_values jsonb, p_diff jsonb, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_prev public.policy_versions;
  v_id uuid;
begin
  perform public.require_admin(p_admin);
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'reason_required: A reason is required.'; end if;
  select * into v_prev from public.policy_versions order by version desc limit 1 for update;
  if v_prev."values" = p_values then raise exception 'no_change: Nothing changed.'; end if;
  insert into public.policy_versions (version, "values", created_by, reason)
  values (v_prev.version + 1, p_values, p_admin, trim(p_reason)) returning id into v_id;
  perform public.queue_notifications(public.log_event(
    p_admin, 'admin', 'POLICY_CHANGED', 'policy_version', v_id::text, null, null,
    'v' || v_prev.version, 'v' || (v_prev.version + 1), trim(p_reason), p_diff, v_id));
  return v_prev.version + 1;
end;
$$;

-- ---------------------------------------------------------------------------- demo clock (PRD 17)
-- Forward only, or back to real time (p_advance_seconds null). Demo mode only; always audited.
create function public.set_clock(p_admin uuid, p_advance_seconds bigint) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_before timestamptz := public.app_now();
  v_after timestamptz;
begin
  perform public.require_admin(p_admin);
  if not coalesce((select demo_mode from public.app_settings where id), false) then
    raise exception 'demo_only: Clock controls work only in demo mode.';
  end if;
  if p_advance_seconds is not null and p_advance_seconds <= 0 then
    raise exception 'invalid_amount: The clock only moves forward.';
  end if;
  update public.app_clock set
    offset_seconds = case when p_advance_seconds is null then 0 else offset_seconds + p_advance_seconds end,
    updated_at = now()
  where id;
  v_after := public.app_now();
  perform public.log_event(p_admin, 'admin', 'CLOCK_CHANGED', 'clock', 'app_clock', null, null,
    v_before::text, v_after::text,
    case when p_advance_seconds is null then 'Clock reset to real time'
      else format('Clock moved forward %s', make_interval(secs => p_advance_seconds)) end,
    jsonb_build_object('advance_seconds', p_advance_seconds));
  return v_after;
end;
$$;

revoke execute on function public.policy_values, public.ist, public.academic_year, public.free_units, public.notify,
  public.notify_staff, public.notify_admins, public.offer_next, public.scheduler_tick, public.report_owner_absent,
  public.decide_extension, public.request_extension, public.request_emergency_credits, public.decide_emergency_credits,
  public.change_policy, public.set_clock
  from public, anon, authenticated;
grant execute on function public.policy_values, public.ist, public.academic_year, public.free_units, public.notify,
  public.notify_staff, public.notify_admins, public.offer_next, public.scheduler_tick, public.report_owner_absent,
  public.decide_extension, public.request_extension, public.request_emergency_credits, public.decide_emergency_credits,
  public.change_policy, public.set_clock
  to service_role;
