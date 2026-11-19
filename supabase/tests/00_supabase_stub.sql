-- Minimale nabootsing van Supabase voor tests op een gewone Postgres.
-- Alleen gebruikt door scripts/test-db.sh; op Supabase zelf bestaat dit al.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  is_anonymous boolean not null default false
);

create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Opslag (Supabase Storage), alleen wat de migraties gebruiken.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create or replace function storage.foldername(name text) returns text[]
language sql immutable
as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to anon, authenticated;

-- Bevestiging van het e-mailadres (uitnodigingen worden pas dan geaccepteerd).
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists last_sign_in_at timestamptz;
alter table auth.users add column if not exists created_at timestamptz not null default now();

-- Organisatie aanmaken in tests (zelf aanmaken kan in de app niet meer; in
-- productie maakt het platform partners aan met create_partner).
create schema if not exists stub;
grant usage on schema stub to authenticated;
create or replace function stub.create_organization(p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  -- Een eigen organisatie van het platform (partners hebben geen eigenaar).
  insert into public.organizations (name, is_platform) values (trim(p_name), true) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  return v_org;
end;
$$;
grant execute on function stub.create_organization(text) to authenticated;

-- Databasegebruiker van Supabase Auth (registreren loopt via deze gebruiker).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;
grant usage on schema auth to supabase_auth_admin;
grant select, insert, update on auth.users to supabase_auth_admin;
