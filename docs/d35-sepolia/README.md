# D35: Amoy baseline and Ethereum Sepolia replay

**Completed on November 18, 2026.** All four Sepolia deployments and seven workflow transactions succeeded. The comparison below pairs six of those operations with the corrected Amoy run.

## Build and local verification

- Source: [Neil's `docs/context` commit `37155af`](https://github.com/neildewan7/vera-credentials/commit/37155afa65548366435f7584da787ddece9b898c). The local review branch is `zihan/sepolia-testing`. Its changes leave the Solidity sources unchanged.
- The November 5 UTC Gradescope checkpoint archive (445310698) has the older contracts and factory-only deploy script. Its **77** tests passed locally. The selected branch compiled **10** Solidity files and passed [**88** tests](hardhat-tests.txt) on Hardhat, including the permission regression checks and the degree → self-report → link → revoke workflow.
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

## Observed costs on Amoy and Ethereum Sepolia

Six workflow actions have a successful receipt on both chains. Sepolia consumed **5.47 times** the Amoy gas for those six actions. Creating a document registry pair accounted for the largest difference. All 11 Sepolia receipts recorded an effective gas price of **18 wei per gas** (0.000000018 gwei). The six Amoy receipts recorded 30 or 50 gwei. Each amount below is denominated in the native test token of its own chain.

| Action | Amoy gas used (receipt) | Amoy price (gwei) | Fee (test POL) | Sepolia gas used (receipt) | Sepolia price (gwei) | Fee (test ETH) |
|---|---:|---:|---:|---:|---:|---:|
| Approve issuer (setup) | [53,925](https://amoy.polygonscan.com/tx/0xfa3c597d8da211ea4dbf8e924fdfe867cdb4b9e561183ac3c1d1a93c35afc441) | 30 | 0.00161775 | [129,237](https://sepolia.etherscan.io/tx/0x5907c3b22fdd6d4d7146b0e3bf69de6c7da2da26cd70e2b50a0158194a1c38e1) | 0.000000018 | 0.000000000002326266 |
| Create document registry pair | [1,439,106](https://amoy.polygonscan.com/tx/0x3f06ecd5053b602e9683b877b280e6a07b2c14868ea7b8e6b6dbd92d6bf3301f) | 30 | 0.04317318 | [9,508,626](https://sepolia.etherscan.io/tx/0x4adbabce26a94a9f26d8a9b2810ea21ddd203d976af8031f0a5356b8896cc614) | 0.000000018 | 0.000000000171155268 |
| Register degree | [199,863](https://amoy.polygonscan.com/tx/0x4c6d5c2eadd438bfaef01aa6d23182b7b8aa56af54fc0c443faec63046c8bdac) | 50 | 0.00999315 | [694,675](https://sepolia.etherscan.io/tx/0xfb93e980e3e9f238aa0a414b2a207fa6682c7e1e19965f698f5ed65e97a17e4f) | 0.000000018 | 0.00000000001250415 |
| Register self-reported credential | [167,859](https://amoy.polygonscan.com/tx/0x18331f02f6aa4ca6fb45f4c58008330c203b785237fffd3b1198e6f21b528266) | 50 | 0.00839295 | [581,359](https://sepolia.etherscan.io/tx/0xf3d968e72f192fb1c9cd900cd88e28d3251962f2817455651c4fe18b1ec750a4) | 0.000000018 | 0.000000000010464462 |
| Link credential | [183,025](https://amoy.polygonscan.com/tx/0xbcae9c55f4ee71109a64d08d6105d4430f5bdb83bfe651b013f4703aca69f37e) | 50 | 0.00915125 | [492,805](https://sepolia.etherscan.io/tx/0x8e35d98ddd2b42dea474f71dbf23e2114bfe7ef27301c7e5d12edde8fc544cd1) | 0.000000018 | 0.00000000000887049 |
| Revoke degree | [86,294](https://amoy.polygonscan.com/tx/0x2a45364948fb1f49c10f9d4031804df6a66fe3a6a0aa2732863dd673d444d868) | 50 | 0.0043147 | [242,894](https://sepolia.etherscan.io/tx/0xa9a9516fc24fafae0c82d67aadee6d55958999ee2310e69a9dd3834b1706727f) | 0.000000018 | 0.000000000004372092 |
| Revoke self-reported credential | No matched receipt | — | — | [258,114](https://sepolia.etherscan.io/tx/0x030f48d597bb708ed1e5299b295482527805a829127d2fcbd12892aeaed18862) | 0.000000018 | 0.000000000004646052 |
| **Six matched actions** | **2,130,072** | | **0.07664298** | **11,649,596** | | **0.000000000209692728** |

The replay used matching runtime bytecode, registry name, config hash, document IDs and hashes, URIs, role pattern, and revocation reasons. Wallet and contract addresses differed. Amoy ran on November 14–15 UTC using existing contracts, with issuer approval in an earlier session. Sepolia ran on November 18 UTC with fresh contracts. These differences in time, chain rules, and starting state limit causal attribution. The measurements support a gas-unit comparison for this sample. A fiat or mainnet cost ranking would need a separate pricing basis.

The six-row subtotal excludes standalone deployments, the final self-reported revocation and the separate student simulation in the Amoy data. The corrected Amoy workflow has no matched receipt for that final revocation. Read-only checks generated no transaction fees.

## Ethereum Sepolia deployment and validation

The four deployments consumed **35,364,046 gas** (0.000000000636552828 test ETH). The seven workflow writes consumed **11,907,710 gas** (0.00000000021433878 test ETH). Across all eleven transactions the fee was **0.000000000850891608 test ETH**. Fees use the receipt values gasUsed × effectiveGasPrice, summed in integer wei.

| Contract | Sepolia address | Gas used | Fee (test ETH) |
|---|---|---:|---:|
| RegistryFactory | [0x0F5C076B1392572Ac8f22dc3b4882a32Ad08A6bd](https://sepolia.etherscan.io/address/0x0F5C076B1392572Ac8f22dc3b4882a32Ad08A6bd) | [22,508,868](https://sepolia.etherscan.io/tx/0x19239cf7a7dff2c36f49ac929e0e95f52235459c47cc185085a5eda39119b625) | 0.000000000405159624 |
| IssuerRegistry | [0x8ff854E484231be668319eA05646c27289B4D591](https://sepolia.etherscan.io/address/0x8ff854E484231be668319eA05646c27289B4D591) | [1,716,119](https://sepolia.etherscan.io/tx/0x63f7593af1bee88895b13471496cd94256cff40e177220c93e1758a2c5ed9022) | 0.000000000030890142 |
| SelfReportedRegistry | [0x3Edcb4eC27995C9D87D0B9E4a14ae44d8f7a697A](https://sepolia.etherscan.io/address/0x3Edcb4eC27995C9D87D0B9E4a14ae44d8f7a697A) | [7,824,466](https://sepolia.etherscan.io/tx/0xccf18351377fe8afba403d874475def56ebb353db394c0f16230dfbc61593d1c) | 0.000000000140840388 |
| CredentialRegistry | [0xb3745c9fe129D4d7f2fAD3Bb230E9E2C95334EE7](https://sepolia.etherscan.io/address/0xb3745c9fe129D4d7f2fAD3Bb230E9E2C95334EE7) | [3,314,593](https://sepolia.etherscan.io/tx/0x3c996adc3d6244a156041c0c4db2d18894bd0319709175c399b8cd741a8c26d0) | 0.000000000059662674 |

At Sepolia block **12161059**, all seven runtime hashes matched the Amoy evidence, and the credential registry referenced the expected factory, issuer registry and self-reported registry. Both the degree and the self-reported credential returned Revoked. The link still resolved to the original holder and degree. During the workflow, revoking the degree left the self-reported credential Active until the holder revoked it in the final step. The first deployment was confirmed once and its original receipt was reused after an interrupted read. [Sepolia receipts, contract addresses, and verification block](sepolia-receipts.json).

## Reproducing the Sepolia run

Use Ethereum Sepolia (chain ID 11155111). The older team note also mentions Arbitrum Sepolia; that would be a distinct network and experiment.

1. Create a fresh wallet for this experiment and claim faucet test ETH. Share only the public address for balance checks. Keep all signing material in your own local wallet or terminal, and keep the test account empty on mainnet.
2. For MetaMask, run `node scripts/walletSepolia.js <public-address>` from the repository and open `http://127.0.0.1:18735` in the extension's browser. Confirm each Sepolia transaction in the wallet. This launcher requests zero transfer value, a total fee budget of 0.01 test ETH and the public Sepolia RPC. It uses only the public wallet address. If you already have a dedicated local terminal signer configured, the existing `scripts/benchmarkSepolia.js` entry point also accepts `D35_BROADCAST=sepolia` and a positive `D35_MAX_TEST_ETH` for the chosen budget.
3. The script checks the chain ID and Amoy runtime hashes, caps the requested fees, and sends zero ETH with each call. It records each transaction hash received from MetaMask in `cache/d35/` before looking up the transaction on the RPC node. To resume, run `node scripts/walletSepolia.js <public-address> <original-journal.jsonl>` using the journal path printed at startup. If MetaMask shows a broadcast that never reached the local server, check that transaction before signing again.
4. For review, record the commit, deployed addresses, wiring checks, receipt links and UTC time, gas used, effective gas price and total native fee. Leave `.env` and credentials outside any review diff.
