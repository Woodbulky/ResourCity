-- Phase 1 foundation: simulated clock, settings, enums, every table from PRD Section 5.
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Simulated clock (PRD 5, 17). Every business time comparison uses app_now().
-- ---------------------------------------------------------------------------
create table public.app_clock (
  id boolean primary key default true check (id),
  offset_seconds bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.app_clock default values;

create function public.app_now() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select now() + make_interval(secs => coalesce((select offset_seconds from public.app_clock where id), 0));
$$;

-- Demo-mode flag the database can read (the domain trigger cannot see NEXT_PUBLIC_DEMO_MODE).
create table public.app_settings (
  id boolean primary key default true check (id),
  demo_mode boolean not null default false
);
insert into public.app_settings default values;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.account_status as enum ('pending_verification', 'verified', 'suspended');
create type public.org_type as enum ('club', 'lab', 'department', 'facility', 'office');
create type public.membership_role as enum ('owner', 'manager');
create type public.badge_status as enum ('pending', 'verified', 'rejected', 'expired', 'revoked');
create type public.resource_category as enum (
  'classroom', 'seminar_hall', 'meeting_room', 'sports_ground', 'lab',
  'electronics', 'media', 'sports_equipment', 'machine', 'other'
);
create type public.form_template as enum ('space', 'lab', 'portable', 'machine');
create type public.resource_status as enum ('active', 'paused', 'under_maintenance', 'unsafe');
create type public.approval_mode as enum ('auto', 'owner', 'manager');
create type public.allocation_mode as enum ('instant', 'batch');
create type public.rate_unit as enum ('hour', 'day');
create type public.usage_estimate as enum ('rarely', 'weekly', 'daily');
create type public.booking_status as enum (
  'pending_allocation', 'pending_approval', 'waitlisted', 'offered', 'approved',
  'checked_out', 'overdue', 'returned', 'under_review', 'completed',
  'rejected', 'cancelled', 'no_show', 'expired'
);
create type public.purpose_category as enum ('academic_deadline', 'project_research', 'club_activity', 'personal');
create type public.approver_role as enum ('owner', 'manager');
create type public.decision_status as enum ('pending', 'approved', 'partial', 'rejected', 'cancelled');
create type public.condition_phase as enum ('checkout', 'return');
create type public.damage_severity as enum ('minor', 'major', 'unusable');
create type public.damage_status as enum ('awaiting_response', 'ready_for_decision', 'more_evidence_requested', 'decided');
create type public.damage_outcome as enum ('dismissed', 'warning', 'credit_deduction', 'restriction', 'insufficient_evidence');
create type public.penalty_kind as enum ('late', 'no_show', 'damage');
create type public.penalty_status as enum ('proposed', 'confirmed', 'reduced', 'waived', 'auto_applied', 'appealed');
create type public.incident_severity as enum ('low', 'medium', 'high');
create type public.incident_status as enum ('open', 'investigating', 'closed');
create type public.ledger_kind as enum (
  'allowance', 'hold', 'release', 'charge', 'penalty', 'forfeit', 'emergency_grant', 'reset_expiry'
);

-- ---------------------------------------------------------------------------
-- People and organisations
-- ---------------------------------------------------------------------------
create table public.allowed_domains (
  domain text primary key check (domain = lower(domain))
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null unique,
  avatar_url text,
  department text,
  year smallint check (year between 1 and 4),
  roll_number text,
  phone text,
  status public.account_status not null default 'pending_verification',
  status_reason text,
  suspended_until timestamptz,
  is_admin boolean not null default false,
  onboarding_complete boolean not null default false,
  id_proof_path text,
  verification_submitted_at timestamptz,
  created_at timestamptz not null default public.app_now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type public.org_type not null,
  created_at timestamptz not null default public.app_now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  role public.membership_role not null,
  granted_by uuid references public.profiles (id),
  reason text not null,
  created_at timestamptz not null default public.app_now(),
  unique (user_id, org_id, role)
);
create index on public.memberships (org_id, role);

-- Org-level restriction from a damage decision (PRD 3, 11): "temporary restriction in this organisation".
create table public.org_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  until timestamptz not null,
  reason text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default public.app_now()
);
create index on public.org_restrictions (user_id, org_id);

create table public.badge_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  issuing_org_id uuid not null references public.organizations (id),
  validity_days integer not null check (validity_days > 0)
);

create table public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_type_id uuid not null references public.badge_types (id),
  status public.badge_status not null default 'pending',
  certificate_path text,
  issued_at date,
  expires_at timestamptz,
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  decision_reason text,
  ai_extraction jsonb,
  created_at timestamptz not null default public.app_now()
);
create index on public.user_badges (user_id);

-- ---------------------------------------------------------------------------
-- Resources (PRD 6)
-- ---------------------------------------------------------------------------
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  category public.resource_category not null,
  form_template public.form_template not null,
  name text not null,
  description text not null default '',
  location text not null default '',
  photos text[] not null default '{}',
  quantity integer not null default 1 check (quantity > 0),
  status public.resource_status not null default 'active',
  approval_mode public.approval_mode not null default 'owner',
  allocation_mode public.allocation_mode not null default 'instant',
  batch_cutoff_hours integer not null default 24 check (batch_cutoff_hours >= 0),
  eligibility jsonb not null default '{}',
  booking_rules jsonb not null default '{}',
  safety_rules jsonb not null default '{}',
  category_fields jsonb not null default '{}',
  checklist jsonb not null default '{"items": [], "shots": []}',
  base_rate integer not null default 0 check (base_rate >= 0),
  rate_unit public.rate_unit not null default 'hour',
  peak_multiplier numeric(3, 2) not null default 1.5 check (peak_multiplier >= 1),
  replacement_value integer,
  estimated_current_usage public.usage_estimate not null default 'rarely',
  door_qr_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default public.app_now(),
  updated_at timestamptz not null default public.app_now()
);
create index on public.resources (org_id);
create index on public.resources (category);

-- Every resource has at least one unit, so the double-booking guard always has a unit_id to work on.
create table public.resource_units (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  label text not null,
  status public.resource_status not null default 'active',
  unique (resource_id, label)
);

create function public.create_resource_units() returns trigger
language plpgsql set search_path = '' as $$
begin
  insert into public.resource_units (resource_id, label)
  select new.id, 'Unit ' || n from generate_series(1, new.quantity) n;
  return new;
end;
$$;
create trigger resources_create_units after insert on public.resources
  for each row execute function public.create_resource_units();

create table public.availability_windows (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday, IST
  start_time time not null,
  end_time time not null check (end_time > start_time)
);
create index on public.availability_windows (resource_id);

create table public.blackouts (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text not null
);
create index on public.blackouts (resource_id);

create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  "values" jsonb not null, -- quoted: VALUES is a reserved word
  created_by uuid references public.profiles (id),
  reason text not null,
  created_at timestamptz not null default public.app_now()
);

-- ---------------------------------------------------------------------------
-- Bookings (PRD 5, 7-10)
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id),
  unit_id uuid references public.resource_units (id),
  user_id uuid not null references public.profiles (id),
  request_group_id uuid, -- one request for several units creates one booking per unit
  start_at timestamptz not null,
  end_at timestamptz not null,
  status public.booking_status not null,
  status_reason text,
  purpose_category public.purpose_category not null default 'personal',
  purpose_text text not null default '',
  purpose_verified boolean not null default false,
  attachments text[] not null default '{}',
  is_exception boolean not null default false,
  exception_reason text,
  eligibility_snapshot jsonb,
  cutoff_at timestamptz,
  priority_score numeric(5, 2),
  score_breakdown jsonb,
  allocation_rule text,
  waitlist_position integer,
  offer_expires_at timestamptz,
  policy_version_id uuid not null references public.policy_versions (id),
  credit_hold integer not null default 0 check (credit_hold >= 0),
  credit_charged integer check (credit_charged >= 0),
  grace_minutes integer,
  picked_up_at timestamptz,
  returned_at timestamptz,
  approver_role public.approver_role not null default 'owner',
  decided_by uuid references public.profiles (id),
  escalation_level smallint not null default 0,
  escalated_at timestamptz,
  created_at timestamptz not null default public.app_now(),
  updated_at timestamptz not null default public.app_now(),
  check (end_at > start_at),
  check (status not in ('approved', 'offered', 'checked_out', 'overdue') or unit_id is not null),
  -- Double-booking guard (PRD 5): one unit cannot hold two overlapping slots.
  constraint bookings_no_double_booking exclude using gist (
    unit_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('approved', 'offered', 'checked_out', 'overdue'))
);
create index on public.bookings (user_id, status);
create index on public.bookings (resource_id, start_at);
create index on public.bookings (status, start_at);

create table public.extension_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  new_end_at timestamptz not null,
  reason text not null,
  note text,
  status public.decision_status not null default 'pending',
  decided_by uuid references public.profiles (id),
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default public.app_now()
);
create index on public.extension_requests (booking_id);

create table public.condition_reports (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  phase public.condition_phase not null,
  checklist_results jsonb not null default '[]', -- [{item, ok, note}]
  photos jsonb not null default '[]', -- [{shot, path}]
  notes text,
  supervisor_name text,
  owner_signed_by uuid references public.profiles (id),
  owner_signed_at timestamptz,
  student_ack_at timestamptz,
  ai_analysis jsonb,
  created_at timestamptz not null default public.app_now(),
  unique (booking_id, phase)
);

-- ---------------------------------------------------------------------------
-- Trust workflows (PRD 11)
-- ---------------------------------------------------------------------------
create table public.damage_cases (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  reported_by uuid not null references public.profiles (id),
  description text not null,
  severity public.damage_severity not null,
  ai_flags jsonb,
  status public.damage_status not null default 'awaiting_response',
  student_response text,
  student_response_photos text[] not null default '{}',
  responded_at timestamptz,
  response_deadline timestamptz not null,
  assigned_to uuid references public.profiles (id),
  outcome public.damage_outcome,
  credits_deducted integer check (credits_deducted >= 0),
  restriction_until timestamptz,
  decision_reason text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default public.app_now(),
  check (assigned_to is distinct from reported_by)
);
create index on public.damage_cases (booking_id);
create index on public.damage_cases (assigned_to, status);

create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  user_id uuid not null references public.profiles (id),
  kind public.penalty_kind not null,
  proposed_amount integer not null check (proposed_amount >= 0),
  final_amount integer check (final_amount >= 0),
  status public.penalty_status not null default 'proposed',
  policy_version_id uuid references public.policy_versions (id),
  decided_by uuid references public.profiles (id),
  reason text,
  appeal_text text,
  decided_at timestamptz,
  created_at timestamptz not null default public.app_now()
);
create index on public.penalties (booking_id);
create index on public.penalties (status);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id),
  booking_id uuid references public.bookings (id),
  reported_by uuid not null references public.profiles (id),
  occurred_at timestamptz not null,
  location text not null default '',
  description text not null,
  evidence text[] not null default '{}',
  severity public.incident_severity not null,
  status public.incident_status not null default 'open',
  actions text,
  resolution text,
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  created_at timestamptz not null default public.app_now()
);
create index on public.incidents (resource_id, status);

-- ---------------------------------------------------------------------------
-- Credits (PRD 9). Available balance = sum(delta); holds are negative deltas,
-- releases positive. Never store a balance column.
-- ---------------------------------------------------------------------------
create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null,
  kind public.ledger_kind not null,
  booking_id uuid references public.bookings (id),
  week_start date,
  note text,
  created_at timestamptz not null default public.app_now()
);
create index on public.credit_ledger (user_id);
create index on public.credit_ledger (booking_id);

create table public.emergency_credit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  booking_id uuid references public.bookings (id),
  amount integer not null check (amount > 0),
  reason text not null,
  urgency text not null default 'normal' check (urgency in ('normal', 'high')),
  proof_path text,
  academic_year text not null,
  status public.decision_status not null default 'pending',
  granted_amount integer check (granted_amount >= 0),
  decided_by uuid references public.profiles (id),
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default public.app_now()
);
create index on public.emergency_credit_requests (status);

-- ---------------------------------------------------------------------------
-- Notifications and audit (PRD 13, 15)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  link text,
  dedupe_key text not null unique,
  urgent boolean not null default false,
  email_eligible boolean not null default false,
  email_status text,
  read_at timestamptz,
  created_at timestamptz not null default public.app_now()
);
create index on public.notifications (user_id, read_at);

-- org_id and subject_user_id are additions to PRD 5 so RLS can scope reads without joins.
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id),
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  org_id uuid references public.organizations (id),
  subject_user_id uuid references public.profiles (id),
  from_state text,
  to_state text,
  reason text,
  metadata jsonb not null default '{}',
  policy_version_id uuid references public.policy_versions (id),
  created_at timestamptz not null default public.app_now()
);
create index on public.audit_events (entity_type, entity_id);
create index on public.audit_events (org_id, created_at);
create index on public.audit_events (subject_user_id, created_at);
