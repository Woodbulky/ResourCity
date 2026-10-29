-- Judge demo step 2 (PRD 17): Aarav is "verified, no CNC badge" and the camera shows Eligible. The
-- DSLR is badge-gated (Photography Basics), so he needs that badge; the gate only looked open before
-- because Zod 4's uuid() rejected the seed's badge ids and eligibility fell back to "no requirements".
-- The base seed stays as written in migration 5; this wrapper adds the one badge after it.
alter function public.seed_demo() rename to seed_demo_base;

create function public.seed_demo() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_demo_base();
  insert into public.user_badges (user_id, badge_type_id, status, certificate_path, issued_at, expires_at, verified_by, verified_at, created_at)
  values ('00000000-0000-4000-a000-000000000007', '00000000-0000-4000-c000-000000000001', 'verified',
    '00000000-0000-4000-a000-000000000007/00000000-0000-4000-c000-000000000001.jpg',
    (public.app_now() - interval '45 days')::date, public.app_now() + interval '320 days',
    '00000000-0000-4000-a000-000000000004', public.app_now() - interval '44 days', public.app_now() - interval '45 days');
end;
$$;

revoke execute on function public.seed_demo, public.seed_demo_base from public, anon, authenticated;
grant execute on function public.seed_demo to service_role;
