-- =============================================================================
-- Fotoboek zoals het huidige: wachtwoord, 28 dagen, stad en vaste onderdelen
--
-- Bouwt voort op 20261118700000_fotoboek.sql:
-- - photobooks krijgt een stad (voorkant), een wachtwoord voor de klant en
--   een einddatum (28 dagen na het delen).
-- - photobook_settings: per organisatie de omslagfoto, vaste algemene foto's
--   en links (video, reviews, vacature, contact) die in elk fotoboek komen.
--   De vaste foto's staan in de bucket photobooks onder huisstijl/<org>/….
-- - Items kunnen nu ook 'stock' zijn: een vaste foto van de organisatie.
-- - shared_photobook(token, wachtwoord) vervangt shared_photobook(token).
-- =============================================================================

-- Wachtwoord voor de klant in de vorm XXXX-XXXX-XXXX (zonder 0/O en 1/I).
create function public.photobook_password()
returns text
language sql volatile set search_path = ''
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(r.b, i) % 32), 1)
      || case when i in (3, 7) then '-' else '' end, '' order by i)
  from (select extensions.gen_random_bytes(12) as b) r, generate_series(0, 11) as i
$$;

alter table public.photobooks
  -- Stad op de voorkant: "Bedankt voor het spelen van The Hunt in <stad>".
  add column city text not null default '' check (length(city) <= 80),
  add column share_password text not null default public.photobook_password(),
  -- Tot wanneer de klant het fotoboek kan bekijken (28 dagen na het delen).
  add column shared_until timestamptz;

comment on column public.photobooks.items is
  '[{ "source": "game" | "own" | "stock", "path": "...", "caption": "...", "large": bool }]';
comment on column public.photobooks.show_ranking is
  'Pagina "Jullie Hunt in cijfers" (afstand, stappen, CO2) in het fotoboek.';

-- Al gedeelde fotoboeken krijgen 28 dagen vanaf nu.
update public.photobooks set shared_until = now() + interval '28 days' where shared;

-- Nieuwe link en nieuw wachtwoord, als de oude te ver zijn verspreid.
create or replace function public.rotate_photobook_token(p_session uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if not public.can_watch_session(p_session) then
    raise exception 'geen toegang tot deze sessie' using errcode = '42501';
  end if;
  update public.photobooks set share_token = v_token, share_password = public.photobook_password()
  where session_id = p_session;
  return v_token;
end;
$$;

-- Delen aan of uit. Aanzetten (of verlengen) geeft de klant 28 dagen vanaf nu.
create function public.share_photobook(p_session uuid, p_shared boolean)
returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_until timestamptz := case when p_shared then now() + interval '28 days' end;
begin
  if not public.can_watch_session(p_session) then
    raise exception 'geen toegang tot deze sessie' using errcode = '42501';
  end if;
  update public.photobooks set shared = p_shared, shared_until = v_until where session_id = p_session;
  if not found then
    raise exception 'fotoboek niet gevonden' using errcode = 'P0002';
  end if;
  return v_until;
end;
$$;

-- -----------------------------------------------------------------------------
-- Vaste onderdelen per organisatie
-- -----------------------------------------------------------------------------

create table public.photobook_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  -- Grote foto op de voorkant (ook bij de video).
  cover_path text,
  -- Algemene foto's die in elk fotoboek komen, in volgorde.
  stock_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(stock_paths) = 'array'),
  -- { video, google_review, website_review, vacancy, website, email, phone }
  links jsonb not null default '{}'::jsonb check (jsonb_typeof(links) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.photobook_settings enable row level security;
create policy photobook_settings_select on public.photobook_settings for select to authenticated
  using (public.is_member(org_id));
create policy photobook_settings_write on public.photobook_settings for all to authenticated
  using (public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[]))
  with check (public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[]));
grant select, insert, update, delete on public.photobook_settings to authenticated;

-- De organisatie van een pad onder huisstijl/, anders null.
create function public.photobook_org(p_name text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1] = 'huisstijl'
     and (storage.foldername(p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[2])::uuid
  end
$$;

create policy photobooks_stock_select on storage.objects for select to authenticated using (
  bucket_id = 'photobooks' and public.is_member(public.photobook_org(name))
);
create policy photobooks_stock_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'photobooks' and public.is_member(public.photobook_org(name), array['owner', 'admin', 'editor']::public.member_role[])
);
create policy photobooks_stock_delete on storage.objects for delete to authenticated using (
  bucket_id = 'photobooks' and public.is_member(public.photobook_org(name), array['owner', 'admin', 'editor']::public.member_role[])
);

-- -----------------------------------------------------------------------------
-- Het fotoboek voor de klant: link + wachtwoord, zolang het gedeeld is
--
-- Alleen foto's die echt bij deze sessie horen komen mee: spelfoto's van een
-- team in de sessie, eigen foto's in de map van de sessie en vaste foto's van
-- de organisatie van de sessie.
-- Fouten: P0002 onbekend of niet gedeeld, 28P01 verkeerd wachtwoord,
-- HT410 verlopen.
-- -----------------------------------------------------------------------------

drop function public.shared_photobook(text);

create function public.shared_photobook(p_token text, p_password text)
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
revoke execute on function public.share_photobook(uuid, boolean) from public, anon;
grant execute on function public.share_photobook(uuid, boolean) to authenticated;
revoke execute on function public.photobook_org(text) from public, anon;
grant execute on function public.photobook_org(text) to authenticated, service_role;
