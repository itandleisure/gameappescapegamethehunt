-- =============================================================================
-- Onderlinge chat voor de hunters
--
-- Naast de teamchat (kanaal 'teams': alle teams en de hunters, die daar als
-- "The Hunters" posten) krijgt elke hunt een eigen chat voor de spelleiders
-- onderling (kanaal 'hunters'). Daarin staat ieder met zijn eigen naam. Teams
-- zien dit kanaal nooit; het beheer leest en praat mee.
-- =============================================================================

alter table public.messages drop constraint messages_channel_check;
alter table public.messages add constraint messages_channel_check check (channel in ('staff', 'teams', 'hunters'));

-- Naam van de afzender: in de hunters-chat de eigen naam van de spelleider,
-- leeg voor iemand uit het beheer (de app toont dan "Organisatie").
create or replace function public.message_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.sender_user := coalesce(auth.uid(), new.sender_user);
  new.created_at := now();
  if new.sender = 'team' then
    select name into new.sender_name from public.teams where id = new.team_id;
  elsif new.channel = 'hunters' then
    new.sender_name := (select name from public.session_leaders
                        where session_id = new.session_id and user_id = new.sender_user);
  else
    new.sender_name := 'The Hunters';
  end if;
  return new;
end;
$$;

-- Teams lezen nooit de hunters-chat (ook niet via realtime).
drop policy messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (
  public.can_run_session(session_id)
  or (
    public.plays_in_session(session_id)
    and channel <> 'hunters'
    and (channel = 'teams' or team_id is null or public.is_team_member(team_id))
  )
);

-- Een team schrijft nooit in de hunters-chat.
drop policy messages_insert_team on public.messages;
create policy messages_insert_team on public.messages for insert to authenticated with check (
  sender = 'team' and sender_user = auth.uid() and team_id is not null
  and public.is_team_member(team_id) and public.team_session(team_id) = session_id
  and (channel = 'staff' or (channel = 'teams' and public.team_chat_open(session_id)))
);

-- Hunters-chat lezen in de app (hooguit de laatste 200 berichten).
create function public.leader_hunter_messages(p_session uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_session_leader(p_session);
  return coalesce((
    select jsonb_agg(m order by m.created_at)
    from (
      select id, team_id, sender, sender_name, body, created_at, sender_user = auth.uid() as own
      from public.messages
      where session_id = p_session and channel = 'hunters'
      order by created_at desc
      limit 200
    ) m
  ), '[]'::jsonb);
end;
$$;

-- Bericht in de hunters-chat, met de eigen naam.
create function public.leader_send_hunter_message(p_session uuid, p_body text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_row public.messages;
begin
  perform public.require_session_leader(p_session);
  if length(trim(coalesce(p_body, ''))) not between 1 and 500 then
    raise exception 'bericht moet 1 tot 500 tekens zijn' using errcode = '22023';
  end if;
  insert into public.messages (session_id, sender, channel, body)
  values (p_session, 'staff', 'hunters', trim(p_body))
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'team_id', v_row.team_id, 'sender', v_row.sender,
    'sender_name', v_row.sender_name, 'body', v_row.body, 'created_at', v_row.created_at, 'own', true);
end;
$$;

revoke execute on function public.leader_hunter_messages(uuid), public.leader_send_hunter_message(uuid, text)
  from public, anon, authenticated;
grant execute on function public.leader_hunter_messages(uuid), public.leader_send_hunter_message(uuid, text)
  to authenticated;
