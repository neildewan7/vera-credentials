const { expect } = require("chai");
const hre = require("hardhat");

describe("CredentialRegistry", function () {
  let factory, issuerRegistry, selfReported, linkContract;
  let hdsi, otherIssuer, holder, attacker;
  let degreeRegistry, degreeId;
  const certHash = hre.ethers.id("aws-certificate");

  beforeEach(async function () {
    [, hdsi, otherIssuer, holder, attacker] = await hre.ethers.getSigners();

    const IssuerRegistry = await hre.ethers.getContractFactory("IssuerRegistry");
    issuerRegistry = await IssuerRegistry.deploy();
    await issuerRegistry.waitForDeployment();
    await issuerRegistry.addIssuer(hdsi.address);
    // otherIssuer is deliberately NOT added — used to test the "not an approved issuer" case

    const Factory = await hre.ethers.getContractFactory("RegistryFactory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();

    // HDSI's degree registry, created via the existing factory
    let tx = await factory.connect(hdsi).createRegistry(0, hre.ethers.id("hdsi"), "HDSI Degrees");
    let receipt = await tx.wait();
    let event = receipt.logs.find((log) => {
      try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
      catch { return false; }
    });
    let parsed = factory.interface.parseLog(event);
    degreeRegistry = await hre.ethers.getContractAt("DocumentRegistryTemplate", parsed.args.verificationRegistry);

    degreeId = hre.ethers.id("holder-degree");
    await degreeRegistry.connect(hdsi).registerDocument(degreeId, degreeId, "uri", holder.address);

    const SelfReportedRegistry = await hre.ethers.getContractFactory("SelfReportedRegistry");
    selfReported = await SelfReportedRegistry.deploy();
    await selfReported.waitForDeployment();

    await selfReported.connect(holder).register(certHash, certHash, "ipfs://aws-cert");

    const CredentialRegistry = await hre.ethers.getContractFactory("CredentialRegistry");
    linkContract = await CredentialRegistry.deploy(
      await selfReported.getAddress(),
      await issuerRegistry.getAddress()
    );
    await linkContract.waitForDeployment();
  });

  it("should let the holder link their own self-reported credential to their own degree", async function () {
    await linkContract.connect(holder).linkCredential(certHash, await degreeRegistry.getAddress(), degreeId);
    const [parentRegistry, parentDocId, linkHolder] = await linkContract.getLink(certHash);
    expect(parentRegistry).to.equal(await degreeRegistry.getAddress());
    expect(parentDocId).to.equal(degreeId);
    expect(linkHolder).to.equal(holder.address);
  });

  it("should reject linking when the caller is not the holder of the self-reported credential", async function () {
    await expect(
      linkContract.connect(attacker).linkCredential(certHash, await degreeRegistry.getAddress(), degreeId)
    ).to.be.revertedWith("Not holder of credential");
  });

  it("should reject linking when the caller is not the holder of the parent degree (spoofing attempt)", async function () {
    // attacker self-reports their OWN cert, then tries to link it to someone else's degree
    const attackerCertHash = hre.ethers.id("attacker-fake-cert");
    await selfReported.connect(attacker).register(attackerCertHash, attackerCertHash, "uri");

    await expect(
      linkContract.connect(attacker).linkCredential(attackerCertHash, await degreeRegistry.getAddress(), degreeId)
    ).to.be.revertedWith("Not holder of parent degree");
  });

  it("should reject linking to a registry whose owner isn't an approved issuer", async function () {
    const tx = await factory.connect(otherIssuer).createRegistry(0, hre.ethers.id("rogue"), "Rogue HDSI Lookalike");
    const receipt = await tx.wait();
    const event = receipt.logs.find((log) => {
      try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
      catch { return false; }
    });
    const parsed = factory.interface.parseLog(event);
    const rogueRegistry = await hre.ethers.getContractAt("DocumentRegistryTemplate", parsed.args.verificationRegistry);

    const rogueDegreeId = hre.ethers.id("fake-degree");
    await rogueRegistry.connect(otherIssuer).registerDocument(rogueDegreeId, rogueDegreeId, "uri", holder.address);

    await expect(
      linkContract.connect(holder).linkCredential(certHash, await rogueRegistry.getAddress(), rogueDegreeId)
    ).to.be.revertedWith("Parent registry is not an approved issuer");
  });

  it("should reject linking the same credential twice", async function () {
    await linkContract.connect(holder).linkCredential(certHash, await degreeRegistry.getAddress(), degreeId);
    await expect(
      linkContract.connect(holder).linkCredential(certHash, await degreeRegistry.getAddress(), degreeId)
    ).to.be.revertedWith("Already linked");
  });

  it("should emit CredentialLinked on a successful link", async function () {
    await expect(
      linkContract.connect(holder).linkCredential(certHash, await degreeRegistry.getAddress(), degreeId)
    )
      .to.emit(linkContract, "CredentialLinked")
      .withArgs(certHash, await degreeRegistry.getAddress(), degreeId, holder.address, (ts) => ts > 0);
  });
});
