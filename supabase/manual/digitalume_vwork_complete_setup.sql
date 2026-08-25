-- DIGITALUME VWORK TRAINING OPERATIONS - COMPLETE MANUAL SETUP
-- Target: the isolated Digitalume Supabase project only.
--
-- Before running:
-- 1. Create the first manager in Supabase Authentication > Users.
-- 2. Replace the manager email value directly below BEGIN with that user's real email.
-- 3. Paste and run this entire file once in Supabase SQL Editor.
--
-- The whole setup runs in one transaction. Any failure rolls everything back.

begin;

select set_config(
  'digitalume.bootstrap_manager_email',
  'REPLACE_WITH_MANAGER_EMAIL',
  true
);

-- ============================================================
-- 1. Minimum Digitalume identity schema
-- ============================================================

-- Run this file only on the isolated Digitalume Supabase project.
-- It creates the minimum identity directory required by the existing AuthContext
-- and the VWork Training Operations server APIs. It does not copy production data.

create table if not exists public.vcontent_profiles (
  id text primary key,
  email text not null unique,
  full_name text not null,
  role text not null default 'vplanning_member',
  vbusiness_role text,
  vplanning_roles text[] not null default '{}'::text[],
  vplanning_departments text[] not null default '{}'::text[],
  vplanning_owner_ids text[] not null default '{}'::text[],
  company_id text,
  organization_id text,
  title text,
  access_scope text not null default 'self',
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  student_class text,
  student_group text,
  student_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vplanning_users (
  email text primary key,
  full_name text not null,
  title text,
  roles text[] not null default '{}'::text[],
  departments text[] not null default '{}'::text[],
  owner_ids text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vplanning_users_payload_object_check check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.vcontent_training_class_students (
  id bigint generated always as identity primary key,
  profile_id text references public.vcontent_profiles(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create index if not exists vcontent_profiles_auth_user_id_idx
  on public.vcontent_profiles (auth_user_id) where active is true;
create index if not exists vcontent_profiles_email_idx
  on public.vcontent_profiles (lower(email)) where active is true;
create index if not exists vplanning_users_full_name_idx
  on public.vplanning_users (full_name);
create index if not exists vcontent_training_class_students_profile_idx
  on public.vcontent_training_class_students (profile_id);
create index if not exists vcontent_training_class_students_email_idx
  on public.vcontent_training_class_students (lower(email));

alter table public.vcontent_profiles enable row level security;
alter table public.vplanning_users enable row level security;
alter table public.vcontent_training_class_students enable row level security;

revoke all on table public.vcontent_profiles from anon, authenticated;
revoke all on table public.vplanning_users from anon, authenticated;
revoke all on table public.vcontent_training_class_students from anon, authenticated;

grant select on table public.vcontent_profiles to authenticated;
grant select on table public.vcontent_training_class_students to authenticated;

drop policy if exists vcontent_profiles_select_self on public.vcontent_profiles;
create policy vcontent_profiles_select_self
on public.vcontent_profiles for select
to authenticated
using ((select auth.uid()) = auth_user_id);

drop policy if exists vcontent_training_class_students_select_self on public.vcontent_training_class_students;
create policy vcontent_training_class_students_select_self
on public.vcontent_training_class_students for select
to authenticated
using (
  exists (
    select 1
    from public.vcontent_profiles profile
    where profile.id = vcontent_training_class_students.profile_id
      and profile.auth_user_id = (select auth.uid())
  )
  or lower(coalesce(email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

grant all on table public.vcontent_profiles to service_role;
grant all on table public.vplanning_users to service_role;
grant all on table public.vcontent_training_class_students to service_role;

-- Existing cleanroom tables may have been created with serial/identity sequences
-- whose generated names differ from the default. Resolve the owned sequence from
-- the column instead of assuming a fixed relation name.
do $$
declare
  v_sequence text := pg_get_serial_sequence('public.vcontent_training_class_students', 'id');
begin
  if v_sequence is not null then
    execute format('grant usage, select on sequence %s to service_role', v_sequence);
  end if;
end;
$$;

-- ============================================================
-- 2. Isolated VWork Training Operations schema
-- ============================================================

-- VWork Training Operations owns every object in this migration.
-- It intentionally has no foreign key, trigger, policy, or write path to VTraining/VLearning tables.

create table if not exists public.vwork_training_operations_state (
  id text primary key,
  active_project_id text,
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vwork_training_operations_state_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint vwork_training_operations_state_payload_projection_check check (not (payload ? 'tasks') and not (payload ? 'auditEvents')),
  constraint vwork_training_operations_state_version_check check (version >= 0)
);

create table if not exists public.vwork_training_operations_tasks (
  state_id text not null references public.vwork_training_operations_state(id) on delete restrict,
  task_id text not null,
  project_id text,
  course_id text,
  class_id text,
  class_code text,
  group_code text,
  status text not null,
  assignee_id text,
  assignee_name text,
  snapshot jsonb not null,
  row_version bigint not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (state_id, task_id),
  constraint vwork_training_operations_tasks_snapshot_object_check check (jsonb_typeof(snapshot) = 'object'),
  constraint vwork_training_operations_tasks_snapshot_id_check check (snapshot ->> 'id' = task_id),
  constraint vwork_training_operations_tasks_row_version_check check (row_version > 0)
);

create table if not exists public.vwork_training_operations_task_history (
  history_id bigint generated always as identity primary key,
  state_id text not null,
  task_id text not null,
  task_row_version bigint not null,
  state_version bigint not null,
  request_id uuid not null,
  command_type text not null,
  actor_id text,
  actor_email text,
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  happened_at timestamptz not null default now(),
  constraint vwork_training_operations_task_history_after_object_check check (jsonb_typeof(after_snapshot) = 'object'),
  constraint vwork_training_operations_task_history_before_object_check check (before_snapshot is null or jsonb_typeof(before_snapshot) = 'object'),
  constraint vwork_training_operations_task_history_version_check check (task_row_version > 0 and state_version > 0),
  foreign key (state_id, task_id) references public.vwork_training_operations_tasks(state_id, task_id) on delete restrict
);

create table if not exists public.vwork_training_operations_audit_events (
  id text primary key,
  state_id text not null references public.vwork_training_operations_state(id) on delete restrict,
  state_version bigint not null,
  request_id uuid not null,
  actor_id text,
  actor_email text,
  actor_name text,
  actor_role text,
  command_type text not null,
  entity_type text,
  entity_id text,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  happened_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint vwork_training_operations_audit_details_object_check check (jsonb_typeof(details) = 'object')
);

create table if not exists public.vwork_training_operations_command_requests (
  request_id uuid primary key,
  state_id text not null references public.vwork_training_operations_state(id) on delete restrict,
  command_type text not null,
  actor_id text,
  expected_version bigint not null,
  resulting_version bigint not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint vwork_training_operations_command_result_object_check check (jsonb_typeof(result) = 'object')
);

create index if not exists vwork_training_operations_tasks_scope_idx
  on public.vwork_training_operations_tasks (state_id, project_id, course_id, class_id, group_code) where archived_at is null;
create index if not exists vwork_training_operations_tasks_assignee_idx
  on public.vwork_training_operations_tasks (state_id, assignee_id, status) where archived_at is null;
create index if not exists vwork_training_operations_task_history_task_idx
  on public.vwork_training_operations_task_history (state_id, task_id, task_row_version desc);
create index if not exists vwork_training_operations_audit_state_version_idx
  on public.vwork_training_operations_audit_events (state_id, state_version desc);
create index if not exists vwork_training_operations_audit_entity_idx
  on public.vwork_training_operations_audit_events (entity_type, entity_id, happened_at desc);

create or replace function public.set_vwork_training_operations_updated_at()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_vwork_training_operations_state_updated_at on public.vwork_training_operations_state;
create trigger set_vwork_training_operations_state_updated_at before update on public.vwork_training_operations_state
for each row execute function public.set_vwork_training_operations_updated_at();

drop trigger if exists set_vwork_training_operations_task_updated_at on public.vwork_training_operations_tasks;
create trigger set_vwork_training_operations_task_updated_at before update on public.vwork_training_operations_tasks
for each row execute function public.set_vwork_training_operations_updated_at();

create or replace function public.persist_vwork_training_operations_state(
  p_state_id text,
  p_expected_version bigint,
  p_request_id uuid,
  p_command_type text,
  p_active_project_id text,
  p_payload jsonb,
  p_tasks jsonb,
  p_audit_events jsonb,
  p_actor jsonb
)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_current_version bigint;
  v_next_version bigint;
  v_existing_count integer;
  v_incoming_count integer;
  v_existing_result jsonb;
  v_task jsonb;
  v_task_id text;
  v_before jsonb;
  v_task_version bigint;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_state_id is null or btrim(p_state_id) = '' then raise exception using errcode = '22023', message = 'VWORK_STATE_ID_REQUIRED'; end if;
  if p_request_id is null then raise exception using errcode = '22023', message = 'VWORK_REQUEST_ID_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version < 0 then raise exception using errcode = '22023', message = 'VWORK_EXPECTED_VERSION_REQUIRED'; end if;
  if p_command_type is null or btrim(p_command_type) = '' then raise exception using errcode = '22023', message = 'VWORK_COMMAND_TYPE_REQUIRED'; end if;
  if jsonb_typeof(p_payload) <> 'object' or p_payload ? 'tasks' or p_payload ? 'auditEvents' then
    raise exception using errcode = '22023', message = 'VWORK_STATE_PROJECTION_INVALID';
  end if;
  if jsonb_typeof(p_tasks) <> 'array' then raise exception using errcode = '22023', message = 'VWORK_TASKS_ARRAY_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_audit_events, '[]'::jsonb)) <> 'array' then raise exception using errcode = '22023', message = 'VWORK_AUDIT_ARRAY_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended('vwork-training-operations:' || p_state_id, 0));
  select result into v_existing_result from public.vwork_training_operations_command_requests where request_id = p_request_id;
  if found then return v_existing_result || jsonb_build_object('idempotentReplay', true); end if;

  select version into v_current_version from public.vwork_training_operations_state where id = p_state_id for update;
  v_current_version := coalesce(v_current_version, 0);
  if v_current_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'VWORK_VERSION_CONFLICT', detail = jsonb_build_object('currentVersion', v_current_version)::text;
  end if;
  v_next_version := v_current_version + 1;

  select count(*) into v_incoming_count from jsonb_array_elements(p_tasks);
  if v_incoming_count = 0 then raise exception using errcode = '22023', message = 'VWORK_EMPTY_TASK_PAYLOAD_REJECTED'; end if;
  if exists (select 1 from jsonb_array_elements(p_tasks) item where nullif(btrim(item ->> 'id'), '') is null) then
    raise exception using errcode = '22023', message = 'VWORK_TASK_ID_REQUIRED';
  end if;
  if (select count(distinct item ->> 'id') from jsonb_array_elements(p_tasks) item) <> v_incoming_count then
    raise exception using errcode = '22023', message = 'VWORK_DUPLICATE_TASK_ID_REJECTED';
  end if;

  select count(*) into v_existing_count from public.vwork_training_operations_tasks where state_id = p_state_id and archived_at is null;
  if exists (
    select 1 from public.vwork_training_operations_tasks existing
    where existing.state_id = p_state_id and existing.archived_at is null
      and not exists (select 1 from jsonb_array_elements(p_tasks) incoming where incoming ->> 'id' = existing.task_id)
  ) then raise exception using errcode = '22023', message = 'VWORK_MISSING_EXISTING_TASK_REJECTED'; end if;
  if v_existing_count > 0 and v_incoming_count * 10 < v_existing_count * 9 then
    raise exception using errcode = '22023', message = 'VWORK_TASK_COUNT_DROP_REJECTED';
  end if;

  insert into public.vwork_training_operations_state (id, active_project_id, payload, version, updated_by, created_at, updated_at)
  values (p_state_id, p_active_project_id, p_payload, v_next_version, p_actor ->> 'email', v_now, v_now)
  on conflict (id) do update set active_project_id = excluded.active_project_id, payload = excluded.payload,
    version = excluded.version, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  for v_task in select value from jsonb_array_elements(p_tasks)
  loop
    v_task_id := v_task ->> 'id';
    select snapshot, row_version into v_before, v_task_version
    from public.vwork_training_operations_tasks where state_id = p_state_id and task_id = v_task_id;
    if not found then
      v_task_version := 1;
      insert into public.vwork_training_operations_tasks (
        state_id, task_id, project_id, course_id, class_id, class_code, group_code,
        status, assignee_id, assignee_name, snapshot, row_version, archived_at, created_at, updated_at
      ) values (
        p_state_id, v_task_id, v_task ->> 'projectId', v_task ->> 'courseId', v_task ->> 'classId',
        v_task ->> 'classCode', v_task ->> 'group', coalesce(nullif(v_task ->> 'status', ''), 'WAITING_INPUT'),
        nullif(v_task ->> 'assigneeId', ''), nullif(v_task ->> 'assignee', ''), v_task, v_task_version,
        case when v_task ->> 'status' = 'CANCELLED' then v_now else null end, v_now, v_now
      );
    elsif v_before is distinct from v_task then
      v_task_version := v_task_version + 1;
      update public.vwork_training_operations_tasks set
        project_id = v_task ->> 'projectId', course_id = v_task ->> 'courseId', class_id = v_task ->> 'classId',
        class_code = v_task ->> 'classCode', group_code = v_task ->> 'group',
        status = coalesce(nullif(v_task ->> 'status', ''), status), assignee_id = nullif(v_task ->> 'assigneeId', ''),
        assignee_name = nullif(v_task ->> 'assignee', ''), snapshot = v_task, row_version = v_task_version,
        archived_at = case when v_task ->> 'status' = 'CANCELLED' then coalesce(archived_at, v_now) else null end,
        updated_at = v_now
      where state_id = p_state_id and task_id = v_task_id;
    else
      continue;
    end if;
    insert into public.vwork_training_operations_task_history (
      state_id, task_id, task_row_version, state_version, request_id, command_type,
      actor_id, actor_email, before_snapshot, after_snapshot, happened_at
    ) values (
      p_state_id, v_task_id, v_task_version, v_next_version, p_request_id, p_command_type,
      p_actor ->> 'id', p_actor ->> 'email', v_before, v_task, v_now
    );
  end loop;

  insert into public.vwork_training_operations_audit_events (
    id, state_id, state_version, request_id, actor_id, actor_email, actor_name,
    actor_role, command_type, entity_type, entity_id, summary, details, happened_at
  )
  select event ->> 'id', p_state_id, v_next_version, p_request_id,
    coalesce(event #>> '{actor,id}', p_actor ->> 'id'), coalesce(event #>> '{actor,email}', p_actor ->> 'email'),
    coalesce(event #>> '{actor,name}', p_actor ->> 'name'), coalesce(event #>> '{actor,role}', p_actor ->> 'role'),
    p_command_type, event ->> 'entityType', event ->> 'entityId', event ->> 'summary',
    coalesce(event -> 'details', '{}'::jsonb), coalesce((event ->> 'happenedAt')::timestamptz, v_now)
  from jsonb_array_elements(coalesce(p_audit_events, '[]'::jsonb)) event;

  v_result := jsonb_build_object('version', v_next_version, 'updatedAt', v_now, 'taskCount', v_incoming_count,
    'auditCount', jsonb_array_length(coalesce(p_audit_events, '[]'::jsonb)), 'idempotentReplay', false);
  insert into public.vwork_training_operations_command_requests (
    request_id, state_id, command_type, actor_id, expected_version, resulting_version, result
  ) values (p_request_id, p_state_id, p_command_type, p_actor ->> 'id', p_expected_version, v_next_version, v_result);
  return v_result;
end;
$$;

alter table public.vwork_training_operations_state enable row level security;
alter table public.vwork_training_operations_tasks enable row level security;
alter table public.vwork_training_operations_task_history enable row level security;
alter table public.vwork_training_operations_audit_events enable row level security;
alter table public.vwork_training_operations_command_requests enable row level security;

revoke all on table public.vwork_training_operations_state from anon, authenticated;
revoke all on table public.vwork_training_operations_tasks from anon, authenticated;
revoke all on table public.vwork_training_operations_task_history from anon, authenticated;
revoke all on table public.vwork_training_operations_audit_events from anon, authenticated;
revoke all on table public.vwork_training_operations_command_requests from anon, authenticated;
do $$
declare
  v_sequence text := pg_get_serial_sequence('public.vwork_training_operations_task_history', 'history_id');
begin
  if v_sequence is not null then
    execute format('revoke all on sequence %s from anon, authenticated', v_sequence);
  end if;
end;
$$;
revoke all on function public.set_vwork_training_operations_updated_at() from public, anon, authenticated;
revoke all on function public.persist_vwork_training_operations_state(text, bigint, uuid, text, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;

grant all on table public.vwork_training_operations_state to service_role;
grant all on table public.vwork_training_operations_tasks to service_role;
grant all on table public.vwork_training_operations_task_history to service_role;
grant all on table public.vwork_training_operations_audit_events to service_role;
grant all on table public.vwork_training_operations_command_requests to service_role;
do $$
declare
  v_sequence text := pg_get_serial_sequence('public.vwork_training_operations_task_history', 'history_id');
begin
  if v_sequence is not null then
    execute format('grant usage, select on sequence %s to service_role', v_sequence);
  end if;
end;
$$;
grant execute on function public.set_vwork_training_operations_updated_at() to service_role;
grant execute on function public.persist_vwork_training_operations_state(text, bigint, uuid, text, text, jsonb, jsonb, jsonb, jsonb) to service_role;

comment on function public.persist_vwork_training_operations_state(text, bigint, uuid, text, text, jsonb, jsonb, jsonb, jsonb)
is 'Atomic isolated VWork Training Operations persistence with optimistic concurrency, idempotency and task history.';

-- ============================================================
-- 3. Least-privilege hardening
-- ============================================================

-- Least-privilege hardening for the isolated VWork Training Operations namespace.
-- History, audit, and idempotency rows are append-only for the API service role.

revoke all on table public.vwork_training_operations_state from service_role;
revoke all on table public.vwork_training_operations_tasks from service_role;
revoke all on table public.vwork_training_operations_task_history from service_role;
revoke all on table public.vwork_training_operations_audit_events from service_role;
revoke all on table public.vwork_training_operations_command_requests from service_role;

grant select, insert, update on table public.vwork_training_operations_state to service_role;
grant select, insert, update on table public.vwork_training_operations_tasks to service_role;
grant select, insert on table public.vwork_training_operations_task_history to service_role;
grant select, insert on table public.vwork_training_operations_audit_events to service_role;
grant select, insert on table public.vwork_training_operations_command_requests to service_role;

do $$
declare
  v_sequence text := pg_get_serial_sequence('public.vwork_training_operations_task_history', 'history_id');
begin
  if v_sequence is not null then
    execute format('revoke all on sequence %s from service_role', v_sequence);
    execute format('grant usage, select on sequence %s to service_role', v_sequence);
  end if;
end;
$$;

-- ============================================================
-- 4. Bootstrap the first real VWork operations manager
-- ============================================================

-- Prerequisite: create the first manager in Supabase Authentication > Users.
-- Replace the email below with that real Auth user's email, then run this file
-- on the isolated Digitalume Supabase project.

do $$
declare
  v_email text := lower(current_setting('digitalume.bootstrap_manager_email'));
  v_auth_user_id uuid;
  v_profile_id text;
begin
  if v_email = 'replace_with_manager_email' or v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'Replace the Digitalume bootstrap manager email before running this script.';
  end if;

  select id
  into v_auth_user_id
  from auth.users
  where lower(email) = v_email
  limit 1;

  if v_auth_user_id is null then
    raise exception 'No Supabase Auth user exists for %', v_email;
  end if;

  v_profile_id := 'VWOPS_MANAGER_' || replace(v_auth_user_id::text, '-', '');

  insert into public.vcontent_profiles (
    id,
    email,
    full_name,
    role,
    vplanning_roles,
    vplanning_departments,
    vplanning_owner_ids,
    title,
    access_scope,
    auth_user_id,
    active
  ) values (
    v_profile_id,
    v_email,
    coalesce(nullif((select raw_user_meta_data ->> 'full_name' from auth.users where id = v_auth_user_id), ''), 'Quản lý vận hành'),
    'training_ops_admin',
    array['vplanning_admin'],
    array['VTraining'],
    '{}'::text[],
    'Quản lý vận hành đào tạo',
    'all',
    v_auth_user_id,
    true
  )
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    full_name = excluded.full_name,
    role = excluded.role,
    vplanning_roles = excluded.vplanning_roles,
    vplanning_departments = excluded.vplanning_departments,
    title = excluded.title,
    access_scope = excluded.access_scope,
    active = true,
    updated_at = now();

  insert into public.vplanning_users (
    email,
    full_name,
    title,
    roles,
    departments,
    owner_ids,
    payload
  ) values (
    v_email,
    coalesce(nullif((select raw_user_meta_data ->> 'full_name' from auth.users where id = v_auth_user_id), ''), 'Quản lý vận hành'),
    'Quản lý vận hành đào tạo',
    array['training_ops_admin', 'vplanning_admin'],
    array['VTraining'],
    '{}'::text[],
    jsonb_build_object('source', 'digitalume_vwork_bootstrap', 'authUserId', v_auth_user_id)
  )
  on conflict (email) do update set
    full_name = excluded.full_name,
    title = excluded.title,
    roles = excluded.roles,
    departments = excluded.departments,
    payload = excluded.payload,
    updated_at = now();
end;
$$;

commit;
