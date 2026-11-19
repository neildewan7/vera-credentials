-- Run against a disposable LOCAL Supabase database using psql -v ON_ERROR_STOP=1.
-- Entire test rolls back; no test users/data survive.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.expect_error(statement text, expected_state text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise exception 'Expected SQLSTATE %, got %: %', expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'Expected SQLSTATE %, but statement succeeded: %', expected_state, statement;
end $$;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004');

-- All indexed fixtures use the same role the backend/indexer will use.
set local role service_role;
insert into public.accounts(id, wallet_address, wallet_verified_at) values
  ('00000000-0000-0000-0000-000000000001', '0x' || repeat('a',40), now()),
  ('00000000-0000-0000-0000-000000000002', '0x' || repeat('b',40), now()),
  ('00000000-0000-0000-0000-000000000003', '0x' || repeat('c',40), now());
insert into public.issuers values (80002, '0x' || repeat('9',40), '0x' || repeat('c',40), true);
insert into public.registries values
  (80002, '0x' || repeat('1',40), '0x' || repeat('f',40), 1, 0,
   '0x' || repeat('c',40), '0x' || repeat('c',40), '0x' || repeat('4',40), '0x' || repeat('0',64), 'Synthetic issuer A', now()),
  (80002, '0x' || repeat('2',40), '0x' || repeat('f',40), 2, 0,
   '0x' || repeat('c',40), '0x' || repeat('c',40), '0x' || repeat('5',40), '0x' || repeat('0',64), 'Synthetic issuer B', now()),
  (11155111, '0x' || repeat('1',40), '0x' || repeat('f',40), 1, 0,
   '0x' || repeat('c',40), '0x' || repeat('c',40), '0x' || repeat('4',40), '0x' || repeat('0',64), 'Other chain', now());
-- Same ID/hash in different registries/chains is legal.
insert into public.documents values
  (80002, '0x' || repeat('1',40), '0x' || repeat('1',64), '0x' || repeat('2',64), '0x' || repeat('c',40), '0x' || repeat('a',40), '', now()),
  (80002, '0x' || repeat('2',40), '0x' || repeat('1',64), '0x' || repeat('2',64), '0x' || repeat('c',40), '0x' || repeat('b',40), '', now()),
  (11155111, '0x' || repeat('1',40), '0x' || repeat('1',64), '0x' || repeat('2',64), '0x' || repeat('c',40), '0x' || repeat('a',40), '', now());
insert into public.self_reported values
  (80002, '0x' || repeat('3',40), '0x' || repeat('6',40), '0x' || repeat('3',64), '0x' || repeat('4',64), '0x' || repeat('a',40), '', now()),
  (80002, '0x' || repeat('3',40), '0x' || repeat('6',40), '0x' || repeat('5',64), '0x' || repeat('6',64), '0x' || repeat('b',40), '', now());
insert into public.credential_links values
  (80002, '0x' || repeat('7',40), '0x' || repeat('3',40), '0x' || repeat('3',64), '0x' || repeat('1',40), '0x' || repeat('1',64), '0x' || repeat('a',40), now());
insert into public.revocations values
  (80002, '0x' || repeat('4',40), '0x' || repeat('2',64), now(), now(), 1),
  (80002, '0x' || repeat('5',40), '0x' || repeat('2',64), now(), null, null),
  (80002, '0x' || repeat('6',40), '0x' || repeat('4',64), now(), null, null),
  (80002, '0x' || repeat('6',40), '0x' || repeat('6',64), now(), null, null);
insert into public.consent_settings(account_id) values ('00000000-0000-0000-0000-000000000001');
insert into public.chain_events values
  (80002, '0x' || repeat('a',64), 0, 100, '0x' || repeat('b',64), '0x' || repeat('1',40), 'DocumentRegistered', '{}');
insert into public.indexer_checkpoints values
  (80002, '0x' || repeat('1',40), 100, '0x' || repeat('b',64));

-- A retry must not duplicate a log; same transaction hash on another chain is distinct.
insert into public.chain_events select * from public.chain_events on conflict do nothing;
select pg_temp.assert_true((select count(*) = 1 from public.chain_events), 'event replay is idempotent');
insert into public.chain_events
  select 11155111, transaction_hash, log_index, block_number, block_hash, contract_address, event_name, args
  from public.chain_events;
select pg_temp.assert_true((select count(*) = 2 from public.chain_events), 'event identity includes chain');
select pg_temp.expect_error($q$update public.credential_links set parent_registry_address = '0x' || repeat('2',40)$q$, '23503');
select pg_temp.expect_error($q$update public.credential_links set child_doc_id = '0x' || repeat('9',64)$q$, '23503');
select pg_temp.expect_error($q$update public.registries set template_type = 3$q$, '23514');
select pg_temp.expect_error($q$update public.consent_settings set schema_version = 2$q$, '23514');
select pg_temp.expect_error($q$select ('0x' || repeat('A',40))::public.evm_address$q$, '23514');
select pg_temp.expect_error($q$update public.documents set doc_id = '0x' || repeat('9',64) where chain_id = 80002 and registry_address = '0x' || repeat('1',40)$q$, '23503');

-- Primitive encodings, exact uint256 boundary, and contract-shaped constraints.
select pg_temp.assert_true(
  '115792089237316195423570985008687907853269984665640564039457584007913129639935'::public.uint256 > 0,
  'maximum uint256 accepted exactly');
select pg_temp.expect_error($q$select '115792089237316195423570985008687907853269984665640564039457584007913129639936'::public.uint256$q$, '23514');
select pg_temp.expect_error($q$select (-1)::public.uint256$q$, '23514');
select pg_temp.expect_error($q$select 1.5::public.uint256$q$, '23514');
select pg_temp.expect_error($q$select '0xABC'::public.evm_address$q$, '23514');
select pg_temp.expect_error($q$select '0x1234'::public.bytes32$q$, '23514');
select pg_temp.expect_error($q$update public.documents set doc_hash = '0x' || repeat('0',64)$q$, '23514');
select pg_temp.expect_error($q$update public.documents set holder_address = '0x' || repeat('0',40)$q$, '23514');
select pg_temp.expect_error($q$update public.documents set registry_address = '0x' || repeat('8',40) where chain_id = 80002 and registry_address = '0x' || repeat('1',40)$q$, '23503');
select pg_temp.expect_error($q$update public.credential_links set holder_address = '0x' || repeat('b',40)$q$, '23503');
select pg_temp.expect_error($q$insert into public.credential_links select * from public.credential_links$q$, '23505');
select pg_temp.expect_error($q$insert into public.documents select * from public.documents limit 1$q$, '23505');
select pg_temp.expect_error($q$insert into public.chain_events select * from public.chain_events$q$, '23505');
select pg_temp.expect_error($q$update public.revocations set revoked_at = now(), reason = 0$q$, '23514');
select pg_temp.expect_error($q$update public.revocations set revoked_at = now(), reason = null$q$, '23514');
select pg_temp.expect_error($q$update public.consent_settings set settings = '[]'$q$, '23514');
select pg_temp.expect_error($q$update public.accounts set wallet_verified_at = null$q$, '23514');
select pg_temp.expect_error($q$update public.accounts set wallet_address = '0x' || repeat('d',40)$q$, '23505');

reset role;
select pg_temp.assert_true((select count(*) = 10 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity), 'RLS enabled on all ten tables');
-- No anonymous table access, including catalog and internal tables.
set local role anon;
select pg_temp.expect_error('select * from public.accounts', '42501');
select pg_temp.expect_error('select * from public.documents', '42501');
select pg_temp.expect_error('select * from public.registries', '42501');
do $$
declare table_name text;
begin
  foreach table_name in array array['accounts','issuers','registries','documents','self_reported',
    'credential_links','revocations','consent_settings','chain_events','indexer_checkpoints'] loop
    perform pg_temp.expect_error(format('select * from public.%I', table_name), '42501');
  end loop;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true((select count(*) = 1 from public.accounts), 'holder sees own account only');
select pg_temp.assert_true((select count(*) = 2 from public.documents), 'holder sees own documents across chains');
select pg_temp.assert_true((select count(*) = 1 from public.self_reported), 'holder sees own self-report only');
select pg_temp.assert_true((select count(*) = 1 from public.credential_links), 'holder sees own link');
select pg_temp.assert_true((select count(*) = 2 from public.revocations), 'holder sees only relevant companion/hash states');
update public.accounts set display_name = 'Synthetic holder';
update public.consent_settings set settings = '{"pending_review":true}';
select pg_temp.assert_true((select display_name = 'Synthetic holder' from public.accounts), 'own profile update succeeds');
select pg_temp.assert_true((select settings = '{"pending_review":true}'::jsonb from public.consent_settings), 'own consent update succeeds');
select pg_temp.expect_error($q$update public.accounts set wallet_address = '0x' || repeat('b',40)$q$, '42501');
select pg_temp.expect_error('update public.accounts set wallet_verified_at = now()', '42501');
select pg_temp.expect_error('update public.issuers set is_approved = true', '42501');
select pg_temp.expect_error($q$update public.documents set uri = 'fake'$q$, '42501');
select pg_temp.expect_error('delete from public.self_reported', '42501');
select pg_temp.expect_error('delete from public.credential_links', '42501');
select pg_temp.expect_error('update public.revocations set reason = 1', '42501');
select pg_temp.expect_error('select * from public.chain_events', '42501');
select pg_temp.expect_error('select * from public.indexer_checkpoints', '42501');
select pg_temp.expect_error($q$insert into public.consent_settings(account_id) values ('00000000-0000-0000-0000-000000000002')$q$, '42501');

-- Every indexed table denies client insertion and update, even with valid fixture shapes.
do $$
declare table_name text;
begin
  foreach table_name in array array['issuers','registries','documents','self_reported',
    'credential_links','revocations','chain_events','indexer_checkpoints'] loop
    perform pg_temp.expect_error(format('insert into public.%I default values', table_name), '42501');
    perform pg_temp.expect_error(format('update public.%I set chain_id = chain_id', table_name), '42501');
    perform pg_temp.expect_error(format('delete from public.%I', table_name), '42501');
  end loop;
end $$;
select pg_temp.expect_error($q$update public.accounts set id = '00000000-0000-0000-0000-000000000005'$q$, '42501');
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert_true((select count(*) = 0 from public.documents), 'missing JWT subject sees no documents');
select pg_temp.assert_true((select count(*) = 0 from public.accounts), 'missing JWT subject sees no accounts');

-- A different holder sees neither A's profile/consent nor A's private records.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true((select count(*) = 1 from public.documents), 'other holder sees own document only');
select pg_temp.assert_true((select count(*) = 0 from public.credential_links), 'other holder cannot read link');
select pg_temp.assert_true((select count(*) = 0 from public.consent_settings), 'other holder cannot read consent');
with changed as (update public.consent_settings set settings = '{}' returning *)
  select pg_temp.assert_true((select count(*) = 0 from changed), 'other holder cannot update consent');
with changed as (update public.accounts set display_name = 'attack'
  where id = '00000000-0000-0000-0000-000000000001' returning *)
  select pg_temp.assert_true((select count(*) = 0 from changed), 'other holder cannot update profile');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select pg_temp.assert_true((select count(*) = 3 from public.documents), 'issuer reads issued documents');
select pg_temp.assert_true((select count(*) = 0 from public.self_reported), 'issuer cannot browse self-reported records');
select pg_temp.assert_true((select count(*) = 1 from public.credential_links), 'issuer sees link to its own parent document');
select pg_temp.assert_true((select count(*) = 2 from public.revocations), 'issuer reads document revocations only');

-- New user creates only an own profile/consent; no wallet or role self-assignment.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
insert into public.accounts(id, display_name) values ('00000000-0000-0000-0000-000000000004', 'Unverified');
insert into public.consent_settings(account_id, settings)
  values ('00000000-0000-0000-0000-000000000004', '{"share_everything":true}');
select pg_temp.assert_true((select count(*) = 0 from public.documents), 'consent scaffold grants no access');
select pg_temp.assert_true((select count(*) = 0 from public.self_reported), 'unverified account sees no credentials');
select pg_temp.expect_error($q$insert into public.accounts(id) values ('00000000-0000-0000-0000-000000000005')$q$, '42501');
select pg_temp.expect_error($q$insert into public.accounts(id, wallet_address, wallet_verified_at)
  values ('00000000-0000-0000-0000-000000000005', '0x' || repeat('a',40), now())$q$, '42501');
reset role;

-- New owner can read documents after an indexed transfer, without changing issuer-at-issuance.
set local role service_role;
update public.registries set owner_address = '0x' || repeat('b',40)
  where chain_id = 80002 and verification_registry_address = '0x' || repeat('1',40);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true((select count(*) = 2 from public.documents), 'current registry owner reads owned registry documents');
reset role;

-- Application-account deletion cannot erase indexed chain evidence.
delete from auth.users where id = '00000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select count(*) = 0 from public.consent_settings where account_id = '00000000-0000-0000-0000-000000000001'), 'account consent cascades');
select pg_temp.assert_true((select count(*) = 3 from public.documents), 'chain documents survive account deletion');
select pg_temp.assert_true((select count(*) = 1 from public.credential_links), 'chain links survive account deletion');
rollback;
