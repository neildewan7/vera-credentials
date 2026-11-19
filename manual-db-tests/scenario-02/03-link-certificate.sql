-- LOCAL Studio ONLY. Simulate trusted indexing of the holder's link event.
-- Both composite FKs require the same chain, registry, document ID, and holder.
begin;
insert into public.credential_links (
  chain_id, link_contract_address, child_registry_address, child_doc_id,
  parent_registry_address, parent_doc_id, holder_address, linked_at
) values (
  99111601, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '0x8888888888888888888888888888888888888888', '0x' || repeat('c', 64),
  '0x4444444444444444444444444444444444444444', '0x' || repeat('a', 64),
  '0x1111111111111111111111111111111111111111', '2026-11-15T12:15:00Z');
commit;
