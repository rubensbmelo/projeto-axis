-- =========================================================
-- AXIS — RLS por papel + Storage vinculado ao caso
-- =========================================================
-- PROBLEMA:
--   As policies anteriores usavam `for all` para qualquer membro da org.
--   Um usuário `viewer` (ou qualquer membro) podia escrever DIRETAMENTE no
--   Supabase via anon key, contornando o requireRole do Express.
--
-- CORREÇÃO:
--   - Escrita (insert/update/delete) passa a exigir papel
--     owner/doctor/secretary no próprio RLS.
--   - Leitura continua liberada para qualquer membro.
--   - Storage: além do org_id, o arquivo é vinculado ao case (case_id no
--     caminho precisa existir e pertencer à org).

-- Helper: o usuário logado tem papel de escrita na organização?
create or replace function can_write_org(p_org uuid)
returns boolean as $$
  select exists (
    select 1 from org_members m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner','doctor','secretary')
  );
$$ language sql stable security definer;

-- ---------- organizations ----------
drop policy if exists "org select" on organizations;
create policy "org select" on organizations
  for select using (id in (select my_org_ids()));

-- ---------- org_members ----------
drop policy if exists "members select" on org_members;
drop policy if exists "members insert by owner" on org_members;
create policy "members select" on org_members
  for select using (org_id in (select my_org_ids()));
create policy "members insert by owner" on org_members
  for insert with check (
    org_id in (select org_id from org_members where user_id = auth.uid() and role = 'owner')
  );

-- ---------- Tabelas de referência ----------
drop policy if exists "insurers all" on insurers;
drop policy if exists "hospitals all" on hospitals;
drop policy if exists "suppliers all" on suppliers;

create policy "insurers select" on insurers
  for select using (org_id in (select my_org_ids()));
create policy "insurers write" on insurers
  for all using (org_id in (select my_org_ids()) and can_write_org(org_id))
  with check (org_id in (select my_org_ids()) and can_write_org(org_id));

create policy "hospitals select" on hospitals
  for select using (org_id in (select my_org_ids()));
create policy "hospitals write" on hospitals
  for all using (org_id in (select my_org_ids()) and can_write_org(org_id))
  with check (org_id in (select my_org_ids()) and can_write_org(org_id));

create policy "suppliers select" on suppliers
  for select using (org_id in (select my_org_ids()));
create policy "suppliers write" on suppliers
  for all using (org_id in (select my_org_ids()) and can_write_org(org_id))
  with check (org_id in (select my_org_ids()) and can_write_org(org_id));

-- ---------- Pacientes ----------
drop policy if exists "patients all" on patients;
create policy "patients select" on patients
  for select using (org_id in (select my_org_ids()));
create policy "patients write" on patients
  for all using (org_id in (select my_org_ids()) and can_write_org(org_id))
  with check (org_id in (select my_org_ids()) and can_write_org(org_id));

-- ---------- Casos cirúrgicos ----------
drop policy if exists "cases all" on surgery_cases;
create policy "cases select" on surgery_cases
  for select using (org_id in (select my_org_ids()));
create policy "cases write" on surgery_cases
  for all using (org_id in (select my_org_ids()) and can_write_org(org_id))
  with check (org_id in (select my_org_ids()) and can_write_org(org_id));

-- ---------- Documentos ----------
drop policy if exists "documents all" on case_documents;
create policy "documents select" on case_documents
  for select using (org_id in (select my_org_ids()));
create policy "documents write" on case_documents
  for all using (org_id in (select my_org_ids()) and can_write_org(org_id))
  with check (org_id in (select my_org_ids()) and can_write_org(org_id));

-- =========================================================
-- STORAGE — vincula o arquivo ao caso (além da org)
-- =========================================================
-- Caminho: case-documents/{org_id}/{case_id}/{uuid}.ext

drop policy if exists "case-documents insert" on storage.objects;
drop policy if exists "case-documents select" on storage.objects;
drop policy if exists "case-documents update" on storage.objects;
drop policy if exists "case-documents delete" on storage.objects;

create policy "case-documents insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] in (select my_org_ids()::text)
    and exists (
      select 1 from surgery_cases c
      where c.id = (storage.foldername(name))[2]::uuid
        and c.org_id = (storage.foldername(name))[1]::uuid
    )
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
    and exists (
      select 1 from surgery_cases c
      where c.id = (storage.foldername(name))[2]::uuid
        and c.org_id = (storage.foldername(name))[1]::uuid
    )
  );

create policy "case-documents delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] in (select my_org_ids()::text)
    and exists (
      select 1 from surgery_cases c
      where c.id = (storage.foldername(name))[2]::uuid
        and c.org_id = (storage.foldername(name))[1]::uuid
    )
  );
