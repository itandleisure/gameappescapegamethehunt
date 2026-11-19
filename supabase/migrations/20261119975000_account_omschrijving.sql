-- =============================================================================
-- Omschrijving per account
--
-- Het platform kan bij elk account een vrije omschrijving zetten ("partner in
-- Lissabon, contact via ...", "stagiair tot juni"), zodat in het
-- accountoverzicht meteen duidelijk is hoe het zit. Op e-mailadres, zodat de
-- omschrijving al bij het uitnodigen kan, voordat het account bestaat.
-- Alleen leesbaar en te wijzigen door eigenaren en beheerders van het platform.
-- =============================================================================

create table public.account_notes (
  email text primary key check (email = lower(trim(email))),
  note text not null check (length(note) <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.account_notes enable row level security;
revoke all on public.account_notes from anon, authenticated;

create function public.set_account_note(p_email text, p_note text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'alleen het platform kan omschrijvingen zetten' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'ongeldig e-mailadres' using errcode = '22023';
  end if;
  if v_note is null then
    delete from public.account_notes where email = v_email;
  else
    insert into public.account_notes (email, note, updated_by) values (v_email, v_note, auth.uid())
    on conflict (email) do update set note = excluded.note, updated_at = now(), updated_by = excluded.updated_by;
  end if;
end;
$$;
revoke execute on function public.set_account_note(text, text) from public, anon;
grant execute on function public.set_account_note(text, text) to authenticated;

-- Gaat een account weg, dan ook zijn omschrijving.
create function public.drop_account_note()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.email is not null then
    delete from public.account_notes where email = lower(old.email);
  end if;
  return old;
end;
$$;
revoke execute on function public.drop_account_note() from public, anon, authenticated;
create trigger drop_account_note after delete on auth.users
  for each row execute function public.drop_account_note();

drop function public.platform_accounts();
create function public.platform_accounts()
returns table (
  user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  login_count integer, confirmed boolean, rights jsonb, note text
)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.email, u.created_at, u.last_sign_in_at,
    coalesce(l.login_count, 0), u.email_confirmed_at is not null,
    coalesce((
      select jsonb_agg(jsonb_build_object('org_id', o.id, 'org', o.name, 'platform', o.is_platform, 'role', m.role)
                       order by o.is_platform desc, o.name)
      from public.memberships m join public.organizations o on o.id = m.org_id
      where m.user_id = u.id
    ), '[]'::jsonb),
    n.note
  from auth.users u
  left join public.account_logins l on l.user_id = u.id
  left join public.account_notes n on n.email = lower(u.email)
  where not coalesce(u.is_anonymous, false) and u.email is not null and public.is_platform_admin()
  order by lower(u.email)
$$;
revoke execute on function public.platform_accounts() from public, anon;
grant execute on function public.platform_accounts() to authenticated;
