-- Een spel verwijderen vanuit de beheerapp (handig tijdens het testen).
-- Alleen wie het spel mag bewerken. Geweigerd als er nog varianten onder
-- hangen of als er al echte sessies (geen testsessies) mee gespeeld zijn:
-- resultaten van klanten gaan nooit per ongeluk verloren. Testsessies, de
-- gepubliceerde versies en alle onderdelen van het spel gaan mee weg.
create or replace function public.delete_game(p_game uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform 1 from public.games where id = p_game for update;
  if not found or not public.can_edit_game(p_game) then
    raise exception 'geen rechten om dit spel te verwijderen' using errcode = '42501';
  end if;
  if exists (select 1 from public.games where parent_id = p_game) then
    raise exception 'Dit spel heeft nog varianten. Verwijder die eerst.' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.sessions s join public.game_versions v on v.id = s.game_version_id
    where v.game_id = p_game and not s.test_mode
  ) then
    raise exception 'Met dit spel zijn al echte sessies gespeeld. Die resultaten blijven bewaard, dus het spel kan niet weg.' using errcode = '23503';
  end if;
  delete from public.sessions s using public.game_versions v where v.id = s.game_version_id and v.game_id = p_game;
  delete from public.game_versions where game_id = p_game;
  delete from public.games where id = p_game;
end;
$$;

revoke all on function public.delete_game(uuid) from public;
grant execute on function public.delete_game(uuid) to authenticated;
