# Vera — Credential Registry (DSC 180A/B Capstone)

UCSD DSC 180A/B capstone, blockchain domain, mentor Prof. Rajesh Gupta. Extends last year's Vera project (`FerdGitUCSD/b10-blockchain-blockthentic`) — credit to that team for the original factory + template + revocation-registry pattern this repo builds on.

**What this is:** a smart-contract system where an HDSI degree is the root of a person's verifiable identity, and other credentials (certificates, external qualifications) can attach to it with a clear trust level — issuer-verified, or self-reported. See `CLAUDE.md` for full project context and `docs/DECISIONS.md` for the reasoning behind specific design choices.

This quarter's scope is the on-chain contracts only, deployed to a public testnet with synthetic data (See `CLAUDE.md` for context). Supabase schema migrations and local SQL access tests are now available; hosted database provisioning, the database-backed indexer, verification backend, and app work remain pending. A one-shot JSON indexer exists. See [database setup and schema](docs/SUPABASE.md).

## Repo structure

```
contracts/   Solidity contracts (see below)
test/        Hardhat/Chai tests, one file per contract or feature area
scripts/     Deploy scripts, a live-deployment sanity check, the issuer track record and the simulator
scripts/lib/ Shared off-chain logic used by the scripts and their tests
config/      Settings for the scripts (per-network addresses, simulator parameters)
supabase/    Database migrations, RLS, local configuration, and SQL tests
docs/        Project context: decisions log, timeline, deployments record, report drafts
```

### Contracts

| Contract | What it does |
|---|---|
| `RegistryFactory` | Deploys a paired verification template + `RevocationRegistry` for whoever calls `createRegistry()`. Deliberately ungated — see `docs/DECISIONS.md`. |
| `DocumentRegistryTemplate` | Per-issuer registry for documents (e.g. degrees, certificates). Has a `holder` field and `verify()` (checks revocation; the original `verifyDocument()` does not, kept for backward compatibility). |
| `DatasetRegistryTemplate` / `MediaRegistryTemplate` | Same pattern as Document, for datasets and media. Both include the holder field and `verify()`; database projection remains Document-only. |
| `RevocationRegistry` | Tracks registered/revoked status per hash for one paired verification registry. |
| `IRevocationRegistry` | Minimal interface used by the templates to call their paired revocation registry. |
| `IssuerRegistry` | Owner-controlled allowlist of approved issuers — decides what counts as *verified*, not who can create a registry. |
| `SelfReportedRegistry` | One single shared contract. Anyone can register their own credential directly (`holder` is always `msg.sender`); only the original holder can revoke their own entry. |
| `CredentialRegistry` | Links a `SelfReportedRegistry` entry to a degree in an issuer's registry. Called directly by the holder; checks the caller holds both records and that the parent registry's owner is an approved issuer. |

## Running it

```bash
npm install
npx hardhat compile
npx hardhat test
```

To run a local node and deploy against it:

```bash
npx hardhat node
npx hardhat run scripts/deployFactory.js --network localhost
```

To deploy to a public testnet, copy `.env.example` to `.env` and fill in an RPC URL + a throwaway private key (never a real wallet), then:

```bash
npx hardhat run scripts/deployFactory.js --network amoy
# or: --network sepolia / --network arbitrumSepolia
```

`scripts/checkAmoyDeploy.js` does a live read against the current Amoy deployment, as a sanity check that a deployed contract actually responds on-chain.

### Issuer track record

Adds up each issuer wallet's on-chain history: credentials issued and credentials revoked, sorted by reason, combined across all registries the wallet owns. An issuer with no history is shown as **UNKNOWN**, not as clean. The script only reads data and needs no contract changes. Settings are in `config/trackRecord.json` (set `fromBlock` to the factory's deploy block before using it on a public chain).

```bash
npx hardhat run scripts/issuerTrackRecord.js --network amoy
ISSUER=0xabc... JSON=1 npx hardhat run scripts/issuerTrackRecord.js --network amoy
```

The chain makes this history append-only, and anyone can recompute it. It cannot make the revocation reasons truthful, because each issuer chooses its own. It also cannot see issuances made off-chain. See the header of `scripts/lib/trackRecord.js`.

### Simulator with fake users

Runs a reproducible scenario with synthetic data on the local Hardhat network (it refuses to run on public networks). The cast is honest, careless, rogue and idle issuers, plus honest holders and fake holders using six tactics. A verifier then judges every claim from chain data alone, and the simulator compares each verdict with the ground truth. It also prints each issuer's track record.

```bash
npx hardhat run scripts/simulate.js            # settings: config/simulation.json
SIM_CONFIG=my.json JSON=1 npx hardhat run scripts/simulate.js
```

What the default run shows: no fake claim reaches VERIFIED, and every attempt to link a fake credential onto a degree is blocked. Made-up self-reported certificates are still accepted, but only at the SELF_REPORTED trust level, because the chain can't judge their content. A careless issuer that hashes the wrong file makes genuine degrees fail to verify; if it never notices, its track record still looks clean.

## Current status

Contract suite: 103 tests passing after integrating the track-record/simulator branch with main. `RegistryFactory` is deployed and confirmed live on Polygon Amoy — see `docs/DEPLOYMENTS.md` for the address. Full contract-by-contract writeup, including exactly what's tested and what's not yet built, is in `docs/report/implementation.md`.

## More context

- `CLAUDE.md` — project context, architecture decisions, open questions
- `docs/DECISIONS.md` — decisions log with reasoning, status, and dates
- `docs/TIMELINE.md` — weekly plan and course deadlines
- `docs/DEPLOYMENTS.md` — every testnet deployment, by network and date
