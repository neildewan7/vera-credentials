# Implementation report (as of 2026-11-04)

How to reproduce everything in this report: `npm install`, `npx hardhat compile`, `npx hardhat test`. For the live testnet check, `npx hardhat run scripts/checkAmoyDeploy.js --network amoy`.

## Status summary

- 9 contracts, 77 tests passing, 0 failing.
- `RegistryFactory` deployed and confirmed live on Polygon Amoy testnet (see `docs/DEPLOYMENTS.md`) — read back `nextRegistryId()` directly from chain to confirm.
- `IssuerRegistry`, `SelfReportedRegistry`, `CredentialRegistry` built and tested locally, not yet deployed to a testnet (standalone contracts, not created through the factory — need their own deploy step).
- No end-to-end integration test yet combining all five pieces in one flow (tracked as a separate task).
- `DatasetRegistryTemplate` / `MediaRegistryTemplate` still on the old behavior (no holder field, no `verify()`) — decision pending on whether to extend or drop them.

## How we're testing correctness

Two layers:

1. **Unit tests per contract** (Hardhat + Chai, `test/*.test.js`) — each contract's functions are tested in isolation: happy path, access-control rejections, edge cases (zero addresses, duplicate registration, double-revocation, etc.).
2. **A live read against the real testnet deployment** — proves the compiled bytecode actually behaves correctly once mined on a real chain, not just inside Hardhat's local simulation. This matters because local tests run against an ephemeral in-memory chain that resets every run; a live read confirms the deployed, permanent contract responds correctly.

What's still missing: an **integration test** exercising the full cross-contract flow in one sequence (an issuer registers a degree, a holder self-reports an external credential, links it, the issuer revokes something, `verify()` reflects it correctly throughout). Each contract is tested alone; nothing yet proves all five work together end to end. This is the next priority.

## Contracts, one by one

### `RegistryFactory`
Deploys a paired verification template + `RevocationRegistry` for whoever calls `createRegistry()`. Deliberately left ungated (see `docs/DECISIONS.md`) — trust is decided downstream by `IssuerRegistry`, not by blocking who can deploy. Unchanged from the original Vera import except for being the thing other new contracts build around.
**Tested:** registry creation for all three template types, event emission, record storage, owner tracking. 13 tests.

### `DocumentRegistryTemplate`
Per-issuer contract holding registered documents. This quarter's main fix lives here:
- Added a `holder` field (independent of `issuer`) and a `holderOf()` getter.
- Added `verify(docId, docHash)` — returns `Unknown` / `Active` / `Revoked` by actually calling the paired `RevocationRegistry.isValid()`. The old `verifyDocument()` is kept unchanged (ignores revocation) for backward compatibility, but is no longer the recommended entry point.
- `DocumentRegistered` event now includes `holder` (it didn't originally — fixed so an indexer doesn't need an extra read call per registration).
**Tested:** registration, revocation lifecycle, the holder field, all four `verify()` outcomes (never-registered, active, revoked, tampered-hash). 24 tests across the factory suite + a dedicated holder/verify test file.

### `RevocationRegistry`
Unchanged from the original import. One owner, tracks registered/revoked status per hash, 10 revocation reasons. This is what `verify()` now actually calls.
**Tested:** register/revoke lifecycle, permission checks, isolation between separately-deployed registries, all 10 revocation reasons individually.

### `IRevocationRegistry`
Minimal interface. Added `isValid()` this quarter (previously only declared `register()`) — needed so `verify()` can call it through the interface rather than the concrete type.

### `IssuerRegistry` — new
Owner-controlled allowlist. `addIssuer()` / `removeIssuer()` / `isIssuer()`. This is what decides whether a credential counts as "verified" in a report — not whether someone can create a registry.
**Tested:** add/remove, access control, zero-address rejection, ownership transfer. 10 tests.

### `SelfReportedRegistry` — new
One single shared contract (not per-holder, not via the factory). Anyone can call `register()` directly; `holder` is always `msg.sender` — no issuer approval, by design, since this is explicitly the "no one can verify this was really issued by who they say" path. Owns its own paired `RevocationRegistry` and exposes `revokeMine()` so only the original holder can pull back their own entry — a deliberate deviation from `RevocationRegistry`'s normal single-owner model, which doesn't fit "many holders, each can only touch their own."
**Tested:** open registration, holder-always-equals-sender, duplicate rejection, `verify()`'s three states, holder-only revocation, rejection of a non-holder trying to revoke someone else's entry. 10 tests.

### `CredentialRegistry` — new
Holds links only, never credential data — "this self-reported entry belongs to that degree." Called directly by the holder's own wallet; no signature verification needed since the holder is always the one submitting the transaction. The security-critical check: confirms `msg.sender` is the holder of *both* the self-reported entry and the parent degree, and that the parent registry's `owner` is an approved issuer, before recording the link.
**Tested, explicitly including the attack cases:** successful link, rejecting a caller who doesn't hold the credential, rejecting a caller who doesn't hold the parent degree (the spoofing case), rejecting a link into a registry whose owner isn't an approved issuer, rejecting a duplicate link. 6 tests.

## What the numbers mean

77 passing tests is a necessary but not sufficient signal — it proves each contract does what its own tests expect, not that the whole system is free of design gaps. The honest open items: no cross-contract integration test yet, Dataset/Media inconsistency, and only one of five new/modified contracts is actually deployed to a testnet so far.
