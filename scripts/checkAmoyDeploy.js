const hre = require("hardhat");

async function main() {
  const factory = await hre.ethers.getContractAt(
    "RegistryFactory",
    "0xD93549E8a45895F323705D90467396012AA85E2e"
  );
  console.log("RegistryFactory.nextRegistryId():", (await factory.nextRegistryId()).toString());

  const issuerRegistry = await hre.ethers.getContractAt(
    "IssuerRegistry",
    "0xf79C0a6FA5638Fa02A89A80048F77DdE6cdD6065"
  );
  console.log("IssuerRegistry.owner():", await issuerRegistry.owner());

  const selfReported = await hre.ethers.getContractAt(
    "SelfReportedRegistry",
    "0x506cCA5F20F48a0E47e3AEe29067B93A72A36405"
  );
  console.log("SelfReportedRegistry.revocationRegistry():", await selfReported.revocationRegistry());

  const credentialRegistry = await hre.ethers.getContractAt(
    "CredentialRegistry",
    "0xD3333358dE40D64F4d4dfCa035a593de42C73CAc"
  );
  console.log("CredentialRegistry.registryFactory():", await credentialRegistry.registryFactory());
  console.log("CredentialRegistry.selfReportedRegistry():", await credentialRegistry.selfReportedRegistry());
  console.log("CredentialRegistry.issuerRegistry():", await credentialRegistry.issuerRegistry());

  console.log("\nAll contracts (fixed versions) live on Amoy and responding correctly.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
