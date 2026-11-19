-- Fysieke puzzels: één lijst per organisatie met de puzzels uit de tassen
-- (tangram, morsecode, cryptex, ...), elk met antwoord, hints en teksten per
-- taal. Een stad kiest per puzzelplek (puzzel 1 t/m 6) welke puzzel erin zit
-- (games.settings.puzzles); bij publiceren komt die puzzel op die plek.

create table public.puzzles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Naam in de beheeromgeving, bijvoorbeeld "Tangram" of "Morsecode (internationaal)".
  name text not null check (char_length(name) between 1 and 120),
  -- Teksten per taal ({"nl": "...", "en": "..."}); leeg = die van de puzzelplek.
  title jsonb not null default '{}'::jsonb,
  body jsonb not null default '{}'::jsonb,
  correct_comment jsonb not null default '{}'::jsonb,
  wrong_comment jsonb not null default '{}'::jsonb,
  -- Antwoord zoals in een opdracht: {"type":"text","accepted":[...]} of {"type":"number","value":159}.
  answer jsonb not null,
  -- Hints in volgorde: [{"cost": 25, "text": {"nl": "..."}, "image": "https://..."}].
  hints jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index puzzles_org on public.puzzles (org_id);

alter table public.puzzles enable row level security;

create policy puzzles_select on public.puzzles for select to authenticated using (public.is_member(org_id));
create policy puzzles_write on public.puzzles for all to authenticated
  using (public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[]))
  with check (public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[]));

grant select, insert, update, delete on public.puzzles to authenticated;
