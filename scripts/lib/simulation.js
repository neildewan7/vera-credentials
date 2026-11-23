// Simulator with fake users: honest holders, fake holders, careless issuers.
//
// Runs a seeded scenario on a LOCAL Hardhat network only, then has a verifier
// judge every claim people make, using chain data alone. Because the
// simulator knows the ground truth (who is lying), it can count how often
// the chain-based check gets it right, and where it can't help.
//
// Assumption: a claim is checked against the wallet the claimant has proven
// they control (e.g. by signing a challenge off-chain). Without that step,
// "this degree belongs to wallet X" proves nothing about the person in front
// of you. The simulator does not model that signature; it takes it as given.
//
// All data is synthetic. "File contents" are made-up strings; their keccak256
// stands in for the hash of the raw file bytes.

const { getIssuerTrackRecords, REVOCATION_REASONS } = require("./trackRecord");

const LEVEL = {
  VERIFIED: "VERIFIED", // approved issuer, factory registry, active, belongs to claimant
  SELF_REPORTED: "SELF_REPORTED", // holder registered it themselves; content unchecked
  UNAPPROVED_ISSUER: "UNAPPROVED_ISSUER", // on-chain and active, but issuer not on the allowlist
  REVOKED: "REVOKED",
  NOT_HOLDER: "NOT_HOLDER", // record exists but belongs to another wallet
  NO_MATCH: "NO_MATCH", // no record with this id and file hash
  UNTRUSTED_CONTRACT: "UNTRUSTED_CONTRACT", // registry not created by the known factory
};
const ACCEPTED = new Set([LEVEL.VERIFIED, LEVEL.SELF_REPORTED]);

const FAKE_TACTICS = [
  "steal-degree", // presents a copy of someone else's real degree file
  "forge-file", // presents an edited copy of someone else's degree
  "rogue-issuer", // degree from an unapproved issuer named like HDSI
  "self-report-fake", // registers a made-up certificate in SelfReportedRegistry
  "link-to-stolen-degree", // tries to link a fake cert onto someone else's degree
  "link-to-rogue-degree", // tries to link a fake cert onto a rogue issuer's degree
];

const reasonCode = (name) => {
  const i = REVOCATION_REASONS.indexOf(name);
  if (i <= 0) throw new Error(`Unknown revocation reason "${name}"`);
  return i;
};

/** Small seeded PRNG (mulberry32) so runs are reproducible. */
function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

async function sendOk(promise) {
  const tx = await promise;
  return tx.wait();
}

/** Returns { ok: true } or { ok: false, reason } for a tx expected to maybe revert. */
async function attempt(promise) {
  try {
    await sendOk(promise);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.reason || e.shortMessage || e.message };
  }
}

/**
 * Judge one claim from chain data only.
 * ctx: { ethers, factoryRegistries: Map(lowercase addr -> record), issuerRegistry, selfReported, credentialRegistry }
 */
async function assessClaim(ctx, claimant, claim) {
  const { ethers } = ctx;
  const addr = claim.registry.toLowerCase();

  if (addr === (await ctx.selfReported.getAddress()).toLowerCase()) {
    const status = Number(await ctx.selfReported.verify(claim.docId, claim.fileHash));
    if (status === 0) return { level: LEVEL.NO_MATCH, detail: "no self-reported entry with this id and file hash" };
    if ((await ctx.selfReported.holderOf(claim.docId)).toLowerCase() !== claimant.toLowerCase()) {
      return { level: LEVEL.NOT_HOLDER, detail: "self-reported entry belongs to another wallet" };
    }
    if (status === 2) return { level: LEVEL.REVOKED, detail: "withdrawn by the holder" };
    const [parentRegistry, parentDocId, linkHolder] = await ctx.credentialRegistry.getLink(claim.docId);
    let detail = "registered by the holder; content not checked by anyone";
    if (linkHolder !== ethers.ZeroAddress) {
      detail += `; holder linked it to degree ${parentDocId.slice(0, 10)}… in ${parentRegistry} (the link is not a check of that degree; present the degree as its own claim)`;
    }
    return { level: LEVEL.SELF_REPORTED, detail };
  }

  // Only trust registries the known factory created. Any other contract could
  // implement owner()/holderOf()/verify() to return whatever it likes.
  const rec = ctx.factoryRegistries.get(addr);
  if (!rec || rec.templateType !== "DOCUMENT") {
    return { level: LEVEL.UNTRUSTED_CONTRACT, detail: "registry was not created by the known RegistryFactory" };
  }
  const reg = await ethers.getContractAt("DocumentRegistryTemplate", claim.registry);
  const status = Number(await reg.verify(claim.docId, claim.fileHash));
  if (status === 0) return { level: LEVEL.NO_MATCH, detail: "file hash does not match any record with this id" };
  if ((await reg.holderOf(claim.docId)).toLowerCase() !== claimant.toLowerCase()) {
    return { level: LEVEL.NOT_HOLDER, detail: "record belongs to another wallet" };
  }
  if (status === 2) {
    const revoc = await ethers.getContractAt("RevocationRegistry", await reg.revocationRegistry());
    const reason = REVOCATION_REASONS[Number(await revoc.getRevocationReason(claim.fileHash))];
    return { level: LEVEL.REVOKED, detail: `revoked by issuer: ${reason}` };
  }
  const owner = await reg.owner();
  if (!(await ctx.issuerRegistry.isIssuer(owner))) {
    return { level: LEVEL.UNAPPROVED_ISSUER, detail: `issuer ${owner} ("${rec.name}") is not on the approved list` };
  }
  return { level: LEVEL.VERIFIED, detail: `issued by approved issuer "${rec.name}"` };
}

/**
 * Run the scenario. Returns everything needed for a report and for tests.
 * @param hre  Hardhat runtime environment
 * @param cfg  see config/simulation.json
 */
async function runSimulation(hre, cfg) {
  const { ethers } = hre;
  if (!["hardhat", "localhost"].includes(hre.network.name)) {
    throw new Error(
      `The simulator only runs on a local network (hardhat or localhost), not "${hre.network.name}". ` +
        "It sends many transactions from impersonated wallets."
    );
  }
  const rng = makeRng(cfg.seed);
  const [admin] = await ethers.getSigners();

  // Deterministic wallets per seed, funded and impersonated (local network only).
  const wallet = async (label) => {
    const address = ethers.getAddress("0x" + ethers.id(`vera-sim:${cfg.seed}:${label}`).slice(26));
    await ethers.provider.send("hardhat_setBalance", [address, "0x56BC75E2D63100000"]); // 100 ETH
    return ethers.getImpersonatedSigner(address);
  };

  // --- Deploy the system ---
  const deploy = async (name, ...args) => {
    const c = await (await ethers.getContractFactory(name)).connect(admin).deploy(...args);
    await c.waitForDeployment();
    return c;
  };
  const issuerRegistry = await deploy("IssuerRegistry");
  const factory = await deploy("RegistryFactory");
  const selfReported = await deploy("SelfReportedRegistry");
  const credentialRegistry = await deploy(
    "CredentialRegistry",
    await selfReported.getAddress(),
    await issuerRegistry.getAddress(),
    await factory.getAddress()
  );

  // --- Issuers ---
  const issuers = [];
  for (const type of ["honest", "careless", "rogue", "idle"]) {
    for (let i = 0; i < (cfg.issuers[type] || 0); i++) {
      const label = `${type}-issuer-${i + 1}`;
      const signer = await wallet(label);
      const approved = type !== "rogue";
      if (approved) await sendOk(issuerRegistry.connect(admin).addIssuer(signer.address));
      const issuer = { type, label, signer, approved, registry: null, revoc: null, name: null, counter: 0 };
      if (type !== "idle") {
        issuer.name = type === "rogue" ? cfg.rogueIssuer.spoofName : `${label} Degrees`;
        const receipt = await sendOk(factory.connect(signer).createRegistry(0, ethers.id(label), issuer.name));
        const ev = receipt.logs
          .map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
          .find((p) => p && p.name === "RegistryCreated");
        issuer.registry = await ethers.getContractAt("DocumentRegistryTemplate", ev.args.verificationRegistry, signer);
        issuer.revoc = await ethers.getContractAt("RevocationRegistry", ev.args.revocationRegistry, signer);
      }
      issuers.push(issuer);
    }
  }
  const degreeIssuers = issuers.filter((i) => i.type === "honest" || i.type === "careless");
  const rogue = issuers.find((i) => i.type === "rogue");
  if (degreeIssuers.length === 0) throw new Error("Need at least one honest or careless issuer");

  const issue = async (issuer, holderAddr, fileContents) => {
    issuer.counter++;
    const docId = ethers.id(`${issuer.label}:doc:${issuer.counter}`);
    const fileHash = ethers.id(fileContents);
    await sendOk(issuer.registry.registerDocument(docId, fileHash, `synthetic://${issuer.label}/${issuer.counter}`, holderAddr));
    return { registry: await issuer.registry.getAddress(), docId, fileHash };
  };

  const events = []; // narrative log of notable things that happened
  const people = [];
  const attempts = []; // transactions fake holders tried; expected to be blocked

  // --- Honest holders ---
  for (let i = 0; i < cfg.holders.honest; i++) {
    const label = `honest-holder-${i + 1}`;
    const signer = await wallet(label);
    const person = { label, role: "honest", tactic: null, signer, claims: [], degree: null };
    const issuer = degreeIssuers[i % degreeIssuers.length];
    const realFile = `degree|${label}|B.S. Data Science|${issuer.label}`;
    let rec;

    if (issuer.type === "honest") {
      rec = await issue(issuer, signer.address, realFile);
      if (rng.chance(cfg.honestIssuer.supersedeProbability)) {
        await sendOk(issuer.revoc.revoke(rec.fileHash, reasonCode("SUPERSEDED")));
        rec = await issue(issuer, signer.address, realFile + "|v2");
        events.push(`${issuer.label} reissued ${label}'s degree (old one revoked as SUPERSEDED)`);
      }
      person.realFileHash = rec.fileHash;
    } else {
      // careless: sometimes hashes the wrong file
      const cc = cfg.carelessIssuer;
      if (rng.chance(cc.errorProbability)) {
        const wrong = await issue(issuer, signer.address, realFile + "|WRONG-FILE");
        if (rng.chance(cc.catchProbability)) {
          await sendOk(issuer.revoc.revoke(wrong.fileHash, reasonCode(rng.pick(cc.errorReasons))));
          rec = await issue(issuer, signer.address, realFile);
          events.push(`${issuer.label} registered the wrong file for ${label}, noticed, revoked and reissued`);
        } else {
          rec = wrong; // on-chain hash is wrong; holder's real file will not match
          events.push(`${issuer.label} registered the wrong file for ${label} and never noticed`);
        }
      } else {
        rec = await issue(issuer, signer.address, realFile);
      }
      person.realFileHash = ethers.id(realFile);
    }

    person.degree = { registry: rec.registry, docId: rec.docId, fileHash: person.realFileHash, issuer: issuer.label };
    person.claims.push({ kind: "degree", genuine: true, ...person.degree });

    for (let c = 0; c < cfg.honestHolder.selfReportedPerHolder; c++) {
      const certId = ethers.id(`${label}:cert:${c}`);
      const certHash = ethers.id(`cert|${label}|${rng.pick(cfg.certNames)}|${c}`);
      await sendOk(selfReported.connect(signer).register(certId, certHash, `synthetic://${label}/cert/${c}`));
      if (rng.chance(cfg.honestHolder.linkProbability)) {
        const r = await attempt(credentialRegistry.connect(signer).linkCredential(certId, rec.registry, rec.docId));
        if (!r.ok) events.push(`${label} could not link their certificate: ${r.reason}`);
      }
      person.claims.push({ kind: "certificate", genuine: true, registry: await selfReported.getAddress(), docId: certId, fileHash: certHash });
    }
    people.push(person);
  }

  const victims = people.filter((p) => p.role === "honest");

  // --- Fake holders ---
  const tactics = cfg.fakeHolder.tactics;
  for (let i = 0; i < cfg.holders.fake; i++) {
    const label = `fake-holder-${i + 1}`;
    const signer = await wallet(label);
    const tactic = tactics[i % tactics.length];
    if (!FAKE_TACTICS.includes(tactic)) throw new Error(`Unknown tactic "${tactic}"`);
    const person = { label, role: "fake", tactic, signer, claims: [] };
    const victim = victims.length ? rng.pick(victims) : null;
    const needRogue = () => {
      if (!rogue) throw new Error(`Tactic "${tactic}" needs at least one rogue issuer`);
      return rogue;
    };
    const needVictim = () => {
      if (!victim) throw new Error(`Tactic "${tactic}" needs at least one honest holder`);
      return victim;
    };
    const fakeCert = async () => {
      const certId = ethers.id(`${label}:fake-cert`);
      const certHash = ethers.id(`cert|${label}|${rng.pick(cfg.certNames)}|made-up`);
      await sendOk(selfReported.connect(signer).register(certId, certHash, `synthetic://${label}/cert`));
      const claim = { kind: "certificate", genuine: false, registry: await selfReported.getAddress(), docId: certId, fileHash: certHash };
      person.claims.push(claim);
      return claim;
    };
    const rogueDegree = async () => {
      const r = needRogue();
      const rec = await issue(r, signer.address, `degree|${label}|B.S. Data Science|${r.label}`);
      const claim = { kind: "degree", genuine: false, ...rec, issuer: r.label };
      person.claims.push(claim);
      return claim;
    };

    if (tactic === "steal-degree") {
      const v = needVictim();
      person.claims.push({ kind: "degree", genuine: false, ...v.degree });
    } else if (tactic === "forge-file") {
      const v = needVictim();
      person.claims.push({ kind: "degree", genuine: false, ...v.degree, fileHash: ethers.id(`degree|${label}|edited copy of ${v.label}`) });
    } else if (tactic === "rogue-issuer") {
      await rogueDegree();
    } else if (tactic === "self-report-fake") {
      await fakeCert();
    } else if (tactic === "link-to-stolen-degree") {
      const v = needVictim();
      const cert = await fakeCert();
      const r = await attempt(credentialRegistry.connect(signer).linkCredential(cert.docId, v.degree.registry, v.degree.docId));
      attempts.push({ person: label, tactic, action: `link fake cert to ${v.label}'s degree`, ...r });
    } else if (tactic === "link-to-rogue-degree") {
      const deg = await rogueDegree();
      const cert = await fakeCert();
      const r = await attempt(credentialRegistry.connect(signer).linkCredential(cert.docId, deg.registry, deg.docId));
      attempts.push({ person: label, tactic, action: "link fake cert to rogue-issued degree", ...r });
    }
    people.push(person);
  }

  // --- Verify every claim from chain data only ---
  const factoryRegistries = new Map();
  const { listFactoryRegistries } = require("./trackRecord");
  for (const r of await listFactoryRegistries(factory)) factoryRegistries.set(r.verificationRegistry.toLowerCase(), r);
  const ctx = { ethers, factoryRegistries, issuerRegistry, selfReported, credentialRegistry };

  const results = [];
  for (const p of people) {
    for (const claim of p.claims) {
      const verdict = await assessClaim(ctx, p.signer.address, claim);
      results.push({
        person: p.label,
        role: p.role,
        tactic: p.tactic,
        kind: claim.kind,
        genuine: claim.genuine,
        accepted: ACCEPTED.has(verdict.level),
        ...verdict,
      });
    }
  }

  // --- Issuer track records (the other To-Do item, reused here) ---
  const trackRecords = await getIssuerTrackRecords(ethers, {
    factoryAddress: await factory.getAddress(),
    issuerRegistryAddress: await issuerRegistry.getAddress(),
    fromBlock: 0,
  });
  const labelOf = new Map(issuers.map((i) => [i.signer.address.toLowerCase(), `${i.label} (${i.type})`]));
  for (const tr of trackRecords) tr.simLabel = labelOf.get(tr.issuer.toLowerCase()) || null;

  return {
    config: cfg,
    addresses: {
      issuerRegistry: await issuerRegistry.getAddress(),
      factory: await factory.getAddress(),
      selfReported: await selfReported.getAddress(),
      credentialRegistry: await credentialRegistry.getAddress(),
    },
    results,
    attempts,
    events,
    trackRecords,
    summary: summarize(results, attempts),
  };
}

function summarize(results, attempts) {
  const fake = results.filter((r) => !r.genuine);
  const genuine = results.filter((r) => r.genuine);
  return {
    claims: results.length,
    fakeClaims: fake.length,
    fakeVerified: fake.filter((r) => r.level === LEVEL.VERIFIED).length, // the number that must stay 0
    fakeSelfReported: fake.filter((r) => r.level === LEVEL.SELF_REPORTED).length, // accepted, but at lowest trust
    fakeRejected: fake.filter((r) => !r.accepted).length,
    genuineClaims: genuine.length,
    genuineAccepted: genuine.filter((r) => r.accepted).length,
    genuineRejected: genuine.filter((r) => !r.accepted).length, // false rejections (e.g. careless issuers)
    attemptsBlocked: attempts.filter((a) => !a.ok).length,
    attemptsSucceeded: attempts.filter((a) => a.ok).length,
  };
}

module.exports = { runSimulation, assessClaim, makeRng, LEVEL, FAKE_TACTICS };
