-- Teamcode van woorden in plaats van zes losse tekens.
--
-- Een code als "RODE-VOS" onthoudt een team veel makkelijker dan "K7QX2M".
-- Bij "Verder spelen" maakt het niet uit of het team hoofdletters, spaties of
-- een streepje typt: alleen de letters en cijfers tellen. Bestaande teams
-- houden hun oude code; die blijft gewoon werken.

-- Alleen de letters en cijfers, in hoofdletters: "rode vos" = "RODE-VOS".
create function public.normalize_team_code(p_code text)
returns text
language sql immutable set search_path = ''
as $$
  select regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
$$;

create index teams_team_code_normalized on public.teams (public.normalize_team_code(team_code));

-- Twee woorden (58 x 124 = 7192 combinaties). Zijn er na veel pogingen geen
-- vrije meer, dan komt er een cijfer achter (RODE-VOS-7).
create function public.new_team_code()
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  v_adj constant text[] := array[
    'RODE', 'BLAUWE', 'GELE', 'GROENE', 'PAARSE', 'ROZE', 'WITTE', 'ZWARTE', 'GOUDEN', 'ZILVEREN',
    'SNELLE', 'SLIMME', 'STOERE', 'DAPPERE', 'VROLIJKE', 'STILLE', 'WILDE', 'GEKKE', 'GROTE', 'KLEINE',
    'STERKE', 'KOELE', 'WARME', 'LUIDE', 'BLIJE', 'SLUWE', 'TROTSE', 'VLUGGE', 'HANDIGE', 'GLIMMENDE',
    'VROEGE', 'LATE', 'NATTE', 'DROGE', 'LANGE', 'KORTE', 'ZACHTE', 'HARDE', 'FELLE', 'COOLE',
    'LEUKE', 'SCHERPE', 'MOEDIGE', 'RAPPE', 'RUSTIGE', 'STRAFFE', 'STOUTE', 'EERLIJKE',
    'HOGE', 'LAGE', 'OUDE', 'JONGE', 'NIEUWE', 'VERRE', 'GULLE', 'FRISSE', 'ZONNIGE', 'GEHEIME'
  ];
  v_noun constant text[] := array[
    'VOS', 'UIL', 'BEER', 'LEEUW', 'TIJGER', 'KAT', 'HOND', 'MUIS', 'EEND', 'GANS',
    'ZWAAN', 'REIGER', 'MEEUW', 'KRAAI', 'EKSTER', 'MUS', 'MEREL', 'SPECHT', 'VALK', 'AREND',
    'HAVIK', 'PAUW', 'KIP', 'HAAN', 'GEIT', 'KOE', 'EZEL', 'ZEBRA', 'GIRAF', 'OLIFANT',
    'AAP', 'PANDA', 'KOALA', 'OTTER', 'BEVER', 'DAS', 'EGEL', 'MOL', 'HAAS', 'KONIJN',
    'HERT', 'ELAND', 'WOLF', 'LYNX', 'PANTER', 'POEMA', 'JAGUAR', 'KAMEEL', 'LAMA', 'ALPACA',
    'PINGUIN', 'ROB', 'WALVIS', 'DOLFIJN', 'HAAI', 'ROG', 'KREEFT', 'KRAB', 'SLAK', 'SPIN',
    'MIER', 'BIJ', 'WESP', 'VLINDER', 'LIBEL', 'KIKKER', 'PAD', 'SLANG', 'HAGEDIS', 'SCHILDPAD',
    'KROKODIL', 'DRAAK', 'RIDDER', 'PIRAAT', 'TOVENAAR', 'SPEURNEUS', 'DETECTIVE', 'KAPITEIN', 'STER', 'MAAN',
    'ZON', 'KOMEET', 'RAKET', 'BOOT', 'KANO', 'FIETS', 'TREIN', 'TOREN', 'BRUG', 'MOLEN',
    'SLEUTEL', 'KAART', 'KOMPAS', 'LANTAARN', 'FAKKEL', 'SCHAT', 'KROON', 'MUNT', 'PAREL', 'ROTS',
    'BERG', 'DUIN', 'GOLF', 'STORM', 'BLIKSEM', 'DONDER', 'WOLK', 'REGENBOOG', 'BLOEM', 'ROOS',
    'TULP', 'EIK', 'DEN', 'PALM', 'APPEL', 'PEER', 'BANAAN', 'CITROEN', 'KERS', 'DRUIF',
    'PIZZA', 'TAART', 'WAFEL', 'KOEK'
  ];
  v_code text;
  v_try integer := 0;
begin
  loop
    v_try := v_try + 1;
    v_code := v_adj[1 + floor(random() * array_length(v_adj, 1))::int]
      || '-' || v_noun[1 + floor(random() * array_length(v_noun, 1))::int];
    if v_try > 30 then
      v_code := v_code || '-' || (2 + floor(random() * 98))::int;
    end if;
    exit when not exists (
      select 1 from public.teams where public.normalize_team_code(team_code) = public.normalize_team_code(v_code)
    );
  end loop;
  return v_code;
end;
$$;

create or replace function public.join_session(p_join_code text, p_team_name text, p_language text, p_phone text default null)
returns public.teams
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_session public.sessions;
  v_package jsonb;
  v_order integer;
  v_team public.teams;
  v_code text;
  v_phone text := nullif(regexp_replace(trim(coalesce(p_phone, '')), '\s+', ' ', 'g'), '');
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd' using errcode = '28000';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 ()-]{6,22}[0-9]$' then
    raise exception 'ongeldig telefoonnummer' using errcode = '22023';
  end if;

  select * into v_session from public.sessions
  where join_code = upper(trim(p_join_code))
  for update;

  if not found or v_session.status <> 'open' then
    raise exception 'onbekende of gesloten sessie' using errcode = 'P0002';
  end if;
  -- Vergrendeld of al gestart: geen nieuwe teams meer. Bestaande teams komen
  -- binnen met hun teamcode (rejoin_team), dat blijft altijd werken.
  if v_session.locked or v_session.started_at is not null then
    raise exception 'hunt is vergrendeld' using errcode = 'P0003';
  end if;

  select package into v_package from public.game_versions where id = v_session.game_version_id;
  if not (v_package -> 'languages') ? p_language then
    raise exception 'taal % niet beschikbaar', p_language using errcode = '22023';
  end if;

  select coalesce(max(login_order), 0) + 1 into v_order from public.teams where session_id = v_session.id;

  v_code := public.new_team_code();

  insert into public.teams (session_id, name, language, login_order, track, team_code)
  values (v_session.id, trim(p_team_name), p_language, v_order, ((v_order - 1) % v_session.track_count) + 1, v_code)
  returning * into v_team;

  insert into public.team_members (team_id, user_id) values (v_team.id, auth.uid());
  if v_phone is not null then
    insert into public.team_contacts (team_id, phone) values (v_team.id, v_phone);
  end if;
  return v_team;
end;
$$;

-- Verder spelen: hoofdletters, spaties en streepjes maken niet uit.
create or replace function public.rejoin_team(p_team_code text)
returns public.teams
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_team public.teams;
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd' using errcode = '28000';
  end if;
  select t.* into v_team from public.teams t join public.sessions s on s.id = t.session_id
  where public.normalize_team_code(t.team_code) = public.normalize_team_code(p_team_code)
    and public.normalize_team_code(p_team_code) <> ''
    and s.status = 'open';
  if not found then
    raise exception 'onbekende teamcode' using errcode = 'P0002';
  end if;
  insert into public.team_members (team_id, user_id) values (v_team.id, auth.uid()) on conflict do nothing;
  return v_team;
end;
$$;
