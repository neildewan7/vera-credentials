-- Read-only, privileged inspection in LOCAL Studio http://127.0.0.1:54323.
-- Expected: three correctly bound accounts, one active degree, no Scenario 2 rows.
select u.email, a.id, a.display_name, a.wallet_address, a.wallet_verified_at
from auth.users u left join public.accounts a on a.id = u.id
where u.email in ('vera-manual-holder-1115@example.invalid',
  'vera-manual-issuer-1115@example.invalid', 'vera-manual-other-1115@example.invalid')
order by u.email;

select d.*, r.owner_address, r.revocation_registry_address,
  v.registered_at, v.revoked_at, v.reason
from public.documents d
join public.registries r on r.chain_id = d.chain_id
  and r.verification_registry_address = d.registry_address
left join public.revocations v on v.chain_id = d.chain_id
  and v.revocation_registry_address = r.revocation_registry_address and v.doc_hash = d.doc_hash
where d.chain_id = 99111601 and d.registry_address = '0x4444444444444444444444444444444444444444'
  and d.doc_id = '0x' || repeat('a', 64);

select 'self_reported' as table_name, count(*) from public.self_reported where chain_id = 99111601
union all select 'credential_links', count(*) from public.credential_links where chain_id = 99111601
union all select 'revocations', count(*) from public.revocations where chain_id = 99111601;
