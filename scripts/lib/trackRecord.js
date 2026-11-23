// Issuer Track Record: adds up each issuer's history from what Vera already
// records on-chain. Read-only: no contract changes, no transactions.
//
// Where the numbers come from (all existing events, nothing new on-chain):
//   - Registries: RegistryFactory.registries(id) for every id, so only
//     registries created through the known factory are counted.
//   - Issued:  RevocationRegistry `Registered(hash)`. Every template
//     (Document/Dataset/Media) mirror-registers each record on its paired
//     revocation registry, so one event type covers all three templates.
//   - Revoked: RevocationRegistry `Revoked(hash, reason)`.
//
// Grouping: by the CURRENT owner() of each verification registry. That is the
// same address CredentialRegistry / IssuerRegistry trust checks use, so a
// key rotation (transferOwnership to a new HDSI wallet) carries the history
// over. Registries whose owner changed are flagged, because buying or
// receiving an old registry would also inherit its history.
//
// What the chain adds here: the history is append-only. An issuer cannot
// quietly delete an issuance or a FRAUDULENT revocation after the fact, and
// anyone can recompute these numbers without trusting us.
// What it does NOT add:
//   - The revocation reason is chosen by the issuer. Nothing stops an issuer
//     from labelling a fraud as SUPERSEDED.
//   - It only sees what was put on-chain. Off-chain issuances are invisible.
//   - A fresh wallet has no history, and wallets are free. So an empty record
//     is reported as UNKNOWN, never as "clean".
//   - One organisation using several wallets gets several separate records.

const REVOCATION_REASONS = [
  "NONE",
  "EXPIRED",
  "SUPERSEDED",
  "KEY_COMPROMISE",
  "AFFILIATION_CHANGED",
  "CESSATION_OF_OPERATION",
  "PRIVILEGE_WITHDRAWN",
  "ADMINISTRATIVE_ERROR",
  "FRAUDULENT",
  "FORMAT_INVALID",
  "OTHER",
]; // must match RevocationRegistry.RevocationReason order

const TEMPLATE_TYPES = ["DOCUMENT", "DATASET", "MEDIA"]; // RegistryFactory.TemplateType

const TEMPLATE_CONTRACTS = {
  DOCUMENT: "DocumentRegistryTemplate",
  DATASET: "DatasetRegistryTemplate",
  MEDIA: "MediaRegistryTemplate",
};

const STATUS = {
  UNKNOWN: "UNKNOWN", // no credentials on record: not the same as clean
  HAS_HISTORY: "HAS_HISTORY",
};

/** Every registry the factory has created, in id order. */
async function listFactoryRegistries(factory) {
  const next = Number(await factory.nextRegistryId());
  const out = [];
  for (let id = 1; id < next; id++) {
    const r = await factory.registries(id);
    out.push({
      id,
      createdBy: r.owner,
      templateType: TEMPLATE_TYPES[Number(r.templateType)],
      verificationRegistry: r.verificationRegistry,
      revocationRegistry: r.revocationRegistry,
      name: r.name,
      createdAt: Number(r.createdAt),
    });
  }
  return out;
}

/**
 * eth_getLogs in block-range chunks (public RPCs cap the range per call) and
 * address batches. Returns logs in chain order.
 */
async function getLogsChunked(provider, { addresses, topics, fromBlock, toBlock, blockChunk, addressBatch = 50 }) {
  if (addresses.length === 0) return [];
  const logs = [];
  for (let a = 0; a < addresses.length; a += addressBatch) {
    const address = addresses.slice(a, a + addressBatch);
    for (let start = fromBlock; start <= toBlock; start += blockChunk) {
      const end = Math.min(start + blockChunk - 1, toBlock);
      logs.push(...(await provider.getLogs({ address, topics, fromBlock: start, toBlock: end })));
    }
  }
  logs.sort((x, y) => x.blockNumber - y.blockNumber || x.index - y.index);
  return logs;
}

function emptyRecord(issuer) {
  return {
    issuer,
    approved: null, // null = no IssuerRegistry given, so not checked
    status: STATUS.UNKNOWN,
    issued: 0,
    revoked: 0,
    active: 0,
    revocationRate: null,
    revokedByReason: [], // [{ reason, count }] sorted by count desc
    firstIssuedAt: null,
    lastActivityAt: null,
    registries: [],
    flags: [],
  };
}

/**
 * Build a track record for every issuer wallet.
 *
 * @param ethers  hre.ethers
 * @param opts.factoryAddress         RegistryFactory address (required)
 * @param opts.issuerRegistryAddress  IssuerRegistry address (optional; adds the approved flag
 *                                    and includes approved issuers that never issued anything)
 * @param opts.issuers                optional list of wallets; if given, only these are returned
 *                                    (a wallet with no registries comes back as UNKNOWN)
 * @param opts.fromBlock / toBlock    log range; fromBlock should be the factory's deploy block
 * @param opts.blockChunk             max blocks per eth_getLogs call
 * @returns array of records, sorted by issued desc, then address
 */
async function getIssuerTrackRecords(ethers, opts) {
  const { factoryAddress, issuerRegistryAddress = null, issuers = null, fromBlock = 0, blockChunk = 10000 } = opts;
  const provider = ethers.provider;
  const toBlock = opts.toBlock == null || opts.toBlock === "latest" ? await provider.getBlockNumber() : Number(opts.toBlock);

  const factory = await ethers.getContractAt("RegistryFactory", factoryAddress);
  const revocIface = (await ethers.getContractFactory("RevocationRegistry")).interface;
  const issuerRegistry = issuerRegistryAddress ? await ethers.getContractAt("IssuerRegistry", issuerRegistryAddress) : null;

  const registries = await listFactoryRegistries(factory);
  const byRevocation = new Map();
  for (const reg of registries) {
    const template = await ethers.getContractAt(TEMPLATE_CONTRACTS[reg.templateType], reg.verificationRegistry);
    const revoc = await ethers.getContractAt("RevocationRegistry", reg.revocationRegistry);
    reg.owner = await template.owner();
    reg.revocationOwner = await revoc.owner();
    reg.issued = 0;
    reg.revoked = 0;
    byRevocation.set(reg.revocationRegistry.toLowerCase(), reg);
  }

  // Tally events per registry.
  const reasonCounts = new Map(); // registry -> Map(reason -> n)
  const times = new Map(); // registry -> { first, last }
  const logs = await getLogsChunked(provider, {
    addresses: registries.map((r) => r.revocationRegistry),
    topics: [[revocIface.getEvent("Registered").topicHash, revocIface.getEvent("Revoked").topicHash]],
    fromBlock,
    toBlock,
    blockChunk,
  });
  for (const log of logs) {
    const reg = byRevocation.get(log.address.toLowerCase());
    if (!reg) continue;
    const ev = revocIface.parseLog(log);
    const ts = Number(ev.args.timestamp);
    const t = times.get(reg) || { first: null, last: null };
    if (ev.name === "Registered") {
      reg.issued++;
      if (t.first === null || ts < t.first) t.first = ts;
    } else {
      reg.revoked++;
      const reason = REVOCATION_REASONS[Number(ev.args.reason)] || `UNKNOWN_REASON_${ev.args.reason}`;
      const m = reasonCounts.get(reg) || new Map();
      m.set(reason, (m.get(reason) || 0) + 1);
      reasonCounts.set(reg, m);
    }
    if (t.last === null || ts > t.last) t.last = ts;
    times.set(reg, t);
  }

  // Group registries by current owner.
  const records = new Map();
  const recordFor = (addr) => {
    const key = ethers.getAddress(addr);
    if (!records.has(key)) records.set(key, emptyRecord(key));
    return records.get(key);
  };

  for (const reg of registries) {
    const rec = recordFor(reg.owner);
    const t = times.get(reg) || { first: null, last: null };
    rec.registries.push({
      id: reg.id,
      name: reg.name,
      templateType: reg.templateType,
      verificationRegistry: reg.verificationRegistry,
      revocationRegistry: reg.revocationRegistry,
      createdBy: reg.createdBy,
      issued: reg.issued,
      revoked: reg.revoked,
    });
    rec.issued += reg.issued;
    rec.revoked += reg.revoked;
    for (const [reason, n] of reasonCounts.get(reg) || []) {
      const row = rec.revokedByReason.find((r) => r.reason === reason);
      if (row) row.count += n;
      else rec.revokedByReason.push({ reason, count: n });
    }
    if (t.first !== null && (rec.firstIssuedAt === null || t.first < rec.firstIssuedAt)) rec.firstIssuedAt = t.first;
    if (t.last !== null && (rec.lastActivityAt === null || t.last > rec.lastActivityAt)) rec.lastActivityAt = t.last;

    if (reg.owner.toLowerCase() !== reg.createdBy.toLowerCase()) {
      rec.flags.push(
        `Registry #${reg.id} "${reg.name}" was created by ${reg.createdBy} and later transferred to this wallet; its history is counted here.`
      );
    }
    if (reg.revocationOwner.toLowerCase() !== reg.owner.toLowerCase()) {
      rec.flags.push(
        `Registry #${reg.id} "${reg.name}": its revocation registry is owned by ${reg.revocationOwner}, not by this wallet, so someone else controls its revocations.`
      );
    }
  }

  // Approved issuers that never created a registry still get a (UNKNOWN) record.
  if (issuerRegistry) {
    const added = await getLogsChunked(provider, {
      addresses: [await issuerRegistry.getAddress()],
      topics: [issuerRegistry.interface.getEvent("IssuerAdded").topicHash],
      fromBlock,
      toBlock,
      blockChunk,
    });
    for (const log of added) {
      const addr = issuerRegistry.interface.parseLog(log).args.issuer;
      if (await issuerRegistry.isIssuer(addr)) recordFor(addr);
    }
  }
  if (issuers) for (const a of issuers) recordFor(a);

  for (const rec of records.values()) {
    if (issuerRegistry) rec.approved = await issuerRegistry.isIssuer(rec.issuer);
    rec.active = rec.issued - rec.revoked;
    rec.status = rec.issued === 0 ? STATUS.UNKNOWN : STATUS.HAS_HISTORY;
    rec.revocationRate = rec.issued === 0 ? null : rec.revoked / rec.issued;
    rec.revokedByReason.sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
    rec.registries.sort((a, b) => a.id - b.id);
  }

  let out = [...records.values()];
  if (issuers) {
    const wanted = new Set(issuers.map((a) => a.toLowerCase()));
    out = out.filter((r) => wanted.has(r.issuer.toLowerCase()));
  }
  out.sort((a, b) => b.issued - a.issued || a.issuer.localeCompare(b.issuer));
  return out;
}

function fmtTime(ts) {
  return ts === null ? "-" : new Date(ts * 1000).toISOString().replace(".000Z", "Z");
}

/** Plain-text rendering of one record, e.g. for a CLI or a report page. */
function formatTrackRecord(rec, { label = null } = {}) {
  const lines = [];
  const approved = rec.approved === null ? "not checked" : rec.approved ? "yes" : "NO";
  lines.push(`Issuer ${rec.issuer}${label ? `  [${label}]` : ""}`);
  lines.push(`  Approved issuer:  ${approved}`);
  if (rec.status === STATUS.UNKNOWN) {
    lines.push("  Track record:     UNKNOWN: no credentials on record. This is not the same as a clean record.");
  } else {
    const pct = (rec.revocationRate * 100).toFixed(1);
    lines.push(`  Issued:           ${rec.issued}   (active ${rec.active}, revoked ${rec.revoked}, ${pct}% revoked)`);
    if (rec.revokedByReason.length === 0) {
      lines.push("  Revoked by reason: none on record");
    } else {
      lines.push("  Revoked by reason (as stated by the issuer):");
      for (const r of rec.revokedByReason) lines.push(`    ${r.reason.padEnd(24)} ${r.count}`);
    }
    lines.push(`  First issued:     ${fmtTime(rec.firstIssuedAt)}`);
    lines.push(`  Last activity:    ${fmtTime(rec.lastActivityAt)}`);
  }
  lines.push(`  Registries:       ${rec.registries.length}`);
  for (const r of rec.registries) {
    lines.push(`    #${r.id} ${r.templateType} "${r.name}" ${r.verificationRegistry}  issued ${r.issued}, revoked ${r.revoked}`);
  }
  for (const f of rec.flags) lines.push(`  ! ${f}`);
  return lines.join("\n");
}

module.exports = {
  REVOCATION_REASONS,
  TEMPLATE_TYPES,
  STATUS,
  listFactoryRegistries,
  getLogsChunked,
  getIssuerTrackRecords,
  formatTrackRecord,
};
