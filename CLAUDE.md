# Project context for Claude Code

## What this project is
UCSD DSC 180A/B capstone (blockchain domain, mentor Prof. Rajesh Gupta, team of four). We extend last year's Vera project, a blockchain registry that stores document hashes. Goal: a basic, extensible system (not a full CRM) that other students can build on, in which each person's HDSI degree is the root of their identity and credentials from other issuers can be attached to it and verified. A recruiter or department user looks a person up and gets a report showing what is verified, and at what trust level.

Mentor's bar: it should only be possible because of blockchain. Be honest in code comments and docs about what the chain adds and what it does not.

## Current state (2026-11-01)
- Repo is an import of Vera's `onchain` Hardhat project: `contracts/`, `test/`, `scripts/`, `hardhat.config.js`.
- Hardhat 2, Solidity 0.8.20, 44 tests passing, CI on GitHub Actions.
- Contracts: `RegistryFactory`, `DocumentRegistryTemplate`, `DatasetRegistryTemplate`, `MediaRegistryTemplate`, `RevocationRegistry`, `IRevocationRegistry`. The factory creates a paired verification + revocation registry per issuer.
- Known gaps in Vera: the verification contract ignores revocation (the revocation registry has its own validity check); anyone can create a registry; approvals were enforced off-chain in Supabase; the app hashed base64 text, not file bytes; Vera's own repo contains a leaked deployer key (never use it).

## What we are building (planned)
On chain: `IssuerRegistry` (allowlist, later multisig-owned), gated `createRegistry`, holder on each document record, `verify()` returning Active / Revoked / Unknown, `CredentialLinks` (holder-signed link from a credential to its parent degree).
Off chain: indexer (optional cache of chain events), verification service (checks the chain), report generator, Supabase for files, metadata, search and consent only.
Apps: issuer app, credential adding, user profile, CRM dashboard.
Trust levels shown in reports: verified (approved issuer, on-chain), externally checkable (link only), self-reported.
Plan and dates: see `docs/TIMELINE.md`. Keep it updated.

## Conventions
- Never commit `.env` or any key. Env names: `PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `AMOY_RPC_URL`, `ARBITRUM_SEPOLIA_RPC_URL` (see `.env.example`). Use throwaway keys on testnets only.
- Work on branches and open pull requests; CI (compile + tests) must pass before merging.
- Every contract change needs tests. Update the existing tests when signatures change. If Dataset/Media templates are removed, remove their tests.
- Keep personal data off-chain. On-chain: hashes of whole files, issuer addresses, holder wallet. Use synthetic data only (student records are protected by FERPA).
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

## Open questions (do not assume answers)
Meaning of "CRM" and "production" for the mentor; department view scope; what counts as "data" for the report; final chain choice (Polygon Amoy is the default, to be decided by measured gas cost against Arbitrum Sepolia and Base Sepolia).
