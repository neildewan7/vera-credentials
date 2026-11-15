// Simulator with fake users. Runs only on the in-process Hardhat network
// (or a local `npx hardhat node`), never on a public testnet.
//
//   npx hardhat run scripts/simulate.js
//
// Settings: config/simulation.json. Optional env vars:
//   SIM_CONFIG=path/to/other.json   use a different config file
//   JSON=1                          print the full result as JSON
const path = require("path");
const hre = require("hardhat");
const { runSimulation, LEVEL } = require("./lib/simulation");
const { formatTrackRecord } = require("./lib/trackRecord");

async function main() {
  const cfgPath = path.resolve(process.env.SIM_CONFIG || path.join(__dirname, "..", "config", "simulation.json"));
  const cfg = require(cfgPath);
  const out = await runSimulation(hre, cfg);

  if (process.env.JSON) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log(`Vera simulator: seed ${cfg.seed}, network ${hre.network.name}, synthetic data only\n`);

  console.log("What happened");
  for (const e of out.events) console.log(`  - ${e}`);
  if (out.events.length === 0) console.log("  (nothing notable)");

  console.log("\nVerifier's judgment of each claim (chain data only)");
  for (const r of out.results) {
    const who = r.role === "fake" ? `${r.person} [${r.tactic}]` : r.person;
    const truth = r.genuine ? "genuine" : "FAKE";
    console.log(`  ${who.padEnd(42)} ${r.kind.padEnd(12)} ${truth.padEnd(8)} -> ${r.level.padEnd(18)} ${r.detail}`);
  }

  console.log("\nTransactions fake holders tried");
  for (const a of out.attempts) {
    console.log(`  ${a.person.padEnd(16)} ${a.action.padEnd(42)} ${a.ok ? "SUCCEEDED (!)" : `blocked: ${a.reason}`}`);
  }
  if (out.attempts.length === 0) console.log("  (none)");

  const s = out.summary;
  console.log("\nSummary");
  console.log(`  Fake claims:     ${s.fakeClaims}`);
  console.log(`    reached ${LEVEL.VERIFIED}:      ${s.fakeVerified}   <- should always be 0`);
  console.log(`    reached ${LEVEL.SELF_REPORTED}: ${s.fakeSelfReported}   <- not caught: the chain can't judge self-reported content, which is why it's labelled the lowest trust level`);
  console.log(`    rejected:               ${s.fakeRejected}`);
  console.log(`  Genuine claims:  ${s.genuineClaims}`);
  console.log(`    accepted:               ${s.genuineAccepted}`);
  console.log(`    rejected:               ${s.genuineRejected}   <- false rejections, e.g. a careless issuer hashed the wrong file`);
  console.log(`  Blocked link attempts:    ${s.attemptsBlocked} of ${s.attemptsBlocked + s.attemptsSucceeded}`);

  console.log("\nIssuer track records (labels in [brackets] are simulator ground truth; the chain doesn't know them)\n");
  for (const tr of out.trackRecords) console.log(formatTrackRecord(tr, { label: tr.simLabel }) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
