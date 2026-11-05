const hre = require("hardhat");

async function main() {
  const factory = await hre.ethers.getContractAt(
    "RegistryFactory",
    "0x7acBD69Cdb8B1B206747c4163454231D3Ccd2F2F"
  );

  const nextId = await factory.nextRegistryId();
  console.log("Live on Amoy — RegistryFactory.nextRegistryId():", nextId.toString());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
