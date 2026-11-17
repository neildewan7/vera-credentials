const hre = require("hardhat");

const TXS = [
  { step: "Register degree", hash: "0xbd2e3dba1d0cf1b5a7de7b2cbdfd6b99b72bab7d88ee59a9a631607abbb8312f" },
  { step: "Register grade (DSC 180A)", hash: "0x99ce8c40be18a3f5bb2a3d674996a204634698b9ac18e206b8403a083e6ed127" },
  { step: "Register grade (DSC 102)", hash: "0x1edc9e380b412b1ff81cb6a924f0818ace3dec31c8d6e9750ad402288d9f3e55" },
  { step: "Register HDSI credential (Teaching Fellowship)", hash: "0x3da621629d6b8b1fb250c32e732bfadd3bc7c483b396b3c5b099b291ff7aa401" },
  { step: "Self-report credential (AWS Cloud Practitioner)", hash: "0xf3247ac4fe4a60efc84dfac2f44f6966e2d8d9cadef42149a1d4de8366e6de89" },
  { step: "Link credential to degree", hash: "0x2987d9d6dbf24baa965dd5772ebcf4a0ffb6986ef2660ee705e567cad6c54d56" },
];

async function main() {
  let total = 0n;
  for (const { step, hash } of TXS) {
    const receipt = await hre.ethers.provider.getTransactionReceipt(hash);
    console.log(`${step}: ${receipt.gasUsed.toString()} gas`);
    total += receipt.gasUsed;
  }
  console.log("\nTotal:", total.toString());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
