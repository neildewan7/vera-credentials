-- LOCAL Studio only. Optional: retain fixtures if continuing to scenario 2.
-- Chain 99111601 is reserved exclusively for this manual suite by setup.
begin;
delete from public.credential_links where chain_id = 99111601;
delete from public.self_reported where chain_id = 99111601;
delete from public.documents where chain_id = 99111601;
delete from public.revocations where chain_id = 99111601;
delete from public.registries where chain_id = 99111601;
delete from public.issuers where chain_id = 99111601;
delete from public.chain_events where chain_id = 99111601;
delete from public.indexer_checkpoints where chain_id = 99111601;
-- Own consent rows cascade from accounts. Auth users are removed manually in Studio.
delete from public.accounts where id in (
  select id from auth.users where email in (
    'vera-manual-holder-1115@example.invalid',
    'vera-manual-issuer-1115@example.invalid',
    'vera-manual-other-1115@example.invalid'));
commit;

select 'documents' as table_name, count(*) from public.documents where chain_id = 99111601
union all select 'registries', count(*) from public.registries where chain_id = 99111601
union all select 'revocations', count(*) from public.revocations where chain_id = 99111601
union all select 'issuers', count(*) from public.issuers where chain_id = 99111601
union all select 'self_reported', count(*) from public.self_reported where chain_id = 99111601
union all select 'credential_links', count(*) from public.credential_links where chain_id = 99111601
union all select 'chain_events', count(*) from public.chain_events where chain_id = 99111601
union all select 'indexer_checkpoints', count(*) from public.indexer_checkpoints where chain_id = 99111601;
