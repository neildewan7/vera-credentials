# Deployments

Record every deploy here: network, address, date, deployer, what commit it was built from. Never delete rows, append new ones (a redeploy gets a new row, the old one stays for history).

| Network | Contract | Address | Date | Commit | Notes |
|---|---|---|---|---|---|
| Polygon Amoy | RegistryFactory | `0x7acBD69Cdb8B1B206747c4163454231D3Ccd2F2F` | 2026-11-04 | `e0c8541` | Practice deploy (issue #8) — confirms the deploy pipeline works. |
| Polygon Amoy | IssuerRegistry | `0xf79C0a6FA5638Fa02A89A80048F77DdE6cdD6065` | 2026-11-05 | (uncommitted — see PR with this deploy) | Deployed via `scripts/deployStandalone.js` (issue #9). |
| Polygon Amoy | SelfReportedRegistry | `0x506cCA5F20F48a0E47e3AEe29067B93A72A36405` | 2026-11-05 | (uncommitted — see PR with this deploy) | Deploys and links its own `RevocationRegistry` at `0x21cA9C8D891D352AbbD3B4871ED50dB8E1831B47`. |
| Polygon Amoy | CredentialRegistry | `0xe302f99956DDcc5faBC06B1ca2B42a3dDdEB5548` | 2026-11-05 | (uncommitted — see PR with this deploy) | Constructor args: the SelfReportedRegistry and IssuerRegistry addresses above. Confirmed via `scripts/checkAmoyDeploy.js`. |

## Live gas report — Polygon Amoy (2026-11-05)

Full end-to-end flow run for real via `scripts/demoFlowAmoy.js` (not simulated — real transactions, real confirmations):

| Step | Function | Gas used |
|---|---|---|
| 1 | `IssuerRegistry.addIssuer` | 53,925 |
| 2 | `RegistryFactory.createRegistry` | 1,413,544 |
| 3 | `DocumentRegistryTemplate.registerDocument` | 199,863 |
| 4 | `SelfReportedRegistry.register` | 167,859 |
| 5 | `CredentialRegistry.linkCredential` | 168,820 |
| 6 | `RevocationRegistry.revoke` | 86,294 |
| 7 | `SelfReportedRegistry.revokeMine` | 117,814 |
| **Total** | | **2,208,119** |

`createRegistry` is 64% of total gas — the one-time cost of the factory pattern deploying a fresh contract pair per issuer. Every other action (registering, self-reporting, linking, revoking) is an order of magnitude cheaper. Worth citing directly in the chain-comparison writeup (issue #9) and the cost-analysis section of the report.

Correctness also confirmed live: `verify()` on the degree correctly returned Active -> Revoked across the revoke step, and the self-reported cert's status was correctly unaffected by the degree's revocation (independent records) before being separately revoked by its own holder.

Still needed for issue #9: run this same script against a second testnet (Arbitrum Sepolia) for a real comparison, then pick the final chain.

## Security fix — CredentialRegistry parentRegistry spoofing (2026-11-05)

Audit found `CredentialRegistry.linkCredential()` never verified `parentRegistry` was a genuine, factory-deployed registry — it trusted whatever contract address the caller supplied to honestly report `owner()`/`holderOf()`. Confirmed exploitable via a proof-of-concept (`contracts/test-helpers/FakeRegistry.sol`, `test/AuditPoC.test.js`): an attacker could fabricate a fake registry claiming to be owned by a real approved issuer, and link their own junk credential to a completely made-up degree.

**Fix:** `RegistryFactory` now tracks `isRegistry[address]` for every verification registry it deploys. `CredentialRegistry`'s constructor takes the factory's address, and `linkCredential()` now requires `registryFactory.isRegistry(parentRegistry)` before trusting anything the parent registry reports. Confirmed fixed — the same PoC now correctly reverts with `"Parent registry was not deployed by the factory"`, and the legitimate linking path is unaffected (88 tests passing).

**This required redeploying `RegistryFactory` and `CredentialRegistry`** (bytecode changed); `IssuerRegistry` and `SelfReportedRegistry` are unchanged and were not redeployed.

| Network | Contract | Address | Date | Notes |
|---|---|---|---|---|
| Polygon Amoy | RegistryFactory (fixed) | `0xD93549E8a45895F323705D90467396012AA85E2e` | 2026-11-05 | Replaces `0x7acBD69Cdb8B1B206747c4163454231D3Ccd2F2F` — old one lacks `isRegistry` tracking, should not be used going forward. |
| Polygon Amoy | CredentialRegistry (fixed) | `0xD3333358dE40D64F4d4dfCa035a593de42C73CAc` | 2026-11-05 | Replaces `0xe302f99956DDcc5faBC06B1ca2B42a3dDdEB5548` — old one is exploitable, should not be used going forward. |

## Fixed contracts re-exercised live (2026-11-05)

Re-ran the full flow against the fixed `RegistryFactory`/`CredentialRegistry` (not just read-checked this time) — `linkCredential` on the fixed contract succeeded for real (183,025 gas), closing the gap where the fix was only proven locally. `revoke` also succeeded (degree -> Revoked, confirmed live). The final step (`revokeMine`) hit a transient `ECONNRESET` on the public RPC endpoint — infrastructure, not a contract issue; not yet retried.

## Indexer (issue #10) — first working pass (2026-11-05)

Built `indexer/schema.sql` (Supabase-ready schema), `indexer/store.js` (local JSON-file store matching that schema, until Supabase is provisioned — issue #12), and `indexer/listener.js` (reads every event from the fixed contracts above via chunked `eth_getLogs` calls, since the public RPC caps queries at 10,001 blocks). Run via `scripts/runIndexer.js --network amoy`.

Confirmed working against real Amoy data: correctly indexed 1 issuer, 1 registry, 1 document (degree), 2 self-reported entries, 1 credential link, and 2 revocations (correctly scoped to their own registry's revocation contract) — every field cross-checked against the actual transactions run above.

**Known limitations, honest:** one-shot backfill only (re-run manually, doesn't listen continuously), looks back a fixed 30,000-block window rather than tracking a "last indexed block" cursor, and only indexes `DOCUMENT`-type registries (Dataset/Media not wired in, since neither has been used on-chain yet).

## Ethereum Sepolia — 2026-11-18 (UTC)

Deployer: 0x6D0D47CaD9AF825083E5dB6FF844A31Dab804Ed3. Contract sources: 37155afa65548366435f7584da787ddece9b898c.

| Contract | Address | Deployment receipt |
|---|---|---|
| RegistryFactory | 0x0F5C076B1392572Ac8f22dc3b4882a32Ad08A6bd | [0x19239cf7a7dff2c36f49ac929e0e95f52235459c47cc185085a5eda39119b625](https://sepolia.etherscan.io/tx/0x19239cf7a7dff2c36f49ac929e0e95f52235459c47cc185085a5eda39119b625) |
| IssuerRegistry | 0x8ff854E484231be668319eA05646c27289B4D591 | [0x63f7593af1bee88895b13471496cd94256cff40e177220c93e1758a2c5ed9022](https://sepolia.etherscan.io/tx/0x63f7593af1bee88895b13471496cd94256cff40e177220c93e1758a2c5ed9022) |
| SelfReportedRegistry | 0x3Edcb4eC27995C9D87D0B9E4a14ae44d8f7a697A | [0xccf18351377fe8afba403d874475def56ebb353db394c0f16230dfbc61593d1c](https://sepolia.etherscan.io/tx/0xccf18351377fe8afba403d874475def56ebb353db394c0f16230dfbc61593d1c) |
| CredentialRegistry | 0xb3745c9fe129D4d7f2fAD3Bb230E9E2C95334EE7 | [0x3c996adc3d6244a156041c0c4db2d18894bd0319709175c399b8cd741a8c26d0](https://sepolia.etherscan.io/tx/0x3c996adc3d6244a156041c0c4db2d18894bd0319709175c399b8cd741a8c26d0) |

[Workflow receipts, runtime verification and matched Amoy comparison](d35-sepolia/README.md).
