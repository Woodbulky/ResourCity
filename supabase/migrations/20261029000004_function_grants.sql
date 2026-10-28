-- Phase 1 hardening (security advisor): no function is callable while signed out, the trigger
-- function is not callable at all, and new functions start closed. RLS helpers stay executable
-- by authenticated because policies call them as the querying user.
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;
revoke execute on function public.handle_new_user, public.audit_events_immutable, public.create_resource_units
  from authenticated;
