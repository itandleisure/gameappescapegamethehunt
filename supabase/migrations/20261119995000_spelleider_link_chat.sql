-- =============================================================================
-- Spelleider-link: telefoonnummers en teamchat
--
-- - De spelleider ziet via de link de telefoonnummers van de teams.
-- - Hij leest de teamchat en stuurt zelf berichten. Berichten van de
--   spelleiding heten in de chat "The Hunters".
-- =============================================================================

-- Berichten van de spelleiding staan op naam van "The Hunters".
create or replace function public.message_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.sender_user := coalesce(auth.uid(), new.sender_user);
  new.created_at := now();
  if new.sender = 'team' then
    select name into new.sender_name from public.teams where id = new.team_id;
  else
    new.sender_name := 'The Hunters';
  end if;
  return new;
end;
$$;
update public.messages set sender_name = 'The Hunters' where sender = 'staff' and sender_name is null;

create or replace function public.leader_session(p_token text, p_after_position bigint default 0)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session uuid := public.leader_session_id(p_token);
begin
  if v_session is null then
    raise exception 'onbekende of verlopen link' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'session', (
      select jsonb_build_object('id', s.id, 'name', s.name, 'status', s.status, 'test_mode', s.test_mode,
        'starts_at', s.starts_at, 'timezone', s.timezone, 'join_code', s.join_code, 'team_chat', s.team_chat)
      from public.sessions s where s.id = v_session
    ),
    'game', (
      select v.package from public.sessions s join public.game_versions v on v.id = s.game_version_id where s.id = v_session
    ),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'track', t.track, 'language', t.language,
        'score', t.score, 'outcome', t.outcome, 'started_at', t.started_at, 'ended_at', t.ended_at,
        'login_order', t.login_order, 'team_code', '', 'caught', t.caught, 'ready_at', t.ready_at,
        'stored_distance_m', t.distance_m, 'phone', c.phone) order by t.login_order)
      from public.teams t left join public.team_contacts c on c.team_id = t.id
      where t.session_id = v_session
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'team_id', e.team_id, 'type', e.type, 'task_key', e.task_key,
        'payload', e.payload, 'client_time', e.client_time) order by e.client_time, e.id)
      from public.events e join public.teams t on t.id = e.team_id where t.session_id = v_session
    ), '[]'::jsonb),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'team_id', p.team_id, 'lat', p.lat, 'lng', p.lng,
        'accuracy', p.accuracy, 'recorded_at', p.recorded_at) order by p.id)
      from public.positions p join public.teams t on t.id = p.team_id
      where t.session_id = v_session and p.id > coalesce(p_after_position, 0)
    ), '[]'::jsonb)
  );
end;
$$;

-- Teamchat lezen via de link (hooguit de laatste 200 berichten).
create function public.leader_messages(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session uuid := public.leader_session_id(p_token);
begin
  if v_session is null then
    raise exception 'onbekende of verlopen link' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(m order by m.created_at)
    from (
      select id, team_id, sender, sender_name, body, created_at
      from public.messages
      where session_id = v_session and channel = 'teams'
      order by created_at desc
      limit 200
    ) m
  ), '[]'::jsonb);
end;
$$;

-- Bericht aan alle teams via de link, als "The Hunters".
create function public.leader_send_message(p_token text, p_body text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_session uuid := public.leader_session_id(p_token);
  v_row public.messages;
begin
  if v_session is null then
    raise exception 'onbekende of verlopen link' using errcode = 'P0002';
  end if;
  if length(trim(coalesce(p_body, ''))) not between 1 and 500 then
    raise exception 'bericht moet 1 tot 500 tekens zijn' using errcode = '22023';
  end if;
  insert into public.messages (session_id, sender, channel, body)
  values (v_session, 'staff', 'teams', trim(p_body))
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'team_id', v_row.team_id, 'sender', v_row.sender,
    'sender_name', v_row.sender_name, 'body', v_row.body, 'created_at', v_row.created_at);
end;
$$;

revoke execute on function public.leader_messages(text), public.leader_send_message(text, text) from public, anon, authenticated;
grant execute on function public.leader_messages(text), public.leader_send_message(text, text) to anon, authenticated;
