-- =============================================================================
-- Accountoverzicht voor het platform
--
-- Eén lijst met alle beheeraccounts (dus niet de anonieme spelers): e-mail,
-- in welke organisaties met welke rol, laatste inlog en hoe vaak ingelogd.
-- Alleen voor eigenaren en beheerders van het platform. Zij kunnen een account
-- ook helemaal verwijderen. Een resetlink sturen gaat via Supabase Auth
-- (resetPasswordForEmail) en heeft geen databasefunctie nodig.
-- =============================================================================

-- Aantal keer ingelogd. Supabase Auth zet last_sign_in_at bij elke inlog
-- (wachtwoord, link); een vernieuwd token telt niet mee.
create table public.account_logins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  login_count integer not null default 0
);
alter table public.account_logins enable row level security;
revoke all on public.account_logins from anon, authenticated;

create function public.count_login()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.last_sign_in_at is not null and not coalesce(new.is_anonymous, false) then
    insert into public.account_logins (user_id, login_count) values (new.id, 1)
    on conflict (user_id) do update set login_count = public.account_logins.login_count + 1;
  end if;
  return new;
end;
$$;
revoke execute on function public.count_login() from public, anon, authenticated;

create trigger count_login after update of last_sign_in_at on auth.users
  for each row when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.count_login();

-- Wie al eens heeft ingelogd, telt vanaf nu mee met minstens één keer.
insert into public.account_logins (user_id, login_count)
select id, 1 from auth.users where last_sign_in_at is not null and not coalesce(is_anonymous, false)
on conflict do nothing;

create function public.platform_accounts()
returns table (
  user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  login_count integer, confirmed boolean, rights jsonb
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
    ), '[]'::jsonb)
  from auth.users u
  left join public.account_logins l on l.user_id = u.id
  where not coalesce(u.is_anonymous, false) and u.email is not null and public.is_platform_admin()
  order by lower(u.email)
$$;

-- Account helemaal verwijderen (alle lidmaatschappen gaan mee). Niet jezelf en
-- niet de laatste eigenaar van een platformorganisatie.
create function public.delete_account(p_user uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'alleen het platform kan accounts verwijderen' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'je kunt je eigen account niet verwijderen' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user and not coalesce(is_anonymous, false)) then
    raise exception 'onbekend account' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.memberships m
    where m.user_id = p_user and m.role = 'owner' and public.owner_count(m.org_id) <= 1
  ) then
    raise exception 'dit is de laatste eigenaar van een organisatie' using errcode = '23514';
  end if;
  delete from public.invitations i using auth.users u where u.id = p_user and i.email = lower(u.email);
  delete from auth.users where id = p_user;
end;
$$;

revoke execute on function public.platform_accounts(), public.delete_account(uuid) from public, anon;
grant execute on function public.platform_accounts(), public.delete_account(uuid) to authenticated;
