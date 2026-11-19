-- Optional manual FK check, run BEFORE 03-link-certificate.sql in LOCAL Studio.
-- This is a relational-constraint test under privileged access, NOT an RLS test.
-- Expected SQLSTATE 23503 (foreign_key_violation), not permission/duplicate denial.
-- After observing the error, run ROLLBACK; in a separate execution.
begin;
insert into public.credential_links (
  chain_id, link_contract_address, child_registry_address, child_doc_id,
  parent_registry_address, parent_doc_id, holder_address, linked_at
) values (
  99111601, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '0x8888888888888888888888888888888888888888', '0x' || repeat('c', 64),
  '0x4444444444444444444444444444444444444444', '0x' || repeat('a', 64),
  '0x3333333333333333333333333333333333333333', '2026-11-15T12:15:00Z');
-- If it unexpectedly succeeds, still run ROLLBACK; separately. Never commit this probe.
