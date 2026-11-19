const el = id => document.getElementById(id);
let state;
let busy = false;
async function refresh() {
  state = await (await fetch("/status")).json();
  el("account").textContent = "测试钱包 " + state.actor;
  el("step").textContent = state.phase === "done" ? "11 笔交易已完成，链上检查通过" :
    state.phase === "stopped" ? "流程已暂停" :
    state.step ? "第 " + state.step + " / 11 步 · " + state.action : "正在核对网络和余额…";
  el("hash").textContent = state.hash || "";
  if (state.message) el("note").textContent = state.message;
  el("sign").disabled = busy || state.phase !== "ready";
}
async function post(route, payload) {
  const response = await fetch(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error("页面状态已更新，请刷新并核对交易状态。");
}
el("sign").onclick = async () => {
  if (busy || state.phase !== "ready") return;
  busy = true;
  el("sign").disabled = true;
  const { actor, step, tx } = state;
  let reserved = false;
  let hash;
  try {
    const provider = window.ethereum?.providers?.find(p => p.isMetaMask) || window.ethereum;
    if (!provider) throw new Error("请在已安装 MetaMask 扩展的浏览器中打开此页。");
    const [account] = await provider.request({ method: "eth_requestAccounts" });
    if (account.toLowerCase() !== actor.toLowerCase()) throw new Error("请在 MetaMask 中选择页面显示的测试账户。");
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
    if (await provider.request({ method: "eth_chainId" }) !== "0xaa36a7") throw new Error("请选择 Ethereum Sepolia。");
    await post("/reserve", { step });
    reserved = true;
    hash = await provider.request({ method: "eth_sendTransaction", params: [tx] });
    await post("/submitted", { step, hash });
    el("note").textContent = "已发送，正在等待确认。";
  } catch (err) {
    if (reserved && !hash && Number(err.code) === 4001) await post("/cancel", { step });
    el("note").textContent = hash ? "已发送，请保留交易哈希 " + hash : err.message;
  } finally {
    busy = false;
    await refresh();
  }
};
refresh();
setInterval(() => refresh().catch(() => { el("note").textContent = "无法连接本机部署进程。"; }), 2000);
