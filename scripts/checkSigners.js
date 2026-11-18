const hre = require("hardhat");

async function main() {
  const signers = await hre.ethers.getSigners();
  for (const s of signers) {
    const balance = await hre.ethers.provider.getBalance(s.address);
    console.log(s.address, "-", hre.ethers.formatEther(balance), "POL");
  }
}

main();
