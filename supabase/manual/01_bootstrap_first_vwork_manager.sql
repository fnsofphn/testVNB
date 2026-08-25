-- Prerequisite: create the first manager in Supabase Authentication > Users.
-- Replace the email below with that real Auth user's email, then run this file
-- on the isolated Digitalume Supabase project.

do $$
declare
  v_email text := lower('REPLACE_WITH_MANAGER_EMAIL');
  v_auth_user_id uuid;
  v_profile_id text;
begin
  if v_email = 'replace_with_manager_email' or v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'Replace REPLACE_WITH_MANAGER_EMAIL before running this script.';
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
