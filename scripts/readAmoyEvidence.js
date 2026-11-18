const { Interface, formatEther, keccak256 } = require("ethers");
const sample = require("../indexer/sample-run/data.json");
const simulation = require("../indexer/sample-run/simulation-result.json");

const endpoint = "https://polygon-amoy-bor-rpc.publicnode.com";
const explorer = "https://amoy.polygonscan.com/tx/";
const contracts = {
  RegistryFactory: "0xD93549E8a45895F323705D90467396012AA85E2e",
  IssuerRegistry: "0xf79C0a6FA5638Fa02A89A80048F77DdE6cdD6065",
  SelfReportedRegistry: "0x506cCA5F20F48a0E47e3AEe29067B93A72A36405",
  CredentialRegistry: "0xD3333358dE40D64F4d4dfCa035a593de42C73CAc",
  SelfReportedRevocation: "0x21cA9C8D891D352AbbD3B4871ED50dB8E1831B47",
  DocumentRegistryTemplate: sample.registries[0].verification_registry,
  RevocationRegistry: sample.registries[0].revocation_registry,
};

function artifact(name) {
  const source = name === "SelfReportedRevocation" ? "RevocationRegistry" : name;
  return require(`../artifacts/contracts/${source}.sol/${source}.json`);
}

let id = 0;
async function rpc(method, params = []) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const { result, error } = await response.json();
  if (error) throw new Error(`${method}: ${error.message}`);
  return result;
}

const hex = (n) => `0x${n.toString(16)}`;
const block = (number) => rpc("eth_getBlockByNumber", [typeof number === "string" ? number : hex(number), false]);
const sameHex = (a, b) => a?.toLowerCase() === b?.toLowerCase();
const decimal = (value) => BigInt(value).toString();

async function findBlock(time, low, high) {
  const seconds = Date.parse(time) / 1000;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (Number((await block(mid)).timestamp) < seconds) low = mid + 1;
    else high = mid;
  }
  if (Number((await block(low)).timestamp) !== seconds) throw new Error(`No block at ${time}`);
  return low;
}

async function measure(label, txHash, range) {
  const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
  const tx = await rpc("eth_getTransactionByHash", [txHash]);
  if (!receipt || !tx || !sameHex(receipt.blockHash, tx.blockHash) || receipt.status !== "0x1") {
    throw new Error(`Missing or unsuccessful receipt: ${label}`);
  }
  const time = new Date(Number((await block(receipt.blockNumber)).timestamp) * 1000).toISOString();
  const fee = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice);
  return {
    range, label, txHash, explorer: explorer + txHash,
    blockNumber: decimal(receipt.blockNumber), blockHash: receipt.blockHash, time,
    from: tx.from, to: tx.to, selector: tx.input.slice(0, 10),
    gasUsed: decimal(receipt.gasUsed), effectiveGasPriceWei: decimal(receipt.effectiveGasPrice),
    feeWei: fee.toString(), feeTestPOL: formatEther(fee), status: 1,
  };
}

async function eventReceipt(label, contract, event, topics, time, anchor) {
  // The sample run and the later student simulation are less than a day apart.
  const n = await findBlock(time, Math.max(0, anchor - 80_000), anchor + 20_000);
  const origin = contracts[contract];
  const signature = new Interface(artifact(contract).abi).getEvent(event).topicHash;
  const logs = await rpc("eth_getLogs", [{ address: origin, fromBlock: hex(n), toBlock: hex(n), topics: [signature, ...topics] }]);
  if (logs.length !== 1) throw new Error(`Expected one matching ${event} for ${label}`);
  const row = await measure(label, logs[0].transactionHash, "fixed-demo");
  if (row.time !== time) throw new Error(`Unexpected receipt timestamp for ${label}`);
  return row;
}

async function main() {
  const chainId = Number(await rpc("eth_chainId"));
  if (chainId !== 80002) throw new Error("Expected Polygon Amoy");
  const pinned = await block("latest");
  const bytecode = {};
  for (const [name, address] of Object.entries(contracts)) {
    const chain = await rpc("eth_getCode", [address, pinned.number]);
    const local = artifact(name).deployedBytecode;
    if (chain === "0x") throw new Error(`No runtime at ${address}`);
    bytecode[name] = {
      address, chainHash: keccak256(chain), localHash: keccak256(local),
      exactRuntimeMatch: sameHex(chain, local),
    };
  }
  const rows = [];
  for (const { step, hash } of simulation.txHashes) {
    rows.push(await measure(step, hash, "student-simulation"));
  }
  const anchor = Number(rows[0].blockNumber);
  const registry = sample.registries[0];
  const degree = sample.documents[0];
  const link = sample.credential_links[0];
  const cert = sample.self_reported.find((entry) => sameHex(entry.doc_id, link.child_doc_id));
  const degreeRevoke = sample.revocations.find((entry) => sameHex(entry.hash, degree.doc_hash));
  const issuer = sample.issuers[0];
  const issuerTopic = "0x" + issuer.address.slice(2).toLowerCase().padStart(64, "0");
  const events = [
    ["addIssuer", "IssuerRegistry", "IssuerAdded", [issuerTopic], issuer.updated_at],
    ["createRegistry", "RegistryFactory", "RegistryCreated", ["0x" + "1".padStart(64, "0"), issuerTopic], registry.created_at],
    ["registerDocument", "DocumentRegistryTemplate", "DocumentRegistered", [degree.doc_id], degree.registered_at],
    ["SelfReportedRegistry.register", "SelfReportedRegistry", "EntryRegistered", [cert.doc_id], cert.registered_at],
    ["linkCredential", "CredentialRegistry", "CredentialLinked", [link.child_doc_id], link.linked_at],
    ["revoke", "RevocationRegistry", "Revoked", [degree.doc_hash], degreeRevoke.revoked_at],
  ];
  for (const event of events) rows.push(await eventReceipt(...event, anchor));
  const credential = contracts.CredentialRegistry;
  const iface = new Interface(artifact("CredentialRegistry").abi);
  const wiring = {};
  for (const [getter, expected] of Object.entries({
    selfReportedRegistry: contracts.SelfReportedRegistry,
    issuerRegistry: contracts.IssuerRegistry,
    registryFactory: contracts.RegistryFactory,
  })) {
    const result = await rpc("eth_call", [{ to: credential, data: iface.encodeFunctionData(getter) }, pinned.number]);
    const [address] = iface.decodeFunctionResult(getter, result);
    if (!sameHex(address, expected)) throw new Error(`Unexpected Amoy wiring: ${getter}`);
    wiring[getter] = address;
  }
  console.log(JSON.stringify({ chainId, codeCheckedAtBlock: decimal(pinned.number), bytecode, wiring, rows }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
