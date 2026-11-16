# Scenario 3 — Maya revokes her linked self-reported certificate

These files are prepared for **manual execution only**. No live inspection or database
test has been executed by the agent. Start with the preflight below; do not run the
revocation update until its results match the expected Scenario 2 fixtures.

All files stay in the separate `DSC Capstone/manual-db-tests/scenario-03` folder.
Use the existing local database, Auth users, passwords, and fictional chain **99111601**.
Do not rerun setup, reset the database, apply migrations, or invoke automatic smoke tests.

## 1. Preflight: inspect and save the original records

Open **http://127.0.0.1:54323**. Confirm the loopback address before pasting any SQL;
these SQL files cannot distinguish local Studio from a hosted dashboard.
In **local Studio → SQL Editor**, run **only `01-preflight.sql`** first.

Expect the following result sets:

1. Three real Auth users with their existing profiles and verified wallets: Maya/holder
   (`1`s), Demo University/issuer (`2`s), Alex/other (`3`s).
2. One self-reported certificate, ID `0x` + 64 `c`s, hash `0x` + 64 `d`s, held by Maya.
   Registry is repeated `8`s; its companion revocation registry is repeated `9`s.
   Certificate and status registration timestamps are both `2026-11-15T12:10:00Z`.
   Status is **active**, with `revoked_at` and `reason` NULL.
3. One university degree, ID `a`s/hash `b`s, held by Maya and issued by Demo University.
   Its status is **active**, using companion revocation registry repeated `5`s.
4. One existing link from the certificate to that degree, `same_holder = true`,
   `linked_at = 2026-11-15T12:15:00Z`.
5. Fixture counts shown below.
6. Five labeled `unchanged_data` JSON values containing the original records.

| accounts | issuers | registries | documents | self_reported | credential_links | revocations |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 1 | 1 | 1 | 1 | 1 | 2 |

**Save/copy the preflight results**, especially the five JSON values, using Studio's
result export/copy controls. These capture the entire certificate registration, degree,
degree status, historical link, and the certificate status record minus only its mutable
`revoked_at`/`reason`. Compare those values after every write probe. Studio may display
timestamps in another timezone; compare the same instant, not just the displayed hour.

If anything differs, stop and inspect before running Step 3. Missing status is **unknown**,
not active. Studio uses privileged access here; these results do not validate RLS.

## 2. Establish a real holder-session baseline

In **PowerShell 7**, load the helper with a leading dot and space:

```powershell
. './manual-db-tests/scenario-03/test-user-session.ps1'
Connect-VeraManualUser -User holder
```

This reuses the Scenario 1 login and Scenario 2 read functions. Loading the file only
defines helpers and clears any old helper session. It runs no requests or tests.
Enter the **local anon/publishable key** and Maya's existing password at the prompts.
Never use a service-role/secret key. Requests use only `http://127.0.0.1:54321`, with
redirects disabled; tokens remain in memory. The login prints Maya's actual Auth UUID.

Run separately:

```powershell
Get-VeraManualCertificate
Get-VeraManualCertificateLink
Get-VeraManualCertificateActivity
Get-VeraManualDegreeRevocation
```

Expect HTTP **200** for each: one certificate, one link, certificate activity **active /
IsActive = True**, and one degree status row with NULL `revoked_at`/`reason`.

## 3. Simulate the indexed result of Maya's revocation

Only after preflight matches, run **`02-revoke-certificate.sql`** in **local Studio**.
This changes exactly one existing `revocations` row:

- Chain: `99111601`.
- Companion revocation registry: `0x` + 40 `9`s.
- Certificate hash: `0x` + 64 `d`s.
- `revoked_at`: **2026-11-15T12:20:00Z**, after the certificate was linked.
- `reason`: **10 = OTHER**, from the existing contract enum.

The script checks that the expected linked certificate and active parent degree exist,
requires the original certificate status registration timestamp, and refuses an already
revoked or missing status row. It reports exactly one updated record and commits.
A rerun intentionally fails. On any transaction error, execute `rollback;` separately
and inspect rather than editing IDs or bypassing the guard.

This is privileged **projection-fixture setup** simulating an indexer after Maya invokes
`SelfReportedRegistry.revokeMine`. It does not call a contract or prove on-chain holder
authorization. In the current model, even Maya cannot directly PATCH indexed revocations
with her user JWT. There is no implemented indexer in this exercise; raw events and
checkpoints remain untouched. No history/event row is invented.

## 4. Inspect status and preserved history

Run **`03-inspect-status.sql`** in local Studio. Expect one result row:

| Field | Expected after revocation |
| --- | --- |
| `certificate_status` | `revoked` |
| `certificate_is_active` | `false` |
| `certificate_revoked_at` | `2026-11-15T12:20:00Z` |
| `certificate_reason` | `10` |
| `original_certificate_registered_at` / `certificate_status_registered_at` | Both still `2026-11-15T12:10:00Z` |
| `source_classification` | `self_reported` (query alias, no schema change) |
| `link_exists` | `true` |
| `original_linked_at` | Still `2026-11-15T12:15:00Z` |
| `degree_status` | `active` |
| `degree_revoked_at` / `degree_reason` | Both NULL |

`certificate_rows_in_documents` must remain **0**. Then rerun **`01-preflight.sql`**:
all seven counts and all five saved `unchanged_data` JSON values must match the baseline.
Only the certificate's `revoked_at` and `reason` should differ in its status result.

Table Editor should still show the certificate in `self_reported`, its original
registration/status row in `revocations`, and the link in `credential_links`.
Revocation updates current state; it does not delete the original registration or link.
The retained link records the historical relationship and does **not** imply the child
is active. The degree and its independent revocation status are unaffected.

There is no new application status field, view, or automatic "active linked credentials"
filter in these files. The inspection query and activity helper explicitly consult the
certificate's matching companion/hash status. A consumer that checks only link existence
would incorrectly treat a revoked certificate as usable.

## 5. Verify real-user reads after revocation

As Maya, run each command individually:

```powershell
Get-VeraManualCertificate
Get-VeraManualCertificateRevocation
Get-VeraManualCertificateActivity
Get-VeraManualCertificateLink
Get-VeraManualDegree
Get-VeraManualDegreeRevocation
```

Switch to Demo University, then repeat the same six reads individually:

```powershell
Connect-VeraManualUser -User issuer
```

Switch to Alex, then repeat the six reads:

```powershell
Connect-VeraManualUser -User other
```

Use each user's own existing password. Expected responses:

| Session | Certificate | Certificate status row | Activity helper | Link | Degree | Degree status row |
| --- | --- | --- | --- | --- | --- | --- |
| Maya | 1 row | 1 revoked row | `revoked`, `IsActive = False` | 1 row | 1 row | 1 active row |
| Demo University | `[]` | `[]` | `unknown_or_not_visible`, `IsActive = null` | 1 row | 1 row | 1 active row |
| Alex | `[]` | `[]` | `unknown_or_not_visible`, `IsActive = null` | `[]` | `[]` | `[]` |

All underlying reads should return **HTTP 200**. Revocation does not change read policies:
Maya retains access to her revoked record; the university can see the link through the
degree but cannot read the self-report or its status. Seeing the link alone cannot tell
the university that the certificate is active. Alex gets no participant records.
Hidden status is not evidence of either activity or revocation; the helper reports unknown.

A 401, timeout, connection error, or sign-in failure is not an RLS pass. Reconnect and
retry. Studio visibility is privileged and is not a substitute for these user sessions.

## 6. Verify direct revocation modifications are denied

This probe attempts a **valid, changed** certificate revocation timestamp (`12:21:00Z`)
on the exact existing status row. It uses a valid reason, so constraints cannot explain
a denial. Run it separately under each real authenticated user:

```powershell
Connect-VeraManualUser -User holder
Invoke-VeraManualDeniedRevocationUpdate
```

Expect **HTTP 403 / PostgreSQL code 42501**, permission denied. Maya controls her entry
on-chain, but her application session has no direct database projection-write privileges.

Rerun `03-inspect-status.sql` in Studio: the timestamp must still be **12:20:00Z**.
Then repeat under Demo University:

```powershell
Connect-VeraManualUser -User issuer
Invoke-VeraManualDeniedRevocationUpdate
```

Expect the same **403 / 42501**. Recheck the timestamp. Finally repeat under Alex:

```powershell
Connect-VeraManualUser -User other
Invoke-VeraManualDeniedRevocationUpdate
```

Expect the same **403 / 42501**. These check table UPDATE grant denial, not an UPDATE RLS
policy: authenticated users have no UPDATE grant on `revocations`. Do not accept a
200/204 empty update, 401, invalid-payload error, or connection error as the expected denial.
If a PATCH succeeds, stop and inspect immediately; do not conceal it by rerunning the
revocation script or resetting fixtures.

Finish by running `01-preflight.sql` and `03-inspect-status.sql` again. Counts and saved
JSON values must remain unchanged, certificate status must remain revoked at **12:20Z**,
and degree status must remain active. This completes the seven requested checks.
**Stop here before the next scenario.** Record observed statuses, counts, and differences.

## Optional local fixture restoration or cleanup

Keep the revoked fixture for later tests. This scenario creates no new records.
If you specifically want to restore the active Scenario 2 baseline, manually run
`99-restore-scenario-02.sql` in local Studio after finishing your inspection. It refuses
anything except the exact expected Scenario 3 timestamp/reason and restores only the
two changed fields. Rerun the inspection scripts afterwards; the certificate should
be active again with all counts and original registrations unchanged.

**This is disposable local test-data restoration, not a supported on-chain unrevocation.**
Do not restore before saving the revoked-state results. For full test-data removal,
the parent `manual-db-tests/99-cleanup.sql` removes all scenarios and profiles; then
delete the three exact synthetic Auth emails in local Studio, as described in Scenario 1.

```powershell
Disconnect-VeraManualUser
```

Close the PowerShell window to discard helper session state. No contract, migration,
hosted database, consent setting, or main repository file needs modification.
