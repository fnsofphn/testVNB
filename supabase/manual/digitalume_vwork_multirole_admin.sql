-- Run once in the isolated Digitalume/cleanroom Supabase SQL Editor.
-- Prerequisite: the Auth user must already exist. This script never stores or changes its password.

begin;

do $$
declare
  v_email constant text := 'admin@vinabrain.com';
  v_auth_user_id uuid;
  v_profile_id text;
  v_full_name text;
  -- vcontent_profiles.vplanning_roles is constrained to the vplanning_* namespace.
  -- training_ops_admin is the backend grant that expands to all six VWork roles.
  v_profile_roles constant text[] := array[
    'vplanning_admin',
    'vplanning_manager',
    'vplanning_member'
  ];
  v_directory_roles constant text[] := array[
    'training_ops_admin',
    'vplanning_admin',
    'vplanning_manager',
    'vplanning_member'
  ];
begin
  select id,
         coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), 'Quản trị VWork đa vai')
    into v_auth_user_id, v_full_name
  from auth.users
  where lower(email) = v_email
  limit 1;

  if v_auth_user_id is null then
    raise exception 'Chưa có Supabase Auth user cho %. Hãy tạo user trước rồi chạy lại file này.', v_email;
  end if;

  v_profile_id := 'VWOPS_MULTIROLE_' || replace(v_auth_user_id::text, '-', '');

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
    v_full_name,
    'training_ops_admin',
    v_profile_roles,
    array['VTraining'],
    array[v_email],
    'Quản trị VWork đa vai',
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
    vplanning_owner_ids = excluded.vplanning_owner_ids,
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
    v_full_name,
    'Quản trị VWork đa vai',
    v_directory_roles,
    array['VTraining'],
    array[v_email],
    jsonb_build_object(
      'source', 'digitalume_vwork_multirole_admin',
      'authUserId', v_auth_user_id,
      'canSwitchTrainingRoles', true
    )
  )
  on conflict (email) do update set
    full_name = excluded.full_name,
    title = excluded.title,
    roles = excluded.roles,
    departments = excluded.departments,
    owner_ids = excluded.owner_ids,
    payload = coalesce(public.vplanning_users.payload, '{}'::jsonb) || excluded.payload,
    updated_at = now();
end;
$$;

commit;

select
  p.email,
  p.role,
  p.vplanning_roles,
  u.roles as directory_roles,
  u.owner_ids
from public.vcontent_profiles p
join public.vplanning_users u on lower(u.email) = lower(p.email)
where lower(p.email) = 'admin@vinabrain.com';
