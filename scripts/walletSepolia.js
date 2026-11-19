// Usage: node scripts/walletSepolia.js <public Ethereum address>
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

Object.assign(process.env, {
  HARDHAT_NETWORK: "sepolia", SEPOLIA_RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
  PRIVATE_KEY: "", PRIVATE_KEY_2: "", D35_BROADCAST: "sepolia", D35_MAX_TEST_ETH: "0.01",
});
const { ethers } = require("hardhat");
const benchmark = require("./benchmarkSepolia");
const actor = ethers.getAddress(process.argv[2]);
const wallet = new ethers.VoidSigner(actor, ethers.provider);
const host = "127.0.0.1:18735";
const origin = "http://" + host;
let state = { actor, phase: "preparing", step: 0 };
let resolveHash;

async function submit(phase, action, request, step) {
  const { data, to, gasLimit, maxFeePerGas, maxPriorityFeePerGas } = request;
  const tx = { from: actor, data, value: "0x0", chainId: "0xaa36a7", type: "0x2",
    gas: ethers.toQuantity(gasLimit), maxFeePerGas: ethers.toQuantity(maxFeePerGas),
    maxPriorityFeePerGas: ethers.toQuantity(maxPriorityFeePerGas) };
  if (to) tx.to = to;
  const result = new Promise(resolve => { resolveHash = resolve; });
  state = { actor, phase: "ready", step, action, tx };
  const hash = await result;
  for (let tries = 0; tries < 60; tries++) {
    const sent = await ethers.provider.getTransaction(hash);
    if (sent) {
      if (sent.chainId !== 11155111n || sent.from !== actor || sent.value !== 0n ||
          sent.data !== data || (sent.to || null) !== (to || null) ||
          sent.gasLimit * sent.maxFeePerGas > gasLimit * maxFeePerGas) {
        throw new Error("Wallet transaction differs from the requested transaction. Review its hash.");
      }
      return sent;
    }
    await delay(2000);
  }
  throw new Error("The RPC has not returned this transaction yet. Check its hash before retrying.");
}

const server = http.createServer(async (req, res) => {
  const reply = (code, body, type = "application/json") => {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
    res.end(body);
  };
  if (req.headers.host !== host) return reply(403, "{}");
  if (req.method === "GET" && ["/", "/wallet.js"].includes(req.url)) {
    const page = req.url === "/";
    return reply(200, fs.readFileSync(path.join(__dirname, "wallet", page ? "index.html" : "wallet.js")),
      page ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8");
  }
  if (req.method === "GET" && req.url === "/status") return reply(200, JSON.stringify(state));
  if (req.method !== "POST" || req.headers.origin !== origin || req.headers["content-type"] !== "application/json")
    return reply(403, "{}");
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 512) return reply(413, "{}");
    }
    const { step, hash } = JSON.parse(body);
    if (step !== state.step) return reply(409, "{}");
    if (req.url === "/reserve" && state.phase === "ready") state.phase = "signing";
    else if (req.url === "/cancel" && state.phase === "signing") state.phase = "ready";
    else if (req.url === "/submitted" && state.phase === "signing" && /^0x[0-9a-f]{64}$/i.test(hash)) {
      state.phase = "mining";
      state.hash = hash;
      console.log(state.action, hash);
      resolveHash(hash);
    } else return reply(409, "{}");
    return reply(200, "{}");
  } catch { return reply(400, "{}"); }
});
server.listen(18735, "127.0.0.1", async () => {
  try {
    await benchmark({ wallet, submit, resume: process.argv[3] });
    state.phase = "done";
  } catch (err) {
    state.phase = "stopped";
    state.message = err.shortMessage || err.message;
    console.error(state.message);
  }
});
