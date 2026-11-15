const { expect } = require("chai");
const hre = require("hardhat");
const { getIssuerTrackRecords, formatTrackRecord, STATUS } = require("../scripts/lib/trackRecord");

// RevocationReason enum values used below
const SUPERSEDED = 2;
const ADMINISTRATIVE_ERROR = 7;
const FRAUDULENT = 8;

describe("Issuer Track Record (off-chain script)", function () {
  let factory, issuerRegistry;
  let issuerA, issuerB, idle, stranger, holder, newOwner;

  async function createRegistry(signer, type, name) {
    const tx = await factory.connect(signer).createRegistry(type, hre.ethers.id(name), name);
    const receipt = await tx.wait();
    const parsed = receipt.logs
      .map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
      .find((p) => p && p.name === "RegistryCreated");
    const contractName = ["DocumentRegistryTemplate", "DatasetRegistryTemplate", "MediaRegistryTemplate"][type];
    return {
      template: await hre.ethers.getContractAt(contractName, parsed.args.verificationRegistry),
      revoc: await hre.ethers.getContractAt("RevocationRegistry", parsed.args.revocationRegistry),
    };
  }

  async function issueDocs(reg, signer, prefix, n) {
    const hashes = [];
    for (let i = 0; i < n; i++) {
      const h = hre.ethers.id(`${prefix}-${i}`);
      await reg.template.connect(signer).registerDocument(h, h, "uri", holder.address);
      hashes.push(h);
    }
    return hashes;
  }

  async function records(extra = {}) {
    return getIssuerTrackRecords(hre.ethers, {
      factoryAddress: await factory.getAddress(),
      issuerRegistryAddress: await issuerRegistry.getAddress(),
      ...extra,
    });
  }

  beforeEach(async function () {
    [, issuerA, issuerB, idle, stranger, holder, newOwner] = await hre.ethers.getSigners();
    factory = await (await hre.ethers.getContractFactory("RegistryFactory")).deploy();
    issuerRegistry = await (await hre.ethers.getContractFactory("IssuerRegistry")).deploy();
    await issuerRegistry.addIssuer(issuerA.address);
    await issuerRegistry.addIssuer(idle.address);
  });

  it("reports an approved issuer with no history as UNKNOWN, not clean", async function () {
    const recs = await records();
    const rec = recs.find((r) => r.issuer === idle.address);
    expect(rec.status).to.equal(STATUS.UNKNOWN);
    expect(rec.issued).to.equal(0);
    expect(rec.revocationRate).to.equal(null);
    expect(rec.approved).to.equal(true);
    expect(formatTrackRecord(rec)).to.include("UNKNOWN");
  });

  it("reports an unseen wallet passed via the issuers filter as UNKNOWN", async function () {
    const recs = await records({ issuers: [stranger.address] });
    expect(recs).to.have.length(1);
    expect(recs[0].status).to.equal(STATUS.UNKNOWN);
    expect(recs[0].approved).to.equal(false);
  });

  it("combines all registries owned by the same wallet and sorts revocations by reason", async function () {
    const r1 = await createRegistry(issuerA, 0, "A Degrees");
    const r2 = await createRegistry(issuerA, 0, "A Certificates");
    const h1 = await issueDocs(r1, issuerA, "a1", 4);
    const h2 = await issueDocs(r2, issuerA, "a2", 3);

    await r1.revoc.connect(issuerA).revoke(h1[0], ADMINISTRATIVE_ERROR);
    await r1.revoc.connect(issuerA).revoke(h1[1], ADMINISTRATIVE_ERROR);
    await r2.revoc.connect(issuerA).revoke(h2[0], FRAUDULENT);

    const rec = (await records()).find((r) => r.issuer === issuerA.address);
    expect(rec.status).to.equal(STATUS.HAS_HISTORY);
    expect(rec.registries).to.have.length(2);
    expect(rec.issued).to.equal(7);
    expect(rec.revoked).to.equal(3);
    expect(rec.active).to.equal(4);
    expect(rec.revokedByReason).to.deep.equal([
      { reason: "ADMINISTRATIVE_ERROR", count: 2 },
      { reason: "FRAUDULENT", count: 1 },
    ]);
    expect(rec.firstIssuedAt).to.be.a("number");
    expect(rec.lastActivityAt).to.be.at.least(rec.firstIssuedAt);
  });

  it("keeps different wallets separate and marks unapproved issuers", async function () {
    const ra = await createRegistry(issuerA, 0, "A");
    const rb = await createRegistry(issuerB, 0, "HDSI Degrees"); // lookalike name, unapproved wallet
    await issueDocs(ra, issuerA, "a", 1);
    await issueDocs(rb, issuerB, "b", 2);

    const recs = await records();
    const a = recs.find((r) => r.issuer === issuerA.address);
    const b = recs.find((r) => r.issuer === issuerB.address);
    expect(a.issued).to.equal(1);
    expect(b.issued).to.equal(2);
    expect(b.approved).to.equal(false);
    expect(recs[0].issuer).to.equal(issuerB.address); // sorted by issued desc
  });

  it("counts Dataset and Media registries via their revocation registry", async function () {
    const ds = await createRegistry(issuerA, 1, "A Datasets");
    const h = hre.ethers.id("dataset-1");
    await ds.template.connect(issuerA).registerDataset(h, h, "uri");
    await ds.revoc.connect(issuerA).revoke(h, SUPERSEDED);

    const rec = (await records()).find((r) => r.issuer === issuerA.address);
    expect(rec.registries[0].templateType).to.equal("DATASET");
    expect(rec.issued).to.equal(1);
    expect(rec.revokedByReason).to.deep.equal([{ reason: "SUPERSEDED", count: 1 }]);
  });

  it("attributes history to the current owner after a transfer, and flags it", async function () {
    const r = await createRegistry(issuerA, 0, "A");
    await issueDocs(r, issuerA, "a", 2);
    await r.template.connect(issuerA).transferOwnership(newOwner.address);

    const recs = await records();
    const moved = recs.find((x) => x.issuer === newOwner.address);
    expect(moved.issued).to.equal(2);
    // created-by flag + revocation registry still owned by issuerA
    expect(moved.flags.some((f) => f.includes("transferred"))).to.equal(true);
    expect(moved.flags.some((f) => f.includes("revocation registry is owned by"))).to.equal(true);
    // issuerA is approved but now owns nothing: back to UNKNOWN
    expect(recs.find((x) => x.issuer === issuerA.address).status).to.equal(STATUS.UNKNOWN);
  });

  it("gives the same result when logs are fetched in tiny block chunks", async function () {
    const r = await createRegistry(issuerA, 0, "A");
    const h = await issueDocs(r, issuerA, "a", 3);
    await r.revoc.connect(issuerA).revoke(h[2], FRAUDULENT);

    const big = await records();
    const small = await records({ blockChunk: 1 });
    expect(small).to.deep.equal(big);
  });
});
