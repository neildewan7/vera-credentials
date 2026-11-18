# Sample run — captured output

These files are **saved output from a real run**, kept as a reference snapshot — not live data and not source code. They are the actual result of running the indexer and the student simulation against the live Polygon Amoy testnet on 2026-11-05, kept as evidence that the pipeline works end to end against real on-chain data.

- `data.json` — what `indexer/listener.js` produced after reading every event off the deployed contracts (1 issuer, 1 registry, 1 degree, 2 self-reported entries, 1 credential link, 2 revocations). Every field here traces back to a confirmed on-chain transaction.
- `simulation-result.json` — the record the student simulation wrote out: which degree, grades, and credentials were registered for the test student wallet, plus the transaction hashes (all independently checkable on amoy.polygonscan.com).

These are frozen on purpose. Re-running `scripts/runIndexer.js` writes a fresh `indexer/data.json` (git-ignored) rather than overwriting this snapshot.
