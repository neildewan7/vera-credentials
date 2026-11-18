const { runIndexer } = require("../indexer/listener");

// Fixed, currently-deployed Amoy addresses (see docs/DEPLOYMENTS.md)
const ADDRESSES = {
  factory: "0xD93549E8a45895F323705D90467396012AA85E2e",
  issuerRegistry: "0xf79C0a6FA5638Fa02A89A80048F77DdE6cdD6065",
  selfReported: "0x506cCA5F20F48a0E47e3AEe29067B93A72A36405",
  credentialRegistry: "0xD3333358dE40D64F4d4dfCa035a593de42C73CAc",
};

runIndexer(ADDRESSES).catch((error) => {
  console.error(error);
  process.exit(1);
});
