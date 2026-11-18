const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ethers, network } = require("hardhat");
const benchmark = require("../scripts/benchmarkSepolia");

describe("Wallet recovery", function () {
  it("resumes after a wallet broadcast even if receipt lookup was interrupted", async function () {
    if (network.name !== "hardhat") this.skip();
    const [wallet] = await ethers.getSigners();
    const cwd = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vera-recovery-"));
    try {
      process.chdir(dir);
      let broadcastHash;
      async function interrupt(phase, action, request, step, recordHash) {
        const tx = await wallet.sendTransaction(request);
        recordHash(tx.hash);
        if (step === 2) {
          broadcastHash = tx.hash;
          throw new Error("RPC disconnected after broadcast");
        }
        return tx;
      }
      await assert.rejects(benchmark({ wallet, submit: interrupt }), /disconnected after broadcast/);
      const [filename] = fs.readdirSync("cache/d35");
      const resume = path.join(dir, "cache/d35", filename);
      const events = () => fs.readFileSync(resume, "utf8").trim().split("\n").map(JSON.parse);
      const submitted = events().filter(row => row.event === "submitted");
      assert.equal(submitted.length, 2);
      assert.equal(submitted[1].txHash, broadcastHash);
      assert.equal(events().filter(row => row.event === "receipt").length, 1);

      const steps = [];
      await benchmark({ wallet, resume, submit: async (phase, action, request, step) => {
        steps.push(step);
        return wallet.sendTransaction(request);
      } });
      assert.deepEqual(steps, [3, 4, 5, 6, 7, 8, 9, 10, 11]);
      const receipts = events().filter(row => row.event === "receipt");
      assert.equal(new Set(receipts.map(row => row.txHash)).size, 11);
      assert.equal(receipts[1].txHash, broadcastHash);
    } finally {
      process.chdir(cwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
