const hre = require("hardhat");

async function main() {
  const [funder] = await hre.ethers.getSigners();
  const target = "0xE27f4Eb0A0D6dbF64805507ACaE9012a9FdB115d";

  const tx = await funder.sendTransaction({
    to: target,
    value: hre.ethers.parseEther("0.05"),
  });
  const receipt = await tx.wait();
  console.log("Sent 0.05 POL to", target, "- tx:", receipt.hash);

  const balance = await hre.ethers.provider.getBalance(target);
  console.log("New balance:", hre.ethers.formatEther(balance), "POL");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
