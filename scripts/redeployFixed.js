const hre = require("hardhat");

// Reuse the existing, unchanged deployments (see docs/DEPLOYMENTS.md)
const ISSUER_REGISTRY = "0xf79C0a6FA5638Fa02A89A80048F77DdE6cdD6065";
const SELF_REPORTED = "0x506cCA5F20F48a0E47e3AEe29067B93A72A36405";

async function main() {
  console.log("Redeploying RegistryFactory (now tracks isRegistry)...");
  const Factory = await hre.ethers.getContractFactory("RegistryFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("RegistryFactory deployed:", factoryAddr);

  console.log("Redeploying CredentialRegistry (now checks factory.isRegistry)...");
  const CredentialRegistry = await hre.ethers.getContractFactory("CredentialRegistry");
  const credentialRegistry = await CredentialRegistry.deploy(SELF_REPORTED, ISSUER_REGISTRY, factoryAddr);
  await credentialRegistry.waitForDeployment();
  const credentialRegistryAddr = await credentialRegistry.getAddress();
  console.log("CredentialRegistry deployed:", credentialRegistryAddr);

  console.log("\nSummary (copy into docs/DEPLOYMENTS.md):");
  console.log(`RegistryFactory (fixed):    ${factoryAddr}`);
  console.log(`CredentialRegistry (fixed): ${credentialRegistryAddr}`);
  console.log(`IssuerRegistry (unchanged): ${ISSUER_REGISTRY}`);
  console.log(`SelfReportedRegistry (unchanged): ${SELF_REPORTED}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
