-- Run this file only on the isolated Digitalume Supabase project.
-- It creates the minimum identity directory required by the existing AuthContext
-- and the VWork Training Operations server APIs. It does not copy production data.

begin;

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
grant usage, select on sequence public.vcontent_training_class_students_id_seq to service_role;

commit;
