# Manual local database review — scenario 1: degree registration

For the complete kit, start with [START-HERE.md](START-HERE.md). Completed, tester-reported
results for all three scenarios are in [TESTING-REPORT.md](TESTING-REPORT.md).

These are **manual reproduction scripts**, not an automatic test runner. Run one step at a time and inspect
the result before continuing. No smart contracts, migrations, hosted database, or commits
are changed. The source schema reviewed is in
`supabase/migrations` in the Vera repository.
The review kit lives separately in the current workspace.

## 1. Confirm local Studio and schema

Open **http://127.0.0.1:54323** and keep that loopback URL in the address bar.
Do not paste these SQL files into a hosted Supabase dashboard. The SQL files themselves
cannot distinguish local from hosted databases; this URL check is required.

If Studio is unavailable, start Docker Desktop, open PowerShell in the actual repository,
then run only:

```powershell
Set-Location '<path-to-vera-credentials>'
npx --yes supabase@3.1.0 start
```

If Docker/npx is missing, reopen your terminal after installation. Do not run `db reset`,
the automatic smoke tests, `link`, `db push`, or commands with remote database URLs.
Confirm stack availability by opening local Studio before proceeding.
Starting the stack does not run this manual review kit.

In local Studio, confirm the ten application tables exist. In SQL Editor you may run:

```sql
select version from supabase_migrations.schema_migrations order by version;
```

Expect migrations `20261116000000` and `20261116000100`. If either is absent, stop here
and report what you see; don't reset existing data to force the test through.

Studio SQL Editor uses privileged database access. Use it for fixture setup and inspection,
**not for proving RLS**. All permission checks below use real Auth password sign-ins.

## 2. Create three actual local Auth users

In local Studio, open **Authentication → Users → Add user / Create user**.
Create each email/password user with email confirmed (Auto Confirm, if shown):

| Email | Role in this scenario |
| --- | --- |
| `vera-manual-holder-1115@example.invalid` | Maya Chen, degree holder |
| `vera-manual-issuer-1115@example.invalid` | Demo University issuer and current registry owner |
| `vera-manual-other-1115@example.invalid` | Alex Rivera, unrelated authenticated user |

Choose disposable local-only passwords and keep them available for sign-in. Do not
reuse existing people/accounts, insert bare UUIDs into `auth.users`, or use hosted users.
If these emails already exist from an earlier attempt, inspect/clean that attempt first.

## 3. Prepare the registry; inspect before adding the degree

Open `01-setup.sql`, copy its contents into **local Studio → SQL Editor**, and run it.
It creates exactly three profiles, one approved issuer row, and one Document registry.
It aborts on existing fixture profiles or use of the reserved synthetic chain ID.
If a transaction errors, run `rollback;` before retrying.

In Table Editor inspect `accounts`, `issuers`, and `registries`:

- The Auth UUID is the profile's `accounts.id`.
- Holder wallet ends in repeated `1`s, issuer wallet in `2`s, unrelated wallet in `3`s.
- Registry address is repeated `4`s; companion revocation registry is repeated `5`s.
- Everything chain-related is scoped to **99111601**, a fictional fixture chain identifier.
- `template_type = 0` means Document, not a schema-enforced degree subtype.

The wallet bindings and verification timestamps are **synthetic privileged fixtures**.
They stand in for a future backend's proof of wallet ownership. The users cannot assign
their own wallets through the API, and no actual wallets/contracts are created here.

## 4. Open a real holder session and inspect the empty starting point

In **PowerShell 7**, load the helper (leading dot and space are intentional):

```powershell
. './manual-db-tests/test-user-session.ps1'
Connect-VeraManualUser -User holder
```

At the key prompt paste the **local anon/publishable key** from local project API settings
or `npx --yes supabase@3.1.0 status` in the repo. Keep status output private: it may also
show backend secrets. Never paste a `service_role` or secret key. The helper refuses
privileged key types, uses only `http://127.0.0.1:54321`, and disables redirects.
At the password prompt enter the holder's password. Tokens stay in memory.

Run this separately:

```powershell
Get-VeraManualDegree
```

Expect **HTTP 200, `[]`** before degree insertion. Do not treat a 401 as an RLS pass:
it means sign-in/session failure. Reconnect if the token expires.

## 5. Register the synthetic degree as the trusted backend

Return to **local Studio → SQL Editor** and run `02-register-degree.sql`.
This atomically inserts one `documents` row and its companion `revocations` row.
It simulates the result of indexing a degree registration, not an on-chain transaction.
There is no implemented indexer here; this step deliberately creates no raw event or
checkpoint. A complete chain-to-database integration is outside this scenario.

Run `03-inspect-degree.sql`. Expect one joined row with:

- ID `0x` + 64 `a`s, hash `0x` + 64 `b`s; these are dummy identifiers, not a real file hash.
- Holder `0x111…111`, issuer `0x222…222`, and registry `0x444…444`.
- Synthetic `example.invalid` URI; it does not serve a document and is not a private URL.
- Status **active**: `registered_at` set, `revoked_at` and `reason` NULL.
- Fixture counts: accounts **3**, issuers **1**, registries **1**, documents **1**, revocations **1**.

How the tables connect: `documents` references `registries` by chain and registry address.
`revocations` is matched by chain, the registry's companion address, and document hash.
There is no document-to-profile FK: indexing can precede user signup. RLS matches the
signed-in user's verified wallet to the document holder, issuer, or current registry owner.
Issuer approval is a separate catalog fact; it is not itself a document access grant.

The degree is a scenario label: the schema has no degree-title or degree-type column.
The revocation join is important: no revocation row would mean **unknown**, not active.

## 6. Check the holder, issuer, and unrelated user yourself

Back in the same PowerShell window, run each command separately:

```powershell
Get-VeraManualDegree
Connect-VeraManualUser -User issuer
Get-VeraManualDegree
Connect-VeraManualUser -User other
Get-VeraManualDegree
```

Each Connect prompts for the local client key and that user's password and replaces the
previous session. It prints the actual signed-in Auth UUID, not the JWT.

| Operation | Expected result | Why |
| --- | --- | --- |
| Holder reads after registration | HTTP 200, one degree row | Verified wallet matches holder |
| Issuer reads | HTTP 200, same row | Matches original issuer and current owner |
| Unrelated authenticated user reads | HTTP 200, `[]` | RLS hides another user's document |
| Privileged Studio reads | One row | Inspection only; bypasses client restrictions |

The unrelated user's query succeeds but returns no rows. That is the intended privacy
behavior, not an error. This first scenario establishes a baseline; broader privacy and
write-protection cases will be handled separately later.

## 7. Confirm a holder cannot register a degree through the client API

```powershell
Connect-VeraManualUser -User holder
Invoke-VeraManualDeniedInsert
```

Expect **HTTP 403**, PostgreSQL code **42501**, with a permission-denied message.
This is grant-level write protection; it does not by itself exercise an INSERT RLS policy.
There is deliberately no client INSERT grant/policy for `documents`. Even the issuer is
only an authenticated client; university identity does not grant indexer write authority.

The attempt uses a *different*, otherwise-valid ID/hash (`d`s/`e`s), so a duplicate error
is not an acceptable substitute for a permission denial. If you get 201/204, stop: that is
unexpected client write access. Inspect the extra row before using cleanup. If you get
401 or a connection error, fix session/connectivity and retry; no security result was proved.

Rerun `03-inspect-degree.sql` in local Studio. Documents must still total **1** for this fixture.
Optionally run `Get-VeraManualDegree` again as holder and visually confirm the original row.

**Stop here.** Record observed HTTP statuses, visible row counts, and any unexpected errors.
Do not proceed to the certificate-linking scenario until this one is understood.

## Cleanup or keep for the next scenario

Keep the fixtures if continuing. Otherwise run `99-cleanup.sql` only in local Studio.
It removes the reserved chain's fixture rows in FK order and these three profiles/consents;
it does not truncate tables or reset the database. Its eight chain-table counts should all be 0.
Then delete the **three exact emails above** in local Studio's Authentication → Users.
Confirm they are absent and there are no matching profiles. If setup failed halfway,
its SQL transaction should roll back; any users created manually still need removal.

```powershell
Disconnect-VeraManualUser
```

Close the PowerShell window to discard session state. No key/password/token files are created.

Later, one at a time: link a self-reported certificate; revoke a credential; replay duplicate
blockchain events; expand privacy checks; test unauthorized modifications; inspect consent.
Consent currently stores preferences only and grants no sharing rights. Duplicate-event
processing also needs a distinction between database uniqueness and unimplemented indexer retry logic.

Official references: [local Supabase and Studio](https://supabase.com/docs/guides/local-development/cli/getting-started),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[password authentication](https://supabase.com/docs/guides/auth/passwords).
