-- V-Coaching only. No changes to V-Work tables, Auth users, or existing storage policies.
create table public.vcoaching_records (
  namespace text not null,
  id text not null,
  kind text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(namespace,id),
  check (data->>'id' = id)
);
create index vcoaching_records_kind_idx on public.vcoaching_records(namespace,kind);
create index vcoaching_queue_idx on public.vcoaching_records(namespace,(data->>'status')) where kind='file';
create table public.vcoaching_leases (
  namespace text primary key,
  holder uuid not null,
  expires_at timestamptz not null
);
alter table public.vcoaching_records enable row level security;
alter table public.vcoaching_leases enable row level security;
revoke all on public.vcoaching_records, public.vcoaching_leases from public, anon, authenticated;
grant select,insert,update,delete on public.vcoaching_records, public.vcoaching_leases to service_role;

create function public.vcoaching_acquire(p_namespace text,p_holder uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 insert into public.vcoaching_leases(namespace,holder,expires_at)
 values(p_namespace,p_holder,clock_timestamp()+interval '360 seconds')
 on conflict(namespace) do update set holder=excluded.holder,expires_at=excluded.expires_at
 where vcoaching_leases.expires_at < clock_timestamp() or vcoaching_leases.holder=p_holder;
 return found;
end $$;
create function public.vcoaching_commit(p_namespace text,p_holder uuid,p_changes jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
 perform 1 from public.vcoaching_leases where namespace=p_namespace and holder=p_holder and expires_at>clock_timestamp() for update;
 if not found then raise exception 'VCOACHING_LEASE_EXPIRED' using errcode='40001'; end if;
 for item in select value from jsonb_array_elements(p_changes) loop
  insert into public.vcoaching_records(namespace,id,kind,data)
  values(p_namespace,item->>'id',item->>'kind',item->'data')
  on conflict(namespace,id) do update set data=excluded.data,updated_at=now()
  where vcoaching_records.kind=excluded.kind;
  if not found then raise exception 'VCOACHING_RECORD_KIND_MISMATCH'; end if;
 end loop;
 delete from public.vcoaching_leases where namespace=p_namespace and holder=p_holder;
end $$;
create function public.vcoaching_release(p_namespace text,p_holder uuid)
returns void language sql security invoker set search_path='' as $$
 delete from public.vcoaching_leases where namespace=p_namespace and holder=p_holder;
$$;
revoke all on function public.vcoaching_acquire(text,uuid), public.vcoaching_commit(text,uuid,jsonb),public.vcoaching_release(text,uuid) from public,anon,authenticated;
grant execute on function public.vcoaching_acquire(text,uuid),public.vcoaching_commit(text,uuid,jsonb),public.vcoaching_release(text,uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vcoaching-private','vcoaching-private',false,67108864,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/zip','application/octet-stream']);

-- The existing real accounts already refer to these scope IDs. Start with an empty workspace.
insert into public.vcoaching_records(namespace,id,kind,data)
select n,'vcoaching-test','project',jsonb_build_object('id','vcoaching-test','type','project','project','vcoaching-test','name','VNPT Rising – V-Coaching')
from unnest(array['production','preview']) n;
insert into public.vcoaching_records(namespace,id,kind,data)
select n,'vcoaching-test-unit','unit',jsonb_build_object('id','vcoaching-test-unit','type','unit','project','vcoaching-test','unit','vcoaching-test-unit','name','Đơn vị VNPT – chọn tên theo nguồn')
from unnest(array['production','preview']) n;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists vcoaching_private;
revoke all on schema vcoaching_private from public,anon,authenticated;
create table vcoaching_private.worker_targets(namespace text primary key,url text not null,secret_name text not null);
alter table vcoaching_private.worker_targets enable row level security;

-- Internal owner-only dispatcher: the secret stays in Vault, never in cron.job.command.
create function vcoaching_private.dispatch() returns void
language plpgsql security definer set search_path='' as $$
declare target record; bearer text;
begin
 for target in select * from vcoaching_private.worker_targets loop
  if exists(select 1 from public.vcoaching_records where namespace=target.namespace and kind='file' and
    (data->>'status'='queued' or (data->>'status'='reading' and coalesce((data->>'claim_until')::double precision,0)<extract(epoch from now())))) then
   select decrypted_secret into bearer from vault.decrypted_secrets where name=target.secret_name;
   if bearer is not null then
    perform net.http_post(url:=target.url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||bearer),
      body:=jsonb_build_object('namespace',target.namespace),timeout_milliseconds:=240000);
   end if;
  end if;
 end loop;
end $$;
revoke all on function vcoaching_private.dispatch() from public,anon,authenticated;

create function public.vcoaching_configure_worker(p_namespace text,p_url text,p_secret text)
returns void language plpgsql security definer set search_path='' as $$
declare secret_id uuid; secret_name text;
begin
 if p_namespace not in ('production','preview') or length(p_secret)<32 or
    p_url !~ '^https://(test-vinabrain\.vercel\.app|test-vinabrian(-[a-z0-9-]+-fnsofphns-projects)?\.vercel\.app)/api/vcoaching\?op=tick$' then
  raise exception 'Invalid V-Coaching worker destination';
 end if;
 secret_name := 'vcoaching-worker-'||p_namespace;
 select id into secret_id from vault.secrets where name=secret_name;
 if secret_id is null then perform vault.create_secret(p_secret,secret_name);
 else perform vault.update_secret(secret_id,p_secret); end if;
 insert into vcoaching_private.worker_targets values(p_namespace,p_url,secret_name)
 on conflict(namespace) do update set url=excluded.url,secret_name=excluded.secret_name;
end $$;
revoke all on function public.vcoaching_configure_worker(text,text,text) from public,anon,authenticated;
grant execute on function public.vcoaching_configure_worker(text,text,text) to service_role;
select cron.schedule('vcoaching-dispatch','* * * * *','select vcoaching_private.dispatch()');
