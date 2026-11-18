-- Teamchat: teams in dezelfde hunt sturen elkaar berichten.
--
-- Eén groepsgesprek per hunt (messages.channel = 'teams'). Alle teams van de
-- hunt en de spelleiding zien het; de spelleiding kan meepraten en berichten
-- verwijderen. De spelleider zet de teamchat per hunt aan of uit
-- (sessions.team_chat). Het bestaande kanaal 'staff' (spelleiding ↔ één team,
-- of de spelleiding aan iedereen) blijft zoals het was.

alter table public.sessions add column team_chat boolean not null default false;

alter table public.messages
  add column channel text not null default 'staff' check (channel in ('staff', 'teams')),
  -- Teamnaam van de afzender, door de database ingevuld: teams kunnen de
  -- tabel teams van andere teams niet lezen, en niemand doet zich zo voor als
  -- een ander team.
  add column sender_name text;

-- Afzender, naam en tijd komen altijd van de server.
create function public.message_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.sender_user := coalesce(auth.uid(), new.sender_user);
  new.created_at := now();
  if new.sender = 'team' then
    select name into new.sender_name from public.teams where id = new.team_id;
  else
    new.sender_name := null;
  end if;
  return new;
end;
$$;

create trigger messages_defaults before insert on public.messages
  for each row execute function public.message_defaults();

-- Staat de teamchat aan in deze (open) hunt?
create function public.team_chat_open(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.sessions where id = p_session and team_chat and status = 'open') $$;

-- Lezen: de teamchat zien alle teams van de hunt.
drop policy messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (
  public.can_run_session(session_id)
  or (
    public.plays_in_session(session_id)
    and (channel = 'teams' or team_id is null or public.is_team_member(team_id))
  )
);

-- Schrijven: een team alleen als zichzelf, en in de teamchat alleen als die aan staat.
drop policy messages_insert_team on public.messages;
create policy messages_insert_team on public.messages for insert to authenticated with check (
  sender = 'team' and sender_user = auth.uid() and team_id is not null
  and public.is_team_member(team_id) and public.team_session(team_id) = session_id
  and (channel = 'staff' or public.team_chat_open(session_id))
);

-- De spelleiding kan een bericht weghalen (bijvoorbeeld iets ongepasts).
create policy messages_delete_staff on public.messages for delete to authenticated
  using (public.can_run_session(session_id));

