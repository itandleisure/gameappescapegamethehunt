-- =============================================================================
-- Partners beheren
--
-- Een partner is een eigen organisatie. Het platform kan nu ook een bestaande
-- partner aanpassen: de naam wijzigen en een omschrijving bijhouden (wie het
-- is, welke afspraken). De omschrijving is alleen voor eigenaren en beheerders
-- van het platform, dus niet in organizations (die leest de partner zelf),
-- maar in een eigen tabel zonder rechtstreekse toegang.
-- Accounts onder een partner uitnodigen kon het platform al (invite_member met
-- de rol Partner); die accounts krijgen de rechten van de partner.
-- =============================================================================

create table public.partner_notes (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  note text not null check (length(note) <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.partner_notes enable row level security;
revoke all on public.partner_notes from anon, authenticated;

-- Naam en omschrijving van een partner wijzigen. Een lege omschrijving wist hem.
create function public.update_partner(p_org uuid, p_name text, p_description text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_note text := nullif(trim(coalesce(p_description, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'alleen het platform kan partners wijzigen' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = p_org and not is_platform) then
    raise exception 'onbekende partner' using errcode = 'P0002';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'naam moet 2 tot 80 tekens zijn' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 1000 then
    raise exception 'omschrijving mag hooguit 1000 tekens zijn' using errcode = '22023';
  end if;
  update public.organizations set name = trim(p_name) where id = p_org;
  if v_note is null then
    delete from public.partner_notes where org_id = p_org;
  else
    insert into public.partner_notes (org_id, note, updated_by) values (p_org, v_note, auth.uid())
    on conflict (org_id) do update set note = excluded.note, updated_at = now(), updated_by = excluded.updated_by;
  end if;
end;
$$;
revoke execute on function public.update_partner(uuid, text, text) from public, anon;
grant execute on function public.update_partner(uuid, text, text) to authenticated;

-- Partners voor het overzicht, nu met omschrijving.
drop function public.partner_orgs();
create function public.partner_orgs()
returns table (
  id uuid, name text, created_at timestamptz, owner_email text, accepted boolean,
  member_count integer, description text
)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.name, o.created_at, i.email, i.accepted_at is not null,
    (select count(*)::integer from public.memberships m where m.org_id = o.id),
    n.note
  from public.organizations o
  left join lateral (
    select email, accepted_at from public.invitations where org_id = o.id order by created_at limit 1
  ) i on true
  left join public.partner_notes n on n.org_id = o.id
  where not o.is_platform and public.is_platform_admin()
  order by o.created_at desc
$$;
revoke execute on function public.partner_orgs() from public, anon;
grant execute on function public.partner_orgs() to authenticated;

-- Omschrijvingen van de accounts onder een organisatie (leden en openstaande
-- uitnodigingen), voor de bewerkpagina van een partner.
create function public.org_account_notes(p_org uuid)
returns table (email text, note text)
language sql stable security definer set search_path = ''
as $$
  select n.email, n.note
  from public.account_notes n
  where public.is_platform_admin()
    and (
      exists (
        select 1 from public.memberships m join auth.users u on u.id = m.user_id
        where m.org_id = p_org and lower(u.email) = n.email
      )
      or exists (select 1 from public.invitations i where i.org_id = p_org and i.email = n.email)
    )
$$;
revoke execute on function public.org_account_notes(uuid) from public, anon;
grant execute on function public.org_account_notes(uuid) to authenticated;
