-- =============================================================================
-- Geen redacteuren meer bij het platform
--
-- Eigen collega's van Escape Game The Hunt zijn eigenaar, beheerder of
-- spelleider. De rol editor bestaat alleen nog bij partners, waar hij in het
-- beheer "Partner" heet. Bestaande redacteuren van het platform (en hun open
-- uitnodigingen) worden beheerder.
-- =============================================================================

update public.memberships m set role = 'admin'
  from public.organizations o
 where o.id = m.org_id and o.is_platform and m.role = 'editor';
update public.invitations i set role = 'admin'
  from public.organizations o
 where o.id = i.org_id and o.is_platform and i.role = 'editor';

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
    if p_role = 'editor' then
      raise exception 'eigen collega''s worden beheerder of spelleider' using errcode = '22023';
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
  if p_role = 'editor' and coalesce((select is_platform from public.organizations where id = p_org), false) then
    raise exception 'eigen collega''s worden beheerder of spelleider' using errcode = '22023';
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
