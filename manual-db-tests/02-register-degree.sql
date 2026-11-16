-- Run manually in LOCAL Studio after inspecting 01-setup.sql results.
-- Simulates trusted indexer projection writes; does not call a contract.
-- Deliberately plain INSERTs: rerunning fails instead of concealing duplicates.
begin;
insert into public.documents (
  chain_id, registry_address, doc_id, doc_hash, issuer_address,
  holder_address, uri, issued_at
) values (
  99111601, '0x4444444444444444444444444444444444444444',
  '0x' || repeat('a', 64), '0x' || repeat('b', 64),
  '0x2222222222222222222222222222222222222222',
  '0x1111111111111111111111111111111111111111',
  'https://example.invalid/vera-manual-1115/degree.json',
  '2026-11-15T12:05:00Z');

insert into public.revocations (
  chain_id, revocation_registry_address, doc_hash, registered_at
) values (
  99111601, '0x5555555555555555555555555555555555555555',
  '0x' || repeat('b', 64), '2026-11-15T12:05:00Z');
commit;
