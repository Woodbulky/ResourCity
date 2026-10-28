-- Phase 1: RLS baseline on every table and private storage buckets (PRD 15).
-- Writes to bookings, ledger, audit, notifications and trust workflows happen only on the
-- server (service role / security-definer functions), so those tables get read policies only.

create function public.can_read_booking(p_booking uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b join public.resources r on r.id = b.resource_id
    where b.id = p_booking
      and (b.user_id = auth.uid() or public.is_staff_of(r.org_id) or public.is_admin())
  );
$$;

-- Org staff see the profiles of students who request their resources (PRD 15).
create function public.is_requester_of_my_org(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b join public.resources r on r.id = b.resource_id
    where b.user_id = p_profile and public.is_staff_of(r.org_id)
  );
$$;

create function public.owns_resource(p_resource uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.resources r where r.id = p_resource and public.is_owner_of(r.org_id));
$$;

-- Storage paths start with an id folder; a malformed one simply grants nothing.
create function public.path_uuid(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid end;
$$;

-- Enable RLS everywhere; the anon role gets nothing (every page needs a signed-in user).
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Server-only tables (no policies): app_clock, app_settings, allowed_domains.

create policy "read transitions" on public.booking_transitions for select to authenticated using (true);

create policy "read own, requesters, or all as admin" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin() or public.is_requester_of_my_org(id));
create policy "update own editable columns" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "read organizations" on public.organizations for select to authenticated using (true);
create policy "read memberships" on public.memberships for select to authenticated using (true);
create policy "read badge types" on public.badge_types for select to authenticated using (true);
create policy "read policy versions" on public.policy_versions for select to authenticated using (true);

create policy "read own or as org manager" on public.org_restrictions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_manager_of(org_id) or public.is_admin());

create policy "read own or as issuing org staff" on public.user_badges for select to authenticated
  using (
    user_id = (select auth.uid()) or public.is_admin()
    or public.is_staff_of((select bt.issuing_org_id from public.badge_types bt where bt.id = badge_type_id))
  );

-- Resources: everyone signed in browses; Owners write for their org. "unsafe" is set and
-- cleared only through the incident flow (server), never by an Owner edit.
create policy "read resources" on public.resources for select to authenticated using (true);
create policy "owners create" on public.resources for insert to authenticated
  with check (public.is_owner_of(org_id) and status <> 'unsafe');
create policy "owners update" on public.resources for update to authenticated
  using (public.is_owner_of(org_id) and status <> 'unsafe')
  with check (public.is_owner_of(org_id) and status <> 'unsafe');

create policy "read units" on public.resource_units for select to authenticated using (true);
create policy "owners write units" on public.resource_units for all to authenticated
  using (public.owns_resource(resource_id)) with check (public.owns_resource(resource_id) and status <> 'unsafe');
create policy "read windows" on public.availability_windows for select to authenticated using (true);
create policy "owners write windows" on public.availability_windows for all to authenticated
  using (public.owns_resource(resource_id)) with check (public.owns_resource(resource_id));
create policy "read blackouts" on public.blackouts for select to authenticated using (true);
create policy "owners write blackouts" on public.blackouts for all to authenticated
  using (public.owns_resource(resource_id)) with check (public.owns_resource(resource_id));

create policy "read own, org, or admin" on public.bookings for select to authenticated
  using (
    user_id = (select auth.uid()) or public.is_admin()
    or public.is_staff_of((select r.org_id from public.resources r where r.id = resource_id))
  );
create policy "read with booking" on public.condition_reports for select to authenticated
  using (public.can_read_booking(booking_id));
create policy "read with booking" on public.extension_requests for select to authenticated
  using (public.can_read_booking(booking_id));

create policy "read as party, org manager, or admin" on public.damage_cases for select to authenticated
  using (
    reported_by = (select auth.uid()) or assigned_to = (select auth.uid()) or public.is_admin()
    or exists (
      select 1 from public.bookings b join public.resources r on r.id = b.resource_id
      where b.id = booking_id and (b.user_id = (select auth.uid()) or public.is_manager_of(r.org_id))
    )
  );
create policy "read own, org manager, or admin" on public.penalties for select to authenticated
  using (
    user_id = (select auth.uid()) or public.is_admin()
    or exists (
      select 1 from public.bookings b join public.resources r on r.id = b.resource_id
      where b.id = booking_id and public.is_manager_of(r.org_id)
    )
  );
create policy "read as party, org manager, or admin" on public.incidents for select to authenticated
  using (
    reported_by = (select auth.uid()) or public.is_admin()
    or public.is_manager_of((select r.org_id from public.resources r where r.id = resource_id))
    or exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = (select auth.uid()))
  );

create policy "read own or admin" on public.credit_ledger for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy "read own or admin" on public.emergency_credit_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy "read own" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "read own, org, or admin" on public.audit_events for select to authenticated
  using (subject_user_id = (select auth.uid()) or public.is_staff_of(org_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage (PRD 15): private buckets, paths start with an id folder.
--   id-proofs/{user_id}/...          certificates/{user_id}/...
--   condition-photos/{booking_id}/... incident-evidence/{user_id}/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('id-proofs', 'id-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('certificates', 'certificates', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('condition-photos', 'condition-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('incident-evidence', 'incident-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

create policy "id-proofs: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'id-proofs' and public.path_uuid(name) = (select auth.uid()));
create policy "id-proofs: admin reads" on storage.objects for select to authenticated
  using (bucket_id = 'id-proofs' and public.is_admin());

create policy "certificates: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'certificates' and public.path_uuid(name) = (select auth.uid()));
create policy "certificates: own or issuing org owner" on storage.objects for select to authenticated
  using (
    bucket_id = 'certificates' and (
      public.path_uuid(name) = (select auth.uid())
      or exists (
        select 1 from public.user_badges ub join public.badge_types bt on bt.id = ub.badge_type_id
        where ub.certificate_path = name and public.is_owner_of(bt.issuing_org_id)
      )
    )
  );

create policy "condition-photos: booking parties upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'condition-photos' and public.can_read_booking(public.path_uuid(name)));
create policy "condition-photos: booking parties read" on storage.objects for select to authenticated
  using (bucket_id = 'condition-photos' and public.can_read_booking(public.path_uuid(name)));

create policy "incident-evidence: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'incident-evidence' and public.path_uuid(name) = (select auth.uid()));
create policy "incident-evidence: reporter, org managers, admin" on storage.objects for select to authenticated
  using (
    bucket_id = 'incident-evidence' and (
      public.path_uuid(name) = (select auth.uid()) or public.is_admin()
      or exists (
        select 1 from public.incidents i join public.resources r on r.id = i.resource_id
        where name = any (i.evidence) and public.is_manager_of(r.org_id)
      )
    )
  );
