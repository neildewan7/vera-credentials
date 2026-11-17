const hre = require("hardhat");

async function main() {
  const doc = await hre.ethers.getContractAt(
    "DocumentRegistryTemplate",
    "0x72eEe3cefD78aAeeD9a833464839323C2CF51BA8"
  );

  const events = await doc.queryFilter(doc.filters.DocumentRegistered(), 52890000, 52895000);
  const event = events[0];

  console.log("=== What the blockchain actually returns (raw log) ===\n");
  console.log({
    address: event.address,
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
    topics: event.topics,
    data: event.data,
  });

  console.log("\n=== What ethers.js decodes that into, using the contract's ABI ===\n");
  console.log({
    eventName: event.fragment.name,
    args: {
      docId: event.args.docId,
      docHash: event.args.docHash,
      issuer: event.args.issuer,
      holder: event.args.holder,
      uri: event.args.uri,
      timestamp: event.args.timestamp.toString(),
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
