-- Centrale start losgelaten: elk team leest de speluitleg in zijn eigen tempo
-- en start zelf, zonder akkoord van de spelleider.
--
-- Hunts met centrale start die nog niet gestart zijn, worden gewone hunts,
-- zodat teams daarin niet blijven wachten op de spelleider. Al gestarte hunts
-- blijven zoals ze zijn. De kolommen en functies blijven bestaan voor oude
-- versies van de app en de gegevens van eerdere hunts.

update public.sessions set central_start = false where central_start and started_at is null;
