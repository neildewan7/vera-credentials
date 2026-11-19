-- OPTIONAL LOCAL TEST-FIXTURE RESTORE. Not a product/on-chain unrevocation operation.
-- Use only AFTER completing inspection, if you want the exact active Scenario 2 baseline.
-- No deletion, new rows, change to registration time, or modification of degree/link.
begin;
do $$
declare affected integer;
begin
  update public.revocations set revoked_at = null, reason = null
  where chain_id = 99111601
    and revocation_registry_address = '0x9999999999999999999999999999999999999999'
    and doc_hash = '0x' || repeat('d', 64)
    and registered_at = '2026-11-15T12:10:00Z'::timestamptz
    and revoked_at = '2026-11-15T12:20:00Z'::timestamptz and reason = 10;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Expected exact Scenario 3 revoked fixture; found %. Stop and inspect.', affected;
  end if;
end $$;
commit;
-- Rerun 01-preflight.sql and 03-inspect-status.sql: certificate active, all counts unchanged.
