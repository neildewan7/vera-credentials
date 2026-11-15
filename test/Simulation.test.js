const { expect } = require("chai");
const hre = require("hardhat");
const { runSimulation, LEVEL, FAKE_TACTICS } = require("../scripts/lib/simulation");
const { STATUS } = require("../scripts/lib/trackRecord");
const defaultConfig = require("../config/simulation.json");

// Probabilities pinned to 0 or 1 so the assertions don't depend on the seed.
function config(overrides = {}) {
  return {
    ...defaultConfig,
    seed: 7,
    issuers: { honest: 1, careless: 1, rogue: 1, idle: 1 },
    holders: { honest: 4, fake: FAKE_TACTICS.length },
    honestIssuer: { supersedeProbability: 1 },
    carelessIssuer: { errorProbability: 1, catchProbability: 0, errorReasons: ["ADMINISTRATIVE_ERROR"] },
    honestHolder: { selfReportedPerHolder: 1, linkProbability: 1 },
    fakeHolder: { tactics: FAKE_TACTICS },
    ...overrides,
  };
}

describe("Simulator (fake users)", function () {
  this.timeout(120000);
  let out;

  before(async function () {
    out = await runSimulation(hre, config());
  });

  it("never lets a fake claim reach VERIFIED", async function () {
    expect(out.summary.fakeVerified).to.equal(0);
  });

  it("blocks every attempt to link a fake credential onto a degree", async function () {
    expect(out.attempts).to.have.length(2);
    for (const a of out.attempts) expect(a.ok).to.equal(false);
    const reasons = out.attempts.map((a) => a.reason).join(" | ");
    expect(reasons).to.include("Not holder of parent degree");
    expect(reasons).to.include("Parent registry is not an approved issuer");
  });

  it("gives each fake tactic the expected outcome", async function () {
    const degreeOf = (tactic) => out.results.find((r) => r.tactic === tactic && r.kind === "degree");
    const certOf = (tactic) => out.results.find((r) => r.tactic === tactic && r.kind === "certificate");
    expect(degreeOf("steal-degree").level).to.be.oneOf([LEVEL.NOT_HOLDER, LEVEL.NO_MATCH]);
    expect(degreeOf("forge-file").level).to.equal(LEVEL.NO_MATCH);
    expect(degreeOf("rogue-issuer").level).to.equal(LEVEL.UNAPPROVED_ISSUER);
    // Honest limitation: a made-up self-reported cert is accepted, but only at the lowest trust level.
    expect(certOf("self-report-fake").level).to.equal(LEVEL.SELF_REPORTED);
  });

  it("verifies honest holders of the honest issuer, including reissued degrees", async function () {
    // honest holders 1 and 3 get the honest issuer (round-robin); supersede=1 means all were reissued
    for (const name of ["honest-holder-1", "honest-holder-3"]) {
      const r = out.results.find((x) => x.person === name && x.kind === "degree");
      expect(r.level).to.equal(LEVEL.VERIFIED);
    }
  });

  it("shows the cost of a careless issuer: genuine degrees that no longer match", async function () {
    for (const name of ["honest-holder-2", "honest-holder-4"]) {
      const r = out.results.find((x) => x.person === name && x.kind === "degree");
      expect(r.genuine).to.equal(true);
      expect(r.level).to.equal(LEVEL.NO_MATCH);
    }
    expect(out.summary.genuineRejected).to.equal(2);
  });

  it("produces issuer track records that tell the issuer types apart", async function () {
    const byType = (t) => out.trackRecords.find((r) => r.simLabel && r.simLabel.includes(`(${t})`));
    expect(byType("idle").status).to.equal(STATUS.UNKNOWN);
    expect(byType("rogue").approved).to.equal(false);
    expect(byType("honest").revokedByReason).to.deep.equal([{ reason: "SUPERSEDED", count: 2 }]);
    expect(byType("careless").revoked).to.equal(0); // never noticed its mistakes
  });

  it("records ADMINISTRATIVE_ERROR revocations when a careless issuer catches its mistakes", async function () {
    const caught = await runSimulation(hre, config({
      seed: 8,
      carelessIssuer: { errorProbability: 1, catchProbability: 1, errorReasons: ["ADMINISTRATIVE_ERROR"] },
    }));
    const careless = caught.trackRecords.find((r) => r.simLabel && r.simLabel.includes("(careless)"));
    expect(careless.revokedByReason).to.deep.equal([{ reason: "ADMINISTRATIVE_ERROR", count: 2 }]);
    expect(caught.summary.genuineRejected).to.equal(0);
  });

  it("is reproducible for a given seed", async function () {
    const cfg = { ...defaultConfig, holders: { honest: 3, fake: 3 } };
    const a = await runSimulation(hre, cfg);
    const b = await runSimulation(hre, cfg);
    const strip = (o) => o.results.map((r) => [r.person, r.kind, r.level]);
    expect(strip(a)).to.deep.equal(strip(b));
    expect(a.events).to.deep.equal(b.events);
  });
});
