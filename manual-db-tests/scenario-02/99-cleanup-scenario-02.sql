-- LOCAL Studio only. Removes Scenario 2 rows while retaining Scenario 1 users/degree.
begin;
delete from public.credential_links where chain_id = 99111601
  and link_contract_address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  and child_registry_address = '0x8888888888888888888888888888888888888888'
  and child_doc_id = '0x' || repeat('c', 64);
delete from public.self_reported where chain_id = 99111601
  and registry_address = '0x8888888888888888888888888888888888888888'
  and doc_id in ('0x' || repeat('c', 64), '0x' || repeat('e', 64));
-- Includes only the extra self-report ID used by the expected-denied API insert probe.
delete from public.revocations where chain_id = 99111601
  and revocation_registry_address = '0x9999999999999999999999999999999999999999'
  and doc_hash = '0x' || repeat('d', 64);
commit;
-- Run 04-inspect.sql afterwards: self_reported/links 0, revocations 1; Scenario 1 unchanged.
