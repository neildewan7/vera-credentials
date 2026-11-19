const hre = require("hardhat");

const STATUS = ["Unknown", "Active", "Revoked"];

async function main() {
  const [, hdsi, holder, attacker] = await hre.ethers.getSigners();

  console.log("=== Setup ===");
  const IssuerRegistry = await hre.ethers.getContractFactory("IssuerRegistry");
  const issuerRegistry = await IssuerRegistry.deploy();
  await issuerRegistry.waitForDeployment();
  await issuerRegistry.addIssuer(hdsi.address);
  console.log(`HDSI (${hdsi.address}) approved as an issuer`);

  const Factory = await hre.ethers.getContractFactory("RegistryFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const SelfReportedRegistry = await hre.ethers.getContractFactory("SelfReportedRegistry");
  const selfReported = await SelfReportedRegistry.deploy();
  await selfReported.waitForDeployment();

  const CredentialRegistry = await hre.ethers.getContractFactory("CredentialRegistry");
  const credentialRegistry = await CredentialRegistry.deploy(
    await selfReported.getAddress(),
    await issuerRegistry.getAddress()
  );
  await credentialRegistry.waitForDeployment();

  console.log("\n=== HDSI registers a degree ===");
  const tx = await factory.connect(hdsi).createRegistry(0, hre.ethers.id("demo-hdsi"), "HDSI Degrees");
  const receipt = await tx.wait();
  const event = receipt.logs.find((log) => {
    try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
    catch { return false; }
  });
  const parsed = factory.interface.parseLog(event);
  const degreeRegistry = await hre.ethers.getContractAt("DocumentRegistryTemplate", parsed.args.verificationRegistry);
  const degreeRevocation = await hre.ethers.getContractAt("RevocationRegistry", parsed.args.revocationRegistry);

  const degreeId = hre.ethers.id("demo-degree");
  await degreeRegistry.connect(hdsi).registerDocument(degreeId, degreeId, "ipfs://degree", holder.address);
  console.log(`Degree registered for holder ${holder.address}`);
  console.log(`verify(degree) -> ${STATUS[await degreeRegistry.verify(degreeId, degreeId)]}`);

  console.log("\n=== Holder self-reports an AWS certificate ===");
  const certHash = hre.ethers.id("demo-aws-cert");
  await selfReported.connect(holder).register(certHash, certHash, "ipfs://aws-cert");
  console.log(`verify(cert) -> ${STATUS[await selfReported.verify(certHash, certHash)]}`);

  console.log("\n=== Holder links the cert to their degree ===");
  await credentialRegistry.connect(holder).linkCredential(certHash, await degreeRegistry.getAddress(), degreeId);
  console.log("Link created successfully");

  console.log("\n=== An attacker tries to attach their own cert to the same degree ===");
  const attackerCertHash = hre.ethers.id("demo-attacker-cert");
  await selfReported.connect(attacker).register(attackerCertHash, attackerCertHash, "uri");
  try {
    await credentialRegistry.connect(attacker).linkCredential(attackerCertHash, await degreeRegistry.getAddress(), degreeId);
    console.log("UNEXPECTED: attacker's link succeeded!");
  } catch (err) {
    console.log(`Blocked, as expected: "${err.reason || err.message}"`);
  }

  console.log("\n=== HDSI revokes the degree (administrative error) ===");
  await degreeRevocation.connect(hdsi).revoke(degreeId, 7);
  console.log(`verify(degree) -> ${STATUS[await degreeRegistry.verify(degreeId, degreeId)]}`);
  console.log(`verify(cert)   -> ${STATUS[await selfReported.verify(certHash, certHash)]} (unaffected — separate record)`);

  console.log("\n=== Holder revokes their own self-reported cert ===");
  await selfReported.connect(holder).revokeMine(certHash, 1);
  console.log(`verify(cert) -> ${STATUS[await selfReported.verify(certHash, certHash)]}`);

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
