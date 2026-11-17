-- Het versienummer in het spelpakket gelijk zetten aan de versie die de
-- database uitdeelt, zodat app en resultaten hetzelfde nummer zien.
create or replace function public.publish_game_version(p_game uuid, p_package jsonb)
returns public.game_versions
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_version public.game_versions;
  v_next integer;
begin
  perform 1 from public.games where id = p_game for update;
  if not found or not public.can_edit_game(p_game) then
    raise exception 'geen rechten om dit spel te publiceren' using errcode = '42501';
  end if;
  if jsonb_typeof(p_package) <> 'object'
     or jsonb_typeof(p_package -> 'tasks') <> 'array'
     or jsonb_typeof(p_package -> 'languages') <> 'array'
     or not (p_package -> 'languages') ? (p_package ->> 'defaultLanguage') then
    raise exception 'ongeldig spelpakket' using errcode = '22023';
  end if;

  v_next := coalesce((select max(version) from public.game_versions where game_id = p_game), 0) + 1;
  insert into public.game_versions (game_id, version, package, published_by)
  values (p_game, v_next, jsonb_set(p_package, '{version}', to_jsonb(v_next)), auth.uid())
  returning * into v_version;
  return v_version;
end;
$$;
