# Supabase database (issues #12, #13, #14)

For shared hosted provisioning, approval gates, teammate access and reviewed
deployments, see [the hosted handoff](HOSTED_SUPABASE.md). No hosted project has
been linked, migrated or validated by the November 22 milestone preparation.

SQL only; no hosted project, deployment, indexer, wallet-verification endpoint,
file bucket, recruiter app, or department-sharing logic is created here.
Use synthetic records. The blockchain remains authoritative; database rows are
an indexed cache plus private account/consent data.

## Files

- `supabase/migrations/20261116000000_core_schema.sql`: ten tables, three encoding
  domains, keys, checks, relationships and lookup/replay indexes.
- `supabase/migrations/20261116000100_access_rules.sql`: explicit grants and RLS.
- `supabase/tests/schema.test.sql`: SQL regression suite, enclosed in a transaction
  that rolls back. Run only on a disposable local database.
- `supabase/tests/api-smoke.ps1`: real local Auth/REST tests with temporary users and automatic cleanup (PowerShell 7+).
- `supabase/config.toml`: minimal local-stack configuration, no credentials.

## Local setup and checks

Local verification completed on November 15, 2026 with Docker Engine 29.9.3,
Supabase CLI 3.1.0 (via npx), and Supabase PostgreSQL 17.11. No hosted project is
linked. Issue #12 remains open for future hosted provisioning.

1. Install Docker Desktop and start its engine. Install the Supabase CLI using
   its supported Windows instructions, or use `npx supabase` below (downloads the
   CLI). A hosted Supabase account/project is not needed for local development.
2. In the repository root, start the local stack:

   ```powershell
   npx supabase@3.1.0 start
   npx supabase@3.1.0 db reset
   npx supabase@3.1.0 db lint --schema public --level warning --fail-on warning
   ```

   `db reset` defaults to the local database in this pinned CLI and applies both
   migrations; it removes existing local data. No remote link is required.
3. Run the rollback-only SQL suite with a PostgreSQL client:

   ```powershell
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/schema.test.sql
   ```

   Without a host `psql`, use the client in the local database container:

   ```powershell
   Get-Content -Raw supabase/tests/schema.test.sql | docker exec -i supabase_db_vera-credentials psql -U postgres -d postgres -v ON_ERROR_STOP=1
   ```

   The test uses synthetic auth UUIDs ending `0001` through `0004` and rolls back
   everything. An SQL error is a failed test. Use a fresh disposable database if
   those test IDs already exist. `supabase status` shows local endpoints/keys;
   keep secret/service-role keys server-side and out of Git.

4. Run real Auth/REST security checks and the local database advisors:

   ```powershell
   pwsh -File supabase/tests/api-smoke.ps1
   npx supabase@3.1.0 db advisors --type all --level info --fail-on warn
   ```

   The smoke test refuses non-loopback API endpoints, consumes local keys only
   in memory, signs in temporary synthetic users, tests isolation/blocked writes,
   and removes its test users and records. It needs PowerShell 7 (`pwsh`).
   Run tests from the repository root. No `supabase login`, `link`, or remote flag
   is needed. Reopen your terminal after installing Docker if it is not on PATH.

Local analytics/log collection is disabled in `config.toml`: on this Windows
Docker setup, Vector could not reach Docker's TCP log endpoint and kept restarting.
Database/Auth/REST/Storage/Studio remain enabled. Do not enable an unauthenticated
Docker TCP endpoint just to collect optional logs.

Official setup/migration references:
[CLI](https://supabase.com/docs/guides/local-development/cli/getting-started),
[migrations](https://supabase.com/docs/guides/local-development/database-migrations).

For #12 later, a team member still needs to create the hosted Supabase project,
record its project URL and client publishable key in untracked app environment
configuration, and store the backend secret key separately. Do not put a secret
key in a mobile/browser app. No remote project is linked or migrated by this work.
No actual credentials are needed to review these SQL files.

## Data model and boundaries

| Table | Identity / relationship |
|---|---|
| `accounts` | Auth user UUID; optional unique verified EVM wallet. Deleting an Auth user removes their profile and consent only. |
| `issuers` | `(chain_id, issuer_registry_address, issuer_address)`; current approval from Added/Removed events. |
| `registries` | `(chain_id, verification_registry_address)`; factory-scoped registry ID is also unique; original owner and current owner are separate. |
| `documents` | `(chain_id, registry_address, doc_id)`; references factory registry; holder and issuer-at-issuance remain chain facts. |
| `self_reported` | `(chain_id, registry_address, doc_id)`; stores the standalone shared registry's companion revocation address. |
| `credential_links` | `(chain_id, link_contract_address, child_doc_id)`; composite FKs require the child and parent to exist and share the recorded holder. |
| `revocations` | `(chain_id, revocation_registry_address, doc_hash)`; stores registration and optional revocation reason/time. |
| `consent_settings` | One JSON object per account, version 1; owner read/write only; preferences do not authorize sharing. |
| `chain_events` | `(chain_id, transaction_hash, log_index)`; canonical decoded logs and block hashes for replay/reorg detection. |
| `indexer_checkpoints` | `(chain_id, contract_address)`; last fully processed block and its hash. |

Addresses/hashes must be lowercase `0x` hex (40/64 digits). Normalize addresses
before writes; no EIP-55 case variants in keys. `uint256` uses unrounded exact
numeric with integer/range checks. The same ID or hash may exist on other chains
or in other registries. Duplicate hashes within a verification registry are
rejected, matching its companion registry's one-registration-per-hash rule.

No FK from an indexed holder to `accounts`: indexing must work before signup.
No FK from registry ownership to `issuers`: factory creation is deliberately
ungated, and removal from an allowlist must not delete credentials. No factory
FK on revocations: standalone SelfReportedRegistry creates its own companion.

Reasons 1..10 follow the Solidity enum: EXPIRED, SUPERSEDED, KEY_COMPROMISE,
AFFILIATION_CHANGED, CESSATION_OF_OPERATION, PRIVILEGE_WITHDRAWN,
ADMINISTRATIVE_ERROR, FRAUDULENT, FORMAT_INVALID, OTHER. No revocation row means
unknown; a registered row without a revocation time means active. Status and
issuer trust are separate; a link never promotes a self-report to verified.
CredentialRegistry checks holder/approval at link time, not current revocation,
degree type or subsequent issuer approval. Recheck these when verifying reports.

Factory template types 0/1/2 are retained. Only DocumentRegistered is projected
into `documents`; Dataset/Media tables are deferred pending the team's interface
decision. No private file URLs or new credential metadata fields are invented:
`uri` is the exact on-chain value. Storage buckets/policies are separate future
work before private files can be served.

## Access rules

- Anonymous clients: no access to these tables.
- Authenticated clients: issuer/registry catalog reads; only their own profile
  and consent reads/writes. Profile edits are limited to `display_name`; clients
  cannot set wallet associations, verification timestamps or roles.
- Verified holders: read their own document/self-reported rows and links.
- Original document issuers and current registry owners: read relevant documents,
  links to those documents, and document revocation states. They cannot browse
  self-reported records merely because a child links to their document.
- Revocation reads follow access to the corresponding document/self-report and
  its exact companion registry/hash; equal hashes elsewhere grant no access.
- `chain_events` and `indexer_checkpoints`: no client access. Decoded events can
  include data from many holders, so they must not become a client bypass.
- Trusted `service_role`: writes indexed tables and manages verified wallet
  associations. It bypasses RLS; keep its secret server-side. A future wallet
  verification service must verify proof of wallet control before assigning an
  account's wallet. This migration does not implement that service.
- Consent is scaffolding only (#14): no recruiter/department grants, sharing
  defaults, or automatic access based on arbitrary JSON settings.

See [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Indexer handoff

Configure trusted deployment addresses and start blocks per chain; do not infer
trust merely from a factory registry or client-supplied address. IssuerRegistry,
SelfReportedRegistry and CredentialRegistry are standalone deployments, discovered
from configuration. The currently documented practice deployment includes only
the factory; full deployment configuration is still needed for integration.

Read companion addresses and CredentialRegistry's configured child registry
from contract getters. Discover new factory registries from RegistryCreated.
Process all logs in block/log order, backfill each newly discovered registry from
its creation block (including the current block), and project documents only for
Document templates. Update current owners on OwnershipTransferred. Indexer must
validate that events belong to the configured deployments/template types and
maintain consistent registry/companion associations; SQL shape checks alone are
not evidence of on-chain authenticity.

In one database transaction, persist the canonical logs, apply projections, and
advance the affected checkpoints. This transaction/API and retry logic are for
indexer integration, not implemented here. On conflict, compare existing block
hash/content rather than blindly accepting a changed event. Repeated identical
logs should be no-ops. A checkpoint is inclusive and advances only after every
log through that block has been handled; no row means indexing has not started.

On a reorg, compare stored block hashes, rewind to a common ancestor, discard
orphaned logs, and rebuild affected projections before advancing checkpoints.
Delete links before their referenced document/self-report rows when rebuilding;
FKs intentionally prevent dangling links. Projections do not FK to log rows, so
removing a log alone does not undo its effects. Raw logs retain history of issuer
approval and ownership changes; projection tables retain current state.

Known contract limitation: linkCredential accepts any parent implementing the
expected getter interface, not only factory-created registries. This schema
projects factory-discovered Document parents. If a link points elsewhere, keep
its raw event and surface the unsupported parent during indexing; do not invent
a trusted document or silently advance past an unhandled projection. Team
agreement is needed before supporting such parents. No contract changes here.

## Validation performed

On November 15, 2026, the real local Supabase stack passed:

- Clean local reset replayed both migrations on PostgreSQL 17.11; both versions
  were confirmed in `supabase_migrations.schema_migrations`.
- The complete SQL suite passed all 101 constraint/authorization assertions,
  including real Supabase `auth.users`, `auth.uid()`, and role permissions.
- 50 real Auth/REST checks passed: actual password sign-ins and JWTs, anonymous
  denial across all ten tables, own profile/consent operations, blocked wallet
  reassignment and indexed-data writes, cross-user record isolation, service-role
  projection writes, and blocked access to internal logs/checkpoints.
- PostgreSQL lint returned no schema errors/warnings (fail-on-warning enabled).
- Security/performance advisors returned no WARN or ERROR findings. Informational
  findings are expected: indexes have no representative workload history yet;
  `chain_events` and `indexer_checkpoints` intentionally have RLS enabled with no
  client policies, because only the trusted service role accesses them.
- Test rows/users were cleaned up; all ten application tables were empty afterward.

Earlier fallback validation also passed in PGlite 0.5.16/PostgreSQL 18.6 with
minimal Auth stubs. Real local tests now supersede that limitation. No schema or
RLS fixes were needed after real-stack testing. This validates the current
synthetic-data prototype, not future indexer behavior, wallet-proof verification,
file access rules, hosted deployment, or mentor-dependent consent semantics.
No hosted connection, remote migration, Solidity change, commit or push occurred.
The local stack is left running for inspection in Studio at http://127.0.0.1:54323.
