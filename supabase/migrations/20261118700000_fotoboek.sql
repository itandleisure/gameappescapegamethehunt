-- =============================================================================
-- Fotoboek voor de klant
--
-- Na afloop van een hunt maakt de spelleiding per sessie een fotoboek: de
-- foto's uit het spel (teamfoto's en foto-opdrachten) plus eigen foto's van
-- de game masters, in een gekozen volgorde. De beheerapp maakt er een PDF van
-- in Escape Game The Hunt-stijl en deelt die met de klant via een geheime link.
--
-- - photobooks: één fotoboek per sessie, met titel, introtekst en de gekozen
--   foto's in volgorde (items).
-- - Bucket "photobooks": eigen foto's en de PDF, pad <sessie>/<bestand>.
-- - shared_photobook(token): het fotoboek via de geheime link, alleen voor de
--   serverfunctie "photobook" (die maakt er tijdelijke foto-links bij).
--
-- Wie de sessie mag bekijken (spelleiding, en de maker van het spel bij een
-- partner) mag ook het fotoboek maken.
-- =============================================================================

create table public.photobooks (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  title text not null default '' check (length(title) <= 200),
  intro text not null default '' check (length(intro) <= 4000),
  -- [{ "source": "game" | "own", "path": "...", "caption": "...", "large": bool }]
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  show_ranking boolean not null default true,
  -- Taal van de teksten in de PDF en op de klantpagina.
  language text not null default 'nl' check (language in ('nl', 'en', 'de', 'es', 'pt', 'it')),
  pdf_path text,
  pdf_made_at timestamptz,
  share_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  shared boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.photobooks enable row level security;

create policy photobooks_select on public.photobooks for select to authenticated
  using (public.can_watch_session(session_id));
create policy photobooks_insert on public.photobooks for insert to authenticated
  with check (public.can_watch_session(session_id));
create policy photobooks_update on public.photobooks for update to authenticated
  using (public.can_watch_session(session_id)) with check (public.can_watch_session(session_id));
create policy photobooks_delete on public.photobooks for delete to authenticated
  using (public.can_watch_session(session_id));
grant select, insert, update, delete on public.photobooks to authenticated;

-- Nieuwe geheime link, als de oude te ver is verspreid.
create function public.rotate_photobook_token(p_session uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if not public.can_watch_session(p_session) then
    raise exception 'geen toegang tot deze sessie' using errcode = '42501';
  end if;
  update public.photobooks set share_token = v_token where session_id = p_session;
  return v_token;
end;
$$;

-- -----------------------------------------------------------------------------
-- Opslag: eigen foto's en de PDF, pad <sessie>/<bestand>
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('photobooks', 'photobooks', false)
on conflict (id) do nothing;

-- De sessie waar een pad bij hoort, of null als de eerste map geen uuid is.
create function public.photobook_session(p_name text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[1])::uuid
  end
$$;

create policy photobooks_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'photobooks' and public.can_watch_session(public.photobook_session(name))
);
create policy photobooks_files_select on storage.objects for select to authenticated using (
  bucket_id = 'photobooks' and public.can_watch_session(public.photobook_session(name))
);
create policy photobooks_files_update on storage.objects for update to authenticated
  using (bucket_id = 'photobooks' and public.can_watch_session(public.photobook_session(name)))
  with check (bucket_id = 'photobooks' and public.can_watch_session(public.photobook_session(name)));
create policy photobooks_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'photobooks' and public.can_watch_session(public.photobook_session(name))
);

-- -----------------------------------------------------------------------------
-- Het fotoboek via de geheime link
--
-- Alleen foto's die echt bij deze sessie horen komen mee: spelfoto's van een
-- team in de sessie en eigen foto's in de map van de sessie. Zo kan een
-- fotoboek nooit foto's van een andere sessie doorgeven.
-- -----------------------------------------------------------------------------

create function public.shared_photobook(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_book public.photobooks;
  v_items jsonb;
  v_ranking jsonb := '[]'::jsonb;
begin
  select * into v_book from public.photobooks
  where share_token = p_token and shared and length(p_token) >= 24;
  if v_book.session_id is null then
    raise exception 'onbekend of niet gedeeld fotoboek' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(i.item order by i.n), '[]'::jsonb) into v_items
  from jsonb_array_elements(v_book.items) with ordinality as i(item, n)
  where (i.item ->> 'source' = 'own'
         and public.photobook_session(i.item ->> 'path') = v_book.session_id)
     or (i.item ->> 'source' = 'game'
         and exists (select 1 from public.photos ph join public.teams tm on tm.id = ph.team_id
                     where ph.path = i.item ->> 'path' and tm.session_id = v_book.session_id));

  if v_book.show_ranking then
    select coalesce(jsonb_agg(jsonb_build_object(
             'rank', t ->> 'rank', 'name', t ->> 'name', 'score', t ->> 'score',
             'duration_seconds', t ->> 'duration_seconds', 'distance_m', t ->> 'distance_m')), '[]'::jsonb)
    into v_ranking
    from jsonb_array_elements(public.build_session_results(v_book.session_id) -> 'teams') t
    where t ->> 'started_at' is not null;
  end if;

  return (
    select jsonb_build_object(
      'title', coalesce(nullif(v_book.title, ''), s.name),
      'intro', v_book.intro,
      'language', v_book.language,
      'session', s.name,
      'starts_at', s.starts_at,
      'timezone', s.timezone,
      'organization', o.name,
      'items', v_items,
      'ranking', v_ranking,
      'pdf_path', case when public.photobook_session(v_book.pdf_path) = v_book.session_id then v_book.pdf_path end,
      'pdf_made_at', v_book.pdf_made_at
    )
    from public.sessions s join public.organizations o on o.id = s.org_id
    where s.id = v_book.session_id
  );
end;
$$;

revoke execute on function public.shared_photobook(text) from public, anon, authenticated;
grant execute on function public.shared_photobook(text) to service_role;
revoke execute on function public.rotate_photobook_token(uuid) from public, anon;
grant execute on function public.rotate_photobook_token(uuid) to authenticated;
revoke execute on function public.photobook_session(text) from public, anon;
grant execute on function public.photobook_session(text) to authenticated, service_role;
