-- =============================================================================
-- Spelleider-code als GAME + 3 cijfers
--
-- Een nieuwe spelleider-code ziet er nu uit als GAME482: makkelijk te zeggen
-- en over te typen. Bestaande codes blijven werken tot er een nieuwe code
-- wordt gemaakt.
--
-- - Uniek onder hunts die nog lopen (niet gesloten, niet opgeruimd). Er zijn
--   maar 1000 codes, dus een gesloten hunt geeft zijn code af zodra een
--   andere hunt die trekt. Opent die gesloten hunt weer, dan krijgt hij bij
--   het ophalen vanzelf een nieuwe code.
-- - Zijn alle 1000 in gebruik, dan wordt het GAME + 4 cijfers.
-- - Inloggen negeert hoofdletters, spaties en streepjes: "game 482" en
--   "Game-482" werken ook, net als een letter O of I in plaats van 0 of 1
--   (oude codes bevatten nooit O of I).
-- =============================================================================

create or replace function public.leader_code(p_session uuid, p_new boolean default false)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_code text;
  v_digits integer;
begin
  if not public.can_run_session(p_session) then
    raise exception 'geen toegang tot deze hunt' using errcode = '42501';
  end if;
  select leader_code into v_code from public.sessions where id = p_session and anonymized_at is null;
  if not found then
    raise exception 'hunt niet gevonden' using errcode = 'P0002';
  end if;
  if v_code is null or p_new then
    loop
      v_code := null;
      -- Eerst 3 cijfers; pas als die allemaal bij lopende hunts in gebruik zijn 4.
      foreach v_digits in array array[3, 4] loop
        select c into v_code
          from (select 'GAME' || lpad(n::text, v_digits, '0') as c
                  from generate_series(0, power(10, v_digits)::integer - 1) n) codes
         where not exists (
                 select 1 from public.sessions s
                  where s.leader_code = codes.c
                    and (s.id = p_session or (s.status <> 'closed' and s.anonymized_at is null)))
         order by random()
         limit 1;
        exit when v_code is not null;
      end loop;
      if v_code is null then
        raise exception 'geen vrije spelleider-code meer' using errcode = 'P0001';
      end if;
      begin
        -- Een gesloten hunt met deze code geeft hem af.
        update public.sessions set leader_code = null
         where leader_code = v_code and id <> p_session and (status = 'closed' or anonymized_at is not null);
        update public.sessions set leader_code = v_code where id = p_session;
        exit;
      exception when unique_violation then
        -- Tegelijk door een andere hunt gepakt: nog een keer.
        null;
      end;
    end loop;
    if p_new then
      delete from public.session_leaders where session_id = p_session;
    end if;
  end if;
  return v_code;
end;
$$;

-- Inloggen als spelleider met de code en een naam. Dezelfde naam opnieuw
-- (bijvoorbeeld op een andere telefoon) neemt die spelleider over.
create or replace function public.leader_join(p_code text, p_name text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_session public.sessions;
  v_name text := trim(coalesce(p_name, ''));
  v_row public.session_leaders;
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd' using errcode = '42501';
  end if;
  select * into v_session from public.sessions
   where leader_code = translate(regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g'), 'OI', '01')
     and anonymized_at is null;
  if not found then
    raise exception 'onbekende spelleider-code' using errcode = 'P0002';
  end if;
  if length(v_name) not between 1 and 40 then
    raise exception 'naam moet 1 tot 40 tekens zijn' using errcode = '22023';
  end if;

  -- Deze telefoon was al ingelogd: alleen de naam bijwerken.
  select * into v_row from public.session_leaders where session_id = v_session.id and user_id = auth.uid();
  if found then
    if exists (select 1 from public.session_leaders
                where session_id = v_session.id and lower(name) = lower(v_name) and id <> v_row.id) then
      raise exception 'deze naam is al in gebruik' using errcode = '23505';
    end if;
    update public.session_leaders set name = v_name where id = v_row.id returning * into v_row;
  else
    -- Zelfde naam: deze spelleider gaat verder op een andere telefoon.
    update public.session_leaders set user_id = auth.uid()
     where session_id = v_session.id and lower(name) = lower(v_name)
     returning * into v_row;
    if not found then
      if (select count(*) from public.session_leaders where session_id = v_session.id) >= v_session.max_leaders then
        raise exception 'maximum aantal spelleiders bereikt' using errcode = 'P0006';
      end if;
      insert into public.session_leaders (session_id, user_id, name)
      values (v_session.id, auth.uid(), v_name)
      returning * into v_row;
    end if;
  end if;
  return jsonb_build_object('session_id', v_session.id, 'leader_id', v_row.id, 'name', v_row.name,
    'session_name', v_session.name);
end;
$$;
