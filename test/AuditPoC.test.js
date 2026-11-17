const { expect } = require("chai");
const hre = require("hardhat");

describe("Security regression: CredentialRegistry must reject a fabricated parentRegistry", function () {
  it("rejects a fake contract impersonating an approved issuer's registry", async function () {
    const [, hdsi, attacker] = await hre.ethers.getSigners();

    const IssuerRegistry = await hre.ethers.getContractFactory("IssuerRegistry");
    const issuerRegistry = await IssuerRegistry.deploy();
    await issuerRegistry.waitForDeployment();
    await issuerRegistry.addIssuer(hdsi.address); // hdsi is a REAL approved issuer

    const Factory = await hre.ethers.getContractFactory("RegistryFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const SelfReportedRegistry = await hre.ethers.getContractFactory("SelfReportedRegistry");
    const selfReported = await SelfReportedRegistry.deploy();
    await selfReported.waitForDeployment();

    const CredentialRegistry = await hre.ethers.getContractFactory("CredentialRegistry");
    const credentialRegistry = await CredentialRegistry.deploy(
      await selfReported.getAddress(),
      await issuerRegistry.getAddress(),
      await factory.getAddress()
    );
    await credentialRegistry.waitForDeployment();

    // Attacker self-reports a junk credential
    const junkHash = hre.ethers.id("poc-fake-credential");
    await selfReported.connect(attacker).register(junkHash, junkHash, "uri");

    // Attacker deploys a FAKE registry that lies: claims to be owned by the
    // REAL approved issuer (hdsi), and claims the attacker is the holder of
    // any docId. This was never deployed by RegistryFactory.
    const FakeRegistry = await hre.ethers.getContractFactory("FakeRegistry");
    const fakeRegistry = await FakeRegistry.deploy(hdsi.address, attacker.address);
    await fakeRegistry.waitForDeployment();

    const fakeDegreeId = hre.ethers.id("poc-fake-degree");

    // Must now be rejected — the factory never deployed this "registry".
    await expect(
      credentialRegistry.connect(attacker).linkCredential(
        junkHash,
        await fakeRegistry.getAddress(),
        fakeDegreeId
      )
    ).to.be.revertedWith("Parent registry was not deployed by the factory");
  });

  it("still allows linking to a real, factory-deployed registry owned by an approved issuer", async function () {
    const [, hdsi, holder] = await hre.ethers.getSigners();

    const IssuerRegistry = await hre.ethers.getContractFactory("IssuerRegistry");
    const issuerRegistry = await IssuerRegistry.deploy();
    await issuerRegistry.waitForDeployment();
    await issuerRegistry.addIssuer(hdsi.address);

    const Factory = await hre.ethers.getContractFactory("RegistryFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const tx = await factory.connect(hdsi).createRegistry(0, hre.ethers.id("real-registry"), "HDSI Degrees");
    const receipt = await tx.wait();
    const event = receipt.logs.find((log) => {
      try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
      catch { return false; }
    });
    const parsed = factory.interface.parseLog(event);
    const degreeRegistry = await hre.ethers.getContractAt("DocumentRegistryTemplate", parsed.args.verificationRegistry);

    const degreeId = hre.ethers.id("real-degree");
    await degreeRegistry.connect(hdsi).registerDocument(degreeId, degreeId, "uri", holder.address);

    const SelfReportedRegistry = await hre.ethers.getContractFactory("SelfReportedRegistry");
    const selfReported = await SelfReportedRegistry.deploy();
    await selfReported.waitForDeployment();

    const certHash = hre.ethers.id("real-cert");
    await selfReported.connect(holder).register(certHash, certHash, "uri");

    const CredentialRegistry = await hre.ethers.getContractFactory("CredentialRegistry");
    const credentialRegistry = await CredentialRegistry.deploy(
      await selfReported.getAddress(),
      await issuerRegistry.getAddress(),
      await factory.getAddress()
    );
    await credentialRegistry.waitForDeployment();

    await credentialRegistry.connect(holder).linkCredential(certHash, await degreeRegistry.getAddress(), degreeId);
    const [parentRegistry] = await credentialRegistry.getLink(certHash);
    expect(parentRegistry).to.equal(await degreeRegistry.getAddress());
  });
});
