# Local database testing report — Scenarios 1–3

**Result: all three manual scenarios passed, as reported by the tester.**
This report summarizes the user's completed runs against local Supabase; it is not an
independent rerun or a record of newly executed tests. Raw response exports were not
reviewed for this report.

## Scope and method

We used synthetic users: Maya (holder), Demo University (degree issuer/registry owner),
and Alex (unrelated user), on fictional fixture chain `99111601`.
Local Studio SQL simulated trusted backend/indexer writes. Permission checks used real
Supabase Auth password sessions and user JWTs, not administrator queries.
Read filtering tested RLS; rejected projection writes tested database grants.

**These were database simulations, not blockchain executions.** No contract transactions,
deployments, wallet signatures, event ingestion, or chain confirmations were exercised.
Synthetic wallet verification timestamps stand in for a future proof-of-ownership service.

## Expected and actual results

| Scenario / check | Expected | Actual (tester reported) |
| --- | --- | --- |
| 1 — Register a degree | One issued document and one active status row; Maya and Demo University can read the degree; Alex gets HTTP 200 with `[]`. | Passed; records and visibility matched. |
| 1 — Reject client registration | Maya's direct INSERT returns HTTP 403; counts do not change. | Passed; 403 and unchanged counts confirmed. |
| 2 — Register and link a self-report | One certificate in `self_reported`, its own status row, and one same-holder link to the existing degree; wrong-holder link fails FK checks. | Passed; relationships matched and invalid link was rejected. |
| 2 — Preserve classification and privacy | No certificate copy in `documents`. Maya can read certificate/status/link; university sees degree/link but not certificate/status; Alex sees none. Direct certificate/link INSERTs are denied. | Passed; classification, visibility, and write restrictions matched. |
| 3 — Revoke the certificate | Certificate status changes to revoked, reason `10` (OTHER), synthetic time `2026-11-15T12:20:00Z`; activity is false despite the link. | Passed; revocation matched the expected outcome. |
| 3 — Preserve history and degree | Original certificate registration and link remain; degree and its status remain unchanged and active; row counts stay unchanged. | Passed; preservation and degree independence matched. |
| 3 — Maintain access and deny modification | Read visibility remains as in Scenario 2. Direct revocation PATCHes by Maya, university, and Alex return HTTP 403. | Passed; access restrictions matched. |

After Scenario 3, before optional restoration/cleanup: **3 accounts, 1 issuer, 1 registry,
1 issued degree, 1 self-reported certificate, 1 link, 2 revocation-status rows**.
The certificate is revoked; the degree remains active. A retained link does not establish
current activity, issuer endorsement, or promotion of a self-report to an issued credential.

## Still to test

- Duplicate blockchain events: uniqueness, identical retries, conflicting payloads,
  atomic projection/checkpoint updates, and reorg recovery once an indexer exists.
- Broader privacy and authorization: anonymous access, unverified wallets, cross-user
  profile/consent changes, DELETE operations, wallet reassignment, and internal event access.
- Consent preferences: own-user read/write, cross-user denial, invalid settings; stored
  preferences currently grant no sharing rights.
- Actual local-chain registration, linking and holder-authorized revocation, followed
  by event ingestion; wallet ownership verification and application status handling.
- Missing status (unknown), repeated/invalid revocation, degree revocation effects,
  fresh teammate reproduction, and cleanup/restoration. These are not claimed as covered
  by the three reported runs. Hosted behavior and real file/storage privacy are also outside scope.

Reproduction: see [START-HERE.md](START-HERE.md). 
