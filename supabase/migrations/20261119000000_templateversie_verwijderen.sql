-- Een templateversie (vaste versie van het basisspel) verwijderen.
--
-- Elke versie is een complete, op zichzelf staande kopie, dus een oude versie
-- kan weg zodra er geen stad meer op voortbouwt. De koppeling vanuit games
-- (games_base_version_fk, on delete restrict) houdt een versie met steden
-- tegen.

create policy base_versions_delete on public.base_versions for delete to authenticated
  using (public.can_edit_game(game_id));
grant delete on public.base_versions to authenticated;
