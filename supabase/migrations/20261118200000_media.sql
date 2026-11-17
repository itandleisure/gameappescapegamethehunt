-- -----------------------------------------------------------------------------
-- Media voor spellen (kaartoverlays, later ook afbeeldingen bij opdrachten).
-- Pad: <game_id>/<bestand>. De bucket is openbaar leesbaar, zodat de speler-app
-- de afbeelding met een gewone URL kan laden; alleen redacteuren van het spel
-- mogen bestanden plaatsen, vervangen of verwijderen.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('media', 'media', true)
on conflict (id) do nothing;

-- Het spel waar een mediapad bij hoort, of null als de eerste map geen uuid is.
create function public.media_game(p_name text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[1])::uuid
  end
$$;

create policy media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and public.can_edit_game(public.media_game(name))
);

create policy media_select on storage.objects for select to authenticated using (
  bucket_id = 'media' and public.can_view_game(public.media_game(name))
);

create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.can_edit_game(public.media_game(name)))
  with check (bucket_id = 'media' and public.can_edit_game(public.media_game(name)));

create policy media_delete on storage.objects for delete to authenticated using (
  bucket_id = 'media' and public.can_edit_game(public.media_game(name))
);
