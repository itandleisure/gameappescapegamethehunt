-- Standaard mogen 20 spelleiders per hunt inloggen (was 5). Bestaande hunts
-- die nog op de oude standaard stonden, gaan mee.
alter table public.sessions alter column max_leaders set default 20;
update public.sessions set max_leaders = 20 where max_leaders = 5;
