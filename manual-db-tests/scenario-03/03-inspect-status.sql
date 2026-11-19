-- LOCAL Studio privileged inspection, not RLS validation.
-- Link existence is independent of credential activity. Missing status means unknown.
select s.doc_id as certificate_id, s.registered_at as original_certificate_registered_at,
  'self_reported' as source_classification,
  cv.registered_at as certificate_status_registered_at, cv.revoked_at as certificate_revoked_at,
  cv.reason as certificate_reason,
  case when cv.doc_hash is null then 'unknown'
       when cv.revoked_at is null then 'active' else 'revoked' end as certificate_status,
  (cv.doc_hash is not null and cv.revoked_at is null) as certificate_is_active,
  (l.child_doc_id is not null) as link_exists, l.linked_at as original_linked_at,
  d.doc_id as degree_id, d.issued_at as original_degree_issued_at,
  dv.revoked_at as degree_revoked_at, dv.reason as degree_reason,
  case when dv.doc_hash is null then 'unknown'
       when dv.revoked_at is null then 'active' else 'revoked' end as degree_status
from public.self_reported s
left join public.revocations cv on cv.chain_id = s.chain_id
  and cv.revocation_registry_address = s.revocation_registry_address and cv.doc_hash = s.doc_hash
left join public.credential_links l on l.chain_id = s.chain_id
  and l.child_registry_address = s.registry_address and l.child_doc_id = s.doc_id
  and l.holder_address = s.holder_address and l.link_contract_address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
left join public.documents d on d.chain_id = l.chain_id
  and d.registry_address = l.parent_registry_address and d.doc_id = l.parent_doc_id
  and d.holder_address = l.holder_address
left join public.registries r on r.chain_id = d.chain_id and r.verification_registry_address = d.registry_address
left join public.revocations dv on dv.chain_id = d.chain_id
  and dv.revocation_registry_address = r.revocation_registry_address and dv.doc_hash = d.doc_hash
where s.chain_id = 99111601 and s.registry_address = '0x8888888888888888888888888888888888888888'
  and s.doc_id = '0x' || repeat('c', 64);

-- Must remain zero: linking/revoking does not promote a self-report to an issued document.
select count(*) as certificate_rows_in_documents from public.documents
where chain_id = 99111601 and doc_id = '0x' || repeat('c', 64);

-- Repeat 01-preflight.sql too: all seven counts and all five unchanged_data JSON values
-- must match the saved preflight output, including the entire degree status row.
