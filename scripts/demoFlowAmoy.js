const hre = require("hardhat");

const STATUS = ["Unknown", "Active", "Revoked"];

// Live Amoy addresses — FIXED versions (see docs/DEPLOYMENTS.md, security fix section)
const ISSUER_REGISTRY = "0xf79C0a6FA5638Fa02A89A80048F77DdE6cdD6065";
const SELF_REPORTED = "0x506cCA5F20F48a0E47e3AEe29067B93A72A36405";
const CREDENTIAL_REGISTRY = "0xD3333358dE40D64F4d4dfCa035a593de42C73CAc";
const FACTORY = "0xD93549E8a45895F323705D90467396012AA85E2e";

function gasLine(label, receipt) {
  console.log(`  gas used: ${receipt.gasUsed.toString()} (${label})`);
  return receipt.gasUsed;
}

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Running live on Amoy (fixed contracts) as:", signer.address);
  let totalGas = 0n;

  const issuerRegistry = await hre.ethers.getContractAt("IssuerRegistry", ISSUER_REGISTRY);
  const factory = await hre.ethers.getContractAt("RegistryFactory", FACTORY);
  const selfReported = await hre.ethers.getContractAt("SelfReportedRegistry", SELF_REPORTED);
  const credentialRegistry = await hre.ethers.getContractAt("CredentialRegistry", CREDENTIAL_REGISTRY);

  console.log("\n=== Step 1: approve self as issuer (demo — single signer plays both roles) ===");
  let isIssuer = await issuerRegistry.isIssuer(signer.address);
  if (!isIssuer) {
    const tx = await issuerRegistry.addIssuer(signer.address);
    const receipt = await tx.wait();
    totalGas += gasLine("addIssuer", receipt);
  } else {
    console.log("  already an approved issuer, skipping");
  }

  console.log("\n=== Step 2: create a degree registry via the FIXED factory ===");
  const salt = Date.now().toString();
  const tx1 = await factory.createRegistry(0, hre.ethers.id(`amoy-fixed-${salt}`), "HDSI Degrees (fixed)");
  const receipt1 = await tx1.wait();
  totalGas += gasLine("createRegistry", receipt1);
  const event = receipt1.logs.find((log) => {
    try { return factory.interface.parseLog(log)?.name === "RegistryCreated"; }
    catch { return false; }
  });
  const parsed = factory.interface.parseLog(event);
  const degreeRegistry = await hre.ethers.getContractAt("DocumentRegistryTemplate", parsed.args.verificationRegistry);
  const degreeRevocation = await hre.ethers.getContractAt("RevocationRegistry", parsed.args.revocationRegistry);
  console.log("  degree registry:", parsed.args.verificationRegistry);

  console.log("\n=== Step 3: register a degree, holder = self (demo) ===");
  const degreeId = hre.ethers.id(`amoy-fixed-degree-${salt}`);
  const tx2 = await degreeRegistry.registerDocument(degreeId, degreeId, "ipfs://degree", signer.address);
  const receipt2 = await tx2.wait();
  totalGas += gasLine("registerDocument", receipt2);
  console.log("  verify(degree) ->", STATUS[await degreeRegistry.verify(degreeId, degreeId)]);

  console.log("\n=== Step 4: self-report a credential ===");
  const certId = hre.ethers.id(`amoy-fixed-cert-${salt}`);
  const tx3 = await selfReported.register(certId, certId, "ipfs://aws-cert");
  const receipt3 = await tx3.wait();
  totalGas += gasLine("SelfReportedRegistry.register", receipt3);
  console.log("  verify(cert) ->", STATUS[await selfReported.verify(certId, certId)]);

  console.log("\n=== Step 5: link the credential to the degree (through the FIXED CredentialRegistry) ===");
  const tx4 = await credentialRegistry.linkCredential(certId, await degreeRegistry.getAddress(), degreeId);
  const receipt4 = await tx4.wait();
  totalGas += gasLine("linkCredential", receipt4);

  console.log("\n=== Step 6: revoke the degree ===");
  const tx5 = await degreeRevocation.revoke(degreeId, 7); // ADMINISTRATIVE_ERROR
  const receipt5 = await tx5.wait();
  totalGas += gasLine("revoke", receipt5);
  console.log("  verify(degree) ->", STATUS[await degreeRegistry.verify(degreeId, degreeId)]);
  console.log("  verify(cert)   ->", STATUS[await selfReported.verify(certId, certId)], "(unaffected)");

  console.log("\n=== Step 7: holder revokes their own self-reported cert ===");
  const tx6 = await selfReported.revokeMine(certId, 1); // EXPIRED
  const receipt6 = await tx6.wait();
  totalGas += gasLine("revokeMine", receipt6);
  console.log("  verify(cert) ->", STATUS[await selfReported.verify(certId, certId)]);

  console.log("\n=== Gas summary (fixed contracts) ===");
  console.log("Total gas used across the full flow:", totalGas.toString());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
