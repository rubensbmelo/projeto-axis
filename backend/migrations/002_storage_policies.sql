-- =========================================================
-- AXIS — Storage RLS (bucket privado case-documents)
-- =========================================================
-- O bucket 'case-documents' é privado e os arquivos ficam em
--   case-documents/{org_id}/{case_id}/{uuid}.ext
-- Sem policies, usuários autenticados não conseguem subir/listar
-- arquivos (erro "row-level security policy" no upload).
-- Regra: membro da org só mexe nos arquivos cuja pasta = org_id dele.

create policy "case-documents insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] in (select my_org_ids()::text)
  );

create policy "case-documents select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] in (select my_org_ids()::text)
  );

create policy "case-documents update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] in (select my_org_ids()::text)
  );

create policy "case-documents delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] in (select my_org_ids()::text)
  );
