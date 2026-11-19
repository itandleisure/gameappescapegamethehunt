-- =============================================================================
-- Toegang beheren: leden verwijderen en hun rol wijzigen
--
-- Eigenaren en beheerders beheren de leden van hun eigen organisatie:
-- - remove_member: lid eruit. Is hij nergens anders meer lid, dan gaat ook zijn
--   account weg (en is hij meteen uitgelogd).
-- - set_member_role: rol wijzigen.
-- Een beheerder kan geen eigenaar verwijderen of maken; de laatste eigenaar
-- blijft altijd bestaan.
-- Steden toewijzen aan een partner gaat met game_shares (al bestaand).
-- =============================================================================

create function public.owner_count(p_org uuid)
returns integer
language sql stable security definer set search_path = ''
as $$ select count(*)::integer from public.memberships where org_id = p_org and role = 'owner' $$;

create function public.remove_member(p_org uuid, p_user uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_role public.member_role;
begin
  if not public.is_member(p_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'alleen eigenaren en beheerders kunnen leden verwijderen' using errcode = '42501';
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
  -- Uitnodigingen voor dit adres in deze organisatie vervallen ook.
  delete from public.invitations i using auth.users u
   where u.id = p_user and i.org_id = p_org and i.email = lower(u.email);
  if not exists (select 1 from public.memberships where user_id = p_user) then
    delete from auth.users where id = p_user and not coalesce(is_anonymous, false);
  end if;
end;
$$;

create function public.set_member_role(p_org uuid, p_user uuid, p_role public.member_role)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_role public.member_role;
begin
  if not public.is_member(p_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'alleen eigenaren en beheerders kunnen rollen wijzigen' using errcode = '42501';
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

revoke execute on function public.owner_count(uuid) from public, anon, authenticated;
revoke execute on function public.remove_member(uuid, uuid), public.set_member_role(uuid, uuid, public.member_role) from public, anon;
grant execute on function public.remove_member(uuid, uuid), public.set_member_role(uuid, uuid, public.member_role) to authenticated;

-- Leden schrijven alleen nog via deze functies (en de uitnodigingen), zodat de
-- regels hierboven niet te omzeilen zijn met een gewone update.
drop policy memberships_write on public.memberships;
