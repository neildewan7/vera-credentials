-- LOCAL Studio ONLY. Privileged projection fixture, not a client write or blockchain call.
begin;
do $$
begin
  if not exists (
    select 1 from public.documents d
    join public.registries r on r.chain_id = d.chain_id and r.verification_registry_address = d.registry_address
    join public.revocations v on v.chain_id = d.chain_id
      and v.revocation_registry_address = r.revocation_registry_address and v.doc_hash = d.doc_hash
    where d.chain_id = 99111601 and d.registry_address = '0x4444444444444444444444444444444444444444'
      and d.doc_id = '0x' || repeat('a', 64) and d.doc_hash = '0x' || repeat('b', 64)
      and d.holder_address = '0x1111111111111111111111111111111111111111'
      and d.issuer_address = '0x2222222222222222222222222222222222222222'
      and v.revoked_at is null
  ) then raise exception 'Scenario 1 active degree fixture is missing or changed; inspect before continuing.';
  end if;
end $$;

-- A standalone self-report registry: do not insert it into factory-discovered registries.
insert into public.self_reported (
  chain_id, registry_address, revocation_registry_address, doc_id, doc_hash,
  holder_address, uri, registered_at
) values (
  99111601, '0x8888888888888888888888888888888888888888',
  '0x9999999999999999999999999999999999999999',
  '0x' || repeat('c', 64), '0x' || repeat('d', 64),
  '0x1111111111111111111111111111111111111111',
  'https://example.invalid/vera-manual-1115/self-reported-certificate.json',
  '2026-11-15T12:10:00Z');

insert into public.revocations (chain_id, revocation_registry_address, doc_hash, registered_at)
values (99111601, '0x9999999999999999999999999999999999999999',
  '0x' || repeat('d', 64), '2026-11-15T12:10:00Z');
commit;
-- Plain INSERTs intentionally fail on a rerun; no upsert overwrites existing fixtures.
