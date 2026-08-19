-- Arquivos ficam no Storage; o banco guarda apenas URLs pequenas e evita Base64 nas linhas.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('products','products',true,2097152,array['image/jpeg','image/png','image/webp']),
  ('branding','branding',true,2097152,array['image/jpeg','image/png','image/webp']),
  ('avatars','avatars',true,1048576,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "leitura publica de midias" on storage.objects;
create policy "leitura publica de midias" on storage.objects for select using(bucket_id in('products','branding','avatars'));
drop policy if exists "equipe envia catalogo e marca" on storage.objects;
create policy "equipe envia catalogo e marca" on storage.objects for insert to authenticated with check(bucket_id in('products','branding') and public.has_system_role(array['admin','manager','inventory']));
drop policy if exists "equipe gerencia catalogo e marca" on storage.objects;
create policy "equipe gerencia catalogo e marca" on storage.objects for delete to authenticated using(bucket_id in('products','branding') and public.has_system_role(array['admin','manager','inventory']));
drop policy if exists "usuario envia proprio avatar" on storage.objects;
create policy "usuario envia proprio avatar" on storage.objects for insert to authenticated with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "usuario remove proprio avatar" on storage.objects;
create policy "usuario remove proprio avatar" on storage.objects for delete to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
