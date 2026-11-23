# Shared development database handoff

Status: no hosted project has been created, linked, migrated or tested by this
work. The owner confirmed that previous testing was local only. Do not treat
this runbook as evidence of remote readiness. Use synthetic data throughout.

## Owner setup (dashboard login required)

1. Sign in at https://supabase.com/dashboard and inspect every team-accessible
   organization for an existing `vera-credentials-dev` project before creating one.
2. Select a team-controlled organization (or create one under a designated team
   owner). Review plan, region and billing with the team. Create exactly one
   `vera-credentials-dev` project. Generate its database password in an approved
   password manager; do not send it through chat or commit it.
3. Share only the organization name and public project reference/dashboard URL
   with the reviewer. Wait for the project to be healthy before linking.
4. Propose invitations through Organization Settings → Team: one accountable
   Owner, the other three teammates as Developers where supported. Developers
   can edit project resources; this is different from application RLS access.
   If roles/project restrictions depend on the plan, review the available scope
   before inviting. Keep billing/membership administration with the Owner.
   Obtain approval for the exact invitees and roles before sending invitations.

## Inspect and link before migration approval

Use the repository-pinned Supabase CLI 3.1.0 from the repository root. Login
through the supported CLI flow on a trusted workstation; use approved secret
storage for automation, never command-line token/password literals. Confirm
command availability with `--help` on the installed CLI.

```sh
npx supabase@3.1.0 login
npx supabase@3.1.0 projects list
npx supabase@3.1.0 link --project-ref <confirmed-project-ref>
npx supabase@3.1.0 migration list --remote
npx supabase@3.1.0 db push --remote --dry-run
```

Linking stores local project metadata under ignored `supabase/.temp/`; the
`project_id` in `supabase/config.toml` names the local stack, not a hosted ID.
Do not run `db pull` over the reviewed migration directory or repair migration
history to conceal drift. Inspect existing public tables, domains, constraints,
indexes, grants, RLS policies, auth dependencies and migration history read-only.
If a project contains existing objects/data or unexpected applied versions,
stop and investigate; never overwrite, reset, delete or automatically reconcile.

The proposed first deployment consists only of:

- `20261116000000_core_schema.sql`: three domains and ten tables (accounts,
  issuers, registries, documents, self_reported, credential_links, revocations,
  consent_settings, chain_events, indexer_checkpoints), keys, constraints and indexes.
- `20261116000100_access_rules.sql`: explicit grants, RLS on all ten tables and
  participant/owner policies. Anonymous access is denied; authenticated clients
  cannot write chain projections or wallet associations; the trusted service
  role bypasses RLS. Consent preferences confer no sharing access.

These migrations use CREATE statements and are not a reconciliation script for
pre-existing tables. They include no seed records. Their access-grant changes
require explicit approval even on an otherwise empty project. Present the
target reference, migration file hashes, existing state, dry-run output and this
change summary to the owner **before** executing any remote migration.

Only after approval for this exact target and plan:

```sh
npx supabase@3.1.0 db push --remote
npx supabase@3.1.0 migration list --remote
```

Never run a remote reset, seed, migration repair or automatic deployment.

## Verify without changing hosted records

After the approved deployment, compare `information_schema` and `pg_catalog`
metadata with both migrations: domains, columns, PK/FK/unique/check constraints,
indexes, table/column grants, RLS flags and `pg_policies` expressions. Compare
applied migration versions with exactly the two repository versions. Read-only
catalog checks alone do not establish end-to-end permission correctness.

Use read-only API requests with the public client key to confirm anonymous
denial for the ten application tables (an empty successful response alone is
not proof of denial). With pre-approved synthetic authenticated users, verify
the expected catalog visibility and participant isolation. Do not create users,
insert fixtures or change permissions without a separate approved test plan.
Exercise write-denial cases in a disposable local stack first.

Do not point `supabase/tests/schema.test.sql` or `api-smoke.ps1` at the hosted
project: the SQL suite is documented as disposable-local-only and the API suite
creates/deletes temporary users/rows and intentionally rejects remote endpoints.
Do not remove those guards. Record actual hosted results separately from local
results; hosted validation remains pending until a target is available.

## Local configuration and repository integration

The template `supabase/.env.example` lists names only. Copy it to ignored
`supabase/.env` if a future consumer requires it; no current indexer reads these
variables. Store backend secrets in the team's approved vault or GitHub
environment secrets, and inject only into trusted server processes. Public URL
and publishable key can be client configuration; service-role/secret keys must
never enter client bundles. Keep database passwords and CLI tokens separate
from application keys. Never print CLI status output containing keys into logs.

The current `indexer/store.js` is a local JSON store using `indexer/schema.sql`,
not these migrations. It lacks chain/deployment-scoped identities and canonical
event/checkpoint transactions. Do not apply `indexer/schema.sql` to hosted
Supabase or swap in a database client without a separate tested adapter. Map
addresses to lowercase, populate all required fields and companion addresses,
process ownership/removal events, handle uint256 exactly, and atomically persist
events/projections/checkpoints with replay and reorg handling.

For GitHub integration, an organization owner can inspect supported Supabase
GitHub integration settings, repository access and plan requirements. Do not
activate automatic production/shared-database deployment. The default reviewed
CLI release process is: PR review → local SQL/Auth tests → exact target inspection
and dry-run → owner approval → one maintainer runs `db push` → read-only catalog
and API checks → record commit, migration hashes, operator and results here.
No GitHub Actions deployment workflow or automatic trigger is enabled by this work.

## Outstanding handoff

- Organization/project identity and secure CLI login are needed first.
- Exact invitation recipients and roles need owner approval.
- Remote migration approval must follow target inspection and dry-run.
- Hosted verification, project link and actual app integration remain pending.
