const { expect } = require("chai");
const hre = require("hardhat");

describe("SelfReportedRegistry", function () {
  let registry, revocation;
  let holder, otherHolder;
  const docHash = hre.ethers.id("self-reported-doc");

  beforeEach(async function () {
    [, holder, otherHolder] = await hre.ethers.getSigners();

    const SelfReportedRegistry = await hre.ethers.getContractFactory("SelfReportedRegistry");
    registry = await SelfReportedRegistry.deploy();
    await registry.waitForDeployment();

    const revocationAddr = await registry.revocationRegistry();
    revocation = await hre.ethers.getContractAt("RevocationRegistry", revocationAddr);
  });

  it("should deploy with its own paired, linked revocation registry", async function () {
    expect(await revocation.verificationContract()).to.equal(await registry.getAddress());
  });

  it("should let anyone register an entry, with holder always set to msg.sender", async function () {
    await registry.connect(holder).register(docHash, docHash, "ipfs://aws-cert");
    expect(await registry.holderOf(docHash)).to.equal(holder.address);
  });

  it("should reject duplicate registration of the same docId", async function () {
    await registry.connect(holder).register(docHash, docHash, "uri");
    await expect(
      registry.connect(holder).register(docHash, docHash, "uri2")
    ).to.be.revertedWith("Entry exists");
  });

  it("should reject a zero docHash", async function () {
    await expect(
      registry.connect(holder).register(docHash, hre.ethers.ZeroHash, "uri")
    ).to.be.revertedWith("Invalid hash");
  });

  it("should mirror-register the hash on its own revocation registry", async function () {
    await registry.connect(holder).register(docHash, docHash, "uri");
    expect(await revocation.isRegistered(docHash)).to.be.true;
    expect(await revocation.isValid(docHash)).to.be.true;
  });

  it("verify() should return Unknown for a never-registered docId", async function () {
    expect(await registry.verify(docHash, docHash)).to.equal(0); // Unknown
  });

  it("verify() should return Active after registration", async function () {
    await registry.connect(holder).register(docHash, docHash, "uri");
    expect(await registry.verify(docHash, docHash)).to.equal(1); // Active
  });

  it("should let the original holder revoke their own entry", async function () {
    await registry.connect(holder).register(docHash, docHash, "uri");
    await registry.connect(holder).revokeMine(docHash, 1); // EXPIRED
    expect(await registry.verify(docHash, docHash)).to.equal(2); // Revoked
  });

  it("should reject revocation from anyone other than the entry's own holder", async function () {
    await registry.connect(holder).register(docHash, docHash, "uri");
    await expect(
      registry.connect(otherHolder).revokeMine(docHash, 1)
    ).to.be.revertedWith("Not your entry");
  });

  it("should reject revoking a docId that was never registered", async function () {
    await expect(
      registry.connect(holder).revokeMine(docHash, 1)
    ).to.be.revertedWith("Entry does not exist");
  });
});
