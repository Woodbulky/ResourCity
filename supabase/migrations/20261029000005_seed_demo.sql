-- Phase 1: demo seed (PRD 17) as a function, so "Reset demo data" (Phase 7) re-runs exactly this.
-- All people, organisations and data are fictional. Every time is relative to app_now(), so the
-- demo always looks live. Users, orgs, badge types and resources keep fixed ids; bookings get
-- fresh ids on every run so the append-only audit log never mixes two seed runs on one booking.
-- Demo password for every seeded account: DvitDemo@2026 (also in docs/SUBMISSION.md).

create function public.seed_demo() returns void
language plpgsql security definer set search_path = '' as $$
declare
  ist constant text := 'Asia/Kolkata';
  v_now timestamptz;
  v_today date;
  v_week date;
  v_court_day date;
  v_p1 uuid := gen_random_uuid();
  v_p2 uuid := gen_random_uuid();
  -- people
  u_admin uuid := '00000000-0000-4000-a000-000000000001';
  u_mehta uuid := '00000000-0000-4000-a000-000000000002';
  u_kulkarni uuid := '00000000-0000-4000-a000-000000000003';
  u_photo uuid := '00000000-0000-4000-a000-000000000004';
  u_maker uuid := '00000000-0000-4000-a000-000000000005';
  u_riya uuid := '00000000-0000-4000-a000-000000000006';
  u_aarav uuid := '00000000-0000-4000-a000-000000000007';
  u_sneha uuid := '00000000-0000-4000-a000-000000000008';
  u_kabir uuid := '00000000-0000-4000-a000-000000000009';
  u_om uuid := '00000000-0000-4000-a000-000000000010';
  u_ishaan uuid := '00000000-0000-4000-a000-000000000011';
  u_meera uuid := '00000000-0000-4000-a000-000000000012';
  u_tanvi uuid := '00000000-0000-4000-a000-000000000013';
  u_rohan uuid := '00000000-0000-4000-a000-000000000014';
  u_dev uuid := '00000000-0000-4000-a000-000000000015';
  v_students uuid[];
  -- organisations
  o_photo uuid := '00000000-0000-4000-b000-000000000001';
  o_maker uuid := '00000000-0000-4000-b000-000000000002';
  o_ece uuid := '00000000-0000-4000-b000-000000000003';
  o_comp uuid := '00000000-0000-4000-b000-000000000004';
  o_sports uuid := '00000000-0000-4000-b000-000000000005';
  o_acad uuid := '00000000-0000-4000-b000-000000000006';
  -- badge types
  bt_photo uuid := '00000000-0000-4000-c000-000000000001';
  bt_cnc uuid := '00000000-0000-4000-c000-000000000002';
  bt_ece uuid := '00000000-0000-4000-c000-000000000003';
  -- resources
  r_dslr uuid := '00000000-0000-4000-d000-000000000001';
  r_cnc uuid := '00000000-0000-4000-d000-000000000002';
  r_seminar uuid := '00000000-0000-4000-d000-000000000003';
  r_gpu uuid := '00000000-0000-4000-d000-000000000004';
  r_osc uuid := '00000000-0000-4000-d000-000000000005';
  r_court uuid := '00000000-0000-4000-d000-000000000006';
  r_lab uuid := '00000000-0000-4000-d000-000000000007';
  r_laptop uuid := '00000000-0000-4000-d000-000000000008';
  r_cricket uuid := '00000000-0000-4000-d000-000000000009';
  r_meeting uuid := '00000000-0000-4000-d000-000000000010';
  -- situation bookings (PRD 17 "Pre-seeded situations")
  b_sem1 uuid := gen_random_uuid(); -- seminar batch, 3 competing
  b_sem2 uuid := gen_random_uuid();
  b_sem3 uuid := gen_random_uuid();
  b_court uuid := gen_random_uuid(); -- court slot with 2 waitlisted
  b_wait1 uuid := gen_random_uuid();
  b_wait2 uuid := gen_random_uuid();
  b_overdue uuid := gen_random_uuid(); -- laptop overdue by 3 h, on policy v1
  b_late uuid := gen_random_uuid(); -- laptop returned late, penalty for Prof. Mehta
  b_cam_dispute uuid := gen_random_uuid(); -- camera under_review, response in, for Prof. Kulkarni
  b_osc_dispute uuid := gen_random_uuid(); -- oscilloscope reported by Prof. Mehta → Admin
  b_cnc_exception uuid := gen_random_uuid();
  b_escalated uuid := gen_random_uuid();
  b_cam_today uuid := gen_random_uuid(); -- handover due today
  b_cam_flag uuid := gen_random_uuid(); -- returned, AI flag to confirm
  b_sneha1 uuid := gen_random_uuid();
  b_sneha2 uuid := gen_random_uuid();
  v_policy jsonb := '{
    "weekly_allowance": 80, "emergency_grant_cap": 50, "category_caps": {},
    "default_category_cap": {"hours": 20, "allocations": 4},
    "grace": {"percent": 0.25, "min_minutes": 15, "max_minutes": 120},
    "strikes": {"limit": 3, "window_days": 30}, "cancellation_window_minutes": 0,
    "offer_windows": {"short_slot_max_minutes": 120, "short_minutes": 10, "long_minutes": 60},
    "escalation": {"owner_hours": 24, "owner_before_start_hours": 2, "manager_hours": 24},
    "dispute_response_hours": 48, "late_penalty_multiplier": 2
  }';
  v_ai jsonb;
begin
  if not coalesce((select demo_mode from public.app_settings where id), false) and session_user <> 'postgres' then
    raise exception 'seed_demo is available only in demo mode';
  end if;

  update public.app_clock set offset_seconds = 0, updated_at = now() where id;
  update public.app_settings set demo_mode = true where id;
  insert into public.allowed_domains values ('dvit.edu.in') on conflict do nothing;
  v_now := public.app_now();
  v_today := (v_now at time zone ist)::date;
  v_week := v_today - (extract(isodow from v_today)::int - 1);
  v_court_day := case when (v_now at time zone ist)::time < time '16:30' then v_today else v_today + 1 end;

  truncate public.notifications, public.credit_ledger, public.penalties, public.damage_cases,
    public.incidents, public.emergency_credit_requests, public.extension_requests,
    public.condition_reports, public.bookings, public.blackouts, public.availability_windows,
    public.resource_units, public.resources, public.user_badges, public.badge_types,
    public.org_restrictions, public.memberships, public.organizations, public.policy_versions;

  -- ---------------------------------------------------------------- accounts
  create temp table seed_users (
    id uuid, email text, name text, dept text, yr smallint, roll text,
    status public.account_status, is_admin boolean
  ) on commit drop;
  insert into seed_users values
    (u_admin, 'admin@dvit.edu.in', 'DVIT Admin', 'Administration', null, null, 'verified', true),
    (u_mehta, 'prof.mehta@dvit.edu.in', 'Prof. Rajesh Mehta', 'ECE', null, null, 'verified', false),
    (u_kulkarni, 'prof.kulkarni@dvit.edu.in', 'Prof. Sunita Kulkarni', 'Academic Office', null, null, 'verified', false),
    (u_photo, 'photo.lead@dvit.edu.in', 'Neha Joshi', 'Computer Engineering', 4, 'CE22041', 'verified', false),
    (u_maker, 'makerspace.lead@dvit.edu.in', 'Arjun Patil', 'Mechanical', 4, 'ME22017', 'verified', false),
    (u_riya, 'riya@dvit.edu.in', 'Riya Sharma', 'Computer Engineering', 3, 'CE23058', 'verified', false),
    (u_aarav, 'aarav@dvit.edu.in', 'Aarav Deshmukh', 'Mechanical', 2, 'ME24033', 'verified', false),
    (u_sneha, 'sneha@dvit.edu.in', 'Sneha Iyer', 'ECE', 4, 'EC22009', 'verified', false),
    (u_kabir, 'kabir@dvit.edu.in', 'Kabir Singh', 'IT', 2, 'IT24071', 'verified', false),
    (u_om, 'om@dvit.edu.in', 'Om Kale', 'Civil', 1, 'CV25012', 'pending_verification', false),
    (u_ishaan, 'ishaan@dvit.edu.in', 'Ishaan Gupta', 'ECE', 3, 'EC23044', 'verified', false),
    (u_meera, 'meera@dvit.edu.in', 'Meera Nair', 'Computer Engineering', 4, 'CE22015', 'verified', false),
    (u_tanvi, 'tanvi@dvit.edu.in', 'Tanvi Shah', 'IT', 3, 'IT23027', 'verified', false),
    (u_rohan, 'rohan@dvit.edu.in', 'Rohan Pawar', 'Mechanical', 4, 'ME22052', 'verified', false),
    (u_dev, 'dev@dvit.edu.in', 'Dev Malhotra', 'Mechanical', 3, 'ME23038', 'verified', false);
  v_students := array[u_riya, u_aarav, u_sneha, u_kabir, u_ishaan, u_meera, u_tanvi, u_rohan, u_dev, u_photo, u_maker];

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  )
  select '00000000-0000-0000-0000-000000000000', s.id, 'authenticated', 'authenticated', s.email,
    extensions.crypt('DvitDemo@2026', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', s.name), now(), now(),
    '', '', '', '', '', '', '', ''
  from seed_users s
  on conflict (id) do nothing;

  insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select s.id, s.id::text, 'email',
    jsonb_build_object('sub', s.id::text, 'email', s.email, 'email_verified', true), now(), now(), now()
  from seed_users s
  where not exists (select 1 from auth.identities i where i.user_id = s.id and i.provider = 'email');

  insert into public.profiles (id, email) select id, email from seed_users on conflict (id) do nothing;
  update public.profiles p set
    full_name = s.name, department = s.dept, year = s.yr, roll_number = s.roll, status = s.status,
    status_reason = null, suspended_until = null, is_admin = s.is_admin, onboarding_complete = true,
    id_proof_path = case when s.id = u_om then u_om || '/id-card.jpg' end,
    verification_submitted_at = case when s.id = u_om then v_now - interval '5 hours' end
  from seed_users s where p.id = s.id;

  -- ---------------------------------------------------------------- organisations and roles
  insert into public.organizations (id, name, type, created_at) values
    (o_photo, 'Photography Club', 'club', v_now - interval '60 days'),
    (o_maker, 'Makerspace', 'lab', v_now - interval '60 days'),
    (o_ece, 'ECE Department', 'department', v_now - interval '60 days'),
    (o_comp, 'Computer Engineering (AI Lab)', 'department', v_now - interval '60 days'),
    (o_sports, 'Sports Committee', 'club', v_now - interval '60 days'),
    (o_acad, 'Academic Office', 'office', v_now - interval '60 days');

  insert into public.memberships (user_id, org_id, role, granted_by, reason, created_at) values
    (u_mehta, o_ece, 'manager', u_admin, 'Head of ECE Department', v_now - interval '59 days'),
    (u_mehta, o_maker, 'manager', u_admin, 'Faculty in charge of the Makerspace', v_now - interval '59 days'),
    (u_mehta, o_comp, 'manager', u_admin, 'Faculty in charge of the AI Lab', v_now - interval '59 days'),
    (u_kulkarni, o_acad, 'manager', u_admin, 'Dean of Academics', v_now - interval '59 days'),
    (u_kulkarni, o_sports, 'manager', u_admin, 'Faculty advisor, Sports Committee', v_now - interval '59 days'),
    (u_kulkarni, o_photo, 'manager', u_admin, 'Faculty advisor, Photography Club', v_now - interval '59 days'),
    (u_photo, o_photo, 'owner', u_admin, 'Photography Club lead 2026-27', v_now - interval '58 days'),
    (u_maker, o_maker, 'owner', u_admin, 'Makerspace student lead 2026-27', v_now - interval '58 days');

  insert into public.badge_types (id, name, description, issuing_org_id, validity_days) values
    (bt_photo, 'Photography Basics', 'Camera handling and care workshop', o_photo, 365),
    (bt_cnc, 'CNC Safety Training', 'Makerspace CNC operation and safety course', o_maker, 180),
    (bt_ece, 'ECE Lab Safety', 'Electrical lab safety induction', o_ece, 365);

  insert into public.user_badges (user_id, badge_type_id, status, certificate_path, issued_at, expires_at, verified_by, verified_at, created_at)
  select u, bt, 'verified', u || '/' || bt || '.jpg', v_today - 60, v_now + interval '300 days', vb, v_now - interval '59 days', v_now - interval '60 days'
  from (values
    (u_riya, bt_photo, u_photo), (u_meera, bt_photo, u_photo), (u_tanvi, bt_photo, u_photo),
    (u_photo, bt_photo, u_kulkarni), (u_rohan, bt_cnc, u_maker), (u_maker, bt_cnc, u_mehta),
    (u_ishaan, bt_ece, u_mehta), (u_sneha, bt_ece, u_mehta)
  ) v(u, bt, vb);
  insert into public.user_badges (user_id, badge_type_id, status, certificate_path, issued_at, ai_extraction, created_at) values
    (u_dev, bt_cnc, 'pending', u_dev || '/' || bt_cnc || '.jpg', v_today - 3,
     jsonb_build_object('name_on_certificate', 'Dev Malhotra', 'course_title', 'CNC Safety Training',
       'issuer', 'DVIT Makerspace', 'issue_date', v_today - 3, 'expiry_date', null,
       'matches_student_name', true, 'confidence', 0.86, 'model', 'deepseek/deepseek-v4.1-flash-1017'),
     v_now - interval '20 hours');

  -- ---------------------------------------------------------------- policy history v1 → v2
  insert into public.policy_versions (id, version, "values", created_by, reason, created_at) values
    (v_p1, 1, v_policy, u_admin, 'Initial campus policy', v_now - interval '45 days'),
    (v_p2, 2, jsonb_set(v_policy, '{weekly_allowance}', '100'), u_admin,
     'Raised weekly allowance to 100 after the first-month review', v_now - interval '10 days');

  -- ---------------------------------------------------------------- resources (PRD 17 table)
  insert into public.resources (
    id, org_id, category, form_template, name, description, location, quantity, approval_mode,
    allocation_mode, eligibility, booking_rules, safety_rules, category_fields, checklist,
    base_rate, rate_unit, peak_multiplier, replacement_value, estimated_current_usage, created_at
  ) values
  (r_dslr, o_photo, 'media', 'portable', 'DSLR camera kit',
   'Canon EOS 90D with 18–135 mm lens. For club events, coursework and projects.', 'Photography Club room, B-104', 2,
   'owner', 'instant',
   jsonb_build_object('required_badge_type_ids', jsonb_build_array(bt_photo)),
   '{"max_duration_minutes": 2880, "max_active_bookings": 1}', '{}',
   '{"included_accessories": ["18–135 mm lens", "2 batteries", "Charger", "64 GB SD card", "Camera bag"]}',
   '{"items": ["Camera body", "18–135 mm lens", "Battery 1", "Battery 2", "Charger", "64 GB SD card", "Camera bag"],
     "shots": ["Front", "Back", "Lens close-up", "All accessories laid out"]}',
   10, 'day', 1.5, 85000, 'weekly', v_now - interval '50 days'),
  (r_cnc, o_maker, 'machine', 'machine', 'CNC milling machine',
   'Desktop 3-axis CNC mill for aluminium, wood and acrylic. Supervised sessions only.', 'Makerspace bay 2', 1,
   'manager', 'batch',
   jsonb_build_object('required_badge_type_ids', jsonb_build_array(bt_cnc)),
   '{"max_duration_minutes": 120, "max_active_bookings": 1}',
   '{"manager_approval": true, "supervision_required": true, "ppe": ["Safety glasses", "Ear protection"],
     "safety_notes": "Never leave the machine running unattended. Clear chips with a brush, not your hand."}',
   '{"training_badge": "CNC Safety Training"}',
   '{"items": ["Spindle and collet", "Bed and clamps", "Emergency stop", "Dust extractor"],
     "shots": ["Machine front", "Bed", "Control panel"]}',
   20, 'hour', 1.5, 450000, 'weekly', v_now - interval '50 days'),
  (r_seminar, o_acad, 'seminar_hall', 'space', 'Seminar hall',
   '180-seat hall with projector, AC and wireless mics.', 'Main building, 2nd floor', 1,
   'manager', 'batch', '{}', '{"max_duration_minutes": 240, "max_active_bookings": 1}',
   '{"manager_approval": true}',
   '{"seating_capacity": 180, "indoor": true, "facilities": ["Projector", "AC", "Mic"]}',
   '{"items": ["Projector", "Wireless mics", "AC remote"], "shots": ["Stage", "Seating"]}',
   15, 'hour', 1.5, null, 'weekly', v_now - interval '50 days'),
  (r_gpu, o_comp, 'electronics', 'lab', 'GPU workstation',
   'RTX workstation for ML training. Priority for verified academic projects.', 'AI Lab, C-301', 1,
   'owner', 'batch', '{}', '{"max_duration_minutes": 240, "max_active_bookings": 1}', '{}',
   '{"stations": 1, "software": ["Ubuntu 24.04", "CUDA 13", "PyTorch"], "supervision_required": false}',
   '{"items": ["Workstation powers on", "Keyboard and mouse", "Scratch disk cleared"], "shots": ["Desk"]}',
   8, 'hour', 1.5, 350000, 'daily', v_now - interval '50 days'),
  (r_osc, o_ece, 'electronics', 'portable', 'Digital oscilloscope',
   '100 MHz 4-channel oscilloscope with probes.', 'ECE lab store, D-210', 3,
   'owner', 'instant',
   jsonb_build_object('required_badge_type_ids', jsonb_build_array(bt_ece), 'departments', jsonb_build_array('ECE')),
   '{"max_duration_minutes": 240, "max_active_bookings": 1}', '{}',
   '{"included_accessories": ["4 probes", "Power cable"]}',
   '{"items": ["Scope unit", "Probe 1", "Probe 2", "Probe 3", "Probe 4", "Power cable"],
     "shots": ["Front panel", "Probes laid out"]}',
   5, 'hour', 1.5, 120000, 'rarely', v_now - interval '50 days'),
  (r_court, o_sports, 'sports_ground', 'space', 'Badminton court',
   'Indoor wooden court with lighting. Peak hours 5–9 pm cost 1.5×.', 'Sports complex, court 1', 1,
   'auto', 'instant', '{}',
   '{"max_duration_minutes": 60, "max_active_bookings": 2, "peak_window": {"start": "17:00", "end": "21:00"}}', '{}',
   '{"capacity": 4, "outdoor": false, "surface": "Wooden", "lighting": true}',
   '{"items": ["Net intact", "Lights working"], "shots": ["Court"]}',
   10, 'hour', 1.5, null, 'daily', v_now - interval '50 days'),
  (r_lab, o_comp, 'lab', 'lab', 'Computer lab (40 stations)',
   '40 workstations with MATLAB, AutoCAD and VS Code.', 'C-201', 1,
   'owner', 'instant', '{}', '{"max_duration_minutes": 240, "max_active_bookings": 1}', '{}',
   '{"stations": 40, "software": ["MATLAB", "AutoCAD", "VS Code", "Python 3"], "supervision_required": false}',
   '{"items": ["All stations shut down", "Projector off"], "shots": ["Room overview"]}',
   5, 'hour', 1.5, null, 'rarely', v_now - interval '50 days'),
  (r_laptop, o_comp, 'electronics', 'portable', 'Laptop',
   '14-inch laptop, 16 GB RAM, for project demos and exams.', 'AI Lab, C-301', 5,
   'owner', 'instant', '{}', '{"max_duration_minutes": 2880, "max_active_bookings": 1, "return_confirmation": true}', '{}',
   '{"included_accessories": ["Charger", "Sleeve"]}',
   '{"items": ["Laptop", "Charger", "Sleeve"], "shots": ["Lid", "Keyboard and screen"]}',
   8, 'day', 1.5, 60000, 'weekly', v_now - interval '50 days'),
  (r_cricket, o_sports, 'sports_equipment', 'portable', 'Cricket kit',
   'Two bats, pads, gloves, helmet and a set of stumps.', 'Sports store', 2,
   'auto', 'instant', '{}', '{"max_duration_minutes": 1440, "max_active_bookings": 2, "condition_record_required": true}', '{}',
   '{"kit_contents": ["2 bats", "2 pairs of pads", "2 pairs of gloves", "Helmet", "Stumps and bails"]}',
   '{"items": ["Bat 1", "Bat 2", "Pads", "Gloves", "Helmet", "Stumps and bails"], "shots": ["Kit laid out"]}',
   2, 'day', 1.5, 15000, 'rarely', v_now - interval '50 days'),
  (r_meeting, o_acad, 'meeting_room', 'space', 'Meeting room',
   '10-seat room with a screen. Free and instantly approved.', 'Main building, M-12', 1,
   'auto', 'instant', '{}', '{"max_duration_minutes": 240, "max_active_bookings": 2}', '{}',
   '{"seating_capacity": 10, "facilities": ["Screen", "Whiteboard"]}',
   '{"items": ["Screen off", "Whiteboard clean"], "shots": ["Room overview"]}',
   0, 'hour', 1, null, 'rarely', v_now - interval '50 days');

  insert into public.availability_windows (resource_id, weekday, start_time, end_time)
  select r.id, d, time '08:00', time '20:00' from public.resources r cross join generate_series(1, 6) d where r.id <> r_court
  union all
  select r_court, d, time '06:00', time '22:00' from generate_series(0, 6) d;

  insert into public.blackouts (resource_id, starts_at, ends_at, reason) values
    (r_seminar, ((v_today + 10) + time '08:00') at time zone ist, ((v_today + 10) + time '20:00') at time zone ist,
     'Convocation rehearsal');

  -- ---------------------------------------------------------------- 30 days of completed history
  insert into public.bookings (
    resource_id, unit_id, user_id, start_at, end_at, status, purpose_category, purpose_text,
    policy_version_id, credit_hold, credit_charged, grace_minutes, picked_up_at, returned_at, created_at, updated_at
  )
  select h.rid, u.id, v_students[1 + (d * 7 + h.every * 3) % array_length(v_students, 1)],
    st, st + h.dur, 'completed', h.purpose, h.purpose_text,
    case when st < v_now - interval '10 days' then v_p1 else v_p2 end,
    h.cost, h.cost, 15, st + interval '7 minutes', st + h.dur - interval '12 minutes',
    st - interval '2 days', st + h.dur
  from generate_series(1, 30) d
  cross join (values
    (r_dslr, 2, interval '1 day', 10, 'club_activity'::public.purpose_category, 'Club event coverage'),
    (r_court, 1, interval '1 hour', 10, 'personal'::public.purpose_category, 'Practice session'),
    (r_laptop, 2, interval '1 day', 8, 'academic_deadline'::public.purpose_category, 'Project demo'),
    (r_gpu, 2, interval '4 hours', 32, 'project_research'::public.purpose_category, 'Model training run'),
    (r_cnc, 5, interval '2 hours', 40, 'project_research'::public.purpose_category, 'Prototype part'),
    (r_seminar, 6, interval '3 hours', 45, 'club_activity'::public.purpose_category, 'Club talk'),
    (r_osc, 9, interval '2 hours', 10, 'academic_deadline'::public.purpose_category, 'Lab assignment'),
    (r_lab, 11, interval '2 hours', 10, 'academic_deadline'::public.purpose_category, 'Practice test'),
    (r_meeting, 13, interval '1 hour', 0, 'club_activity'::public.purpose_category, 'Committee meeting')
  ) h(rid, every, dur, cost, purpose, purpose_text)
  cross join lateral (select (((v_today - d) + time '09:00') at time zone ist) + ((d % 5) * interval '1 hour') as st) t
  cross join lateral (
    select x.id from (
      select ru.id, row_number() over (order by ru.label) - 1 as rn, count(*) over () as cnt
      from public.resource_units ru where ru.resource_id = h.rid
    ) x where x.rn = d % x.cnt
  ) u
  where d % h.every = 0;

  -- Tanvi lost two seminar allocations (unsuccessful requests raise her priority score).
  insert into public.bookings (resource_id, user_id, start_at, end_at, status, status_reason, purpose_category,
    purpose_text, policy_version_id, credit_hold, approver_role, priority_score, allocation_rule, created_at, updated_at)
  select r_seminar, u_tanvi, st, st + interval '3 hours', 'rejected',
    'Not allocated: a higher-priority request won the batch', 'club_activity', 'IT club workshop', v_p1, 45, 'manager',
    51, 'batch allocation, policy v1', st - interval '3 days', st - interval '1 day'
  from (values (((v_today - 15) + time '14:00') at time zone ist), (((v_today - 22) + time '14:00') at time zone ist)) v(st);

  -- Kabir's two no-shows in the last 30 days ("2 of 3" warning).
  insert into public.bookings (resource_id, unit_id, user_id, start_at, end_at, status, status_reason, policy_version_id,
    credit_hold, grace_minutes, created_at, updated_at)
  select rid, (select id from public.resource_units where resource_id = rid order by label limit 1), u_kabir, st, st + dur,
    'no_show', 'Not collected within the grace period', v_p2, cost, g, st - interval '1 day', st + make_interval(mins => g)
  from (values
    (r_court, ((v_today - 12) + time '18:00') at time zone ist, interval '1 hour', 15, 15),
    (r_cricket, ((v_today - 5) + time '07:00') at time zone ist, interval '1 day', 2, 120)
  ) v(rid, st, dur, cost, g);

  -- ---------------------------------------------------------------- situations
  -- Seminar hall: 3 competing batch requests, cutoff ~1 hour of app time away.
  insert into public.bookings (id, resource_id, user_id, start_at, end_at, status, purpose_category, purpose_text,
    purpose_verified, attachments, cutoff_at, policy_version_id, credit_hold, approver_role, created_at, updated_at)
  select id, r_seminar, uid, st, st + interval '3 hours', 'pending_allocation', pc, pt, pv, att,
    st - interval '24 hours', v_p2, 45, 'manager', v_now - ago, v_now - ago
  from (select date_trunc('hour', v_now) + interval '25 hours' as st) s
  cross join (values
    (b_sem1, u_ishaan, 'academic_deadline'::public.purpose_category, 'Final-year project review with the external examiner', true,
     array[u_ishaan || '/review-notice.pdf'], interval '30 hours'),
    (b_sem2, u_meera, 'club_activity'::public.purpose_category, 'Photography Club exhibition briefing', false,
     '{}'::text[], interval '20 hours'),
    (b_sem3, u_tanvi, 'personal'::public.purpose_category, 'Study group before mid-terms', false,
     '{}'::text[], interval '6 hours')
  ) r(id, uid, pc, pt, pv, att, ago);

  -- Badminton court at peak: Dev holds it, Kabir and Tanvi wait.
  insert into public.bookings (id, resource_id, unit_id, user_id, start_at, end_at, status, purpose_text, waitlist_position,
    policy_version_id, credit_hold, grace_minutes, approver_role, created_at, updated_at)
  select id, r_court, case when st = 'approved' then (select ru.id from public.resource_units ru where ru.resource_id = r_court) end,
    uid, (v_court_day + time '18:00') at time zone ist, (v_court_day + time '19:00') at time zone ist, st::public.booking_status,
    'Doubles practice', pos, v_p2, 15, 15, 'owner', v_now - ago, v_now - ago
  from (values (b_court, u_dev, 'approved', null::int, interval '9 hours'),
               (b_wait1, u_kabir, 'waitlisted', 1, interval '5 hours'),
               (b_wait2, u_tanvi, 'waitlisted', 2, interval '2 hours')) v(id, uid, st, pos, ago);

  -- Laptop overdue by 3 hours, still on policy v1.
  insert into public.bookings (id, resource_id, unit_id, user_id, start_at, end_at, status, purpose_category, purpose_text,
    policy_version_id, credit_hold, grace_minutes, picked_up_at, decided_by, created_at, updated_at)
  values (b_overdue, r_laptop, (select id from public.resource_units where resource_id = r_laptop and label = 'Unit 1'),
    u_rohan, v_now - interval '27 hours', v_now - interval '3 hours', 'overdue', 'academic_deadline', 'Capstone demo',
    v_p1, 8, 120, v_now - interval '26 hours 40 minutes', u_mehta, v_now - interval '12 days', v_now - interval '3 hours');

  -- Laptop returned 5 hours late: a proposed late penalty waits for Prof. Mehta.
  insert into public.bookings (id, resource_id, unit_id, user_id, start_at, end_at, status, purpose_category, purpose_text,
    policy_version_id, credit_hold, credit_charged, grace_minutes, picked_up_at, returned_at, decided_by, created_at, updated_at)
  values (b_late, r_laptop, (select id from public.resource_units where resource_id = r_laptop and label = 'Unit 2'),
    u_meera, v_now - interval '4 days', v_now - interval '3 days', 'completed', 'academic_deadline', 'Internship interview prep',
    v_p2, 8, 8, 120, v_now - interval '3 days 23 hours', v_now - interval '2 days 19 hours', u_mehta,
    v_now - interval '5 days', v_now - interval '2 days 19 hours');

  -- Camera under review: filed by the Photography Club Owner, student responded, ready for Prof. Kulkarni.
  insert into public.bookings (id, resource_id, unit_id, user_id, start_at, end_at, status, purpose_category, purpose_text,
    policy_version_id, credit_hold, grace_minutes, picked_up_at, returned_at, decided_by, created_at, updated_at)
  values (b_cam_dispute, r_dslr, (select id from public.resource_units where resource_id = r_dslr and label = 'Unit 1'),
    u_meera, v_now - interval '3 days', v_now - interval '1 day', 'under_review', 'club_activity', 'Annual fest photography',
    v_p2, 20, 120, v_now - interval '2 days 23 hours 50 minutes', v_now - interval '1 day 30 minutes', u_photo,
    v_now - interval '4 days', v_now - interval '1 day');

  -- Oscilloscope reported by Prof. Mehta himself: conflict of interest, routed to the Admin.
  insert into public.bookings (id, resource_id, unit_id, user_id, start_at, end_at, status, purpose_category, purpose_text,
    policy_version_id, credit_hold, grace_minutes, picked_up_at, returned_at, decided_by, created_at, updated_at)
  values (b_osc_dispute, r_osc, (select id from public.resource_units where resource_id = r_osc and label = 'Unit 2'),
    u_ishaan, v_now - interval '20 hours', v_now - interval '16 hours', 'under_review', 'academic_deadline', 'Signals lab assignment',
    v_p2, 20, 60, v_now - interval '19 hours 55 minutes', v_now - interval '16 hours', u_mehta,
    v_now - interval '2 days', v_now - interval '15 hours');

  -- CNC exception request (3 h against a 2 h cap) for Prof. Mehta.
  insert into public.bookings (id, resource_id, user_id, start_at, end_at, status, purpose_category, purpose_text,
    is_exception, exception_reason, policy_version_id, credit_hold, approver_role, created_at, updated_at)
  values (b_cnc_exception, r_cnc, u_rohan, ((v_today + 3) + time '10:00') at time zone ist,
    ((v_today + 3) + time '13:00') at time zone ist, 'pending_approval', 'project_research', 'Capstone gearbox housing',
    true, 'The housing is one continuous cut of about 2.5 hours; stopping at 2 hours would scrap the part.',
    v_p2, 60, 'manager', v_now - interval '7 hours', v_now - interval '7 hours');

  -- Computer lab request nobody decided: escalated to the Manager, then to the Admin.
  insert into public.bookings (id, resource_id, user_id, start_at, end_at, status, purpose_category, purpose_text,
    policy_version_id, credit_hold, approver_role, escalation_level, escalated_at, created_at, updated_at)
  values (b_escalated, r_lab, u_dev, ((v_today + 2) + time '14:00') at time zone ist, ((v_today + 2) + time '16:00') at time zone ist,
    'pending_approval', 'club_activity', 'Robotics club coding workshop for first-years', v_p2, 10, 'owner', 2,
    v_now - interval '2 hours', v_now - interval '50 hours', v_now - interval '2 hours');

  -- Camera handover due today for the Photography Club Owner.
  insert into public.bookings (id, resource_id, unit_id, user_id, start_at, end_at, status, purpose_category, purpose_text,
    policy_version_id, credit_hold, grace_minutes, decided_by, created_at, updated_at)
  values (b_cam_today, r_dslr, (select id from public.resource_units where resource_id = r_dslr and label = 'Unit 2'),
    u_tanvi, date_trunc('hour', v_now) + interval '2 hours', date_trunc('hour', v_now) + interval '26 hours', 'approved',
    'club_activity', 'IT department farewell', v_p2, 10, 120, u_photo, v_now - interval '1 day', v_now - interval '20 hours');

  -- Camera returned with an AI condition flag the Owner still has to confirm or dismiss.
  insert into public.bookings (id, resource_id, unit_id, user_id, start_at, end_at, status, purpose_category, purpose_text,
    policy_version_id, credit_hold, grace_minutes, picked_up_at, returned_at, decided_by, created_at, updated_at)
  values (b_cam_flag, r_dslr, (select id from public.resource_units where resource_id = r_dslr and label = 'Unit 2'),
    u_tanvi, v_now - interval '30 hours', v_now - interval '6 hours', 'returned', 'personal', 'Weekend trek photos',
    v_p2, 10, 120, v_now - interval '29 hours 50 minutes', v_now - interval '6 hours', u_photo,
    v_now - interval '3 days', v_now - interval '6 hours');

  -- Sneha spent 90 of her 100 credits this week (shows the emergency credits path).
  insert into public.bookings (id, resource_id, unit_id, user_id, start_at, end_at, status, purpose_category, purpose_text,
    policy_version_id, credit_hold, credit_charged, grace_minutes, picked_up_at, returned_at, approver_role, decided_by, created_at, updated_at)
  select id, r_seminar, (select ru.id from public.resource_units ru where ru.resource_id = r_seminar), u_sneha, st, st + interval '3 hours',
    'completed', 'club_activity', 'IEEE student branch talk', v_p2, 45, 45, 45, st, st + interval '3 hours', 'manager', u_kulkarni,
    st - interval '2 days', st + interval '3 hours'
  from (values (b_sneha1, date_trunc('hour', v_now) - interval '30 hours'),
               (b_sneha2, date_trunc('hour', v_now) - interval '26 hours')) v(id, st);

  -- ---------------------------------------------------------------- condition records, cases, penalties
  insert into public.condition_reports (booking_id, phase, checklist_results, photos, owner_signed_by, owner_signed_at,
    student_ack_at, notes, ai_analysis, created_at)
  select b, ph::public.condition_phase,
    (select jsonb_agg(jsonb_build_object('item', i, 'ok', true, 'note', '')) from jsonb_array_elements_text(r.checklist -> 'items') i),
    (select jsonb_agg(jsonb_build_object('shot', s, 'path', b || '/' || ph || '/' || lower(replace(s, ' ', '-')) || '.jpg'))
       from jsonb_array_elements_text(r.checklist -> 'shots') s),
    signer, at, at + interval '2 minutes', null, null, at
  from (values
    (b_cam_dispute, r_dslr, 'checkout', u_photo, v_now - interval '2 days 23 hours 50 minutes'),
    (b_cam_dispute, r_dslr, 'return', u_photo, v_now - interval '1 day 30 minutes'),
    (b_cam_flag, r_dslr, 'checkout', u_photo, v_now - interval '29 hours 50 minutes'),
    (b_cam_flag, r_dslr, 'return', u_photo, v_now - interval '6 hours'),
    (b_osc_dispute, r_osc, 'checkout', u_mehta, v_now - interval '19 hours 55 minutes'),
    (b_osc_dispute, r_osc, 'return', u_mehta, v_now - interval '16 hours'),
    (b_overdue, r_laptop, 'checkout', u_mehta, v_now - interval '26 hours 40 minutes'),
    (b_late, r_laptop, 'checkout', u_mehta, v_now - interval '3 days 23 hours'),
    (b_late, r_laptop, 'return', u_mehta, v_now - interval '2 days 19 hours')
  ) v(b, rid, ph, signer, at)
  join public.resources r on r.id = v.rid;

  v_ai := jsonb_build_object(
    'model', 'deepseek/deepseek-v4.1-flash-1017', 'at', v_now - interval '6 hours', 'overall', 'possible_damage',
    'shots', jsonb_build_array(
      jsonb_build_object('shot', 'Lens close-up', 'comparable', true, 'differences', jsonb_build_array(
        jsonb_build_object('description', 'Possible fine scratch on the front lens element', 'location', 'lower left of the lens', 'confidence', 0.62))),
      jsonb_build_object('shot', 'Front', 'comparable', true, 'differences', '[]'::jsonb),
      jsonb_build_object('shot', 'Back', 'comparable', false, 'differences', '[]'::jsonb)),
    'missing_items', '[]'::jsonb, 'owner_decision', null);
  update public.condition_reports set ai_analysis = v_ai where booking_id = b_cam_flag and phase = 'return';
  update public.condition_reports set
    ai_analysis = jsonb_set(jsonb_set(v_ai, '{at}', to_jsonb(v_now - interval '1 day 25 minutes')), '{owner_decision}', '"confirmed"'),
    checklist_results = (select jsonb_agg(case when e ->> 'item' = '18–135 mm lens'
      then jsonb_set(e, '{ok}', 'false') || '{"note": "Fine scratch on the front element"}' else e end)
      from jsonb_array_elements(checklist_results) e)
  where booking_id = b_cam_dispute and phase = 'return';

  insert into public.damage_cases (booking_id, reported_by, description, severity, ai_flags, status, student_response,
    responded_at, response_deadline, assigned_to, created_at) values
  (b_cam_dispute, u_photo, 'Fine scratch across the front lens element, visible against light.', 'minor',
   v_ai -> 'shots', 'ready_for_decision',
   'The scratch was already there when I picked the kit up. The lens cap was missing from the bag at pickup, which I mentioned to Neha at the handover.',
   v_now - interval '10 hours', v_now - interval '1 day 30 minutes' + interval '48 hours', u_kulkarni, v_now - interval '1 day 20 minutes'),
  (b_osc_dispute, u_mehta, 'Channel 2 probe gives no signal and its BNC connector looks bent.', 'major',
   null, 'awaiting_response', null, null, v_now - interval '16 hours' + interval '48 hours', u_admin, v_now - interval '15 hours');

  insert into public.penalties (booking_id, user_id, kind, proposed_amount, status, policy_version_id, reason, created_at)
  values (b_late, u_meera, 'late', 16, 'proposed', v_p2,
    'Returned 5 hours late with no approved extension: 1 started day × 8 credits × 2 (policy v2).', v_now - interval '2 days 19 hours');

  insert into public.incidents (resource_id, reported_by, occurred_at, location, description, severity, status, created_at)
  values (r_cnc, u_maker, v_now - interval '2 days', 'Makerspace bay 2',
    'Coolant leaked from the spindle housing during a supervised session. Area cleaned, nobody hurt; machine still usable.',
    'low', 'open', v_now - interval '2 days');

  insert into public.emergency_credit_requests (user_id, booking_id, amount, reason, urgency, academic_year, status, created_at)
  values (u_dev, null, 30, 'Robotics competition entry is due Friday and I need extra GPU hours for the vision model.',
    'high', '2026-27', 'pending', v_now - interval '3 hours');

  -- ---------------------------------------------------------------- credit ledger
  insert into public.credit_ledger (user_id, delta, kind, week_start, note, created_at)
  select p.id, 100, 'allowance', v_week, 'Weekly allowance (policy v2)', v_week::timestamp at time zone ist
  from public.profiles p where p.id = any (v_students);

  insert into public.credit_ledger (user_id, delta, kind, booking_id, note, created_at)
  select b.user_id, -b.credit_hold, 'hold', b.id, 'Hold for booking', b.created_at
  from public.bookings b where b.id in (b_court, b_overdue, b_cam_dispute, b_osc_dispute, b_cam_today, b_cam_flag, b_late, b_sneha1, b_sneha2);
  insert into public.credit_ledger (user_id, delta, kind, booking_id, note, created_at)
  select b.user_id, d, k::public.ledger_kind, b.id, n, b.returned_at
  from public.bookings b
  cross join lateral (values (b.credit_hold, 'release', 'Hold released'), (-b.credit_charged, 'charge', 'Charged for actual use')) x(d, k, n)
  where b.id in (b_late, b_sneha1, b_sneha2);

  -- ---------------------------------------------------------------- audit trail for the situations
  create temp table seed_events (
    actor uuid, actor_role text, action text, booking uuid, from_state text, to_state text, reason text, at timestamptz
  ) on commit drop;
  insert into seed_events values
    (null, 'system', 'BOOKING_SUBMIT_BATCH', b_sem1, 'new', 'pending_allocation', null, v_now - interval '30 hours'),
    (null, 'system', 'BOOKING_SUBMIT_BATCH', b_sem2, 'new', 'pending_allocation', null, v_now - interval '20 hours'),
    (null, 'system', 'BOOKING_SUBMIT_BATCH', b_sem3, 'new', 'pending_allocation', null, v_now - interval '6 hours'),
    (null, 'system', 'BOOKING_SUBMIT_AUTO', b_court, 'new', 'approved', null, v_now - interval '9 hours'),
    (null, 'system', 'BOOKING_SUBMIT_WAITLIST', b_wait1, 'new', 'waitlisted', 'Slot taken; joined the waitlist', v_now - interval '5 hours'),
    (null, 'system', 'BOOKING_SUBMIT_WAITLIST', b_wait2, 'new', 'waitlisted', 'Slot taken; joined the waitlist', v_now - interval '2 hours'),
    (null, 'system', 'BOOKING_SUBMIT_APPROVAL', b_overdue, 'new', 'pending_approval', null, v_now - interval '12 days'),
    (u_mehta, 'manager', 'BOOKING_APPROVE', b_overdue, 'pending_approval', 'approved', null, v_now - interval '11 days'),
    (u_mehta, 'manager', 'BOOKING_HANDOVER', b_overdue, 'approved', 'checked_out', null, v_now - interval '26 hours 40 minutes'),
    (null, 'system', 'BOOKING_MARK_OVERDUE', b_overdue, 'checked_out', 'overdue', null, v_now - interval '3 hours'),
    (null, 'system', 'BOOKING_SUBMIT_APPROVAL', b_late, 'new', 'pending_approval', null, v_now - interval '5 days'),
    (u_mehta, 'manager', 'BOOKING_APPROVE', b_late, 'pending_approval', 'approved', null, v_now - interval '4 days 20 hours'),
    (u_mehta, 'manager', 'BOOKING_HANDOVER', b_late, 'approved', 'checked_out', null, v_now - interval '3 days 23 hours'),
    (null, 'system', 'BOOKING_MARK_OVERDUE', b_late, 'checked_out', 'overdue', null, v_now - interval '3 days'),
    (u_mehta, 'manager', 'BOOKING_RETURN', b_late, 'overdue', 'returned', null, v_now - interval '2 days 19 hours'),
    (u_mehta, 'manager', 'BOOKING_COMPLETE', b_late, 'returned', 'completed', null, v_now - interval '2 days 19 hours'),
    (null, 'system', 'PENALTY_PROPOSED', b_late, null, 'proposed', 'Returned 5 hours late with no approved extension', v_now - interval '2 days 19 hours'),
    (null, 'system', 'BOOKING_SUBMIT_APPROVAL', b_cam_dispute, 'new', 'pending_approval', null, v_now - interval '4 days'),
    (u_photo, 'owner', 'BOOKING_APPROVE', b_cam_dispute, 'pending_approval', 'approved', null, v_now - interval '3 days 20 hours'),
    (u_photo, 'owner', 'BOOKING_HANDOVER', b_cam_dispute, 'approved', 'checked_out', null, v_now - interval '2 days 23 hours 50 minutes'),
    (u_photo, 'owner', 'BOOKING_RETURN', b_cam_dispute, 'checked_out', 'returned', null, v_now - interval '1 day 30 minutes'),
    (u_photo, 'owner', 'BOOKING_REPORT_DAMAGE', b_cam_dispute, 'returned', 'under_review', 'Fine scratch on the front lens element', v_now - interval '1 day 20 minutes'),
    (u_meera, 'student', 'DAMAGE_RESPONSE_SUBMITTED', b_cam_dispute, null, 'ready_for_decision', null, v_now - interval '10 hours'),
    (null, 'system', 'BOOKING_SUBMIT_APPROVAL', b_osc_dispute, 'new', 'pending_approval', null, v_now - interval '2 days'),
    (u_mehta, 'manager', 'BOOKING_APPROVE', b_osc_dispute, 'pending_approval', 'approved', null, v_now - interval '1 day 22 hours'),
    (u_mehta, 'manager', 'BOOKING_HANDOVER', b_osc_dispute, 'approved', 'checked_out', null, v_now - interval '19 hours 55 minutes'),
    (u_mehta, 'manager', 'BOOKING_RETURN', b_osc_dispute, 'checked_out', 'returned', null, v_now - interval '16 hours'),
    (u_mehta, 'manager', 'BOOKING_REPORT_DAMAGE', b_osc_dispute, 'returned', 'under_review', 'Channel 2 probe dead, BNC connector bent', v_now - interval '15 hours'),
    (null, 'system', 'DAMAGE_CASE_ASSIGNED', b_osc_dispute, null, 'awaiting_response', 'Conflict of interest: the reporter is the only Manager; assigned to an Admin', v_now - interval '15 hours'),
    (null, 'system', 'BOOKING_SUBMIT_APPROVAL', b_cnc_exception, 'new', 'pending_approval', 'Exception requested: 3 hours against a 2-hour cap', v_now - interval '7 hours'),
    (null, 'system', 'BOOKING_SUBMIT_APPROVAL', b_escalated, 'new', 'pending_approval', null, v_now - interval '50 hours'),
    (null, 'system', 'BOOKING_ESCALATED', b_escalated, null, 'pending_approval', 'No Owner decision within 24 hours; assigned to the Manager', v_now - interval '26 hours'),
    (null, 'system', 'BOOKING_ESCALATED', b_escalated, null, 'pending_approval', 'No Manager decision within 24 hours; Admin alerted', v_now - interval '2 hours'),
    (null, 'system', 'BOOKING_SUBMIT_APPROVAL', b_cam_today, 'new', 'pending_approval', null, v_now - interval '1 day'),
    (u_photo, 'owner', 'BOOKING_APPROVE', b_cam_today, 'pending_approval', 'approved', null, v_now - interval '20 hours'),
    (null, 'system', 'BOOKING_SUBMIT_APPROVAL', b_cam_flag, 'new', 'pending_approval', null, v_now - interval '3 days'),
    (u_photo, 'owner', 'BOOKING_APPROVE', b_cam_flag, 'pending_approval', 'approved', null, v_now - interval '2 days 22 hours'),
    (u_photo, 'owner', 'BOOKING_HANDOVER', b_cam_flag, 'approved', 'checked_out', null, v_now - interval '29 hours 50 minutes'),
    (u_photo, 'owner', 'BOOKING_RETURN', b_cam_flag, 'checked_out', 'returned', null, v_now - interval '6 hours'),
    (null, 'system', 'AI_CONDITION_FLAGGED', b_cam_flag, null, null, 'AI suggestion: possible scratch on the lens (confidence 0.62)', v_now - interval '6 hours');

  insert into public.audit_events (actor_id, actor_role, action, entity_type, entity_id, org_id, subject_user_id,
    from_state, to_state, reason, metadata, policy_version_id, created_at)
  select e.actor, e.actor_role, e.action, 'booking', e.booking::text, r.org_id, b.user_id, e.from_state, e.to_state, e.reason,
    jsonb_build_object('seed', true), b.policy_version_id, e.at
  from seed_events e join public.bookings b on b.id = e.booking join public.resources r on r.id = b.resource_id;

  insert into public.audit_events (actor_id, actor_role, action, entity_type, entity_id, org_id, subject_user_id,
    from_state, to_state, reason, metadata, policy_version_id, created_at) values
    (u_admin, 'admin', 'POLICY_CHANGED', 'policy_version', v_p2::text, null, null, 'v1', 'v2',
     'Raised weekly allowance to 100 after the first-month review',
     jsonb_build_object('seed', true, 'previous', jsonb_build_object('weekly_allowance', 80), 'new', jsonb_build_object('weekly_allowance', 100)),
     v_p2, v_now - interval '10 days'),
    (u_om, 'student', 'VERIFICATION_SUBMITTED', 'profile', u_om::text, null, u_om, null, 'pending_verification', null,
     jsonb_build_object('seed', true), v_p2, v_now - interval '5 hours'),
    (u_dev, 'student', 'BADGE_SUBMITTED', 'user_badge', u_dev::text, o_maker, u_dev, null, 'pending', 'CNC Safety Training certificate',
     jsonb_build_object('seed', true), v_p2, v_now - interval '20 hours'),
    (u_maker, 'owner', 'INCIDENT_REPORTED', 'resource', r_cnc::text, o_maker, null, null, 'open', 'Coolant leak, no injury',
     jsonb_build_object('seed', true, 'severity', 'low'), v_p2, v_now - interval '2 days'),
    (u_dev, 'student', 'EMERGENCY_CREDITS_REQUESTED', 'profile', u_dev::text, null, u_dev, null, 'pending', '30 credits',
     jsonb_build_object('seed', true), v_p2, v_now - interval '3 hours'),
    (null, 'system', 'DEMO_SEEDED', 'demo', 'seed', null, null, null, null, 'Demo data loaded', jsonb_build_object('seed', true), v_p2, v_now);
end;
$$;

revoke execute on function public.seed_demo from public, anon, authenticated;
grant execute on function public.seed_demo to service_role;
