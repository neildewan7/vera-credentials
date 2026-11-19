-- LOCAL Studio ONLY, AFTER reviewing 01-preflight.sql and saving its results.
-- Trusted-indexer fixture simulation of Maya calling revokeMine; no contract call is made.
-- OTHER = 10 in the existing Solidity enum. Fixed synthetic time is after linking.
begin;
do $$
declare affected integer;
begin
  if not exists (
    select 1 from public.self_reported s
    join public.credential_links l on l.chain_id = s.chain_id
      and l.child_registry_address = s.registry_address and l.child_doc_id = s.doc_id
      and l.holder_address = s.holder_address
    join public.documents d on d.chain_id = l.chain_id and d.registry_address = l.parent_registry_address
      and d.doc_id = l.parent_doc_id and d.holder_address = l.holder_address
    join public.registries r on r.chain_id = d.chain_id and r.verification_registry_address = d.registry_address
    join public.revocations v on v.chain_id = d.chain_id
      and v.revocation_registry_address = r.revocation_registry_address and v.doc_hash = d.doc_hash
    where s.chain_id = 99111601 and s.registry_address = '0x8888888888888888888888888888888888888888'
      and s.doc_id = '0x' || repeat('c', 64) and s.doc_hash = '0x' || repeat('d', 64)
      and s.revocation_registry_address = '0x9999999999999999999999999999999999999999'
      and s.holder_address = '0x1111111111111111111111111111111111111111'
      and s.registered_at = '2026-11-15T12:10:00Z'::timestamptz
      and l.link_contract_address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      and l.linked_at = '2026-11-15T12:15:00Z'::timestamptz
      and d.registry_address = '0x4444444444444444444444444444444444444444'
      and d.doc_id = '0x' || repeat('a', 64) and d.doc_hash = '0x' || repeat('b', 64)
      and d.issuer_address = '0x2222222222222222222222222222222222222222'
      and r.revocation_registry_address = '0x5555555555555555555555555555555555555555'
      and v.revoked_at is null and v.reason is null
  ) then raise exception 'Expected linked certificate/active degree fixture missing or changed. Stop and inspect.';
  end if;

  update public.revocations
  set revoked_at = '2026-11-15T12:20:00Z', reason = 10
  where chain_id = 99111601
    and revocation_registry_address = '0x9999999999999999999999999999999999999999'
    and doc_hash = '0x' || repeat('d', 64)
    and registered_at = '2026-11-15T12:10:00Z'::timestamptz
    and revoked_at is null and reason is null;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one active certificate status row; found %. Nothing committed.', affected;
  end if;
  raise notice 'Updated exactly one certificate revocation record. Original registrations and link retained.';
end $$;
commit;
-- A rerun intentionally fails instead of changing an existing revocation timestamp.
