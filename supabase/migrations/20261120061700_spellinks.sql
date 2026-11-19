-- Vaste links per spel en event, zoals bij Loquiz: /<game-ID>:<spelcode>.
--
-- * Game-ID: een unieke, leesbare naam per spel (bijv. the-hunt-leeuwarden).
--   Bestaande spellen krijgen er een op basis van hun sleutel (slug); de
--   beheerder kan hem daarna aanpassen.
-- * Spelcode: de bestaande code van een event (sessions.join_code), die al
--   uniek is over alle spellen heen.
--
-- De spelcode is dus genoeg om het event te vinden. Het game-ID maakt de link
-- leesbaar; een link met een oud of verkeerd game-ID werkt daarom gewoon.

alter table public.games add column public_id text;

-- Leesbaar game-ID uit vrije tekst: kleine letters, cijfers en streepjes.
create or replace function public.game_public_id_from(p_text text)
returns text
language sql immutable set search_path = ''
as $$
  select left(
    trim(both '-' from regexp_replace(
      lower(translate(coalesce(p_text, ''),
        'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÝýÿÑñÇç',
        'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuYyyNnCc')),
      '[^a-z0-9]+', '-', 'g')),
    40)
$$;

-- Eerste vrije game-ID: de basis, of de basis met -2, -3, …
create or replace function public.unique_game_public_id(p_base text, p_except uuid default null)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_base text := trim(both '-' from left(nullif(p_base, ''), 36));
  v_try text;
  v_n integer := 1;
begin
  if v_base is null or length(v_base) < 2 then
    v_base := 'spel';
  end if;
  v_try := v_base;
  while exists (select 1 from public.games where public_id = v_try and id is distinct from p_except) loop
    v_n := v_n + 1;
    v_try := v_base || '-' || v_n;
  end loop;
  return v_try;
end;
$$;
revoke execute on function public.unique_game_public_id(text, uuid) from public, anon;

-- Bestaande spellen: steden eerst, zodat die de kortste namen krijgen.
do $$
declare
  r record;
begin
  for r in
    select id, slug from public.games
    order by case layer when 'city' then 0 when 'client' then 1 else 2 end, created_at, id
  loop
    update public.games
    set public_id = public.unique_game_public_id(public.game_public_id_from(r.slug), r.id)
    where id = r.id;
  end loop;
end $$;

alter table public.games
  alter column public_id set not null,
  add constraint games_public_id_format check (public_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(public_id) between 2 and 40),
  add constraint games_public_id_unique unique (public_id);

-- Nieuw spel zonder game-ID: er een maken uit de sleutel. Een ingevuld
-- game-ID wordt netjes gemaakt (hoofdletters, spaties).
create or replace function public.games_public_id()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.public_id is null or trim(new.public_id) = '' then
    new.public_id := public.unique_game_public_id(public.game_public_id_from(new.slug), new.id);
  else
    new.public_id := public.game_public_id_from(new.public_id);
  end if;
  return new;
end;
$$;

create trigger games_public_id
before insert or update of public_id on public.games
for each row execute function public.games_public_id();

-- Wat de openbare spellink-pagina nodig heeft: welk spel, de code, en of het
-- event open is. Werkt zonder inloggen. Geeft niets terug over de klant of de
-- teams (de naam van het event blijft binnen de beheeromgeving).
create or replace function public.event_link(p_game text, p_code text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'game_id', g.public_id,
    'code', s.join_code,
    'game_matches', g.public_id = public.game_public_id_from(p_game),
    'name', coalesce(g.settings -> 'name', to_jsonb(g.slug)),
    'default_language', g.default_language,
    'status', s.status,
    'starts_at', s.starts_at,
    'timezone', s.timezone
  )
  from public.sessions s
  join public.game_versions v on v.id = s.game_version_id
  join public.games g on g.id = v.game_id
  where s.join_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;
grant execute on function public.event_link(text, text) to anon, authenticated;
