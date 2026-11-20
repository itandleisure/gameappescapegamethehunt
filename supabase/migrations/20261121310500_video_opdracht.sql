-- Video-opdracht (optioneel opdrachttype): de app uploadt korte video's naar
-- dezelfde bucket als de foto's (pad <team_id>/<opdracht>/<id>.mp4 of .mov),
-- zodat toegangsregels, bewaartermijn en verwijderen gelijk blijven. De bucket
-- staat daarom ook MP4 en QuickTime toe, en maximaal 60 MB per bestand
-- (30 seconden in middelmatige kwaliteit is zo'n 10 tot 25 MB).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    update storage.buckets
       set file_size_limit = 60 * 1024 * 1024,
           allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime']
     where id = 'photos';
  end if;
end $$;
