const { expect } = require("chai");
const hre = require("hardhat");

describe("End-to-end: issuer registers a degree, holder self-reports + links a credential, revocation", function () {
  let issuerRegistry, factory, selfReported, credentialRegistry;
  let hdsi, holder, attacker;
  let degreeRegistry, degreeRevocation, degreeId;
  const certHash = hre.ethers.id("e2e-aws-certificate");

  beforeEach(async function () {
    [, hdsi, holder, attacker] = await hre.ethers.getSigners();

    const IssuerRegistry = await hre.ethers.getContractFactory("IssuerRegistry");
    issuerRegistry = await IssuerRegistry.deploy();
    await issuerRegistry.waitForDeployment();
    await issuerRegistry.addIssuer(hdsi.address);

    const Factory = await hre.ethers.getContractFactory("RegistryFactory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();

    const SelfReportedRegistry = await hre.ethers.getContractFactory("SelfReportedRegistry");
    selfReported = await SelfReportedRegistry.deploy();
    await selfReported.waitForDeployment();

    const CredentialRegistry = await hre.ethers.getContractFactory("CredentialRegistry");
    credentialRegistry = await CredentialRegistry.deploy(
      await selfReported.getAddress(),
      await issuerRegistry.getAddress(),
      await factory.getAddress()
    );
    await credentialRegistry.waitForDeployment();
  });

  it("runs the full flow: register degree -> self-report -> link -> verify -> revoke -> verify again", async function () {
    // Step 1: HDSI (an approved issuer) creates its own degree registry via the factory
    const tx = await factory.connect(hdsi).createRegistry(0, hre.ethers.id("hdsi-e2e"), "HDSI Degrees");
    const receipt = await tx.wait();
    const event = receipt.logs.find((log) => {
      try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
      catch { return false; }
    });
    const parsed = factory.interface.parseLog(event);
    degreeRegistry = await hre.ethers.getContractAt("DocumentRegistryTemplate", parsed.args.verificationRegistry);
    degreeRevocation = await hre.ethers.getContractAt("RevocationRegistry", parsed.args.revocationRegistry);

    // Step 2: HDSI registers the holder's degree
    degreeId = hre.ethers.id("e2e-degree");
    await degreeRegistry.connect(hdsi).registerDocument(degreeId, degreeId, "ipfs://degree", holder.address);
    expect(await degreeRegistry.verify(degreeId, degreeId)).to.equal(1); // Active

    // Step 3: holder self-reports an external credential, independent of HDSI
    await selfReported.connect(holder).register(certHash, certHash, "ipfs://aws-cert");
    expect(await selfReported.verify(certHash, certHash)).to.equal(1); // Active

    // Step 4: holder links the self-reported credential to their degree
    await credentialRegistry.connect(holder).linkCredential(certHash, await degreeRegistry.getAddress(), degreeId);
    const [parentRegistry, parentDocId, linkHolder] = await credentialRegistry.getLink(certHash);
    expect(parentRegistry).to.equal(await degreeRegistry.getAddress());
    expect(parentDocId).to.equal(degreeId);
    expect(linkHolder).to.equal(holder.address);

    // Sanity: an attacker cannot link their own junk onto this degree
    const attackerCertHash = hre.ethers.id("e2e-attacker-cert");
    await selfReported.connect(attacker).register(attackerCertHash, attackerCertHash, "uri");
    await expect(
      credentialRegistry.connect(attacker).linkCredential(attackerCertHash, await degreeRegistry.getAddress(), degreeId)
    ).to.be.revertedWith("Not holder of parent degree");

    // Step 5: HDSI revokes the degree (e.g., administrative error)
    await degreeRevocation.connect(hdsi).revoke(degreeId, 7); // ADMINISTRATIVE_ERROR
    expect(await degreeRegistry.verify(degreeId, degreeId)).to.equal(2); // Revoked

    // The linked self-reported credential is NOT automatically revoked — it's a separate record
    expect(await selfReported.verify(certHash, certHash)).to.equal(1); // still Active
    // ...but the link itself still correctly points at the now-revoked degree, so a report
    // generator checking both records independently would see the full picture.

    // Step 6: holder can still independently revoke their own self-reported credential
    await selfReported.connect(holder).revokeMine(certHash, 1); // EXPIRED
    expect(await selfReported.verify(certHash, certHash)).to.equal(2); // Revoked
  });
});
