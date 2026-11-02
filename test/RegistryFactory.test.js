const { expect } = require("chai");
const hre = require("hardhat");

describe("RegistryFactory + RevocationRegistry", function () {
  let factory;
  let owner, user1, user2;

  beforeEach(async function () {
    [owner, user1, user2] = await hre.ethers.getSigners();

    const Factory = await hre.ethers.getContractFactory("RegistryFactory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();
  });

  // =========================================================
  // 1. FACTORY DEPLOYMENT
  // =========================================================

  describe("Factory Deployment", function () {
    it("should deploy factory with nextRegistryId = 1", async function () {
      expect(await factory.nextRegistryId()).to.equal(1);
    });
  });

  // =========================================================
  // 2. REGISTRY CREATION — TIGHTLY COUPLED PAIR
  // =========================================================

  describe("Registry Creation (Coupled Pair)", function () {
    it("should deploy both verification and revocation contracts for DOCUMENT", async function () {
      const tx = await factory.connect(user1).createRegistry(0, hre.ethers.id("config1"), "Doc Registry");
      const receipt = await tx.wait();

      // Parse the RegistryCreated event
      const event = receipt.logs.find((log) => {
        try {
          return factory.interface.parseLog(log)?.name === "RegistryCreated";
        } catch { return false; }
      });
      const parsed = factory.interface.parseLog(event);

      expect(parsed.args.verificationRegistry).to.not.equal(hre.ethers.ZeroAddress);
      expect(parsed.args.revocationRegistry).to.not.equal(hre.ethers.ZeroAddress);
      expect(parsed.args.templateType).to.equal(0); // DOCUMENT
      expect(parsed.args.owner).to.equal(user1.address);
    });

    it("should deploy both contracts for DATASET", async function () {
      const tx = await factory.connect(user1).createRegistry(1, hre.ethers.id("config2"), "Dataset Registry");
      const receipt = await tx.wait();

      const event = receipt.logs.find((log) => {
        try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
        catch { return false; }
      });
      const parsed = factory.interface.parseLog(event);

      expect(parsed.args.verificationRegistry).to.not.equal(hre.ethers.ZeroAddress);
      expect(parsed.args.revocationRegistry).to.not.equal(hre.ethers.ZeroAddress);
      expect(parsed.args.templateType).to.equal(1);
    });

    it("should deploy both contracts for MEDIA", async function () {
      const tx = await factory.connect(user1).createRegistry(2, hre.ethers.id("config3"), "Media Registry");
      const receipt = await tx.wait();

      const event = receipt.logs.find((log) => {
        try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
        catch { return false; }
      });
      const parsed = factory.interface.parseLog(event);

      expect(parsed.args.verificationRegistry).to.not.equal(hre.ethers.ZeroAddress);
      expect(parsed.args.revocationRegistry).to.not.equal(hre.ethers.ZeroAddress);
      expect(parsed.args.templateType).to.equal(2);
    });

    it("should increment registryId for each creation", async function () {
      await factory.connect(user1).createRegistry(0, hre.ethers.id("a"), "First");
      await factory.connect(user1).createRegistry(1, hre.ethers.id("b"), "Second");

      expect(await factory.nextRegistryId()).to.equal(3);
    });

    it("should reject empty name", async function () {
      await expect(
        factory.connect(user1).createRegistry(0, hre.ethers.id("x"), "")
      ).to.be.revertedWith("Name required");
    });

    it("should reject invalid template type", async function () {
      await expect(
        factory.connect(user1).createRegistry(3, hre.ethers.id("x"), "Bad")
      ).to.be.revertedWith("Invalid template");
    });
  });

  // =========================================================
  // 3. TIGHT COUPLING — LINKING VERIFICATION
  // =========================================================

  describe("Tight Coupling", function () {
    let verificationAddr, revocationAddr, revocation;

    beforeEach(async function () {
      const tx = await factory.connect(user1).createRegistry(0, hre.ethers.id("link-test"), "Link Test");
      const receipt = await tx.wait();

      const event = receipt.logs.find((log) => {
        try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
        catch { return false; }
      });
      const parsed = factory.interface.parseLog(event);
      verificationAddr = parsed.args.verificationRegistry;
      revocationAddr = parsed.args.revocationRegistry;

      revocation = await hre.ethers.getContractAt("RevocationRegistry", revocationAddr);
    });

    it("should link revocation to verification contract", async function () {
      expect(await revocation.verificationContract()).to.equal(verificationAddr);
    });

    it("should transfer revocation ownership to user", async function () {
      expect(await revocation.owner()).to.equal(user1.address);
    });

    it("should not allow re-linking", async function () {
      await expect(
        revocation.connect(user1).setVerificationContract(user2.address)
      ).to.be.revertedWith("Already linked");
    });
  });

  // =========================================================
  // 4. REGISTRATION — MIRROR REGISTER ON REVOCATION
  // =========================================================

  describe("Registration with Mirror Register", function () {
    let verification, revocation;
    const docHash = hre.ethers.id("test-document-hash");

    beforeEach(async function () {
      const tx = await factory.connect(user1).createRegistry(0, hre.ethers.id("reg-test"), "Reg Test");
      const receipt = await tx.wait();

      const event = receipt.logs.find((log) => {
        try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
        catch { return false; }
      });
      const parsed = factory.interface.parseLog(event);

      verification = await hre.ethers.getContractAt("DocumentRegistryTemplate", parsed.args.verificationRegistry);
      revocation = await hre.ethers.getContractAt("RevocationRegistry", parsed.args.revocationRegistry);
    });

    it("should register document on verification registry", async function () {
      await verification.connect(user1).registerDocument(docHash, docHash, "https://example.com/doc");
      expect(await verification.verifyDocument(docHash, docHash)).to.be.true;
    });

    it("should mirror-register hash on revocation registry", async function () {
      await verification.connect(user1).registerDocument(docHash, docHash, "https://example.com/doc");
      expect(await revocation.isRegistered(docHash)).to.be.true;
    });

    it("should show hash as valid (registered + not revoked)", async function () {
      await verification.connect(user1).registerDocument(docHash, docHash, "https://example.com/doc");
      expect(await revocation.isValid(docHash)).to.be.true;
    });

    it("should reject duplicate registration", async function () {
      await verification.connect(user1).registerDocument(docHash, docHash, "https://example.com/doc");
      await expect(
        verification.connect(user1).registerDocument(docHash, docHash, "https://example.com/doc2")
      ).to.be.revertedWith("Document exists");
    });

    it("should reject registration from non-owner", async function () {
      await expect(
        verification.connect(user2).registerDocument(docHash, docHash, "https://example.com/doc")
      ).to.be.revertedWith("Not owner");
    });
  });

  // =========================================================
  // 5. REVOCATION LIFECYCLE
  // =========================================================

  describe("Revocation Lifecycle", function () {
    let verification, revocation;
    const docHash = hre.ethers.id("revoke-test-hash");

    // Reason enum values from RevocationRegistry.sol
    const REASON = {
      NONE: 0,
      EXPIRED: 1,
      SUPERSEDED: 2,
      KEY_COMPROMISE: 3,
      AFFILIATION_CHANGED: 4,
      CESSATION_OF_OPERATION: 5,
      PRIVILEGE_WITHDRAWN: 6,
      ADMINISTRATIVE_ERROR: 7,
      FRAUDULENT: 8,
      FORMAT_INVALID: 9,
      OTHER: 10,
    };

    beforeEach(async function () {
      const tx = await factory.connect(user1).createRegistry(0, hre.ethers.id("revoke-test"), "Revoke Test");
      const receipt = await tx.wait();

      const event = receipt.logs.find((log) => {
        try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
        catch { return false; }
      });
      const parsed = factory.interface.parseLog(event);

      verification = await hre.ethers.getContractAt("DocumentRegistryTemplate", parsed.args.verificationRegistry);
      revocation = await hre.ethers.getContractAt("RevocationRegistry", parsed.args.revocationRegistry);

      // Register a document first
      await verification.connect(user1).registerDocument(docHash, docHash, "https://example.com/doc");
    });

    it("should revoke a registered hash", async function () {
      await revocation.connect(user1).revoke(docHash, REASON.EXPIRED);
      expect(await revocation.isRevoked(docHash)).to.be.true;
    });

    it("should mark hash as invalid after revocation", async function () {
      await revocation.connect(user1).revoke(docHash, REASON.FRAUDULENT);
      expect(await revocation.isValid(docHash)).to.be.false;
    });

    it("should store revocation reason", async function () {
      await revocation.connect(user1).revoke(docHash, REASON.SUPERSEDED);
      expect(await revocation.getRevocationReason(docHash)).to.equal(REASON.SUPERSEDED);
    });

    it("should return full status via getStatus", async function () {
      // Before revocation
      let [exists, valid, reason] = await revocation.getStatus(docHash);
      expect(exists).to.be.true;
      expect(valid).to.be.true;
      expect(reason).to.equal(REASON.NONE);

      // After revocation
      await revocation.connect(user1).revoke(docHash, REASON.KEY_COMPROMISE);
      [exists, valid, reason] = await revocation.getStatus(docHash);
      expect(exists).to.be.true;
      expect(valid).to.be.false;
      expect(reason).to.equal(REASON.KEY_COMPROMISE);
    });

    it("should emit Revoked event", async function () {
      await expect(revocation.connect(user1).revoke(docHash, REASON.EXPIRED))
        .to.emit(revocation, "Revoked")
        .withArgs(docHash, REASON.EXPIRED, (ts) => ts > 0);
    });

    it("should reject revocation with NONE reason", async function () {
      await expect(
        revocation.connect(user1).revoke(docHash, REASON.NONE)
      ).to.be.revertedWith("Must provide reason");
    });

    it("should reject double revocation", async function () {
      await revocation.connect(user1).revoke(docHash, REASON.EXPIRED);
      await expect(
        revocation.connect(user1).revoke(docHash, REASON.SUPERSEDED)
      ).to.be.revertedWith("Already revoked");
    });

    it("should reject revocation of unregistered hash", async function () {
      const unknownHash = hre.ethers.id("never-registered");
      await expect(
        revocation.connect(user1).revoke(unknownHash, REASON.EXPIRED)
      ).to.be.revertedWith("Not registered");
    });

    it("should reject revocation from non-owner", async function () {
      await expect(
        revocation.connect(user2).revoke(docHash, REASON.EXPIRED)
      ).to.be.revertedWith("Not owner");
    });

    it("should still show document as registered on verification after revocation", async function () {
      await revocation.connect(user1).revoke(docHash, REASON.EXPIRED);
      // Verification registry doesn't know about revocation — it still returns true
      expect(await verification.verifyDocument(docHash, docHash)).to.be.true;
      // But revocation registry says it's invalid
      expect(await revocation.isValid(docHash)).to.be.false;
    });
  });

  // =========================================================
  // 6. REVOCATION PERMISSIONS
  // =========================================================

  describe("Revocation Permissions", function () {
    let revocation;
    const docHash = hre.ethers.id("perm-test");

    beforeEach(async function () {
      const tx = await factory.connect(user1).createRegistry(0, hre.ethers.id("perm"), "Perm Test");
      const receipt = await tx.wait();

      const event = receipt.logs.find((log) => {
        try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
        catch { return false; }
      });
      const parsed = factory.interface.parseLog(event);

      const verification = await hre.ethers.getContractAt("DocumentRegistryTemplate", parsed.args.verificationRegistry);
      revocation = await hre.ethers.getContractAt("RevocationRegistry", parsed.args.revocationRegistry);

      await verification.connect(user1).registerDocument(docHash, docHash, "uri");
    });

    it("should not allow non-owner to call register directly on revocation", async function () {
      const newHash = hre.ethers.id("direct-register-attempt");
      await expect(
        revocation.connect(user1).register(newHash)
      ).to.be.revertedWith("Not verification contract");
    });

    it("should not allow factory to call register (factory is no longer owner)", async function () {
      const newHash = hre.ethers.id("factory-attempt");
      await expect(
        revocation.connect(owner).register(newHash)
      ).to.be.revertedWith("Not verification contract");
    });

    it("should allow ownership transfer of revocation registry", async function () {
      await revocation.connect(user1).transferOwnership(user2.address);
      expect(await revocation.owner()).to.equal(user2.address);

      // user2 can now revoke
      await revocation.connect(user2).revoke(docHash, 1);
      expect(await revocation.isRevoked(docHash)).to.be.true;
    });

    it("should not allow non-owner to transfer ownership", async function () {
      await expect(
        revocation.connect(user2).transferOwnership(user2.address)
      ).to.be.revertedWith("Not owner");
    });
  });

  // =========================================================
  // 7. DATASET TEMPLATE — FULL FLOW
  // =========================================================

  describe("Dataset Template — Full Revocation Flow", function () {
    let verification, revocation;
    const dataHash = hre.ethers.id("dataset-content-hash");

    beforeEach(async function () {
      const tx = await factory.connect(user1).createRegistry(1, hre.ethers.id("ds"), "Dataset Test");
      const receipt = await tx.wait();

      const event = receipt.logs.find((log) => {
        try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
        catch { return false; }
      });
      const parsed = factory.interface.parseLog(event);

      verification = await hre.ethers.getContractAt("DatasetRegistryTemplate", parsed.args.verificationRegistry);
      revocation = await hre.ethers.getContractAt("RevocationRegistry", parsed.args.revocationRegistry);
    });

    it("should register → verify → mirror → revoke → invalidate", async function () {
      // Register
      await verification.connect(user1).registerDataset(dataHash, dataHash, "https://data.example.com");
      expect(await verification.verifyDataset(dataHash, dataHash)).to.be.true;
      expect(await revocation.isRegistered(dataHash)).to.be.true;
      expect(await revocation.isValid(dataHash)).to.be.true;

      // Revoke
      await revocation.connect(user1).revoke(dataHash, 2); // SUPERSEDED
      expect(await revocation.isRevoked(dataHash)).to.be.true;
      expect(await revocation.isValid(dataHash)).to.be.false;
      expect(await revocation.getRevocationReason(dataHash)).to.equal(2);
    });
  });

  // =========================================================
  // 8. MEDIA TEMPLATE — FULL FLOW
  // =========================================================

  describe("Media Template — Full Revocation Flow", function () {
    let verification, revocation;
    const mediaHash = hre.ethers.id("media-content-hash");

    beforeEach(async function () {
      const tx = await factory.connect(user1).createRegistry(2, hre.ethers.id("med"), "Media Test");
      const receipt = await tx.wait();

      const event = receipt.logs.find((log) => {
        try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
        catch { return false; }
      });
      const parsed = factory.interface.parseLog(event);

      verification = await hre.ethers.getContractAt("MediaRegistryTemplate", parsed.args.verificationRegistry);
      revocation = await hre.ethers.getContractAt("RevocationRegistry", parsed.args.revocationRegistry);
    });

    it("should register → verify → mirror → revoke → invalidate", async function () {
      // Register
      await verification.connect(user1).registerMedia(mediaHash, mediaHash, "ipfs://Qm...");
      expect(await verification.verifyImage(mediaHash, mediaHash)).to.be.true;
      expect(await revocation.isRegistered(mediaHash)).to.be.true;
      expect(await revocation.isValid(mediaHash)).to.be.true;

      // Revoke
      await revocation.connect(user1).revoke(mediaHash, 8); // FRAUDULENT
      expect(await revocation.isRevoked(mediaHash)).to.be.true;
      expect(await revocation.isValid(mediaHash)).to.be.false;
      expect(await revocation.getRevocationReason(mediaHash)).to.equal(8);
    });
  });

  // =========================================================
  // 9. MULTIPLE REGISTRIES — ISOLATION
  // =========================================================

  describe("Registry Isolation", function () {
    it("should keep revocation state isolated between registries", async function () {
      const hash = hre.ethers.id("shared-hash");

      // Create two registries
      const tx1 = await factory.connect(user1).createRegistry(0, hre.ethers.id("iso1"), "Registry A");
      const receipt1 = await tx1.wait();
      const event1 = receipt1.logs.find((l) => {
        try { return factory.interface.parseLog(l)?.name === "RegistryCreated"; }
        catch { return false; }
      });
      const parsed1 = factory.interface.parseLog(event1);

      const tx2 = await factory.connect(user1).createRegistry(0, hre.ethers.id("iso2"), "Registry B");
      const receipt2 = await tx2.wait();
      const event2 = receipt2.logs.find((l) => {
        try { return factory.interface.parseLog(l)?.name === "RegistryCreated"; }
        catch { return false; }
      });
      const parsed2 = factory.interface.parseLog(event2);

      const verA = await hre.ethers.getContractAt("DocumentRegistryTemplate", parsed1.args.verificationRegistry);
      const revA = await hre.ethers.getContractAt("RevocationRegistry", parsed1.args.revocationRegistry);
      const verB = await hre.ethers.getContractAt("DocumentRegistryTemplate", parsed2.args.verificationRegistry);
      const revB = await hre.ethers.getContractAt("RevocationRegistry", parsed2.args.revocationRegistry);

      // Register same hash in both
      await verA.connect(user1).registerDocument(hash, hash, "uriA");
      await verB.connect(user1).registerDocument(hash, hash, "uriB");

      // Revoke in A only
      await revA.connect(user1).revoke(hash, 1);

      // A is revoked, B is still valid
      expect(await revA.isRevoked(hash)).to.be.true;
      expect(await revA.isValid(hash)).to.be.false;
      expect(await revB.isRevoked(hash)).to.be.false;
      expect(await revB.isValid(hash)).to.be.true;
    });
  });

  // =========================================================
  // 10. FACTORY ON-CHAIN RECORD
  // =========================================================

  describe("Factory Record Storage", function () {
    it("should store correct record with both addresses", async function () {
      const tx = await factory.connect(user1).createRegistry(0, hre.ethers.id("record-test"), "Record Test");
      const receipt = await tx.wait();

      const record = await factory.registries(1);

      expect(record.id).to.equal(1);
      expect(record.owner).to.equal(user1.address);
      expect(record.templateType).to.equal(0);
      expect(record.verificationRegistry).to.not.equal(hre.ethers.ZeroAddress);
      expect(record.revocationRegistry).to.not.equal(hre.ethers.ZeroAddress);
      expect(record.name).to.equal("Record Test");
    });

    it("should track owner registries", async function () {
      await factory.connect(user1).createRegistry(0, hre.ethers.id("a"), "A");
      await factory.connect(user1).createRegistry(1, hre.ethers.id("b"), "B");
      await factory.connect(user2).createRegistry(2, hre.ethers.id("c"), "C");

      const user1Registries = await factory.getOwnerRegistries(user1.address);
      const user2Registries = await factory.getOwnerRegistries(user2.address);

      expect(user1Registries.length).to.equal(2);
      expect(user2Registries.length).to.equal(1);
    });
  });

  // =========================================================
  // 11. ALL REVOCATION REASONS
  // =========================================================

  describe("All Revocation Reasons", function () {
    let verification, revocation;

    beforeEach(async function () {
      const tx = await factory.connect(user1).createRegistry(0, hre.ethers.id("reasons"), "Reasons Test");
      const receipt = await tx.wait();

      const event = receipt.logs.find((log) => {
        try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
        catch { return false; }
      });
      const parsed = factory.interface.parseLog(event);

      verification = await hre.ethers.getContractAt("DocumentRegistryTemplate", parsed.args.verificationRegistry);
      revocation = await hre.ethers.getContractAt("RevocationRegistry", parsed.args.revocationRegistry);
    });

    const reasons = [
      { id: 1, name: "EXPIRED" },
      { id: 2, name: "SUPERSEDED" },
      { id: 3, name: "KEY_COMPROMISE" },
      { id: 4, name: "AFFILIATION_CHANGED" },
      { id: 5, name: "CESSATION_OF_OPERATION" },
      { id: 6, name: "PRIVILEGE_WITHDRAWN" },
      { id: 7, name: "ADMINISTRATIVE_ERROR" },
      { id: 8, name: "FRAUDULENT" },
      { id: 9, name: "FORMAT_INVALID" },
      { id: 10, name: "OTHER" },
    ];

    reasons.forEach(({ id, name }) => {
      it(`should accept reason ${name} (${id})`, async function () {
        const hash = hre.ethers.id(`reason-test-${id}`);
        await verification.connect(user1).registerDocument(hash, hash, "uri");
        await revocation.connect(user1).revoke(hash, id);
        expect(await revocation.getRevocationReason(hash)).to.equal(id);
      });
    });
  });
});
