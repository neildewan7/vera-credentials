-- LOCAL Studio: privileged inspection only. This does not prove RLS.
select d.chain_id, r.name as registry_name, r.template_type,
  d.doc_id, d.doc_hash, d.issuer_address, d.holder_address, d.uri, d.issued_at,
  v.registered_at, v.revoked_at, v.reason,
  case when v.doc_hash is null then 'unknown'
       when v.revoked_at is null then 'active' else 'revoked' end as credential_status
from public.documents d
join public.registries r on r.chain_id = d.chain_id
  and r.verification_registry_address = d.registry_address
left join public.revocations v on v.chain_id = d.chain_id
  and v.revocation_registry_address = r.revocation_registry_address
  and v.doc_hash = d.doc_hash
where d.chain_id = 99111601;

select 'accounts' as table_name, count(*) from public.accounts
where id in (select id from auth.users where email in (
  'vera-manual-holder-1115@example.invalid',
  'vera-manual-issuer-1115@example.invalid',
  'vera-manual-other-1115@example.invalid'))
union all select 'issuers', count(*) from public.issuers where chain_id = 99111601
union all select 'registries', count(*) from public.registries where chain_id = 99111601
union all select 'documents', count(*) from public.documents where chain_id = 99111601
union all select 'revocations', count(*) from public.revocations where chain_id = 99111601;
