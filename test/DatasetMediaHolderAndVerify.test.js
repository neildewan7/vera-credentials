const { expect } = require("chai");
const hre = require("hardhat");

describe("DatasetRegistryTemplate / MediaRegistryTemplate — holder field and verify()", function () {
  let factory;
  let issuer, holder, otherHolder;

  beforeEach(async function () {
    [, issuer, holder, otherHolder] = await hre.ethers.getSigners();

    const Factory = await hre.ethers.getContractFactory("RegistryFactory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();
  });

  async function createRegistry(templateType, contractName, configSeed) {
    const tx = await factory.connect(issuer).createRegistry(templateType, hre.ethers.id(configSeed), "Test Registry");
    const receipt = await tx.wait();
    const event = receipt.logs.find((log) => {
      try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
      catch { return false; }
    });
    const parsed = factory.interface.parseLog(event);
    const verification = await hre.ethers.getContractAt(contractName, parsed.args.verificationRegistry);
    const revocation = await hre.ethers.getContractAt("RevocationRegistry", parsed.args.revocationRegistry);
    return { verification, revocation };
  }

  describe("DatasetRegistryTemplate", function () {
    const dataHash = hre.ethers.id("dataset-holder-verify-test");
    let verification, revocation;

    beforeEach(async function () {
      ({ verification, revocation } = await createRegistry(1, "DatasetRegistryTemplate", "dataset-holder-verify"));
    });

    it("should let an issuer register on behalf of a different holder", async function () {
      await verification.connect(issuer).registerDataset(dataHash, dataHash, "uri", holder.address);
      expect(await verification.holderOf(dataHash)).to.equal(holder.address);
    });

    it("should reject the zero address as holder", async function () {
      await expect(
        verification.connect(issuer).registerDataset(dataHash, dataHash, "uri", hre.ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid holder");
    });

    it("verify() should return Unknown, then Active, then Revoked", async function () {
      expect(await verification.verify(dataHash, dataHash)).to.equal(0); // Unknown
      await verification.connect(issuer).registerDataset(dataHash, dataHash, "uri", holder.address);
      expect(await verification.verify(dataHash, dataHash)).to.equal(1); // Active
      await revocation.connect(issuer).revoke(dataHash, 1);
      expect(await verification.verify(dataHash, dataHash)).to.equal(2); // Revoked
    });

    it("verify() should return Unknown for a mismatched hash", async function () {
      await verification.connect(issuer).registerDataset(dataHash, dataHash, "uri", holder.address);
      expect(await verification.connect(otherHolder).verify(dataHash, hre.ethers.id("wrong"))).to.equal(0);
    });
  });

  describe("MediaRegistryTemplate", function () {
    const mediaHash = hre.ethers.id("media-holder-verify-test");
    let verification, revocation;

    beforeEach(async function () {
      ({ verification, revocation } = await createRegistry(2, "MediaRegistryTemplate", "media-holder-verify"));
    });

    it("should let an issuer register on behalf of a different holder", async function () {
      await verification.connect(issuer).registerMedia(mediaHash, mediaHash, "uri", holder.address);
      expect(await verification.holderOf(mediaHash)).to.equal(holder.address);
    });

    it("should reject the zero address as holder", async function () {
      await expect(
        verification.connect(issuer).registerMedia(mediaHash, mediaHash, "uri", hre.ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid holder");
    });

    it("verify() should return Unknown, then Active, then Revoked", async function () {
      expect(await verification.verify(mediaHash, mediaHash)).to.equal(0); // Unknown
      await verification.connect(issuer).registerMedia(mediaHash, mediaHash, "uri", holder.address);
      expect(await verification.verify(mediaHash, mediaHash)).to.equal(1); // Active
      await revocation.connect(issuer).revoke(mediaHash, 1);
      expect(await verification.verify(mediaHash, mediaHash)).to.equal(2); // Revoked
    });

    it("verify() should return Unknown for a mismatched hash", async function () {
      await verification.connect(issuer).registerMedia(mediaHash, mediaHash, "uri", holder.address);
      expect(await verification.connect(otherHolder).verify(mediaHash, hre.ethers.id("wrong"))).to.equal(0);
    });
  });
});
