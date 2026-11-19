-- =============================================================================
-- Fotoboek: de andere spellen van Badass Games op de slotpagina
--
-- photobook_settings.games: de blokken "Meer spellen van Badass Games"
-- (naam, tekst, link en een foto onder huisstijl/<org>/). Null betekent nog
-- nooit ingesteld: de beheerapp gebruikt dan de spellen van het huidige
-- fotoboek. shared_photobook geeft de spellen mee aan de klantpagina, met
-- alleen foto's van de eigen organisatie.
-- =============================================================================

alter table public.photobook_settings
  add column games jsonb check (games is null or jsonb_typeof(games) = 'array');

create or replace function public.shared_photobook(p_token text, p_password text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_book public.photobooks;
  v_org uuid;
  v_items jsonb;
  v_teams jsonb := '[]'::jsonb;
  v_settings public.photobook_settings;
begin
  select * into v_book from public.photobooks
  where share_token = p_token and shared and length(p_token) >= 24;
  if v_book.session_id is null then
    raise exception 'onbekend of niet gedeeld fotoboek' using errcode = 'P0002';
  end if;
  if upper(replace(trim(coalesce(p_password, '')), ' ', '')) <> v_book.share_password then
    raise exception 'verkeerd wachtwoord' using errcode = '28P01';
  end if;
  if v_book.shared_until is not null and v_book.shared_until < now() then
    raise exception 'fotoboek verlopen' using errcode = 'HT410';
  end if;

  select org_id into v_org from public.sessions where id = v_book.session_id;
  select * into v_settings from public.photobook_settings where org_id = v_org;

  select coalesce(jsonb_agg(i.item order by i.n), '[]'::jsonb) into v_items
  from jsonb_array_elements(v_book.items) with ordinality as i(item, n)
  where (i.item ->> 'source' = 'own'
         and public.photobook_session(i.item ->> 'path') = v_book.session_id)
     or (i.item ->> 'source' = 'stock'
         and public.photobook_org(i.item ->> 'path') = v_org)
     or (i.item ->> 'source' = 'game'
         and exists (select 1 from public.photos ph join public.teams tm on tm.id = ph.team_id
                     where ph.path = i.item ->> 'path' and tm.session_id = v_book.session_id));

  if v_book.show_ranking then
    select coalesce(jsonb_agg(jsonb_build_object(
             'rank', (t ->> 'rank')::int, 'name', t ->> 'name', 'score', (t ->> 'score')::int,
             'duration_seconds', (t ->> 'duration_seconds')::int, 'distance_m', (t ->> 'distance_m')::int)), '[]'::jsonb)
    into v_teams
    from jsonb_array_elements(public.build_session_results(v_book.session_id) -> 'teams') t
    where t ->> 'started_at' is not null;
  end if;

  return (
    select jsonb_build_object(
      'title', coalesce(nullif(v_book.title, ''), s.name),
      'city', v_book.city,
      'intro', v_book.intro,
      'language', v_book.language,
      'session', s.name,
      'starts_at', s.starts_at,
      'timezone', s.timezone,
      'items', v_items,
      'teams', v_teams,
      'cover_path', case when public.photobook_org(v_settings.cover_path) = v_org then v_settings.cover_path end,
      'links', coalesce(v_settings.links, '{}'::jsonb),
      -- null: nog nooit ingesteld, de beheerapp vult dan de standaardspellen in.
      'games', case when v_settings.games is null then null else (
        select coalesce(jsonb_agg(
                 g - 'image_path' || jsonb_build_object('image_path',
                   case when public.photobook_org(g ->> 'image_path') = v_org then g ->> 'image_path' end)
                 order by n), '[]'::jsonb)
        from jsonb_array_elements(v_settings.games) with ordinality as x(g, n)
        where jsonb_typeof(g) = 'object') end,
      'pdf_path', case when public.photobook_session(v_book.pdf_path) = v_book.session_id then v_book.pdf_path end,
      'pdf_made_at', v_book.pdf_made_at,
      'shared_until', v_book.shared_until
    )
    from public.sessions s
    where s.id = v_book.session_id
  );
end;
$$;

revoke execute on function public.shared_photobook(text, text) from public, anon, authenticated;
grant execute on function public.shared_photobook(text, text) to service_role;
