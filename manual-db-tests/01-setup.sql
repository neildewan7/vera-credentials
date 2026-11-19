-- LOCAL STUDIO ONLY: http://127.0.0.1:54323. Privileged fixture setup, NOT an RLS test.
-- First create the three real Auth users listed in README.md through local Studio.
begin;
do $$
begin
  if (select count(*) from auth.users where email in (
    'vera-manual-holder-1115@example.invalid',
    'vera-manual-issuer-1115@example.invalid',
    'vera-manual-other-1115@example.invalid')) <> 3 then
    raise exception 'Create all three dedicated Auth users first.';
  end if;
  if exists (select 1 from public.accounts where id in (
    select id from auth.users where email in (
      'vera-manual-holder-1115@example.invalid',
      'vera-manual-issuer-1115@example.invalid',
      'vera-manual-other-1115@example.invalid'))) then
    raise exception 'Fixture accounts already exist; inspect or clean up before retrying.';
  end if;
  if exists (
    select chain_id from public.issuers where chain_id = 99111601
    union all select chain_id from public.registries where chain_id = 99111601
    union all select chain_id from public.documents where chain_id = 99111601
    union all select chain_id from public.self_reported where chain_id = 99111601
    union all select chain_id from public.credential_links where chain_id = 99111601
    union all select chain_id from public.revocations where chain_id = 99111601
    union all select chain_id from public.chain_events where chain_id = 99111601
    union all select chain_id from public.indexer_checkpoints where chain_id = 99111601
  ) then
    raise exception 'Reserved synthetic chain 99111601 is already in use. Stop and inspect.';
  end if;
end $$;

-- Test-only stand-in for trusted backend wallet verification. No wallet proof is performed.
insert into public.accounts (id, display_name, wallet_address, wallet_verified_at)
select id,
  case email
    when 'vera-manual-holder-1115@example.invalid' then 'SYNTHETIC: Maya Chen (holder)'
    when 'vera-manual-issuer-1115@example.invalid' then 'SYNTHETIC: Demo University (issuer)'
    else 'SYNTHETIC: Alex Rivera (unrelated user)' end,
  (case email
    when 'vera-manual-holder-1115@example.invalid' then '0x1111111111111111111111111111111111111111'
    when 'vera-manual-issuer-1115@example.invalid' then '0x2222222222222222222222222222222222222222'
    else '0x3333333333333333333333333333333333333333' end)::public.evm_address,
  '2026-11-15T12:00:00Z'::timestamptz
from auth.users where email in (
  'vera-manual-holder-1115@example.invalid',
  'vera-manual-issuer-1115@example.invalid',
  'vera-manual-other-1115@example.invalid');

insert into public.issuers values (
  99111601, '0x6666666666666666666666666666666666666666',
  '0x2222222222222222222222222222222222222222', true);

insert into public.registries (
  chain_id, verification_registry_address, factory_address, registry_id,
  template_type, original_owner_address, owner_address,
  revocation_registry_address, config_hash, name, created_at
) values (
  99111601, '0x4444444444444444444444444444444444444444',
  '0x7777777777777777777777777777777777777777', 1, 0,
  '0x2222222222222222222222222222222222222222',
  '0x2222222222222222222222222222222222222222',
  '0x5555555555555555555555555555555555555555',
  '0x' || repeat('c', 64), 'SYNTHETIC: Demo University degree registry',
  '2026-11-15T12:00:00Z');
commit;

select id, display_name, wallet_address from public.accounts
where display_name like 'SYNTHETIC:%';
select * from public.registries where chain_id = 99111601;
