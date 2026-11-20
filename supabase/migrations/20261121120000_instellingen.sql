-- =============================================================================
-- Algemene instellingen per organisatie (menu Instellingen in de beheerapp)
--
-- org_settings.settings is één JSON-object met:
--   company:   naam, groep ("Badass Games"), logo, website, e-mail, telefoon
--   tickets:   standaard tijdzone, aantal tracks, teamchat en testmodus
--   games:     GPS-nauwkeurigheid, wachttijd na "Nee", cirkel verzamelpunt,
--              kaartstijl en kleuren van het speelveld
--   countries: per land de taal en tijdzone
--   photobook: hoe lang een gedeeld fotoboek te zien is, minimum aantal
--              foto's en eigen teksten per taal
-- De beheerapp leest en controleert de waarden (src/lib/org-settings.ts).
--
-- Website, e-mail en telefoon stonden bij de vaste links van het fotoboek;
-- die verhuizen naar company. share_photobook gebruikt de ingestelde termijn
-- en shared_photobook geeft naam, logo en eigen teksten mee.
-- =============================================================================

create table public.org_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.org_settings enable row level security;
create policy org_settings_select on public.org_settings for select to authenticated
  using (public.is_member(org_id));
create policy org_settings_write on public.org_settings for all to authenticated
  using (public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[]))
  with check (public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[]));
grant select, insert, update, delete on public.org_settings to authenticated;

-- Contactgegevens van het fotoboek naar het bedrijf.
insert into public.org_settings (org_id, settings)
select org_id, jsonb_build_object('company', jsonb_strip_nulls(jsonb_build_object(
  'website', links -> 'website', 'email', links -> 'email', 'phone', links -> 'phone')))
from public.photobook_settings
where links ?| array['website', 'email', 'phone']
on conflict (org_id) do nothing;
update public.photobook_settings set links = links - 'website' - 'email' - 'phone'
where links ?| array['website', 'email', 'phone'];

-- Dagen dat een gedeeld fotoboek te zien is: instelbaar van 1 tot 365, standaard 28.
create function public.photobook_share_days(p_org uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select least(365, greatest(1, round((settings #>> '{photobook,share_days}')::numeric)::int))
    from public.org_settings
    where org_id = p_org
      and jsonb_typeof(settings #> '{photobook,share_days}') = 'number'
  ), 28)
$$;
revoke execute on function public.photobook_share_days(uuid) from public, anon;
grant execute on function public.photobook_share_days(uuid) to authenticated, service_role;

-- Delen aan of uit. Aanzetten (of verlengen) geeft de klant de ingestelde termijn vanaf nu.
create or replace function public.share_photobook(p_session uuid, p_shared boolean)
returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_until timestamptz;
begin
  if not public.can_watch_session(p_session) then
    raise exception 'geen toegang tot deze sessie' using errcode = '42501';
  end if;
  if p_shared then
    select now() + make_interval(days => public.photobook_share_days(s.org_id)) into v_until
    from public.sessions s where s.id = p_session;
  end if;
  update public.photobooks set shared = p_shared, shared_until = v_until where session_id = p_session;
  if not found then
    raise exception 'fotoboek niet gevonden' using errcode = 'P0002';
  end if;
  return v_until;
end;
$$;

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
  v_general jsonb;
  v_company jsonb;
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
  select settings into v_general from public.org_settings where org_id = v_org;
  v_company := coalesce(v_general -> 'company', '{}'::jsonb);

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
      -- Contactgegevens staan bij het bedrijf (Instellingen) en gaan voor.
      'links', coalesce(v_settings.links, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'website', nullif(trim(v_company ->> 'website'), ''),
        'email', nullif(trim(v_company ->> 'email'), ''),
        'phone', nullif(trim(v_company ->> 'phone'), ''))),
      'company', jsonb_build_object(
        'name', nullif(trim(v_company ->> 'name'), ''),
        'group', nullif(trim(v_company ->> 'group'), ''),
        'logo_path', case when public.photobook_org(v_company ->> 'logo_path') = v_org then v_company ->> 'logo_path' end),
      'texts', case when jsonb_typeof(v_general #> '{photobook,texts}') = 'object' then v_general #> '{photobook,texts}' else '{}'::jsonb end,
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
