-- Verder spelen met alleen de teamnaam.
--
-- Een team onthoudt zijn eigen naam altijd; de hunt-code vaak niet. Zonder
-- hunt-code zoekt rejoin_team_by_name het team in de hunts die nu lopen: open
-- hunts waarin het team de afgelopen 2 dagen is aangemeld. Komt de naam daar
-- meer dan eens voor, dan vraagt de app er de hunt-code bij (fout P0005).
-- Met hunt-code werkt het zoals voorheen (ook voor oudere app-versies).

create or replace function public.rejoin_team_by_name(p_join_code text, p_team_name text)
returns public.teams
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_team public.teams;
  v_code text := upper(trim(coalesce(p_join_code, '')));
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd' using errcode = '28000';
  end if;
  if public.normalize_team_name(p_team_name) = '' then
    raise exception 'onbekend team' using errcode = 'P0002';
  end if;

  if v_code <> '' then
    select t.* into v_team from public.teams t join public.sessions s on s.id = t.session_id
    where s.join_code = v_code
      and s.status = 'open'
      and public.normalize_team_name(t.name) = public.normalize_team_name(p_team_name)
    order by t.login_order
    limit 1;
  else
    select count(*) into v_count from public.teams t join public.sessions s on s.id = t.session_id
    where s.status = 'open'
      and t.created_at > now() - interval '2 days'
      and public.normalize_team_name(t.name) = public.normalize_team_name(p_team_name);
    if v_count > 1 then
      raise exception 'meerdere teams met deze naam, vul ook de hunt-code in' using errcode = 'P0005';
    end if;
    select t.* into v_team from public.teams t join public.sessions s on s.id = t.session_id
    where s.status = 'open'
      and t.created_at > now() - interval '2 days'
      and public.normalize_team_name(t.name) = public.normalize_team_name(p_team_name);
  end if;

  if v_team.id is null then
    raise exception 'onbekend team' using errcode = 'P0002';
  end if;
  insert into public.team_members (team_id, user_id) values (v_team.id, auth.uid()) on conflict do nothing;
  return v_team;
end;
$$;

revoke execute on function public.rejoin_team_by_name(text, text) from public, anon;
grant execute on function public.rejoin_team_by_name(text, text) to authenticated;
