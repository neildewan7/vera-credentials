const { expect } = require("chai");
const hre = require("hardhat");

describe("IssuerRegistry", function () {
  let registry;
  let owner, issuer1, issuer2, outsider;

  beforeEach(async function () {
    [owner, issuer1, issuer2, outsider] = await hre.ethers.getSigners();

    const IssuerRegistry = await hre.ethers.getContractFactory("IssuerRegistry");
    registry = await IssuerRegistry.deploy();
    await registry.waitForDeployment();
  });

  it("should deploy with the deployer as owner", async function () {
    expect(await registry.owner()).to.equal(owner.address);
  });

  it("should report an unlisted address as not an issuer", async function () {
    expect(await registry.isIssuer(issuer1.address)).to.be.false;
  });

  it("should let the owner add an issuer", async function () {
    await registry.addIssuer(issuer1.address);
    expect(await registry.isIssuer(issuer1.address)).to.be.true;
  });

  it("should let the owner remove an issuer", async function () {
    await registry.addIssuer(issuer1.address);
    await registry.removeIssuer(issuer1.address);
    expect(await registry.isIssuer(issuer1.address)).to.be.false;
  });

  it("should reject addIssuer from a non-owner", async function () {
    await expect(
      registry.connect(outsider).addIssuer(issuer1.address)
    ).to.be.revertedWith("Not owner");
  });

  it("should reject removeIssuer from a non-owner", async function () {
    await registry.addIssuer(issuer1.address);
    await expect(
      registry.connect(outsider).removeIssuer(issuer1.address)
    ).to.be.revertedWith("Not owner");
  });

  it("should reject adding the zero address", async function () {
    await expect(
      registry.addIssuer(hre.ethers.ZeroAddress)
    ).to.be.revertedWith("Invalid issuer");
  });

  it("should keep issuers independent of each other", async function () {
    await registry.addIssuer(issuer1.address);
    expect(await registry.isIssuer(issuer1.address)).to.be.true;
    expect(await registry.isIssuer(issuer2.address)).to.be.false;
  });

  it("should emit IssuerAdded and IssuerRemoved events", async function () {
    await expect(registry.addIssuer(issuer1.address))
      .to.emit(registry, "IssuerAdded")
      .withArgs(issuer1.address);

    await expect(registry.removeIssuer(issuer1.address))
      .to.emit(registry, "IssuerRemoved")
      .withArgs(issuer1.address);
  });

  it("should allow ownership transfer, and only the new owner can manage issuers after", async function () {
    await registry.transferOwnership(issuer2.address);
    expect(await registry.owner()).to.equal(issuer2.address);

    await expect(
      registry.addIssuer(issuer1.address)
    ).to.be.revertedWith("Not owner");

    await registry.connect(issuer2).addIssuer(issuer1.address);
    expect(await registry.isIssuer(issuer1.address)).to.be.true;
  });
});
