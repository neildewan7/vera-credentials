-- LOCAL Studio privileged inspection. Not an RLS test.
select s.*, 'self_reported' as source_classification,
  case when v.doc_hash is null then 'unknown'
       when v.revoked_at is null then 'active' else 'revoked' end as certificate_status
from public.self_reported s
left join public.revocations v on v.chain_id = s.chain_id
  and v.revocation_registry_address = s.revocation_registry_address and v.doc_hash = s.doc_hash
where s.chain_id = 99111601 and s.registry_address = '0x8888888888888888888888888888888888888888'
  and s.doc_id = '0x' || repeat('c', 64);

select l.*, s.doc_hash as certificate_hash, s.uri as certificate_uri,
  d.doc_hash as degree_hash, d.issuer_address as degree_issuer,
  s.holder_address = d.holder_address and d.holder_address = l.holder_address as same_holder,
  'self_reported' as child_source_classification
from public.credential_links l
join public.self_reported s on s.chain_id = l.chain_id
  and s.registry_address = l.child_registry_address and s.doc_id = l.child_doc_id
  and s.holder_address = l.holder_address
join public.documents d on d.chain_id = l.chain_id
  and d.registry_address = l.parent_registry_address and d.doc_id = l.parent_doc_id
  and d.holder_address = l.holder_address
where l.chain_id = 99111601 and l.link_contract_address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  and l.child_doc_id = '0x' || repeat('c', 64);

select 'accounts' as table_name, count(*) from public.accounts where id in (
  select id from auth.users where email in ('vera-manual-holder-1115@example.invalid',
    'vera-manual-issuer-1115@example.invalid', 'vera-manual-other-1115@example.invalid'))
union all select 'issuers', count(*) from public.issuers where chain_id = 99111601
union all select 'registries', count(*) from public.registries where chain_id = 99111601
union all select 'documents', count(*) from public.documents where chain_id = 99111601
union all select 'self_reported', count(*) from public.self_reported where chain_id = 99111601
union all select 'credential_links', count(*) from public.credential_links where chain_id = 99111601
union all select 'revocations', count(*) from public.revocations where chain_id = 99111601;

-- Must be 0: the certificate has not been copied/promoted into issued documents.
select count(*) as certificate_rows_in_documents from public.documents
where chain_id = 99111601 and doc_id = '0x' || repeat('c', 64);
