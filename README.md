# Vera — Credential Registry (DSC 180A/B Capstone)

UCSD DSC 180A/B capstone, blockchain domain, mentor Prof. Rajesh Gupta. Extends last year's Vera project (`FerdGitUCSD/b10-blockchain-blockthentic`) — credit to that team for the original factory + template + revocation-registry pattern this repo builds on.

**What this is:** a smart-contract system where an HDSI degree is the root of a person's verifiable identity, and other credentials (certificates, external qualifications) can attach to it with a clear trust level — issuer-verified, or self-reported. See `CLAUDE.md` for full project context and `docs/DECISIONS.md` for the reasoning behind specific design choices.

This quarter's prototype uses synthetic credentials on Polygon Amoy and Ethereum Sepolia. A local event indexer exports registry activity to JSON.

## Repo structure

```
contracts/   Solidity contracts (see below)
test/        Hardhat/Chai tests, one file per contract or feature area
scripts/     Deploy scripts and a live-deployment sanity check
indexer/     Event listener, local store, and a sample run
docs/        Project context: decisions log, timeline, deployments record, report drafts
```

### Contracts

| Contract | What it does |
|---|---|
| `RegistryFactory` | Deploys a paired verification template + `RevocationRegistry` for whoever calls `createRegistry()`. Deliberately ungated — see `docs/DECISIONS.md`. |
| `DocumentRegistryTemplate` | Per-issuer registry for documents (e.g. degrees, certificates). Has a `holder` field and `verify()` (checks revocation; the original `verifyDocument()` does not, kept for backward compatibility). |
| `DatasetRegistryTemplate` / `MediaRegistryTemplate` | Record dataset or media hashes and their holders. `holderOf()` returns the holder and `verify()` checks the paired revocation registry. |
| `RevocationRegistry` | Tracks registered/revoked status per hash for one paired verification registry. |
| `IRevocationRegistry` | Minimal interface used by the templates to call their paired revocation registry. |
| `IssuerRegistry` | Owner-controlled allowlist of approved issuers — decides what counts as *verified*, not who can create a registry. |
| `SelfReportedRegistry` | One single shared contract. Anyone can register their own credential directly (`holder` is always `msg.sender`); only the original holder can revoke their own entry. |
| `CredentialRegistry` | Links a `SelfReportedRegistry` entry to a degree in an issuer's registry. Called directly by the holder; checks the caller holds both records and that the parent registry's owner is an approved issuer. |

## Running it

```bash
npm ci
npx hardhat compile
npx hardhat test
```

To run a local node and deploy against it:

```bash
npx hardhat node
npx hardhat run scripts/deployFactory.js --network localhost
```

For a factory-only deployment on a public testnet, copy `.env.example` to `.env` and configure a testnet RPC URL and a dedicated test wallet:

```bash
npx hardhat run scripts/deployFactory.js --network amoy
# or: --network sepolia / --network arbitrumSepolia
```

`scripts/checkAmoyDeploy.js` does a live read against the current Amoy deployment, as a sanity check that a deployed contract actually responds on-chain.

## Current status

The local suite covers [88 contract tests](docs/d35-sepolia/hardhat-tests.txt) and one [wallet recovery test](test/WalletRecovery.test.js). On Ethereum Sepolia the team deployed four contracts and ran seven workflow transactions. Six operations have matching Polygon Amoy receipts. See the [comparison and full workflow instructions](docs/d35-sepolia/README.md) for gas usage, fees, and transaction links, or the [deployment log](docs/DEPLOYMENTS.md) for addresses.

## More context

- `CLAUDE.md` — project context, architecture decisions, open questions
- `docs/DECISIONS.md` — decisions log with reasoning, status, and dates
- `docs/TIMELINE.md` — weekly plan and course deadlines
- `docs/DEPLOYMENTS.md` — every testnet deployment, by network and date
