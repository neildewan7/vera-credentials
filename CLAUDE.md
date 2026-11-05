# Project context for Claude Code

## What this project is
UCSD DSC 180A/B capstone (blockchain domain, mentor Prof. Rajesh Gupta, team of four). We extend last year's Vera project, a blockchain registry that stores document hashes. Goal: a basic, extensible system (not a full CRM) that other students can build on, in which each person's HDSI degree is the root of their identity and credentials from other issuers can be attached to it and verified. A recruiter or department user looks a person up and gets a report showing what is verified, and at what trust level.

Mentor's bar: it should only be possible because of blockchain. Be honest in code comments and docs about what the chain adds and what it does not.

## Current state (2026-11-04)
- Repo is an import of Vera's `onchain` Hardhat project: `contracts/`, `test/`, `scripts/`, `hardhat.config.js`.
- Hardhat 2, Solidity 0.8.20, 77 tests passing, CI on GitHub Actions.
- Contracts: `RegistryFactory`, `DocumentRegistryTemplate`, `DatasetRegistryTemplate`, `MediaRegistryTemplate`, `RevocationRegistry`, `IRevocationRegistry`, `IssuerRegistry`, `SelfReportedRegistry`, `CredentialRegistry`. The factory still creates a paired verification + revocation registry per issuer (kept, not moved to a single shared registry — considered, rejected: more rework, loses bug isolation and per-issuer upgradeability, see decision below).
- `DocumentRegistryTemplate` now has a `holder` field (independent of `issuer`) and a `verify(docId, docHash)` function returning `Unknown`/`Active`/`Revoked` by actually checking the paired `RevocationRegistry` — fixes the gap described below. The old `verifyDocument()` (ignores revocation) is still present, unchanged, for backward compatibility. Holder field and `verify()` were only added to `DocumentRegistryTemplate`, not `DatasetRegistryTemplate`/`MediaRegistryTemplate` — those two are now inconsistent with Document and still need the same treatment or a decision to drop them (see conventions).
- Known gaps in the original Vera: the verification contract ignores revocation (now fixed on `DocumentRegistryTemplate` via `verify()`, see above); anyone can create a registry (still true — see decision below, this is now intentional); approvals were enforced off-chain in Supabase; the app hashed base64 text, not file bytes; Vera's own repo (`FerdGitUCSD/b10-blockchain-blockthentic`) contains a leaked deployer key and 3 Alchemy API keys, publicly committed (never use it; always generate a fresh throwaway key for this repo).

## Architecture decisions made this quarter
- **`createRegistry()` stays ungated.** `IssuerRegistry` does not block who can deploy a registry — registry contract addresses are never actually secret (they ship in app config and become public on first transaction regardless), so gating creation wouldn't have stopped spoofing anyway. Instead, `IssuerRegistry` gates *what counts as verified*: a report only trusts a credential if its registry's `owner` is an approved issuer.
- **`SelfReportedRegistry`**: one single shared contract (not per-holder, not via the factory). Anyone can register their own credential directly (`holder` is always `msg.sender`, no issuer approval needed). Only the original holder can revoke their own entry (`revokeMine()`) — it owns its own paired `RevocationRegistry` and gates revocation itself, since `RevocationRegistry`'s single-owner model doesn't fit "many holders, each can only touch their own entry."
- **`CredentialRegistry`**: links a `SelfReportedRegistry` entry to a degree in an issuer's `DocumentRegistryTemplate`. Holds pointers only, never credential data. Called directly by the holder's own wallet — no signature verification needed, since the holder is always the one submitting the transaction. Checks `msg.sender` is the holder of *both* the credential and the degree, and that the parent registry's owner is an approved issuer, or it reverts — this prevents linking a fake credential onto someone else's real degree.
- **HDSI-issued credentials never use the link contract.** If HDSI issues both a degree and a certificate, same `holder` + same trusted `issuer` already proves they belong together — no explicit link needed. The link contract exists only for the self-reported case, where there's no shared trusted issuer to imply the connection.
- **App split**: one shared app for issuers + holders (mobile, following last year's Blockthentic pattern), a separate web-based CRM/lookup tool for recruiters/department staff — not built yet, planned for Winter.

## What we are building (planned — Winter/Q2, not this quarter)
Off chain: indexer (watches `RegistryCreated` to discover new issuer registries, plus all other contract events — no direct chain↔Supabase link, the app/indexer is always the mediator), verification service (checks the chain), report generator, Supabase for files, metadata, accounts, consent only.
Apps: issuer + holder app (one shared app, role-based), separate CRM/lookup tool.
Trust levels shown in reports: verified (approved issuer, on-chain), externally checkable (link only), self-reported.
Plan and dates: see `docs/TIMELINE.md`. Keep it updated.

## Conventions
- Never commit `.env` or any key. Env names: `PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `AMOY_RPC_URL`, `ARBITRUM_SEPOLIA_RPC_URL` (see `.env.example`). Use throwaway keys on testnets only.
- Work on branches and open pull requests; CI (compile + tests) must pass before merging.
- Every contract change needs tests. Update the existing tests when signatures change. If Dataset/Media templates are removed, remove their tests. (Open: they currently lack the holder field/`verify()` that Document has — decide whether to extend them to match or drop them before the Nov 13 interface freeze.)
- Keep personal data off-chain. On-chain: hashes of whole files, issuer addresses, holder wallet. Default to synthetic data (student records are protected by FERPA, which covers alumni too — it doesn't end at graduation). Real HDSI degree/certificate data for graduates may be authorized per a conversation with the dean, but this is **not yet formally confirmed in writing** by the Registrar/FERPA compliance office — treat as unresolved and keep using synthetic data until it is. Even if confirmed, only hashes and wallet addresses ever go on-chain, never names or other PII in the clear — and hashing alone isn't anonymization if the input is guessable, so consider a salt if real data is used.
- Hash raw file bytes, not base64 text.
- Course rules: README must explain what is where and how to run/reproduce; configuration in files, not code; justify the structure; Q1 and Q2 projects use separate repos.

## Commands
- `npm install`
- `npx hardhat compile`
- `npx hardhat test`
- `npx hardhat node` then `npx hardhat run scripts/deployFactory.js --network localhost`

## How to work with the team
- Read the code before describing it. Do not invent function names or behavior; say when something is unverified.
- Label confidence on claims about what the code does, costs, or what the course requires.
- Ask before deploying to a public testnet, changing the contract interface after Gate G3, or deleting files.
- Prefer small, reviewable changes. Explain the reasoning briefly so teammates can follow it.
- Contract interface freeze is planned for Nov 13; changes after that need team agreement.
- Check the repo's GitHub Issues for the current task list before asking "what should I work on" — each issue's body has the specific scope (which events/tables/functions are involved) for that piece of work. See also `docs/DEPLOYMENTS.md` for addresses already deployed to testnets.

## What "production" means (answered by the mentor, 2026-11-04)
What we propose/build gets deployed to a public testnet, using synthetic data — that testnet deployment *is* the deliverable we pitch. Fully production-level (real HDSI integration, presumably real data and real users) is explicitly out of scope for this capstone; it happens after this project, if at all. This also means synthetic data is sufficient for the entire project, not just a fallback — real graduate data is not required to meet the mentor's bar.

## Open questions (do not assume answers)
For the mentor: meaning of "CRM", who the real first users are, department view scope, whether reusing last year's code as a base is fine for the code grade, whether there's a maintenance path after this team graduates.
For the dean/Registrar/compliance: no longer blocking, since synthetic data satisfies the project's actual bar — real graduate data use is optional, not required, so this doesn't need to be resolved before proceeding (still worth confirming eventually if the team wants to use real data for its own sake).
Team decisions still open: Dataset/Media templates — extend to match Document or drop; final chain choice (Polygon Amoy is the default, to be decided by measured gas cost against Arbitrum Sepolia and Base Sepolia); end-to-end integration test across all five contracts not yet written.
