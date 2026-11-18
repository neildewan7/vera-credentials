const assert = require("node:assert/strict");
const fs = require("node:fs");
const hre = require("hardhat");
const { ethers } = hre;

const chainIds = { hardhat: 31337, sepolia: 11155111 };
const deployments = ["RegistryFactory", "IssuerRegistry", "SelfReportedRegistry", "CredentialRegistry"];
const sample = require("../indexer/sample-run/data.json");
const { name: registryName, config_hash: configHash } = sample.registries[0];
const [{ doc_id: degreeId, uri: degreeUri }] = sample.documents;
const { child_doc_id: certId } = sample.credential_links[0];
const { uri: certUri } = sample.self_reported.find((entry) => entry.doc_id === certId);
const status = { unknown: 0n, active: 1n, revoked: 2n };

async function main({ wallet, submit, resume } = {}) {
  const network = hre.network.name;
  if (!Object.hasOwn(chainIds, network)) {
    throw new Error("Use the in-process Hardhat network or Ethereum Sepolia");
  }
  const live = network === "sepolia";
  let cap = 0n;
  if (live) {
    if (process.env.D35_BROADCAST !== "sepolia") {
      throw new Error("Sepolia requires explicit D35_BROADCAST=sepolia");
    }
    try { cap = ethers.parseEther(process.env.D35_MAX_TEST_ETH || "0"); }
    catch { throw new Error("Set D35_MAX_TEST_ETH to a positive decimal amount"); }
    if (cap <= 0n) throw new Error("Set D35_MAX_TEST_ETH to a positive decimal amount");
  }
  const chainId = Number(await ethers.provider.send("eth_chainId", []));
  if (chainId !== chainIds[network]) throw new Error(`Unexpected chain ID for ${network}`);

  const artifacts = Object.fromEntries(await Promise.all(deployments.map(async (name) => {
    const artifact = await hre.artifacts.readArtifact(name);
    const build = await hre.artifacts.getBuildInfo(`${artifact.sourceName}:${name}`);
    return [name, {
      runtimeHash: ethers.keccak256(artifact.deployedBytecode),
      initcodeHash: ethers.keccak256(artifact.bytecode),
      solc: build.solcLongVersion,
      optimizer: build.input.settings.optimizer,
      evmTarget: build.input.settings.evmVersion,
    }];
  })));
  if (live) {
    const { bytecode } = require("../docs/d35-sepolia/amoy-receipts.json");
    for (const name of deployments) {
      if (bytecode[name]?.chainHash !== artifacts[name].runtimeHash) {
        throw new Error(`Amoy runtime does not match the local build for ${name}`);
      }
    }
  }
  const signer = wallet ?? (await ethers.getSigners())[0];
  if (!signer) throw new Error("No test wallet configured");
  const actor = await signer.getAddress();
  if (live && await ethers.provider.getBalance(actor) < cap) {
    throw new Error("The Sepolia wallet balance is below the requested fee budget");
  }

  const evidence = {
    network, chainId, feeUnit: live ? "test ETH" : "simulated ETH", actor,
    artifacts, inputs: { registryName, configHash, degreeId, degreeUri, certId, certUri },
    addresses: {}, checks: {}, transactions: [], completed: false,
  };
  fs.mkdirSync("cache/d35", { recursive: true });
  const output = resume || `cache/d35/${network}-${Date.now()}.jsonl`;
  let saved = [];
  const recordedReceipts = new Set();
  if (resume) {
    const [start, ...events] = fs.readFileSync(output, "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
    assert.equal(start.event, "start");
    assert.equal(start.actor, actor);
    assert.equal(start.chainId, chainId);
    assert.deepEqual(start.artifacts, artifacts);
    assert.deepEqual(start.inputs, evidence.inputs);
    assert.ok(!events.some(row => row.event === "finish"), "Run already complete");
    saved = events.filter(row => row.event === "submitted");
    for (const row of events.filter(e => e.event === "receipt")) recordedReceipts.add(row.txHash);
  } else {
    fs.writeFileSync(output, JSON.stringify({ event: "start", ...evidence }) + "\n", { flag: "wx" });
  }
  const log = (event) => fs.appendFileSync(output, JSON.stringify(event) + "\n");
  let spent = 0n;
  let blockTag = "latest";
  const view = (method, ...args) => method.staticCall(...args, { blockTag });
  console.log(`Evidence: ${output}`);

  async function send(phase, action, request) {
    if (request.value && BigInt(request.value) !== 0n) throw new Error("Nonzero transaction value is disabled");
    request = { ...request, value: 0n };
    const index = evidence.transactions.length;
    const previous = saved[index];
    if (live && !previous) {
      const [estimated, fees] = await Promise.all([
        signer.estimateGas(request),
        ethers.provider.getFeeData(),
      ]);
      if (fees.maxFeePerGas == null || fees.maxPriorityFeePerGas == null) {
        throw new Error("Could not get a Sepolia fee quote");
      }
      const gasLimit = (estimated * 120n + 99n) / 100n;
      const worstCase = gasLimit * fees.maxFeePerGas;
      if (spent + worstCase > cap || await ethers.provider.getBalance(actor) < worstCase) {
        throw new Error(`Fee estimate for ${action} exceeds the remaining budget or balance`);
      }
      request = { ...request, type: 2, gasLimit, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };
    }
    let tx;
    if (previous) {
      assert.equal(previous.phase, phase);
      assert.equal(previous.action, action);
      tx = await ethers.provider.getTransaction(previous.txHash);
      assert.ok(tx, "Saved transaction not visible; retry the same journal");
      assert.equal(tx.from, actor);
      assert.equal(tx.chainId, BigInt(chainId));
      assert.equal(tx.to, request.to ?? null);
      assert.equal(tx.data, request.data);
      assert.equal(tx.value, 0n);
    } else {
      tx = submit ? await submit(phase, action, request, index + 1) : await signer.sendTransaction(request);
      log({ event: "submitted", phase, action, txHash: tx.hash });
    }
    const receipt = await tx.wait(1, 180_000);
    const raw = await ethers.provider.send("eth_getTransactionReceipt", [tx.hash]);
    const calldata = Buffer.from(tx.data.slice(2), "hex");
    assert.equal(raw.status, "0x1", action);
    assert.equal(raw.blockHash, receipt.blockHash, action);
    blockTag = receipt.blockNumber;
    const fee = BigInt(raw.gasUsed) * BigInt(raw.effectiveGasPrice);
    spent += fee;
    const minedBlock = await ethers.provider.getBlock(receipt.blockNumber);
    const row = {
      phase, action, txHash: tx.hash, status: receipt.status, blockNumber: receipt.blockNumber,
      blockHash: raw.blockHash, time: new Date(minedBlock.timestamp * 1000).toISOString(),
      to: raw.to, contractAddress: raw.contractAddress, type: tx.type,
      calldataBytes: calldata.length, zeroCalldataBytes: calldata.filter((byte) => byte === 0).length,
      gasUsed: BigInt(raw.gasUsed).toString(), effectiveGasPriceWei: BigInt(raw.effectiveGasPrice).toString(),
      feeWei: fee.toString(), feeNative: ethers.formatEther(fee),
    };
    if (live) row.explorer = "https://sepolia.etherscan.io/tx/" + tx.hash;
    evidence.transactions.push(row);
    if (!previous || !recordedReceipts.has(tx.hash)) log({ event: "receipt", ...row });
    console.log(`${row.action}: ${row.gasUsed} gas, ${row.feeNative} ${evidence.feeUnit}`);
    return receipt;
  }

  async function deploy(name, ...args) {
    const factory = await ethers.getContractFactory(name, signer);
    const receipt = await send("deploy", name, await factory.getDeployTransaction(...args));
    const address = receipt.contractAddress;
    let code = "0x";
    for (let attempt = 0; attempt < 8; attempt++) {
      try { code = await ethers.provider.send("eth_getCode", [address, ethers.toQuantity(receipt.blockNumber)]); }
      catch (err) { if (attempt === 7) throw err; }
      if (code !== "0x") break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.equal(ethers.keccak256(code), artifacts[name].runtimeHash, name);
    evidence.addresses[name] = address;
    return factory.attach(address);
  }

  const factory = await deploy("RegistryFactory");
  const issuer = await deploy("IssuerRegistry");
  const selfReported = await deploy("SelfReportedRegistry");
  const credentials = await deploy("CredentialRegistry", selfReported.target, issuer.target, factory.target);
  assert.equal(await view(credentials.registryFactory), factory.target);
  assert.equal(await view(credentials.issuerRegistry), issuer.target);
  assert.equal(await view(credentials.selfReportedRegistry), selfReported.target);
  evidence.addresses.selfReportedRevocation = await view(selfReported.revocationRegistry);
  evidence.checks.constructorWiring = true;

  const call = async (contract, method, ...args) => send("flow",
    `${contractNames.get(contract)}.${method}`, await contract[method].populateTransaction(...args));
  const contractNames = new Map([[factory, "RegistryFactory"], [issuer, "IssuerRegistry"],
    [selfReported, "SelfReportedRegistry"], [credentials, "CredentialRegistry"]]);
  assert.equal(await view(issuer.isIssuer, actor), false);
  await call(issuer, "addIssuer", actor);
  assert.equal(await view(issuer.isIssuer, actor), true);
  const created = await call(factory, "createRegistry", 0, configHash, registryName);
  const [event] = created.logs.filter((log) => log.address === factory.target)
    .map((log) => factory.interface.parseLog(log)).filter((log) => log?.name === "RegistryCreated");
  assert.ok(event);
  const { verificationRegistry, revocationRegistry } = event.args;
  evidence.addresses.DocumentRegistryTemplate = verificationRegistry;
  evidence.addresses.RevocationRegistry = revocationRegistry;
  assert.equal(await view(factory.isRegistry, verificationRegistry), true);
  const degree = await ethers.getContractAt("DocumentRegistryTemplate", verificationRegistry, signer);
  const revocation = await ethers.getContractAt("RevocationRegistry", revocationRegistry, signer);
  contractNames.set(degree, "DocumentRegistryTemplate");
  contractNames.set(revocation, "RevocationRegistry");
  assert.equal(await view(degree.verify, degreeId, degreeId), status.unknown);
  await call(degree, "registerDocument", degreeId, degreeId, degreeUri, actor);
  assert.equal(await view(degree.verify, degreeId, degreeId), status.active);
  await call(selfReported, "register", certId, certId, certUri);
  assert.equal(await view(selfReported.verify, certId, certId), status.active);
  await call(credentials, "linkCredential", certId, verificationRegistry, degreeId);
  assert.deepEqual(Array.from(await view(credentials.getLink, certId)), [verificationRegistry, degreeId, actor]);
  await call(revocation, "revoke", degreeId, 7);
  assert.equal(await view(degree.verify, degreeId, degreeId), status.revoked);
  assert.equal(await view(selfReported.verify, certId, certId), status.active);
  await call(selfReported, "revokeMine", certId, 1);
  assert.equal(await view(selfReported.verify, certId, certId), status.revoked);
  Object.assign(evidence.checks, { degree: "Unknown → Active → Revoked",
    selfReported: "Active after degree revocation; Revoked after own revocation", linkReadBack: true });
  evidence.completed = true;
  const summary = { ...evidence, totalFeeWei: spent.toString() };
  log({ event: "finish", ...summary, transactions: evidence.transactions.length });
  fs.writeFileSync(output.replace(/\.jsonl$/, ".json"), JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
}

module.exports = main;
if (require.main === module) main().catch((error) => {
  // RPC exceptions may contain an authenticated endpoint; only report safe diagnostic codes.
  if (hre.network.name === "sepolia" && error.code) console.error(`Stopped: ${error.code}; see the local evidence journal.`);
  else console.error(error.message);
  process.exitCode = 1;
});
