-- Phase 7 forbidden-action pass (PRD 15): close the gaps found by sweeping every grant to anon and
-- authenticated. RLS stays the per-row gate; these remove privileges no app path uses.

-- TRUNCATE bypasses RLS. PostgREST never issues it, but no signed-in role needs it either.
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from anon, authenticated;

-- Units are created by the create_resource_units trigger (security invoker, so Owners keep INSERT).
-- Unit status changes only through set_resource_status(): the old ALL policy let an Owner move a unit
-- out of 'unsafe' with a direct REST call, skipping the Manager-only restore step.
revoke update, delete on public.resource_units from authenticated;

-- Owners edit listing fields directly under RLS (resource-actions.ts). Status (pause, maintenance,
-- unsafe, restore), quantity (units follow it) and the door QR token change only server-side.
revoke update on public.resources from authenticated;
grant update (org_id, category, form_template, name, description, location, photos, approval_mode,
  allocation_mode, batch_cutoff_hours, eligibility, booking_rules, safety_rules, category_fields,
  checklist, base_rate, rate_unit, peak_multiplier, replacement_value, estimated_current_usage)
  on public.resources to authenticated;

-- Supabase's auto-RLS event trigger function: never called over the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
