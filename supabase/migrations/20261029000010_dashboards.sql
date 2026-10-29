-- Phase 6: dashboards and insights (PRD 12).

-- ---------------------------------------------------------------------------- audit log search (PRD 12, 15)
-- Filters for user, resource, organisation, event type, actor, date range and policy version.
-- Visibility is the audit_events read policy (own, org staff, or Admin), applied once in the WHERE
-- clause: under RLS the per-row policy checks across the joins timed out. Booking events are
-- resolved to their resource so "resource" filters every event about it. No contact details.
create function public.audit_search(
  p_actor text default null,
  p_user text default null,
  p_resource uuid default null,
  p_org uuid default null,
  p_action text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_policy_version integer default null,
  p_limit integer default 300
) returns table (
  id bigint, created_at timestamptz, action text, actor_name text, actor_role text, entity_type text, entity_id text,
  org_name text, resource_name text, subject_name text, from_state text, to_state text, reason text, policy_version integer
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.created_at, e.action, a.full_name, e.actor_role, e.entity_type, e.entity_id,
         o.name, r.name, s.full_name, e.from_state, e.to_state, e.reason, pv.version
  from public.audit_events e
  left join public.profiles a on a.id = e.actor_id
  left join public.profiles s on s.id = e.subject_user_id
  left join public.organizations o on o.id = e.org_id
  left join public.policy_versions pv on pv.id = e.policy_version_id
  left join public.bookings b on e.entity_type = 'booking' and b.id = case when e.entity_type = 'booking' then e.entity_id::uuid end
  left join public.resources r on r.id = coalesce(b.resource_id, case when e.entity_type = 'resource' then e.entity_id::uuid end)
  where ((select public.is_admin()) or e.subject_user_id = (select auth.uid())
         or e.org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())))
    and (p_actor is null or a.full_name ilike '%' || p_actor || '%' or e.actor_role ilike p_actor)
    and (p_user is null or s.full_name ilike '%' || p_user || '%')
    and (p_resource is null or r.id = p_resource)
    and (p_org is null or e.org_id = p_org)
    and (p_action is null or e.action ilike '%' || p_action || '%')
    and (p_from is null or e.created_at >= p_from)
    and (p_to is null or e.created_at < p_to)
    and (p_policy_version is null or pv.version = p_policy_version)
  order by e.id desc
  limit least(greatest(coalesce(p_limit, 300), 1), 5000);
$$;

revoke execute on function public.audit_search from public, anon;
grant execute on function public.audit_search to authenticated, service_role;

-- ---------------------------------------------------------------------------- badge types (PRD 12 Admin)
create function public.create_badge_type(
  p_actor uuid, p_name text, p_description text, p_org uuid, p_validity_days integer
) returns public.badge_types
language plpgsql security definer set search_path = '' as $$
declare
  t public.badge_types;
begin
  if not exists (select 1 from public.profiles where id = p_actor and is_admin) then
    raise exception 'forbidden: Only an Admin can define badge types.';
  end if;
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'invalid: Give the badge a name.'; end if;
  if p_validity_days is null or p_validity_days < 1 or p_validity_days > 3650 then
    raise exception 'invalid: Validity must be between 1 and 3650 days.';
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then raise exception 'not_found: Organisation not found.'; end if;
  if exists (select 1 from public.badge_types where lower(name) = lower(trim(p_name))) then
    raise exception 'duplicate: A badge type with this name already exists.';
  end if;
  insert into public.badge_types (name, description, issuing_org_id, validity_days)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_org, p_validity_days)
  returning * into t;
  perform public.log_event(p_actor, 'admin', 'BADGE_TYPE_CREATED', 'badge_type', t.id::text, p_org, null, null, 'active',
    null, jsonb_build_object('name', t.name, 'validity_days', t.validity_days));
  return t;
end;
$$;

revoke execute on function public.create_badge_type from public, anon, authenticated;
grant execute on function public.create_badge_type to service_role;
