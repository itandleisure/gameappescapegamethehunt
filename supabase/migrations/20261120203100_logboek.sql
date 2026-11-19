-- =============================================================================
-- Logboek voor technische problemen (tabblad Logging in het beheer)
--
-- De speler-app, de webapp en het beheer melden hier fouten en signalen die
-- helpen om een probleem te vinden: zwak of weggevallen GPS, geweigerde
-- locatietoestemming, mislukte verzoeken en uploads, crashes en scriptfouten,
-- kaarten die niet laden, een klok die afwijkt. Bij elke melding staat het
-- toestel (systeem, versie, model of browser, appversie) en, als dat bekend
-- is, de hunt en het team.
--
-- Schrijven kan alleen via log_app_issues(): die controleert de grootte, zet
-- hunt en organisatie zelf (alleen een eigen team of hunt telt), en remt een
-- toestel dat te veel meldt. Lezen: de organisatie van de hunt, en het
-- platform alles (ook meldingen zonder hunt, zoals fouten bij het aanmelden).
-- Meldingen gaan na 28 dagen weg.
-- =============================================================================

create table public.app_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  client_time timestamptz,
  source text not null check (source in ('app', 'webapp', 'spelleider', 'beheer')),
  level text not null check (level in ('error', 'warn', 'info')),
  kind text not null check (length(kind) between 1 and 60),
  message text not null default '' check (length(message) <= 2000),
  details jsonb not null default '{}'::jsonb,
  device jsonb not null default '{}'::jsonb,
  -- Willekeurig id per installatie, om meldingen van één toestel bij elkaar te zien.
  install_id text check (length(install_id) <= 64),
  user_id uuid default auth.uid(),
  org_id uuid references public.organizations (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  team_id uuid references public.teams (id) on delete set null,
  -- Zelfde melding kort na elkaar wordt in de app samengevoegd.
  repeat_count integer not null default 1 check (repeat_count >= 1)
);
create index app_logs_created_idx on public.app_logs (created_at desc);
create index app_logs_session_idx on public.app_logs (session_id, created_at desc);
create index app_logs_org_idx on public.app_logs (org_id, created_at desc);
create index app_logs_user_idx on public.app_logs (user_id, created_at desc);

alter table public.app_logs enable row level security;
create policy app_logs_select on public.app_logs for select to authenticated
  using (public.is_platform_admin() or (org_id is not null and public.is_member(org_id)));
grant select on public.app_logs to authenticated;

-- Meldingen opslaan. p_entries: lijst van objecten met
--   source, level, kind, message, details, device, install_id, client_time,
--   session_id, team_id, count
-- Geeft het aantal opgeslagen meldingen terug.
create function public.log_app_issues(p_entries jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_entry jsonb;
  v_team uuid;
  v_session uuid;
  v_org uuid;
  v_time timestamptz;
  v_recent integer;
  v_saved integer := 0;
begin
  if jsonb_typeof(p_entries) <> 'array' then
    raise exception 'verwacht een lijst' using errcode = '22023';
  end if;

  -- Een toestel dat los gaat, vult het logboek niet: hooguit 300 per uur per gebruiker.
  select count(*) into v_recent from public.app_logs
   where user_id is not distinct from v_user and created_at > now() - interval '1 hour';
  if v_recent >= 300 then
    return 0;
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries) with ordinality as e(value, i) order by i limit 50 loop
    continue when jsonb_typeof(v_entry) <> 'object';
    v_team := null;
    v_session := null;
    v_org := null;

    -- Team alleen als het van deze gebruiker is; de hunt komt dan van het team.
    begin
      v_team := nullif(v_entry ->> 'team_id', '')::uuid;
    exception when others then v_team := null;
    end;
    if v_team is not null and public.is_team_member(v_team) then
      v_session := public.team_session(v_team);
    else
      v_team := null;
      begin
        v_session := nullif(v_entry ->> 'session_id', '')::uuid;
      exception when others then v_session := null;
      end;
      -- Hunt alleen als de gebruiker erin speelt, er spelleider is of hem beheert.
      if v_session is not null and not (
        public.plays_in_session(v_session)
        or public.can_run_session(v_session)
        or exists (select 1 from public.session_leaders l where l.session_id = v_session and l.user_id = v_user)
      ) then
        v_session := null;
      end if;
    end if;
    if v_session is not null then
      v_org := public.session_org(v_session);
    end if;

    begin
      v_time := (v_entry ->> 'client_time')::timestamptz;
    exception when others then v_time := null;
    end;

    insert into public.app_logs (client_time, source, level, kind, message, details, device, install_id,
                                 user_id, org_id, session_id, team_id, repeat_count)
    values (
      v_time,
      case when v_entry ->> 'source' in ('app', 'webapp', 'spelleider', 'beheer') then v_entry ->> 'source' else 'app' end,
      case when v_entry ->> 'level' in ('error', 'warn', 'info') then v_entry ->> 'level' else 'error' end,
      coalesce(nullif(left(regexp_replace(lower(coalesce(v_entry ->> 'kind', '')), '[^a-z0-9_.-]', '', 'g'), 60), ''), 'onbekend'),
      left(coalesce(v_entry ->> 'message', ''), 2000),
      case when jsonb_typeof(v_entry -> 'details') = 'object' and length((v_entry -> 'details')::text) <= 8000
           then v_entry -> 'details' else '{}'::jsonb end,
      case when jsonb_typeof(v_entry -> 'device') = 'object' and length((v_entry -> 'device')::text) <= 2000
           then v_entry -> 'device' else '{}'::jsonb end,
      left(v_entry ->> 'install_id', 64),
      v_user, v_org, v_session, v_team,
      case when v_entry ->> 'count' ~ '^[0-9]{1,5}$' then greatest(1, (v_entry ->> 'count')::integer) else 1 end
    );
    v_saved := v_saved + 1;
  end loop;

  -- Bewaartermijn: oude meldingen opruimen (af en toe, bij het schrijven).
  if random() < 0.02 then
    delete from public.app_logs where created_at < now() - interval '28 days';
  end if;

  return v_saved;
end;
$$;

revoke execute on function public.log_app_issues(jsonb) from public;
grant execute on function public.log_app_issues(jsonb) to anon, authenticated;
