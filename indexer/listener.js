// Backfill indexer: discovers every RegistryCreated event from the factory,
// then pulls every event from that registry's own pair of contracts, plus
// the fixed-address shared contracts (IssuerRegistry, SelfReportedRegistry,
// CredentialRegistry). Run as a one-shot pass for now (see scripts/runIndexer.js);
// a live-listening version would just keep this logic running against new
// blocks instead of a single queryFilter pass.

const hre = require("hardhat");
const store = require("./store");

// Public RPC endpoints (e.g. OnFinality's free Amoy tier) cap eth_getLogs at
// 10,001 blocks per call. A real indexer would track "last indexed block" and
// only scan forward from there; this backfill pass instead just looks back a
// fixed window from the chain tip, chunked to stay under that cap.
const MAX_CHUNK = 9999;

async function queryFilterChunked(contract, filter, lookbackBlocks) {
  const provider = contract.runner.provider;
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - lookbackBlocks);

  const results = [];
  for (let start = fromBlock; start <= latest; start += MAX_CHUNK + 1) {
    const end = Math.min(start + MAX_CHUNK, latest);
    const events = await contract.queryFilter(filter, start, end);
    results.push(...events);
  }
  return results;
}

function toISO(blockTimestamp) {
  return new Date(Number(blockTimestamp) * 1000).toISOString();
}

async function indexIssuerRegistry(address, lookbackBlocks) {
  const contract = await hre.ethers.getContractAt("IssuerRegistry", address);
  const added = await queryFilterChunked(contract, contract.filters.IssuerAdded(), lookbackBlocks);
  const removed = await queryFilterChunked(contract, contract.filters.IssuerRemoved(), lookbackBlocks);

  for (const event of added) {
    const block = await event.getBlock();
    store.upsert("issuers", {
      address: event.args.issuer,
      is_approved: true,
      updated_at: toISO(block.timestamp),
    }, ["address"]);
  }
  for (const event of removed) {
    const block = await event.getBlock();
    store.upsert("issuers", {
      address: event.args.issuer,
      is_approved: false,
      updated_at: toISO(block.timestamp),
    }, ["address"]);
  }
  console.log(`  IssuerRegistry: ${added.length} added, ${removed.length} removed events`);
}

async function indexRevocationRegistry(registryAddress, revocationAddress, lookbackBlocks) {
  const contract = await hre.ethers.getContractAt("RevocationRegistry", revocationAddress);
  const revoked = await queryFilterChunked(contract, contract.filters.Revoked(), lookbackBlocks);
  for (const event of revoked) {
    const block = await event.getBlock();
    store.upsert("revocations", {
      registry_address: registryAddress,
      hash: event.args.hash,
      revoked: true,
      reason: Number(event.args.reason),
      revoked_at: toISO(block.timestamp),
    }, ["registry_address", "hash"]);
  }
  return revoked.length;
}

async function indexFactory(factoryAddress, lookbackBlocks) {
  const factory = await hre.ethers.getContractAt("RegistryFactory", factoryAddress);
  const created = await queryFilterChunked(factory, factory.filters.RegistryCreated(), lookbackBlocks);
  console.log(`  RegistryFactory: ${created.length} RegistryCreated events`);

  let totalDocs = 0;
  let totalRevocations = 0;

  for (const event of created) {
    const block = await event.getBlock();
    const { registryId, owner, templateType, verificationRegistry, revocationRegistry, configHash, name } = event.args;

    store.upsert("registries", {
      id: Number(registryId),
      owner,
      template_type: Number(templateType),
      verification_registry: verificationRegistry,
      revocation_registry: revocationRegistry,
      name,
      config_hash: configHash,
      created_at: toISO(block.timestamp),
    }, ["id"]);

    // Only DOCUMENT (0) templates are indexed for now — Dataset/Media use
    // the same DocumentRegistered-shaped event but a different contract
    // name; extend here if those start getting used.
    if (Number(templateType) === 0) {
      const doc = await hre.ethers.getContractAt("DocumentRegistryTemplate", verificationRegistry);
      const registered = await queryFilterChunked(doc, doc.filters.DocumentRegistered(), lookbackBlocks);
      for (const docEvent of registered) {
        const docBlock = await docEvent.getBlock();
        store.upsert("documents", {
          registry_address: verificationRegistry,
          doc_id: docEvent.args.docId,
          doc_hash: docEvent.args.docHash,
          issuer: docEvent.args.issuer,
          holder: docEvent.args.holder,
          uri: docEvent.args.uri,
          registered_at: toISO(docBlock.timestamp),
        }, ["registry_address", "doc_id"]);
      }
      totalDocs += registered.length;
    }

    totalRevocations += await indexRevocationRegistry(verificationRegistry, revocationRegistry, lookbackBlocks);
  }

  console.log(`  Documents indexed: ${totalDocs}, revocations indexed (issuer side): ${totalRevocations}`);
}

async function indexSelfReported(address, lookbackBlocks) {
  const contract = await hre.ethers.getContractAt("SelfReportedRegistry", address);
  const registered = await queryFilterChunked(contract, contract.filters.EntryRegistered(), lookbackBlocks);
  for (const event of registered) {
    const block = await event.getBlock();
    store.upsert("self_reported", {
      doc_id: event.args.docId,
      doc_hash: event.args.docHash,
      holder: event.args.holder,
      uri: event.args.uri,
      registered_at: toISO(block.timestamp),
    }, ["doc_id"]);
  }
  console.log(`  SelfReportedRegistry: ${registered.length} EntryRegistered events`);

  const revocationAddress = await contract.revocationRegistry();
  const revokedCount = await indexRevocationRegistry(address, revocationAddress, lookbackBlocks);
  console.log(`  SelfReportedRegistry revocations: ${revokedCount}`);
}

async function indexCredentialRegistry(address, lookbackBlocks) {
  const contract = await hre.ethers.getContractAt("CredentialRegistry", address);
  const linked = await queryFilterChunked(contract, contract.filters.CredentialLinked(), lookbackBlocks);
  for (const event of linked) {
    const block = await event.getBlock();
    store.upsert("credential_links", {
      child_doc_id: event.args.childDocId,
      parent_registry: event.args.parentRegistry,
      parent_doc_id: event.args.parentDocId,
      holder: event.args.holder,
      linked_at: toISO(block.timestamp),
    }, ["child_doc_id"]);
  }
  console.log(`  CredentialRegistry: ${linked.length} CredentialLinked events`);
}

async function runIndexer({ factory, issuerRegistry, selfReported, credentialRegistry, lookbackBlocks = 30000 }) {
  console.log(`Indexing the last ${lookbackBlocks} blocks...\n`);

  console.log("Indexing IssuerRegistry...");
  await indexIssuerRegistry(issuerRegistry, lookbackBlocks);

  console.log("Indexing RegistryFactory + all discovered registries...");
  await indexFactory(factory, lookbackBlocks);

  console.log("Indexing SelfReportedRegistry...");
  await indexSelfReported(selfReported, lookbackBlocks);

  console.log("Indexing CredentialRegistry...");
  await indexCredentialRegistry(credentialRegistry, lookbackBlocks);

  console.log("\nDone. Data written to", store.DATA_FILE);
}

module.exports = { runIndexer };
