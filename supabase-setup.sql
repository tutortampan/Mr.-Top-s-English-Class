create table if not exists public.cec_app_state (
  id integer primary key check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cec_app_state enable row level security;

drop policy if exists "Allow public app state read" on public.cec_app_state;
create policy "Allow public app state read"
  on public.cec_app_state for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow public app state write" on public.cec_app_state;
create policy "Allow public app state write"
  on public.cec_app_state for insert
  to anon, authenticated
  with check (id = 1);

drop policy if exists "Allow public app state update" on public.cec_app_state;
create policy "Allow public app state update"
  on public.cec_app_state for update
  to anon, authenticated
  using (id = 1)
  with check (id = 1);

grant select, insert, update on public.cec_app_state to anon, authenticated;

-- Phase 1 master data. These tables are authoritative when the app is
-- connected to Supabase; localStorage remains an offline compatibility cache.
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_id text not null unique check (length(trim(student_id)) > 0),
  full_name text not null check (length(trim(full_name)) > 0),
  date_of_birth date,
  gender text check (gender is null or lower(gender) in ('male', 'female', 'other')),
  photo_url text,
  program text,
  class_name text,
  current_level text,
  status text not null default 'active' check (status in ('active', 'inactive', 'graduated', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists students_full_name_dob_idx
  on public.students (lower(full_name), date_of_birth);

create table if not exists public.student_accounts (
  student_id uuid primary key references public.students(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  auth_email text not null unique,
  account_status text not null default 'active' check (account_status in ('active', 'disabled')),
  password_not_set boolean not null default true,
  password_created_at timestamptz,
  password_updated_at timestamptz,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.student_accounts
  add column if not exists auth_email text;

create table if not exists public.scholarships (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  scholarship_name text not null check (length(trim(scholarship_name)) > 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'completed')),
  starts_on date,
  ends_on date,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_progress (
  student_id uuid primary key references public.students(id) on delete cascade,
  progress_percent numeric(5,2) not null default 0 check (progress_percent between 0 and 100),
  completed_requirements integer not null default 0 check (completed_requirements >= 0),
  total_requirements integer not null default 0 check (total_requirements >= 0),
  completed_targets integer not null default 0 check (completed_targets >= 0),
  total_targets integer not null default 0 check (total_targets >= 0),
  next_level text,
  next_level_eligible boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists scholarships_student_id_idx on public.scholarships(student_id);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint subjects_name_not_blank check (length(trim(name)) > 0),
  constraint subjects_name_no_separators check (name !~ '[-_]')
);

insert into public.subjects (name)
values ('Vocabulary'), ('Expressions'), ('Proverbs'), ('Idioms')
on conflict (name) do nothing;

alter table public.subjects enable row level security;
drop policy if exists "subjects_read_authenticated" on public.subjects;
create policy "subjects_read_authenticated" on public.subjects for select to authenticated using (active);
drop policy if exists "subjects_manage_tutor" on public.subjects;
create policy "subjects_manage_tutor" on public.subjects for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id, name)
);

create table if not exists public.levels (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  level_order integer not null check (level_order >= 0),
  description text,
  advancement_threshold numeric(5,2) not null default 100 check (advancement_threshold between 0 and 100),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_id, name),
  unique(class_id, level_order)
);

alter table public.levels
  add column if not exists advancement_threshold numeric(5,2) not null default 100;

create table if not exists public.requirements (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references public.levels(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  description text,
  mandatory boolean not null default false,
  requirement_type text not null default 'custom',
  completion_criteria jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.achievement_targets (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references public.levels(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  description text,
  mandatory boolean not null default false,
  completion_criteria jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.requirement_targets (
  requirement_id uuid not null references public.requirements(id) on delete cascade,
  target_id uuid not null references public.achievement_targets(id) on delete cascade,
  primary key(requirement_id, target_id)
);

create table if not exists public.student_requirement_progress (
  student_id uuid not null references public.students(id) on delete cascade,
  requirement_id uuid not null references public.requirements(id) on delete cascade,
  completed boolean not null default false,
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(student_id, requirement_id)
);

create table if not exists public.student_target_progress (
  student_id uuid not null references public.students(id) on delete cascade,
  target_id uuid not null references public.achievement_targets(id) on delete cascade,
  completed boolean not null default false,
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(student_id, target_id)
);

create table if not exists public.progression_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  previous_level_id uuid references public.levels(id),
  new_level_id uuid not null references public.levels(id),
  program text,
  class_name text,
  reason text not null,
  trigger_event text not null,
  evidence jsonb not null default '{}'::jsonb,
  progress_percent numeric(5,2) not null check (progress_percent between 0 and 100),
  requirement_status jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(student_id, previous_level_id, new_level_id)
);

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  exam_id text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'expired', 'cancelled')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  entry_photo_url text,
  last_question integer not null default 0 check (last_question >= 0),
  created_at timestamptz not null default now(),
  unique(student_id, exam_id, status)
);

create table if not exists public.exam_session_answers (
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  question_key text not null,
  answer text not null default '',
  updated_at timestamptz not null default now(),
  primary key(session_id, question_key)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (length(trim(action)) > 0),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
alter table public.audit_logs enable row level security;
drop policy if exists "Tutors manage audit logs" on public.audit_logs;
create policy "Tutors manage audit logs" on public.audit_logs for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');

alter table public.exam_sessions enable row level security;
alter table public.exam_session_answers enable row level security;
drop policy if exists "Students manage own exam sessions" on public.exam_sessions;
create policy "Students manage own exam sessions" on public.exam_sessions
  for all to authenticated using (exists (
    select 1 from public.student_accounts account
    where account.student_id = exam_sessions.student_id and account.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.student_accounts account
    where account.student_id = exam_sessions.student_id and account.user_id = auth.uid()
  ));
drop policy if exists "Students manage own exam answers" on public.exam_session_answers;
create policy "Students manage own exam answers" on public.exam_session_answers
  for all to authenticated using (exists (
    select 1 from public.exam_sessions session
    join public.student_accounts account on account.student_id = session.student_id
    where session.id = exam_session_answers.session_id and account.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.exam_sessions session
    join public.student_accounts account on account.student_id = session.student_id
    where session.id = exam_session_answers.session_id and account.user_id = auth.uid()
  ));

alter table public.progression_history enable row level security;
drop policy if exists "Students read own progression history" on public.progression_history;
create policy "Students read own progression history" on public.progression_history
  for select to authenticated using (exists (
    select 1 from public.student_accounts account
    where account.student_id = progression_history.student_id and account.user_id = auth.uid()
  ));
drop policy if exists "Tutors manage progression history" on public.progression_history;
create policy "Tutors manage progression history" on public.progression_history
  for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');

create or replace function public.advance_student_progression(
  p_student_id uuid,
  p_trigger_event text default 'progress_recalculation'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  student_row public.students%rowtype;
  current_level public.levels%rowtype;
  next_level public.levels%rowtype;
  total_requirements integer := 0;
  completed_requirements integer := 0;
  total_targets integer := 0;
  completed_targets integer := 0;
  mandatory_remaining integer := 0;
  percentage numeric(5,2) := 0;
  eligible boolean := false;
  status text := 'in_progress';
  history_id uuid;
begin
  if auth.uid() is not null and not exists (
    select 1 from public.student_accounts
    where student_id = p_student_id and user_id = auth.uid()
  ) and (auth.jwt()->'app_metadata'->>'role') <> 'tutor' then
    raise exception 'Student progression ownership validation failed';
  end if;
  select * into student_row from public.students where id = p_student_id for update;
  if not found then raise exception 'Student not found'; end if;

  select * into current_level from public.levels
    where id = student_row.level_id and status = 'active' for update;

  if current_level.id is null then
    return jsonb_build_object('status', 'in_progress', 'reason', 'Current level is not configured');
  end if;

  select count(*), count(*) filter (where coalesce(progress.completed, false)),
         count(*) filter (where requirements.mandatory and not coalesce(progress.completed, false))
    into total_requirements, completed_requirements, mandatory_remaining
    from public.requirements
    left join public.student_requirement_progress progress
      on progress.requirement_id = requirements.id and progress.student_id = p_student_id
    where requirements.level_id = current_level.id and requirements.status = 'active';

  select count(*), count(*) filter (where coalesce(progress.completed, false))
    into total_targets, completed_targets
    from public.achievement_targets
    left join public.student_target_progress progress
      on progress.target_id = achievement_targets.id and progress.student_id = p_student_id
    where achievement_targets.level_id = current_level.id and achievement_targets.status = 'active';

  percentage := case when total_requirements = 0 then 100
    else round(completed_requirements::numeric / total_requirements * 100, 2) end;
  eligible := percentage >= current_level.advancement_threshold and mandatory_remaining = 0
    and (total_targets = 0 or completed_targets = total_targets);

  select * into next_level from public.levels
    where class_id = current_level.class_id and status = 'active'
      and level_order > current_level.level_order
    order by level_order
    limit 1;

  if not eligible then status := case when percentage > 0 then 'not_eligible' else 'in_progress' end;
  elsif next_level.id is null then status := 'no_next_level';
  else
    update public.students set level_id = next_level.id, current_level = next_level.name, updated_at = now()
      where id = p_student_id and level_id = current_level.id;
    if found then
      insert into public.progression_history (
        student_id, previous_level_id, new_level_id, program, class_name, reason,
        trigger_event, evidence, progress_percent, requirement_status, actor_user_id
      ) values (
        p_student_id, current_level.id, next_level.id, student_row.program, student_row.class_name,
        'All configured advancement conditions satisfied', p_trigger_event,
        jsonb_build_object('completed_targets', completed_targets, 'total_targets', total_targets),
        percentage,
        jsonb_build_object('completed', completed_requirements, 'total', total_requirements,
          'mandatory_remaining', mandatory_remaining),
        auth.uid()
      ) on conflict (student_id, previous_level_id, new_level_id) do nothing
      returning id into history_id;
      status := 'advanced';
    end if;
  end if;

  insert into public.student_progress (
    student_id, progress_percent, completed_requirements, total_requirements,
    completed_targets, total_targets, next_level, next_level_eligible, updated_at
  ) values (
    p_student_id, percentage, completed_requirements, total_requirements,
    completed_targets, total_targets, case when status = 'advanced' then null else next_level.name end,
    eligible and next_level.id is not null, now()
  ) on conflict (student_id) do update set
    progress_percent = excluded.progress_percent,
    completed_requirements = excluded.completed_requirements,
    total_requirements = excluded.total_requirements,
    completed_targets = excluded.completed_targets,
    total_targets = excluded.total_targets,
    next_level = excluded.next_level,
    next_level_eligible = excluded.next_level_eligible,
    updated_at = now();

  return jsonb_build_object(
    'status', status, 'progress_percent', percentage,
    'completed_requirements', completed_requirements, 'total_requirements', total_requirements,
    'completed_targets', completed_targets, 'total_targets', total_targets,
    'next_level', case when status = 'advanced' then null else next_level.name end,
    'history_id', history_id
  );
end;
$$;

revoke all on function public.advance_student_progression(uuid, text) from public, anon;
grant execute on function public.advance_student_progression(uuid, text) to authenticated;

alter table public.students
  add column if not exists program_id uuid references public.programs(id) on delete restrict,
  add column if not exists class_id uuid references public.classes(id) on delete restrict,
  add column if not exists level_id uuid references public.levels(id) on delete restrict;

create index if not exists students_program_class_level_idx
  on public.students(program_id, class_id, level_id);

create or replace function public.validate_student_hierarchy()
returns trigger
language plpgsql
as $$
declare
  class_program_id uuid;
  level_class_id uuid;
begin
  if new.class_id is not null then
    select program_id, status into class_program_id
    from public.classes where id = new.class_id;
    if class_program_id is null or (new.program_id is not null and class_program_id <> new.program_id) then
      raise exception 'Student class does not belong to the selected program';
    end if;
  end if;
  if new.level_id is not null then
    select class_id into level_class_id from public.levels where id = new.level_id;
    if level_class_id is null or (new.class_id is not null and level_class_id <> new.class_id) then
      raise exception 'Student level does not belong to the selected class';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_student_hierarchy on public.students;
create trigger validate_student_hierarchy
before insert or update of program_id, class_id, level_id on public.students
for each row execute function public.validate_student_hierarchy();

create table if not exists public.student_import_logs (
  id uuid primary key default gen_random_uuid(),
  performed_by uuid references auth.users(id),
  source_filename text not null,
  processed_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  rejected_count integer not null default 0,
  duplicate_warning_count integer not null default 0,
  status text not null check (status in ('preview', 'committed', 'rolled_back', 'failed')),
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.students enable row level security;
alter table public.student_accounts enable row level security;
alter table public.scholarships enable row level security;
alter table public.student_progress enable row level security;
alter table public.student_import_logs enable row level security;
alter table public.programs enable row level security;
alter table public.classes enable row level security;
alter table public.levels enable row level security;
alter table public.requirements enable row level security;
alter table public.achievement_targets enable row level security;
alter table public.requirement_targets enable row level security;
alter table public.student_requirement_progress enable row level security;
alter table public.student_target_progress enable row level security;

drop policy if exists "Authenticated users read active master data" on public.programs;
create policy "Authenticated users read active master data" on public.programs
  for select to authenticated using (status = 'active');
drop policy if exists "Authenticated users read active classes" on public.classes;
create policy "Authenticated users read active classes" on public.classes
  for select to authenticated using (status = 'active');
drop policy if exists "Authenticated users read active levels" on public.levels;
create policy "Authenticated users read active levels" on public.levels
  for select to authenticated using (status = 'active');
drop policy if exists "Authenticated users read active requirements" on public.requirements;
create policy "Authenticated users read active requirements" on public.requirements
  for select to authenticated using (status = 'active');
drop policy if exists "Authenticated users read active targets" on public.achievement_targets;
create policy "Authenticated users read active targets" on public.achievement_targets
  for select to authenticated using (status = 'active');
drop policy if exists "Authenticated users read target relationships" on public.requirement_targets;
create policy "Authenticated users read target relationships" on public.requirement_targets
  for select to authenticated using (true);
drop policy if exists "Students read own requirement progress" on public.student_requirement_progress;
create policy "Students read own requirement progress" on public.student_requirement_progress
  for select to authenticated using (exists (
    select 1 from public.student_accounts account
    where account.student_id = student_requirement_progress.student_id and account.user_id = auth.uid()
  ));
drop policy if exists "Students read own target progress" on public.student_target_progress;
create policy "Students read own target progress" on public.student_target_progress
  for select to authenticated using (exists (
    select 1 from public.student_accounts account
    where account.student_id = student_target_progress.student_id and account.user_id = auth.uid()
  ));

drop policy if exists "Tutors manage master data" on public.programs;
create policy "Tutors manage master data" on public.programs for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');
drop policy if exists "Tutors manage classes" on public.classes;
create policy "Tutors manage classes" on public.classes for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');
drop policy if exists "Tutors manage levels" on public.levels;
create policy "Tutors manage levels" on public.levels for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');
drop policy if exists "Tutors manage requirements" on public.requirements;
create policy "Tutors manage requirements" on public.requirements for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');
drop policy if exists "Tutors manage targets" on public.achievement_targets;
create policy "Tutors manage targets" on public.achievement_targets for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');
drop policy if exists "Tutors manage requirement targets" on public.requirement_targets;
create policy "Tutors manage requirement targets" on public.requirement_targets for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');
drop policy if exists "Tutors manage requirement progress" on public.student_requirement_progress;
create policy "Tutors manage requirement progress" on public.student_requirement_progress for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');
drop policy if exists "Tutors manage target progress" on public.student_target_progress;
create policy "Tutors manage target progress" on public.student_target_progress for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');

drop policy if exists "Students read own record" on public.students;
create policy "Students read own record" on public.students
  for select to authenticated
  using (exists (
    select 1 from public.student_accounts account
    where account.student_id = students.id and account.user_id = auth.uid()
  ));

drop policy if exists "Tutors manage students" on public.students;
create policy "Tutors manage students" on public.students
  for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');

drop policy if exists "Student accounts read own record" on public.student_accounts;
create policy "Student accounts read own record" on public.student_accounts
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Tutors manage student accounts" on public.student_accounts;
create policy "Tutors manage student accounts" on public.student_accounts
  for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');

drop policy if exists "Students read own scholarships" on public.scholarships;
create policy "Students read own scholarships" on public.scholarships
  for select to authenticated
  using (exists (
    select 1
    from public.student_accounts account
    where account.student_id = scholarships.student_id and account.user_id = auth.uid()
  ));

drop policy if exists "Students read own progress" on public.student_progress;
create policy "Students read own progress" on public.student_progress
  for select to authenticated
  using (exists (
    select 1 from public.student_accounts account
    where account.student_id = student_progress.student_id and account.user_id = auth.uid()
  ));

drop policy if exists "Tutors manage scholarships" on public.scholarships;
create policy "Tutors manage scholarships" on public.scholarships
  for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'tutor')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'tutor');

revoke all on public.students, public.student_accounts, public.scholarships, public.student_import_logs from anon;
grant select on public.students, public.student_accounts, public.scholarships to authenticated;
grant select on public.student_progress to authenticated;

create or replace function public.touch_student_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists students_touch_updated_at on public.students;
create trigger students_touch_updated_at
before update on public.students
for each row execute function public.touch_student_updated_at();

drop trigger if exists scholarships_touch_updated_at on public.scholarships;
create trigger scholarships_touch_updated_at
before update on public.scholarships
for each row execute function public.touch_student_updated_at();

-- The RPC validates and merges one import atomically. It deliberately does
-- not create program, class, or level master records.
create or replace function public.merge_student_import(
  import_filename text,
  records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  record_item jsonb;
  existing_student public.students%rowtype;
  imported_id text;
  imported_name text;
  imported_dob date;
  inserted_count integer := 0;
  updated_count integer := 0;
  rejected_count integer := 0;
  duplicate_warning_count integer := 0;
  errors jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role', '') <> 'tutor' then
    raise exception 'Tutor authorization is required';
  end if;
  if jsonb_typeof(records) <> 'array' then
    raise exception 'Import records must be an array';
  end if;

  for record_item in select value from jsonb_array_elements(records)
  loop
    imported_id := nullif(trim(record_item->>'student_id'), '');
    imported_name := nullif(trim(record_item->>'full_name'), '');
    imported_dob := nullif(record_item->>'date_of_birth', '')::date;

    if imported_id is null or imported_name is null then
      rejected_count := rejected_count + 1;
      errors := errors || jsonb_build_array(jsonb_build_object(
        'student_id', imported_id, 'full_name', imported_name,
        'error', 'Student ID and full name are required'
      ));
      continue;
    end if;

    select * into existing_student from public.students
      where student_id = imported_id
      or (lower(full_name) = lower(imported_name)
          and date_of_birth is not distinct from imported_dob)
      limit 1
      for update;

    if found then
      if existing_student.student_id <> imported_id then
        duplicate_warning_count := duplicate_warning_count + 1;
        errors := errors || jsonb_build_array(jsonb_build_object(
          'student_id', imported_id, 'full_name', imported_name,
          'error', 'Possible duplicate matched by name and date of birth'
        ));
        continue;
      end if;
      update public.students set
        full_name = imported_name,
        date_of_birth = imported_dob,
        gender = nullif(lower(record_item->>'gender'), ''),
        photo_url = nullif(record_item->>'photo_url', ''),
        program = nullif(trim(record_item->>'program'), ''),
        class_name = nullif(trim(record_item->>'class_name'), ''),
        current_level = nullif(trim(record_item->>'current_level'), ''),
        status = coalesce(nullif(record_item->>'status', ''), 'active')
        where id = existing_student.id;
      updated_count := updated_count + 1;
    else
      insert into public.students (
        student_id, full_name, date_of_birth, gender, photo_url,
        program, class_name, current_level, status
      ) values (
        imported_id, imported_name, imported_dob,
        nullif(lower(record_item->>'gender'), ''),
        nullif(record_item->>'photo_url', ''),
        nullif(trim(record_item->>'program'), ''),
        nullif(trim(record_item->>'class_name'), ''),
        nullif(trim(record_item->>'current_level'), ''),
        coalesce(nullif(record_item->>'status', ''), 'active')
      );
      inserted_count := inserted_count + 1;
    end if;
  end loop;

  insert into public.student_import_logs (
    performed_by, source_filename, processed_count, inserted_count,
    updated_count, rejected_count, duplicate_warning_count, status, errors
  ) values (
    auth.uid(), import_filename, jsonb_array_length(records), inserted_count,
    updated_count, rejected_count, duplicate_warning_count, 'committed', errors
  );

  return jsonb_build_object(
    'processed', jsonb_array_length(records),
    'inserted', inserted_count,
    'updated', updated_count,
    'rejected', rejected_count,
    'duplicate_warnings', duplicate_warning_count,
    'errors', errors
  );
exception when others then
  raise;
end;
$$;

revoke all on function public.merge_student_import(text, jsonb) from public, anon;
grant execute on function public.merge_student_import(text, jsonb) to authenticated;
