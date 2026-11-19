-- =============================================================================
-- Beheeromgeving alleen op uitnodiging
--
-- Voorheen kon iedereen op de beheersite een account aanmaken, zelf een
-- organisatie beginnen en dan bijvoorbeeld via /api/vertalen op het tegoed van
-- Escape Game The Hunt vertalen. Nu:
--
-- - Een account (e-mail) aanmaken lukt alleen voor een e-mailadres dat is
--   uitgenodigd. Anonieme spelers in de app merken hier niets van.
-- - Eigenaren en beheerders nodigen collega's uit in hun eigen organisatie.
-- - Het platform (Escape Game The Hunt, organizations.is_platform) maakt een
--   partner aan: een nieuwe organisatie met een uitnodiging voor de eigenaar.
--   Wat een partner mag spelen, loopt via game_shares (spel per spel delen);
--   dat blijft de plek om partnerrechten later per hunt te beperken.
-- - Zelf een organisatie aanmaken (create_organization) kan niet meer.
-- - Een uitnodiging wordt lid zodra het e-mailadres is bevestigd.
-- =============================================================================

alter table public.organizations add column is_platform boolean not null default false;
-- Alle organisaties die nu bestaan zijn van Escape Game The Hunt zelf: partners
-- komen pas na deze wijziging, via create_partner().
update public.organizations set is_platform = true;

create table public.invitations (
  email text not null check (email = lower(trim(email)) and email like '%_@_%'),
  org_id uuid not null references public.organizations (id) on delete cascade,
  role public.member_role not null,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (email, org_id)
);
alter table public.invitations enable row level security;
create policy invitations_select on public.invitations for select to authenticated
  using (public.is_member(org_id, array['owner', 'admin']::public.member_role[]));
create policy invitations_delete on public.invitations for delete to authenticated
  using (accepted_at is null and public.is_member(org_id, array['owner', 'admin']::public.member_role[]));
grant select, delete on public.invitations to authenticated;

-- Is de ingelogde gebruiker eigenaar of beheerder van een platformorganisatie?
create function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m join public.organizations o on o.id = m.org_id
    where m.user_id = auth.uid() and o.is_platform and m.role in ('owner', 'admin')
  );
$$;

-- Openstaande uitnodigingen van een bevestigd account omzetten in lidmaatschap.
create function public.accept_invitations(p_user uuid, p_email text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  insert into public.memberships (org_id, user_id, role)
  select i.org_id, p_user, i.role from public.invitations i
  where i.email = lower(trim(p_email)) and i.accepted_at is null
  on conflict (org_id, user_id) do nothing;
  update public.invitations set accepted_at = now()
  where email = lower(trim(p_email)) and accepted_at is null;
end;
$$;

-- Collega uitnodigen in de eigen organisatie. Heeft die al een bevestigd
-- account, dan is hij meteen lid.
create function public.invite_member(p_org uuid, p_email text, p_role public.member_role)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid;
begin
  if not public.is_member(p_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'alleen eigenaren en beheerders kunnen uitnodigen' using errcode = '42501';
  end if;
  if p_role = 'owner' and not public.is_member(p_org, array['owner']::public.member_role[]) then
    raise exception 'alleen een eigenaar kan een eigenaar uitnodigen' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'ongeldig e-mailadres' using errcode = '22023';
  end if;
  insert into public.invitations (email, org_id, role, invited_by)
  values (v_email, p_org, p_role, auth.uid())
  on conflict (email, org_id) do update set role = excluded.role, invited_by = excluded.invited_by,
    created_at = now(), accepted_at = null;
  select id into v_user from auth.users
  where lower(email) = v_email and not coalesce(is_anonymous, false) and email_confirmed_at is not null;
  if v_user is not null then
    perform public.accept_invitations(v_user, v_email);
  end if;
end;
$$;

-- Partner aanmaken: nieuwe organisatie met een uitnodiging voor de eigenaar.
-- Alleen eigenaren en beheerders van het platform.
create function public.create_partner(p_name text, p_owner_email text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_email text := lower(trim(coalesce(p_owner_email, '')));
  v_user uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'alleen het platform kan partners aanmaken' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'naam moet 2 tot 80 tekens zijn' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'ongeldig e-mailadres' using errcode = '22023';
  end if;
  insert into public.organizations (name) values (trim(p_name)) returning id into v_org;
  insert into public.invitations (email, org_id, role, invited_by) values (v_email, v_org, 'owner', auth.uid());
  select id into v_user from auth.users
  where lower(email) = v_email and not coalesce(is_anonymous, false) and email_confirmed_at is not null;
  if v_user is not null then
    perform public.accept_invitations(v_user, v_email);
  end if;
  return v_org;
end;
$$;

-- Leden van de eigen organisatie met e-mailadres (auth.users is niet leesbaar).
create function public.org_members(p_org uuid)
returns table (user_id uuid, email text, role public.member_role, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, u.email, m.role, m.created_at
  from public.memberships m join auth.users u on u.id = m.user_id
  where m.org_id = p_org and public.is_member(p_org)
  order by m.created_at
$$;

-- Partners die het platform heeft aangemaakt (voor het overzicht).
create function public.partner_orgs()
returns table (id uuid, name text, created_at timestamptz, owner_email text, accepted boolean)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.name, o.created_at, i.email, i.accepted_at is not null
  from public.organizations o
  left join public.invitations i on i.org_id = o.id and i.role = 'owner'
  where not o.is_platform and public.is_platform_admin()
  order by o.created_at desc
$$;

-- -----------------------------------------------------------------------------
-- Accounts: alleen met uitnodiging
-- -----------------------------------------------------------------------------

create function public.auth_user_invited()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Alleen aanmeldingen via Supabase Auth (registreren, uitnodigen in het
  -- dashboard), herkenbaar aan de databasegebruiker van Supabase Auth. Wie
  -- rechtstreeks in de database schrijft, beheert dat zelf.
  if coalesce(new.is_anonymous, false) or session_user <> 'supabase_auth_admin' then
    return new;
  end if;
  if not exists (
    select 1 from public.invitations where email = lower(trim(coalesce(new.email, ''))) and accepted_at is null
  ) then
    raise exception 'Registreren kan alleen met een uitnodiging' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.auth_user_confirmed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(new.is_anonymous, false) and new.email_confirmed_at is not null and new.email is not null then
    perform public.accept_invitations(new.id, new.email);
  end if;
  return new;
end;
$$;

create trigger invited_only before insert on auth.users
  for each row execute function public.auth_user_invited();
create trigger accept_invitations_on_insert after insert on auth.users
  for each row execute function public.auth_user_confirmed();
create trigger accept_invitations_on_confirm after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.auth_user_confirmed();

-- -----------------------------------------------------------------------------
-- Rechten
-- -----------------------------------------------------------------------------

-- Zelf een organisatie aanmaken kan niet meer.
revoke execute on function public.create_organization(text) from public, anon, authenticated;

revoke execute on function public.accept_invitations(uuid, text), public.auth_user_invited(), public.auth_user_confirmed()
  from public, anon, authenticated;
revoke execute on function public.invite_member(uuid, text, public.member_role), public.create_partner(text, text),
  public.org_members(uuid), public.partner_orgs(), public.is_platform_admin() from public, anon;
grant execute on function public.invite_member(uuid, text, public.member_role), public.create_partner(text, text),
  public.org_members(uuid), public.partner_orgs(), public.is_platform_admin() to authenticated;
