-- =============================================================================
-- Partners nodigen zelf collega's uit, met dezelfde rechten
--
-- - In een partnerorganisatie (organizations.is_platform = false) bestaat geen
--   eigenaar of beheerder meer. De hoogste rol is redacteur. Dat dwingt een
--   trigger op memberships en invitations af, dus ook buiten de functies om.
-- - Elk lid van een partner kan een collega uitnodigen, maar alleen met zijn
--   eigen rol. Welke steden en spellen de partner heeft, staat per organisatie
--   in game_shares; een collega krijgt die dus vanzelf ook.
-- - Leden verwijderen of hun rol wijzigen in een partnerorganisatie doet het
--   platform (eigenaren en beheerders van Escape Game The Hunt).
-- - De contactpersoon die create_partner uitnodigt, wordt redacteur.
-- =============================================================================

-- Bestaande eigenaren en beheerders van partners worden redacteur.
update public.memberships m set role = 'editor'
  from public.organizations o
 where o.id = m.org_id and not o.is_platform and m.role in ('owner', 'admin');
update public.invitations i set role = 'editor'
  from public.organizations o
 where o.id = i.org_id and not o.is_platform and i.role in ('owner', 'admin');

-- Geen eigenaar of beheerder in een partnerorganisatie, hoe de rij ook binnenkomt.
create function public.partner_role_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role in ('owner', 'admin')
     and not coalesce((select is_platform from public.organizations where id = new.org_id), false) then
    raise exception 'een partner kan geen eigenaar of beheerder hebben' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.partner_role_limit() from public, anon, authenticated;

create trigger partner_role_limit before insert or update of role, org_id on public.memberships
  for each row execute function public.partner_role_limit();
create trigger partner_role_limit before insert or update of role, org_id on public.invitations
  for each row execute function public.partner_role_limit();

-- Alleen de naam, het logo en de kleuren van een organisatie zijn aan te passen,
-- zodat niemand zijn organisatie zelf tot platform maakt.
revoke update on public.organizations from authenticated;
grant update (name, logo_path, colors) on public.organizations to authenticated;

-- Mag de ingelogde gebruiker de leden van deze organisatie beheren?
-- Platform: eigenaren en beheerders van die organisatie.
-- Partner: eigenaren en beheerders van het platform.
create function public.can_manage_members(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when (select is_platform from public.organizations where id = p_org)
      then public.is_member(p_org, array['owner', 'admin']::public.member_role[])
    else public.is_platform_admin()
  end;
$$;
revoke execute on function public.can_manage_members(uuid) from public, anon;
grant execute on function public.can_manage_members(uuid) to authenticated;

-- Eigen rol in een organisatie (null als geen lid).
create function public.my_role(p_org uuid)
returns public.member_role
language sql stable security definer set search_path = ''
as $$ select role from public.memberships where org_id = p_org and user_id = auth.uid() $$;
revoke execute on function public.my_role(uuid) from public, anon, authenticated;

create or replace function public.invite_member(p_org uuid, p_email text, p_role public.member_role)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_platform boolean;
  v_user uuid;
begin
  select is_platform into v_platform from public.organizations where id = p_org;
  if not found then
    raise exception 'onbekende organisatie' using errcode = 'P0002';
  end if;

  if v_platform then
    if not public.is_member(p_org, array['owner', 'admin']::public.member_role[]) then
      raise exception 'alleen eigenaren en beheerders kunnen uitnodigen' using errcode = '42501';
    end if;
    if p_role = 'owner' and not public.is_member(p_org, array['owner']::public.member_role[]) then
      raise exception 'alleen een eigenaar kan een eigenaar uitnodigen' using errcode = '42501';
    end if;
  else
    if p_role in ('owner', 'admin') then
      raise exception 'een partner kan geen eigenaar of beheerder hebben' using errcode = '42501';
    end if;
    -- Een partner nodigt alleen uit met zijn eigen rol; het platform met elke rol.
    if not public.is_platform_admin() and public.my_role(p_org) is distinct from p_role then
      raise exception 'je kunt alleen een collega uitnodigen met dezelfde rechten als jij' using errcode = '42501';
    end if;
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

create or replace function public.create_partner(p_name text, p_owner_email text)
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
  insert into public.invitations (email, org_id, role, invited_by) values (v_email, v_org, 'editor', auth.uid());
  select id into v_user from auth.users
  where lower(email) = v_email and not coalesce(is_anonymous, false) and email_confirmed_at is not null;
  if v_user is not null then
    perform public.accept_invitations(v_user, v_email);
  end if;
  return v_org;
end;
$$;

create or replace function public.remove_member(p_org uuid, p_user uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_role public.member_role;
begin
  if not public.can_manage_members(p_org) then
    raise exception 'je mag de leden van deze organisatie niet beheren' using errcode = '42501';
  end if;
  select role into v_role from public.memberships where org_id = p_org and user_id = p_user;
  if not found then
    raise exception 'onbekend lid' using errcode = 'P0002';
  end if;
  if v_role = 'owner' and not public.is_member(p_org, array['owner']::public.member_role[]) then
    raise exception 'alleen een eigenaar kan een eigenaar verwijderen' using errcode = '42501';
  end if;
  if v_role = 'owner' and public.owner_count(p_org) <= 1 then
    raise exception 'de laatste eigenaar kan niet weg' using errcode = '23514';
  end if;

  delete from public.memberships where org_id = p_org and user_id = p_user;
  delete from public.invitations i using auth.users u
   where u.id = p_user and i.org_id = p_org and i.email = lower(u.email);
  if not exists (select 1 from public.memberships where user_id = p_user) then
    delete from auth.users where id = p_user and not coalesce(is_anonymous, false);
  end if;
end;
$$;

create or replace function public.set_member_role(p_org uuid, p_user uuid, p_role public.member_role)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_role public.member_role;
begin
  if not public.can_manage_members(p_org) then
    raise exception 'je mag de leden van deze organisatie niet beheren' using errcode = '42501';
  end if;
  select role into v_role from public.memberships where org_id = p_org and user_id = p_user;
  if not found then
    raise exception 'onbekend lid' using errcode = 'P0002';
  end if;
  if (v_role = 'owner' or p_role = 'owner') and not public.is_member(p_org, array['owner']::public.member_role[]) then
    raise exception 'alleen een eigenaar kan eigenaren aanwijzen of wijzigen' using errcode = '42501';
  end if;
  if v_role = 'owner' and p_role <> 'owner' and public.owner_count(p_org) <= 1 then
    raise exception 'de laatste eigenaar kan niet weg' using errcode = '23514';
  end if;
  update public.memberships set role = p_role where org_id = p_org and user_id = p_user;
end;
$$;

-- Leden met e-mailadres: voor leden van de organisatie en, bij een partner, het platform.
create or replace function public.org_members(p_org uuid)
returns table (user_id uuid, email text, role public.member_role, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, u.email, m.role, m.created_at
  from public.memberships m join auth.users u on u.id = m.user_id
  where m.org_id = p_org and (public.is_member(p_org) or public.can_manage_members(p_org))
  order by m.created_at
$$;

-- Partners met de contactpersoon (de eerste uitnodiging) en het aantal leden.
drop function public.partner_orgs();
create function public.partner_orgs()
returns table (id uuid, name text, created_at timestamptz, owner_email text, accepted boolean, member_count integer)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.name, o.created_at, i.email, i.accepted_at is not null,
    (select count(*)::integer from public.memberships m where m.org_id = o.id)
  from public.organizations o
  left join lateral (
    select email, accepted_at from public.invitations where org_id = o.id order by created_at limit 1
  ) i on true
  where not o.is_platform and public.is_platform_admin()
  order by o.created_at desc
$$;
revoke execute on function public.partner_orgs() from public, anon;
grant execute on function public.partner_orgs() to authenticated;

-- Uitnodigingen: wie de leden beheert ziet en trekt ze in. Een partnerlid ziet
-- de uitnodigingen van zijn organisatie en trekt zijn eigen uitnodigingen in.
drop policy invitations_select on public.invitations;
drop policy invitations_delete on public.invitations;
create policy invitations_select on public.invitations for select to authenticated
  using (public.can_manage_members(org_id) or public.is_member(org_id));
create policy invitations_delete on public.invitations for delete to authenticated
  using (accepted_at is null and (public.can_manage_members(org_id) or invited_by = auth.uid()));
