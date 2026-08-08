const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const orderId = (params.get("orderId") || "").trim();
const storageKey = `xuejin-service-room:${orderId}`;
const orderKey = `xuejin-order:${orderId}`;
const roomIndexKey = "xuejin-room-index";
const stateTemplate = () => ({ orderId, baseline: null, remaining: null, totalGames: 0, successCount: 0, totalEaten: 0, records: [], currentCompanion: "", companionChanges: [] });
let state = stateTemplate();
let failureMode = "plus60";

function roundW(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function formatW(value) { return roundW(value).toLocaleString("zh-CN", {maximumFractionDigits: 2}); }
function nowText() { return new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false}).format(new Date()); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[character])); }
function isStarted() { return Number.isFinite(state.baseline); }
function isEnded() { return isStarted() && state.remaining < 0; }
function isLowGuarantee() { return isStarted() && state.remaining >= -100 && state.remaining <= 0; }

function saveState() {
  if (!orderId) return;
  localStorage.setItem(storageKey, JSON.stringify(state));
  try {
    const rooms = JSON.parse(localStorage.getItem(roomIndexKey) || "[]");
    const list = Array.isArray(rooms) ? rooms : [];
    const existing = list.find((room) => room.orderId === orderId);
    const roomUrl = new URL("room.html", window.location.href).href;
    const status = state.feedback ? "已结单" : isEnded() ? "待结单" : state.baseline === null ? "待开局" : "服务中";
    const room = {...(existing || {}), orderId, roomUrl, status, updatedAt: new Date().toISOString(), createdAt: existing?.createdAt || new Date().toISOString()};
    localStorage.setItem(roomIndexKey, JSON.stringify([room, ...list.filter((item) => item.orderId !== orderId)]));
  } catch { /* localStorage index is optional; the room state remains authoritative */ }
}
function getInitialCompanion() {
  try {
    const order = JSON.parse(localStorage.getItem(orderKey) || "null");
    return order && typeof order.companion === "string" ? order.companion.trim() : "";
  } catch { return ""; }
}
function loadState() {
  if (!orderId) return;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && saved.orderId === orderId) state = {...stateTemplate(), ...saved, companionChanges: Array.isArray(saved.companionChanges) ? saved.companionChanges : []};
  } catch { state = stateTemplate(); }
  if (!state.currentCompanion) state.currentCompanion = getInitialCompanion();
}

function showToast(message) {
  const toast = $("roomToast");
  toast.textContent = message; toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function setActionStatus(message, error = false) {
  $("actionStatus").textContent = message;
  $("actionStatus").style.color = error ? "#b8554d" : "";
}

function addRecord(kind, label, value, delta, detail) {
  state.totalGames += 1;
  if (kind === "success") state.successCount += 1;
  if (value > 0) state.totalEaten = roundW(state.totalEaten + value);
  state.remaining = roundW(state.remaining + delta);
  state.records.unshift({id: Date.now() + Math.random(), kind, label, value: roundW(value), delta: roundW(delta), remaining: state.remaining, detail, time: nowText()});
  saveState(); render();
  if (isEnded()) setActionStatus("基础保底已小于 0，游戏结束。", true);
  else setActionStatus("已记录本局，数据已保存。", false);
}

function addGuaranteeAdjustment(value, label = "调整当前基础保底") {
  state.remaining = roundW(state.remaining + value);
  state.records.unshift({
    id: Date.now() + Math.random(),
    kind: "adjustment",
    label,
    value: roundW(value),
    delta: roundW(value),
    remaining: state.remaining,
    detail: "只调整基础保底，不计入战绩",
    time: nowText()
  });
  saveState(); render();
  if (isEnded()) setActionStatus("基础保底已小于 0，游戏结束。", true);
  else setActionStatus("保底已调整，操作记录已保留。", false);
}

function recordAdditionalGuarantee() {
  if (!canAdjust()) return;
  const value = Number($("guaranteeValue").value);
  if (!Number.isFinite(value) || value <= 0) { setActionStatus("请输入大于 0 的追加保底。", true); $("guaranteeValue").focus(); return; }
  addGuaranteeAdjustment(value, "追加基础保底");
  $("guaranteeValue").value = "";
}

function recordCompanionChange() {
  if (!canAdjust()) return;
  const nextCompanion = $("companionInput").value.trim();
  if (!nextCompanion) { setActionStatus("请输入新的打手 / 陪陪名字。", true); $("companionInput").focus(); return; }
  const previousCompanion = state.currentCompanion || getInitialCompanion() || "待填写";
  if (nextCompanion === previousCompanion) { setActionStatus("新的陪陪名字和当前相同，无需重复修改。", true); return; }
  state.currentCompanion = nextCompanion;
  state.companionChanges.push({from: previousCompanion, to: nextCompanion, time: nowText()});
  state.records.unshift({id: Date.now() + Math.random(), kind: "companion", label: "修改陪陪", value: 0, delta: 0, remaining: state.remaining, detail: `${previousCompanion} → ${nextCompanion}`, time: nowText()});
  saveState(); render(); $("companionInput").value = "";
  setActionStatus("陪陪已修改，结单时会显示最新名字。", false);
}

function recordSuccess() {
  if (!canRecord()) return;
  const value = Number($("successValue").value);
  if (!Number.isFinite(value) || value <= 0) { setActionStatus("请输入大于 0 的撤离价值。", true); $("successValue").focus(); return; }
  addRecord("success", "撤离成功", value, -value, `保底 -${formatW(value)}W`);
  $("successValue").value = "";
}

function recordFailure() {
  if (!canRecord()) return;
  if (failureMode === "manual") {
    const value = Number($("failureValue").value);
    if (!Number.isFinite(value) || value <= 0) { setActionStatus("请输入大于 0 的撤离金额。", true); $("failureValue").focus(); return; }
    addRecord("failure", "撤离失败 · 手动金额 +60W", value, 60 - value, `保底 -${formatW(value)}W + 60W`);
    $("failureValue").value = "";
    return;
  }
  if (failureMode === "plus60") addRecord("failure", "撤离失败 · +60W 保底", 0, 60, "保底 +60W");
  else addRecord("failure", "撤离失败 · 不加保底", 0, 0, "只记录，不改变保底");
}

function canRecord() {
  if (!isStarted()) { showToast("请先设置基础保底。"); $("baselineModal").hidden = false; return false; }
  if (isEnded()) { setActionStatus("基础保底已小于 0，游戏结束。", true); return false; }
  return true;
}

function canAdjust() {
  if (!isStarted()) { showToast("请先设置基础保底。"); $("baselineModal").hidden = false; return false; }
  return true;
}

function openFeedbackModal() {
  if (isLowGuarantee()) {
    $("lowGuaranteeModal").hidden = false;
    $("closeLowGuarantee").focus();
    setActionStatus("当前处于卡保底区间，请先补充保底。", true);
    return;
  }
  if (!isEnded()) { setActionStatus("基础保底小于 0 后才能结束订单。", true); return; }
  $("feedbackError").textContent = "";
  $("feedbackModal").hidden = false;
}

function submitFeedback() {
  const technical = document.querySelector('input[name="technicalScore"]:checked');
  const attitude = document.querySelector('input[name="attitudeScore"]:checked');
  if (!technical || !attitude) {
    $("feedbackError").textContent = "请先完成操作技术和服务态度两项评价。";
    return;
  }
  state.feedback = {
    technical: Number(technical.value),
    attitude: Number(attitude.value),
    note: $("feedbackNote").value.trim(),
    submittedAt: nowText()
  };
  state.endedAt = state.endedAt || nowText();
  saveState();
  const settlementUrl = new URL("settlement.html", window.location.href);
  settlementUrl.searchParams.set("orderId", orderId);
  window.location.href = settlementUrl.href;
}

function renderRecords() {
  const list = $("recordsList");
  $("recordCount").textContent = `${state.records.length} 条`;
  if (!state.records.length) {
    list.innerHTML = '<div class="empty-records"><span>✦</span><p>还没有记录</p><small>完成第一局后，记录会出现在这里。</small></div>';
    return;
  }
  list.innerHTML = state.records.map((record, index) => `<div class="record-row ${record.kind}"><span class="record-index">${String(state.records.length - index).padStart(2, "0")}</span><div class="record-main"><strong>${escapeHtml(record.label)}</strong><small>${escapeHtml(record.time)} · ${escapeHtml(record.detail)}</small></div><span class="record-value">${record.kind === "adjustment" ? `${record.value > 0 ? "+" : ""}${formatW(record.value)}W` : record.value > 0 ? `+${formatW(record.value)}W` : record.delta > 0 ? "+60W" : "—"}</span><span class="record-remaining">余 ${formatW(record.remaining)}W</span></div>`).join("");
}

function renderCompanion() {
  const current = state.currentCompanion || getInitialCompanion();
  $("currentCompanion").textContent = current || "待填写";
  if (!state.companionChanges.length) {
    $("companionHistory").textContent = "暂未修改";
    return;
  }
  $("companionHistory").textContent = `修改 ${state.companionChanges.length} 次：${state.companionChanges.map((change) => change.to).join(" → ")}`;
}

function render() {
  const started = isStarted();
  $("roomIdTop").textContent = orderId || "缺少订单号";
  $("roomKey").textContent = orderId || "缺少订单号";
  $("remainingGuarantee").textContent = started ? formatW(state.remaining) : "--";
  $("guaranteeHint").textContent = started ? `基础保底 ${formatW(state.baseline)}W` : "设置基础保底后开始计算";
  $("guaranteeAlert").hidden = !isLowGuarantee();
  $("successCount").textContent = state.successCount;
  $("totalGames").textContent = state.totalGames;
  $("successRate").textContent = state.totalGames ? `${((state.successCount / state.totalGames) * 100).toFixed(1)}%` : "0%";
  $("totalEaten").textContent = formatW(state.totalEaten);
  $("roundState").textContent = !started ? "等待开始" : isEnded() ? "已结束" : "进行中";
  $("balanceCard").classList.toggle("ended", isEnded());
  $("endedBanner").hidden = !isEnded();
  document.querySelectorAll(".record-button, .mode-button, .value-entry input, .manual-failure input").forEach((element) => { element.disabled = isEnded() || !started; });
  document.querySelectorAll(".guarantee-input").forEach((element) => { element.disabled = !started; });
  $("companionInput").disabled = !started;
  $("changeCompanionButton").disabled = !started;
  $("adjustGuaranteeButton").disabled = !started;
  $("endOrderButton").disabled = !isEnded();
  renderCompanion();
  renderRecords();
}

function initializeRoom() {
  if (!orderId) {
    $("baselineError").textContent = "缺少订单号，无法创建服务房间。请从订单页面重新进入。";
    $("startRoomButton").disabled = true;
  }
  loadState();
  $("baselineModal").hidden = isStarted();
  render();
  if (window.XuejinCloud?.isEnabled()) {
    window.XuejinCloud.watchRoom(orderId, () => { loadState(); render(); });
  }
}

$("startRoomButton").addEventListener("click", () => {
  const value = Number($("baseGuaranteeInput").value);
  if (!Number.isFinite(value)) { $("baselineError").textContent = "基础保底必须填写。"; return; }
  state = {...stateTemplate(), baseline: roundW(value), remaining: roundW(value), currentCompanion: getInitialCompanion()};
  saveState(); $("baselineModal").hidden = true; render(); showToast("服务房间已开始。");
});
$("baseGuaranteeInput").addEventListener("keydown", (event) => { if (event.key === "Enter") $("startRoomButton").click(); });
$("successButton").addEventListener("click", recordSuccess);
$("failureButton").addEventListener("click", recordFailure);
$("addGuaranteeButton").addEventListener("click", recordAdditionalGuarantee);
$("changeCompanionButton").addEventListener("click", recordCompanionChange);
$("successValue").addEventListener("keydown", (event) => { if (event.key === "Enter") recordSuccess(); });
$("failureValue").addEventListener("keydown", (event) => { if (event.key === "Enter") recordFailure(); });
$("guaranteeValue").addEventListener("keydown", (event) => { if (event.key === "Enter") recordAdditionalGuarantee(); });
$("companionInput").addEventListener("keydown", (event) => { if (event.key === "Enter") recordCompanionChange(); });
document.querySelectorAll(".mode-button").forEach((button) => button.addEventListener("click", () => {
  failureMode = button.dataset.mode;
  document.querySelectorAll(".mode-button").forEach((item) => item.classList.toggle("active", item === button));
  $("manualFailure").hidden = failureMode !== "manual";
  $("failureButton").textContent = failureMode === "plus60" ? "记录失败 · +60W 保底" : failureMode === "none" ? "记录失败 · 不加保底" : "记录失败 · 金额 +60W";
}));
$("adjustGuaranteeButton").addEventListener("click", () => {
  if (!canAdjust()) return;
  $("adjustmentError").textContent = "";
  $("adjustGuaranteeInput").value = "";
  $("adjustmentModal").hidden = false;
  window.setTimeout(() => $("adjustGuaranteeInput").focus(), 0);
});
$("cancelAdjustment").addEventListener("click", () => { $("adjustmentModal").hidden = true; });
$("submitAdjustment").addEventListener("click", () => {
  const value = Number($("adjustGuaranteeInput").value);
  if (!Number.isFinite(value) || value === 0) { $("adjustmentError").textContent = "请输入不为 0 的调整数值。正数增加，负数扣减。"; return; }
  $("adjustmentModal").hidden = true;
  addGuaranteeAdjustment(value);
});
$("adjustGuaranteeInput").addEventListener("keydown", (event) => { if (event.key === "Enter") $("submitAdjustment").click(); });
$("endOrderButton").addEventListener("click", openFeedbackModal);
$("cancelFeedback").addEventListener("click", () => { $("feedbackModal").hidden = true; });
$("submitFeedback").addEventListener("click", submitFeedback);
$("closeLowGuarantee").addEventListener("click", () => { $("lowGuaranteeModal").hidden = true; $("adjustGuaranteeButton").focus(); });
$("lowGuaranteeModal").addEventListener("click", (event) => { if (event.target.id === "lowGuaranteeModal") $("lowGuaranteeModal").hidden = true; });

window.XuejinSyncReady.then(initializeRoom);
