const { expect } = require("chai");
const hre = require("hardhat");

describe("DocumentRegistryTemplate — holder field and verify()", function () {
  let factory, verification, revocation;
  let owner, issuer, holder, otherHolder;
  const docHash = hre.ethers.id("holder-verify-test-doc");

  beforeEach(async function () {
    [owner, issuer, holder, otherHolder] = await hre.ethers.getSigners();

    const Factory = await hre.ethers.getContractFactory("RegistryFactory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();

    const tx = await factory.connect(issuer).createRegistry(0, hre.ethers.id("holder-verify"), "Holder Verify Test");
    const receipt = await tx.wait();
    const event = receipt.logs.find((log) => {
      try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
      catch { return false; }
    });
    const parsed = factory.interface.parseLog(event);

    verification = await hre.ethers.getContractAt("DocumentRegistryTemplate", parsed.args.verificationRegistry);
    revocation = await hre.ethers.getContractAt("RevocationRegistry", parsed.args.revocationRegistry);
  });

  describe("holder field", function () {
    it("should let an issuer register a document on behalf of a different holder", async function () {
      await verification.connect(issuer).registerDocument(docHash, docHash, "uri", holder.address);
      // No direct getter for the struct's holder field is exposed, but the
      // call succeeding with issuer != holder confirms they're independent.
      expect(await verification.verifyDocument(docHash, docHash)).to.be.true;
    });

    it("should reject registering a document with the zero address as holder", async function () {
      await expect(
        verification.connect(issuer).registerDocument(docHash, docHash, "uri", hre.ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid holder");
    });
  });

  describe("verify()", function () {
    it("should return Unknown for a never-registered docId", async function () {
      expect(await verification.verify(docHash, docHash)).to.equal(0); // Unknown
    });

    it("should return Active immediately after registration", async function () {
      await verification.connect(issuer).registerDocument(docHash, docHash, "uri", holder.address);
      expect(await verification.verify(docHash, docHash)).to.equal(1); // Active
    });

    it("should return Revoked after the paired revocation registry revokes it", async function () {
      await verification.connect(issuer).registerDocument(docHash, docHash, "uri", holder.address);
      await revocation.connect(issuer).revoke(docHash, 1); // EXPIRED
      expect(await verification.verify(docHash, docHash)).to.equal(2); // Revoked
    });

    it("should return Unknown when the hash doesn't match the registered docId", async function () {
      await verification.connect(issuer).registerDocument(docHash, docHash, "uri", holder.address);
      const wrongHash = hre.ethers.id("tampered-file");
      expect(await verification.verify(docHash, wrongHash)).to.equal(0); // Unknown
    });

    it("should be callable by anyone, not just the issuer or holder", async function () {
      await verification.connect(issuer).registerDocument(docHash, docHash, "uri", holder.address);
      expect(await verification.connect(otherHolder).verify(docHash, docHash)).to.equal(1); // Active
    });
  });
});
