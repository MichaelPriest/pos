-- Fotos de doações podem conter dados pessoais e não devem possuir URL pública.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('donations','donations',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "cliente envia fotos de doacao" on storage.objects;
create policy "cliente envia fotos de doacao" on storage.objects for insert to authenticated with check(bucket_id='donations' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "cliente ve fotos de doacao" on storage.objects;
create policy "cliente ve fotos de doacao" on storage.objects for select to authenticated using(bucket_id='donations' and ((storage.foldername(name))[1]=auth.uid()::text or public.has_system_role(array['admin','manager'])));
drop policy if exists "cliente remove fotos de doacao" on storage.objects;
create policy "cliente remove fotos de doacao" on storage.objects for delete to authenticated using(bucket_id='donations' and ((storage.foldername(name))[1]=auth.uid()::text or public.has_system_role(array['admin','manager'])));
