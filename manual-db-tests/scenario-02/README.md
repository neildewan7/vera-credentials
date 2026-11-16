# Scenario 2 — link Maya's self-reported certificate

Run each step yourself; these files do not execute tests automatically. Reuse the real
Scenario 1 Auth users and their passwords. All files here are separate from the main
repository, in `DSC Capstone/manual-db-tests/scenario-02`.

Only use **local Studio at http://127.0.0.1:54323**. Check the address bar before every
SQL execution; SQL files cannot detect whether you pasted them into hosted Studio.
The API helper uses only `http://127.0.0.1:54321` and disables redirects.
Do not rerun Scenario 1 setup, reset the database, or run automatic smoke tests.

## 1. Inspect the existing starting point

Run `01-preflight.sql` in local Studio's SQL Editor. Expect:

- Three real users with existing profiles: Maya's verified wallet is repeated `1`s,
  Demo University's repeated `2`s, Alex's repeated `3`s.
- One degree: ID `0x` + 64 `a`s, hash `0x` + 64 `b`s, holder Maya, issuer Demo University.
- Its existing revocation row has `registered_at` set and `revoked_at`/`reason` NULL.
- Fixture counts: `self_reported = 0`, `credential_links = 0`, `revocations = 1`.

Stop if those results differ. All new records use the same fictional chain **99111601**.

## 2. Insert the self-reported certificate, then pause to inspect

In local Studio, run **only `02-insert-certificate.sql`**. This creates one self-report
and its own active revocation record in a transaction. It does not create a link yet.
If an SQL transaction errors, execute `rollback;` separately before continuing.

This is privileged fixture setup simulating trusted indexer writes. In the real design,
Maya registers on the self-report contract, then an indexer projects the event into the DB.
Authenticated clients cannot directly insert these projection rows. This scenario does
not call a contract, deploy anything, verify wallet proofs, or test an actual indexer.

Run `04-inspect.sql` and inspect the Table Editor:

| New fixture | Value |
| --- | --- |
| Certificate source table | `self_reported` |
| Self-report registry | `0x` + 40 `8`s |
| Its companion revocation registry | `0x` + 40 `9`s |
| Certificate ID / hash | `0x` + 64 `c`s / `0x` + 64 `d`s |
| Holder | Maya's wallet, repeated `1`s |
| Future link contract | `0x` + 40 `a`s |

The example.invalid URI is a dummy marker for a synthetic certificate, not a retrievable
file. There is no certificate-title field in this schema. The standalone self-report
registry does **not** get a row in the factory-discovered `registries` table.

Expect one active certificate in the first inspection result, zero links in the second,
`documents = 1`, `self_reported = 1`, `revocations = 2`, `credential_links = 0`.
The certificate's `source_classification = 'self_reported'` is an explanatory query alias,
not a new stored field or a trust status inferred from the parent.

## 3. Read the unlinked certificate through actual user sessions

In PowerShell 7, load the new helper:

```powershell
. './manual-db-tests/scenario-02/test-user-session.ps1'
Connect-VeraManualUser -User holder
```

This loads the existing login functions and clears any old helper session. As before,
enter the **local anon/publishable key** and that user's password at the prompts. Never
use a service-role/secret key. Loading the script makes no requests. Connecting signs
in a real Auth user and prints their UUID; it does not run tests.

Run each separately and inspect the response:

```powershell
Get-VeraManualCertificate
Get-VeraManualCertificateRevocation
Get-VeraManualCertificateLink
```

Expect Maya to receive **HTTP 200** for each: one certificate, one active certificate
revocation row, and `[]` for links. Revocation here means the status table, not that the
certificate is revoked: `revoked_at` and `reason` must be NULL.

## 4. Confirm Maya cannot write projection tables through the API

Still signed in as holder, run these separately **before inserting the valid link**:

```powershell
Invoke-VeraManualDeniedCertificateInsert
Invoke-VeraManualDeniedLinkInsert
```

Both should return **HTTP 403 / SQLSTATE 42501**, permission denied. These exercise table
write grants, not INSERT RLS policies: neither projection table has a client INSERT grant.
The certificate probe uses a fresh ID/hash. The link probe uses existing valid parents
and is run before the valid link exists. A duplicate/FK error is not a permission pass.

Rerun `04-inspect.sql`: certificate count remains **1**, links **0**, revocations **2**.
If either write succeeds, stop and inspect before proceeding; do not hide it with an upsert.

## 5. Check that linking requires the same holder (manual SQL constraint test)

In local Studio, run `05-reject-wrong-holder.sql`. It tries to link Maya's certificate and
degree while recording Alex as holder. Expect **23503 / foreign_key_violation** because
the composite FK requires the actual holder along with chain, registry, and document ID.
One failing FK is enough to reject the insert; the error may name either FK.

Immediately execute this **separately**, including if the insert unexpectedly succeeded:

```sql
rollback;
```

Never commit this probe. Rerun `04-inspect.sql`: links must remain **0**.
This is a database relationship check using privileged SQL, not an RLS test. The schema
has two composite FKs, one to `self_reported` and one to `documents`, so neither a missing
child/parent nor a mismatched holder can create a valid link.

## 6. Insert the correct link and inspect the relationship

Run `03-link-certificate.sql` in local Studio. Then run `04-inspect.sql` again.
Expect one joined link row with:

- Child registry/ID pointing to the self-report (`8`s / `c`s).
- Parent registry/ID pointing to the existing degree (`4`s / `a`s).
- `same_holder = true`, with Maya's wallet recorded on all three rows.
- `child_source_classification = self_reported` and the original synthetic certificate URI.
- `certificate_rows_in_documents = 0`: linking did not insert a second issued document.

Expected fixture counts after linking:

| accounts | issuers | registries | documents | self_reported | credential_links | revocations |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 1 | 1 | 1 | 1 | 1 | 2 |

The link is a separate relationship row. It does not change the certificate's source,
add an issuer to it, upgrade trust, or merge its revocation status with the degree.
Approval of Demo University does not endorse the child certificate. The SQL schema
does not enforce contract approval/configuration/degree-type checks at link time;
these fixture inserts are not evidence that those contract checks ran.

## 7. Check all three users after linking

As Maya, run these one at a time:

```powershell
Get-VeraManualDegree
Get-VeraManualCertificate
Get-VeraManualCertificateLink
Get-VeraManualCertificateRevocation
```

Then switch to Demo University and repeat the four reads:

```powershell
Connect-VeraManualUser -User issuer
```

Finally switch to Alex and repeat the four reads:

```powershell
Connect-VeraManualUser -User other
```

Each Connect requires that user's own password. Expected results are:

| Actual session | Degree | Self-reported certificate | Link row | Certificate revocation row |
| --- | --- | --- | --- | --- |
| Maya / holder | 1 row | 1 row | 1 row | 1 row |
| Demo University / issuer | 1 row | `[]` | 1 row | `[]` |
| Alex / other | `[]` | `[]` | `[]` | `[]` |

All reads should return **HTTP 200**. Empty results demonstrate RLS filtering only when
the user is actually authenticated. A 401, connection error, or expired token is not a pass;
sign in again and retry. Privileged Studio visibility does not prove client access.

Demo University can see the **link and child identifiers** through its access to the
parent degree. It cannot read the underlying self-report, its URI/hash, or its revocation
state merely because it is linked. This is the current intentional distinction in the
RLS rules. A client joining links to hidden child rows must handle the absent child;
use these separate reads to inspect each permission independently.

Rerun `04-inspect.sql` in Studio to confirm counts stayed unchanged after the API reads
and denied writes. **Stop here** and record the statuses/counts before Scenario 3.

## Optional cleanup

Keep these fixtures for revocation testing next. To undo only Scenario 2, run
`99-cleanup-scenario-02.sql` in local Studio, then `04-inspect.sql`.
Expect Scenario 1 to remain: accounts 3, issuers 1, registries 1, documents 1,
revocations 1; self-reports and links return to 0.
The cleanup also covers the fresh certificate ID used by the expected-denied API probe.
It will fail rather than cascade-delete unexpected dependent links: stop and inspect those.

This SQL removal is local test-data cleanup, not a supported on-chain unlink operation.
Do not run the parent folder's full `99-cleanup.sql` unless you intend to remove both scenarios.
No changes to consent, Auth users, wallets, or the original degree are needed for Scenario 2.

```powershell
Disconnect-VeraManualUser
```

Close the PowerShell window when done. Tokens remain in helper memory only; no passwords,
keys, or tokens are written to disk by these files.
