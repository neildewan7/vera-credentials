-- READ ONLY. Run FIRST in LOCAL Studio: http://127.0.0.1:54323.
-- Save these results before any update. Rerun after revocation for comparison.
-- Privileged inspection, NOT an RLS test. No database queries have been run by the agent.

select u.email, a.id, a.wallet_address, a.wallet_verified_at
from auth.users u left join public.accounts a on a.id = u.id
where u.email in ('vera-manual-holder-1115@example.invalid',
  'vera-manual-issuer-1115@example.invalid', 'vera-manual-other-1115@example.invalid')
order by u.email;

select s.*, v.registered_at as status_registered_at, v.revoked_at, v.reason,
  case when v.doc_hash is null then 'unknown'
       when v.revoked_at is null then 'active' else 'revoked' end as certificate_status
from public.self_reported s
left join public.revocations v on v.chain_id = s.chain_id
  and v.revocation_registry_address = s.revocation_registry_address and v.doc_hash = s.doc_hash
where s.chain_id = 99111601 and s.registry_address = '0x8888888888888888888888888888888888888888'
  and s.doc_id = '0x' || repeat('c', 64);

select d.*, r.revocation_registry_address, v.registered_at as status_registered_at,
  v.revoked_at, v.reason,
  case when v.doc_hash is null then 'unknown'
       when v.revoked_at is null then 'active' else 'revoked' end as degree_status
from public.documents d
join public.registries r on r.chain_id = d.chain_id and r.verification_registry_address = d.registry_address
left join public.revocations v on v.chain_id = d.chain_id
  and v.revocation_registry_address = r.revocation_registry_address and v.doc_hash = d.doc_hash
where d.chain_id = 99111601 and d.registry_address = '0x4444444444444444444444444444444444444444'
  and d.doc_id = '0x' || repeat('a', 64);

select l.*, s.holder_address = d.holder_address and d.holder_address = l.holder_address as same_holder
from public.credential_links l
join public.self_reported s on s.chain_id = l.chain_id and s.registry_address = l.child_registry_address
  and s.doc_id = l.child_doc_id and s.holder_address = l.holder_address
join public.documents d on d.chain_id = l.chain_id and d.registry_address = l.parent_registry_address
  and d.doc_id = l.parent_doc_id and d.holder_address = l.holder_address
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

-- Save/copy these JSON values. They must be identical after revocation and denied writes.
-- Full degree/degree status, certificate registration, and link rows are included.
-- Only certificate revoked_at/reason are excluded, since those are the intended changes.
select 'certificate_registration' as record_name, to_jsonb(s) as unchanged_data
from public.self_reported s where s.chain_id = 99111601
  and s.registry_address = '0x8888888888888888888888888888888888888888'
  and s.doc_id = '0x' || repeat('c', 64)
union all select 'degree', to_jsonb(d) from public.documents d where d.chain_id = 99111601
  and d.registry_address = '0x4444444444444444444444444444444444444444' and d.doc_id = '0x' || repeat('a', 64)
union all select 'degree_revocation_record', to_jsonb(v) from public.revocations v where v.chain_id = 99111601
  and v.revocation_registry_address = '0x5555555555555555555555555555555555555555' and v.doc_hash = '0x' || repeat('b', 64)
union all select 'historical_link', to_jsonb(l) from public.credential_links l where l.chain_id = 99111601
  and l.link_contract_address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' and l.child_doc_id = '0x' || repeat('c', 64)
union all select 'certificate_status_registration', to_jsonb(v) - 'revoked_at' - 'reason'
from public.revocations v where v.chain_id = 99111601
  and v.revocation_registry_address = '0x9999999999999999999999999999999999999999' and v.doc_hash = '0x' || repeat('d', 64);
