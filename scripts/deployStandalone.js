const hre = require("hardhat");

async function main() {
  console.log("Deploying IssuerRegistry...");
  const IssuerRegistry = await hre.ethers.getContractFactory("IssuerRegistry");
  const issuerRegistry = await IssuerRegistry.deploy();
  await issuerRegistry.waitForDeployment();
  const issuerRegistryAddr = await issuerRegistry.getAddress();
  console.log("IssuerRegistry deployed:", issuerRegistryAddr);

  console.log("Deploying SelfReportedRegistry...");
  const SelfReportedRegistry = await hre.ethers.getContractFactory("SelfReportedRegistry");
  const selfReportedRegistry = await SelfReportedRegistry.deploy();
  await selfReportedRegistry.waitForDeployment();
  const selfReportedAddr = await selfReportedRegistry.getAddress();
  console.log("SelfReportedRegistry deployed:", selfReportedAddr);

  console.log("Deploying CredentialRegistry...");
  const CredentialRegistry = await hre.ethers.getContractFactory("CredentialRegistry");
  const credentialRegistry = await CredentialRegistry.deploy(selfReportedAddr, issuerRegistryAddr);
  await credentialRegistry.waitForDeployment();
  const credentialRegistryAddr = await credentialRegistry.getAddress();
  console.log("CredentialRegistry deployed:", credentialRegistryAddr);

  console.log("\nSummary (copy into docs/DEPLOYMENTS.md):");
  console.log(`IssuerRegistry:        ${issuerRegistryAddr}`);
  console.log(`SelfReportedRegistry:  ${selfReportedAddr}`);
  console.log(`CredentialRegistry:    ${credentialRegistryAddr}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
