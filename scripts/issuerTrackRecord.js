// Print each issuer's on-chain track record (issued / revoked by reason).
//
//   npx hardhat run scripts/issuerTrackRecord.js --network amoy
//
// Settings come from config/trackRecord.json (keyed by network name).
// Optional environment variables:
//   ISSUER=0xabc,0xdef   only show these wallets (unknown wallets show as UNKNOWN)
//   FACTORY=0x...        override the factory address from the config
//   JSON=1               print JSON instead of text
const hre = require("hardhat");
const config = require("../config/trackRecord.json");
const { getIssuerTrackRecords, formatTrackRecord } = require("./lib/trackRecord");

async function main() {
  const net = hre.network.name;
  const cfg = config[net];
  if (!cfg) throw new Error(`No entry for network "${net}" in config/trackRecord.json`);

  const factoryAddress = process.env.FACTORY || cfg.factory;
  if (!factoryAddress) throw new Error(`Set "factory" for "${net}" in config/trackRecord.json (or FACTORY=0x...)`);
  if (cfg.fromBlock == null) {
    throw new Error(
      `Set "fromBlock" for "${net}" in config/trackRecord.json to the factory's deploy block. ` +
        "Scanning a public chain from block 0 would take thousands of RPC calls."
    );
  }

  const issuers = process.env.ISSUER ? process.env.ISSUER.split(",").map((s) => s.trim()).filter(Boolean) : null;

  const records = await getIssuerTrackRecords(hre.ethers, {
    factoryAddress,
    issuerRegistryAddress: cfg.issuerRegistry,
    issuers,
    fromBlock: cfg.fromBlock,
    blockChunk: cfg.blockChunk,
  });

  if (process.env.JSON) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }
  console.log(`Issuer track records on ${net} (factory ${factoryAddress})`);
  if (!cfg.issuerRegistry) console.log("No issuerRegistry configured: approval status is not checked.");
  console.log("");
  if (records.length === 0) console.log("No issuers found.");
  for (const r of records) console.log(formatTrackRecord(r) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
