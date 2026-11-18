# D35: Amoy baseline and Ethereum Sepolia replay

**Status:** Amoy runtime and selected transaction receipts verified. Local tests and full replay pass. Public Sepolia deployment awaits a funded test wallet; there are no Sepolia measurements yet.

## Build and local verification

- Source: [Neil's `docs/context` commit `37155af`](https://github.com/neildewan7/vera-credentials/commit/37155afa65548366435f7584da787ddece9b898c). The local review branch is `zihan/sepolia-testing`. Its changes leave the Solidity sources unchanged.
- The November 5 UTC Gradescope checkpoint archive (445310698) has the older contracts and factory-only deploy script. Its **77** tests passed locally. The selected branch compiled **10** Solidity files and passed **88** tests on Hardhat, including the permission regression checks and the degree → self-report → link → revoke workflow.
- Node 24.18.0, npm 11.16.0, locked Hardhat 2.28.6 and ethers 6.16.0; Solidity `0.8.20+commit.a1b79de6`, optimizer on (200 runs), EVM target Paris. Compile the Solidity files with LF line endings: Windows CRLF changes the metadata and bytecode hashes.
- [Amoy evidence](amoy-receipts.json) compares seven exact runtime hashes from block **53172748** (chain 80002). The factory, issuer registry, self-reported registry, credential registry, document template, and both revocation addresses match. The live credential registry also points to the recorded factory, issuer registry and self-reported registry. This verifies runtime identity; the original four deployment receipts and creation input were not recovered.
- [Hardhat dry run](hardhat-dry-run.json) contains **4** deployment and **7** workflow receipts. The fake local wallet spent no public funds. The test checks confirmed the degree transitions Unknown → Active → Revoked, the self-reported credential remains Active after degree revocation and becomes Revoked after its own revocation, and the link can be read back.

```sh
npm ci --ignore-scripts
npx --no-install hardhat test --network hardhat
npx --no-install hardhat run scripts/benchmarkSepolia.js --network hardhat
node scripts/readAmoyEvidence.js
```

The last command only reads an Amoy public RPC and needs the compiled artifacts. Save its output separately if rechecking; the current code block may differ from the recorded block. Explorer links in the JSON are derived from the receipts.

## Matched workflow and observed costs

Replayed the fixed Amoy demo with the same synthetic registry name, config hash, document IDs and hashes, placeholder URIs, role pattern, and revocation reasons. The wallet and contract addresses are chain specific; count different zero bytes in calldata when inspecting small gas differences. The archived Amoy setup was done in a different transaction window from the five workflow actions on November 15 UTC, on existing contracts. The replay starts with fresh contracts. Historical Amoy and the eventual Sepolia run should be described as an observed comparison, with state and date differences called out. To isolate network effects further, repeat the whole workflow on fresh matching contracts on both testnets, in the same time window and with identical inputs and role layout.

| Action | Amoy gasUsed | Amoy effectiveGasPrice (gwei) | Fee (test POL) | Sepolia status |
|---|---:|---:|---:|---|
| [Approve issuer](https://amoy.polygonscan.com/tx/0xfa3c597d8da211ea4dbf8e924fdfe867cdb4b9e561183ac3c1d1a93c35afc441) (setup) | 53,925 | 30 | 0.00161775 | Pending |
| [Create document registry pair](https://amoy.polygonscan.com/tx/0x3f06ecd5053b602e9683b877b280e6a07b2c14868ea7b8e6b6dbd92d6bf3301f) | 1,439,106 | 30 | 0.04317318 | Pending |
| [Register degree](https://amoy.polygonscan.com/tx/0x4c6d5c2eadd438bfaef01aa6d23182b7b8aa56af54fc0c443faec63046c8bdac) | 199,863 | 50 | 0.00999315 | Pending |
| [Register self-reported credential](https://amoy.polygonscan.com/tx/0x18331f02f6aa4ca6fb45f4c58008330c203b785237fffd3b1198e6f21b528266) | 167,859 | 50 | 0.00839295 | Pending |
| [Link credential](https://amoy.polygonscan.com/tx/0xbcae9c55f4ee71109a64d08d6105d4430f5bdb83bfe651b013f4703aca69f37e) | 183,025 | 50 | 0.00915125 | Pending |
| [Revoke degree](https://amoy.polygonscan.com/tx/0x2a45364948fb1f49c10f9d4031804df6a66fe3a6a0aa2732863dd673d444d868) | 86,294 | 50 | 0.00431470 | Pending |
| Revoke self-reported credential | No matched receipt | — | — | Pending |
| **Subtotal of six observed actions** | **2,130,072** | | **0.07664298** | |

The separate student simulation in the JSON is corroboration only. Do not add it to this subtotal or combine it with the old pre-fix gas table in `docs/DEPLOYMENTS.md`. Use each receipt's actual `gasUsed × effectiveGasPrice` in wei and divide by 10¹⁸ for the chain's native test token. Record deployments separately from the workflow and exclude unmatched rows from that subtotal on both networks. `verify` and `getLink` are read calls in this run and generate no paid transaction. Use gas units for the matched computational comparison and report each chain's native test-token fee separately; these observations do not establish mainnet fees or a fiat price comparison. [Ethereum JSON-RPC receipt fields](https://ethereum.org/developers/docs/apis/json-rpc/#eth_gettransactionreceipt).

## Public Sepolia run

Use Ethereum Sepolia (chain ID 11155111). The older team note also mentions Arbitrum Sepolia; that would be a distinct network and experiment.

1. Create a fresh wallet for this experiment and claim faucet test ETH. Share only the public address for balance checks. Keep all signing material in your own local wallet or terminal, and keep the test account empty on mainnet.
2. After team confirmation, choose a total fee cap in test ETH based on the current Sepolia quote. Configure `SEPOLIA_RPC_URL` and `PRIVATE_KEY` in your own terminal session. Set `D35_BROADCAST=sepolia` and `D35_MAX_TEST_ETH` to the chosen cap, then run `npx --no-install hardhat run scripts/benchmarkSepolia.js --network sepolia`. Do not run the old factory-only shortcut; it will not deploy the complete system.
3. The script checks the actual chain ID, checks the four local runtime hashes against Amoy, caps each transaction's worst-case fee within the remaining budget, and sends zero ETH with every call. It journals hashes and then confirmed receipts in `cache/d35/`. If a run stops, check the journal and the last hash before resuming or starting a new deployment.
4. For review, record the commit, deployed addresses, wiring checks, receipt links and UTC time, gas used, effective gas price and total native fee. Keep Sepolia rows pending until the receipts exist. Leave `.env` and credentials outside any review diff.
