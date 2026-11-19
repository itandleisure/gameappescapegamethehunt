-- Foto's bij fysieke puzzels: een foto bij de puzzel zelf (boven de
-- opdrachttekst) en per hint (zat al in hints[].image). Uploads staan in de
-- bucket media onder puzzels/<org_id>/<bestand>; redacteuren van de
-- organisatie mogen ze plaatsen, vervangen en verwijderen.

alter table public.puzzles add column image text check (image is null or char_length(image) <= 2000);

-- De organisatie van een puzzelfoto, of null als het pad niet puzzels/<uuid>/... is.
create function public.media_puzzle_org(p_name text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1] = 'puzzels'
      and (storage.foldername(p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[2])::uuid
  end
$$;

create policy media_puzzle_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and public.is_member(public.media_puzzle_org(name), array['owner', 'admin', 'editor']::public.member_role[])
);

create policy media_puzzle_select on storage.objects for select to authenticated using (
  bucket_id = 'media' and public.is_member(public.media_puzzle_org(name))
);

create policy media_puzzle_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_member(public.media_puzzle_org(name), array['owner', 'admin', 'editor']::public.member_role[]))
  with check (bucket_id = 'media' and public.is_member(public.media_puzzle_org(name), array['owner', 'admin', 'editor']::public.member_role[]));

create policy media_puzzle_delete on storage.objects for delete to authenticated using (
  bucket_id = 'media' and public.is_member(public.media_puzzle_org(name), array['owner', 'admin', 'editor']::public.member_role[])
);

-- De fysieke puzzels bestaan alleen in het Nederlands. Bij het overnemen uit
-- het template kwamen ook Engelse teksten mee; die halen we weg. Andere talen
-- klik je voortaan per puzzel zelf bij.
update public.puzzles set
  title = coalesce(jsonb_build_object('nl', title -> 'nl') - (case when title ? 'nl' then '' else 'nl' end), '{}'::jsonb),
  body = coalesce(jsonb_build_object('nl', body -> 'nl') - (case when body ? 'nl' then '' else 'nl' end), '{}'::jsonb),
  correct_comment = coalesce(jsonb_build_object('nl', correct_comment -> 'nl') - (case when correct_comment ? 'nl' then '' else 'nl' end), '{}'::jsonb),
  wrong_comment = coalesce(jsonb_build_object('nl', wrong_comment -> 'nl') - (case when wrong_comment ? 'nl' then '' else 'nl' end), '{}'::jsonb),
  hints = coalesce((
    select jsonb_agg(h || jsonb_build_object('text', case when h -> 'text' ? 'nl' then jsonb_build_object('nl', h -> 'text' -> 'nl') else '{}'::jsonb end) order by i)
    from jsonb_array_elements(hints) with ordinality as x(h, i)
  ), '[]'::jsonb);
