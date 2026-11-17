-- Beheeromgeving (fase 3): eerste organisatie aanmaken, spelversies
-- publiceren en sessies met een automatische sessiecode.

-- -----------------------------------------------------------------------------
-- Eigen organisatie aanmaken
-- -----------------------------------------------------------------------------

-- Een ingelogde medewerker (geen anonieme speler) die nog nergens lid van is,
-- maakt zijn eigen organisatie aan en wordt daarvan eigenaar. Verdere leden
-- voegt de eigenaar daarna zelf toe.
create function public.create_organization(p_name text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null
     or coalesce((select is_anonymous from auth.users where id = auth.uid()), true) then
    raise exception 'alleen voor ingelogde medewerkers' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'je bent al lid van een organisatie' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'naam moet 2 tot 80 tekens zijn' using errcode = '22023';
  end if;

  insert into public.organizations (name) values (trim(p_name)) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  return v_org;
end;
$$;

-- -----------------------------------------------------------------------------
-- Spelversie publiceren
-- -----------------------------------------------------------------------------

-- Slaat een samengesteld spelpakket op als nieuwe, vaste versie. Sessies
-- verwijzen naar een versie, zodat een lopend spel niet verandert als het spel
-- later wordt aangepast.
create function public.publish_game_version(p_game uuid, p_package jsonb)
returns public.game_versions
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_version public.game_versions;
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game for update;
  if not found or not public.can_edit_game(p_game) then
    raise exception 'geen rechten om dit spel te publiceren' using errcode = '42501';
  end if;
  if jsonb_typeof(p_package) <> 'object'
     or jsonb_typeof(p_package -> 'tasks') <> 'array'
     or jsonb_typeof(p_package -> 'languages') <> 'array'
     or not (p_package -> 'languages') ? (p_package ->> 'defaultLanguage') then
    raise exception 'ongeldig spelpakket' using errcode = '22023';
  end if;

  insert into public.game_versions (game_id, version, package, published_by)
  values (
    p_game,
    coalesce((select max(version) from public.game_versions where game_id = p_game), 0) + 1,
    p_package,
    auth.uid()
  )
  returning * into v_version;
  return v_version;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sessiecode automatisch
-- -----------------------------------------------------------------------------

-- Zonder opgegeven code krijgt een sessie een unieke code van 6 tekens.
create function public.sessions_join_code()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.join_code is null or new.join_code = '' then
    loop
      new.join_code := public.random_code(6);
      exit when not exists (select 1 from public.sessions where join_code = new.join_code);
    end loop;
  else
    new.join_code := upper(trim(new.join_code));
  end if;
  return new;
end;
$$;

create trigger sessions_join_code before insert or update of join_code on public.sessions
  for each row execute function public.sessions_join_code();

grant execute on all functions in schema public to authenticated;
grant execute on function public.shared_session_results(text) to anon;
