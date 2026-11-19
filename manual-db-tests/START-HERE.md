# Manual database tests — teammate entry point

Read the short [testing report](TESTING-REPORT.md) for completed results and limits.
No tests run by opening these files.

## Reproduce one scenario at a time

Use local Supabase only: Studio `http://127.0.0.1:54323`, API `http://127.0.0.1:54321`.
You need Docker, the local Supabase CLI setup, and PowerShell 7 for user-session helpers.
The schema must include migrations `20261116000000` and `20261116000100`; see
`docs/SUPABASE.md` in the Vera repository. Do not reset an existing database to run this kit.

For sharing, place this **entire folder** at `<vera-repository>/manual-db-tests/`.
Run guide PowerShell commands from that repository root. In the current separate review
workspace, commands also work from its root; run Supabase CLI commands from the actual
Vera repository. Replace `<path-to-vera-credentials>` with your own clone path when asked.
The SQL files and helpers contain shared synthetic identifiers, not local user UUIDs.
Create your own three local Auth users/passwords as instructed; UUIDs are resolved from
their synthetic emails. Enter your local client key at the prompt; do not save it here.

| Order | Guide and files | Purpose |
| --- | --- | --- |
| 1 | [Degree registration](README.md); root `01-setup.sql`, `02-register-degree.sql`, `03-inspect-degree.sql`, `test-user-session.ps1` | Establish accounts, issuer, registry, degree/status; verify user reads and blocked INSERT. |
| 2 | [Certificate linking](scenario-02/README.md); that folder's SQL and helper | Preflight, insert self-report, reject client writes and wrong-holder link, add valid link, inspect visibility. |
| 3 | [Certificate revocation](scenario-03/README.md); that folder's SQL and helper | Preflight baseline, revoke only certificate status, preserve history/degree, verify user reads and blocked PATCH. |

**Follow guide order, not filename sorting.** In Scenario 2, `05-reject-wrong-holder.sql`
runs before `03-link-certificate.sql`; execute `rollback;` separately after that probe.
Scenarios share state and must run in order. Do not rerun successful plain INSERT scripts
on existing fixtures. Scenario 3 requires an active certificate initially.

## Keep the complete helper and cleanup set

Scenario 2's helper loads the root helper; Scenario 3 loads Scenario 2's helper. Sharing
only the final helper will break reproducibility. All three use real Auth sessions for
permission checks. Loading a helper defines functions; tests require explicit commands.

Retain root `99-cleanup.sql` for full fixture cleanup, Scenario 2's
`99-cleanup-scenario-02.sql` for removing only its additions, and Scenario 3's
`99-restore-scenario-02.sql` for optional restoration of its two changed status fields.
These are local test utilities, not on-chain unlink/unrevocation operations. Full cleanup
also requires deleting the three synthetic Auth users manually, as in the Scenario 1 guide.

SQL Editor is privileged: use it for setup/inspection, never as evidence of RLS.
The helpers accept local client keys, not backend secrets, and disable redirects.
SQL scripts cannot detect a hosted dashboard; check the local Studio URL yourself.

Keep credential notes, raw CLI status output, transcripts, exports, and screenshots under
ignored `local-credentials/` or `local-evidence/`, or outside Git. Share only redacted
evidence if needed. The report records tester-confirmed results, not raw credential-bearing logs.
