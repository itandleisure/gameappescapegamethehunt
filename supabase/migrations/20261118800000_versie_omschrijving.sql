-- Omschrijving bij een versie van het basisspel.
--
-- Bij elke versie (v1, v2, ...) houdt het team voor zichzelf bij wat erin zit,
-- zodat je bij het uitrollen van een nieuwe stad ziet welke versie je kiest.
-- Die omschrijving (kolom note) mag nu ook achteraf worden aangepast door wie
-- het basisspel mag bewerken, en mag langer zijn. De kopie zelf (snapshot)
-- blijft vast.

alter table public.base_versions drop constraint base_versions_note_check;
alter table public.base_versions
  add constraint base_versions_note_check check (note is null or length(note) <= 2000);

create policy base_versions_update on public.base_versions for update to authenticated
  using (public.can_edit_game(game_id))
  with check (public.can_edit_game(game_id));
grant update (note) on public.base_versions to authenticated;
