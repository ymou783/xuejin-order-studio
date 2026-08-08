const $ = (id) => document.getElementById(id);
const roomIndexKey = "xuejin-room-index";
let rooms = [];

function readJson(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value ?? fallback; } catch { return fallback; } }
function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character])); }
function nowText() { return new Intl.DateTimeFormat("zh-CN", {timeZone:"Asia/Shanghai", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false}).format(new Date()); }
function formatTime(value) { if (!value) return "--"; try { return new Intl.DateTimeFormat("zh-CN", {timeZone:"Asia/Shanghai", month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit", hour12:false}).format(new Date(value)); } catch { return value; } }
function pageUrl(file, orderId) { const url = new URL(file, window.location.href); url.searchParams.set("orderId", orderId); return url.href; }
function statusFor(state, order) { if (!state || state.baseline === null || state.baseline === undefined) return "待开局"; if (state.feedback) return "已结单"; if (Number(state.remaining) < 0) return "待结单"; return "服务中"; }
function statusClass(status) { return status === "服务中" ? "active" : status === "待结单" ? "pending" : status === "已结单" ? "closed" : ""; }

function discoverRooms() {
  const indexed = readJson(roomIndexKey, []);
  const map = new Map((Array.isArray(indexed) ? indexed : []).filter((room) => room?.orderId).map((room) => [room.orderId, room]));
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) || "";
    if (!key.startsWith("xuejin-order:") && !key.startsWith("xuejin-service-room:")) continue;
    const orderId = key.slice(key.indexOf(":") + 1);
    if (!orderId) continue;
    const current = map.get(orderId) || {orderId, createdAt:new Date().toISOString()};
    map.set(orderId, current);
  }
  const result = [...map.values()].map((room) => {
    const order = readJson(`xuejin-order:${room.orderId}`, {orderId:room.orderId});
    const state = readJson(`xuejin-service-room:${room.orderId}`, null);
    return {...room, order, state, status:statusFor(state, order), roomUrl:pageUrl("room.html", room.orderId), updatedAt:room.updatedAt || room.orderUpdatedAt || room.createdAt};
  }).sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  const indexData = result.map(({order, state, ...room}) => room);
  writeJson(roomIndexKey, indexData);
  return result;
}

function showToast(message) { const toast = $("adminToast"); toast.textContent = message; toast.classList.add("show"); window.setTimeout(() => toast.classList.remove("show"), 2200); }
function updateClock() { $("adminClock").textContent = `北京时间 ${new Intl.DateTimeFormat("zh-CN", {timeZone:"Asia/Shanghai", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false}).format(new Date())}`; }

function renderStats(list) {
  $("totalRooms").textContent = list.length;
  $("activeRooms").textContent = list.filter((room) => room.status === "服务中").length;
  $("pendingRooms").textContent = list.filter((room) => room.status === "待结单").length;
  $("closedRooms").textContent = list.filter((room) => room.status === "已结单").length;
}

function renderRooms() {
  rooms = discoverRooms();
  const query = $("searchRooms").value.trim().toLowerCase();
  const status = $("statusFilter").value;
  const filtered = rooms.filter((room) => {
    const searchText = `${room.orderId} ${room.order.companion || ""} ${room.order.board || ""}`.toLowerCase();
    return (!query || searchText.includes(query)) && (status === "all" || room.status === status);
  });
  renderStats(rooms);
  if (!filtered.length) { $("roomsList").innerHTML = '<div class="empty-rooms"><strong>还没有符合条件的房间</strong><span>生成订单小票或点击右上角创建一个独立房间。</span></div>'; return; }
  $("roomsList").innerHTML = filtered.map((room) => {
    const companion = room.state?.currentCompanion || room.order.companion || "待填写";
    const records = room.state?.records?.length || 0;
    return `<article class="room-card" data-order-id="${escapeHtml(room.orderId)}"><div class="room-main"><strong>${escapeHtml(room.orderId)}</strong><small>创建于 ${escapeHtml(formatTime(room.createdAt))}</small></div><div class="room-meta"><span class="status-badge ${statusClass(room.status)}">${escapeHtml(room.status)}</span><small>${escapeHtml(companion)} · ${records} 条服务记录</small></div><div><a class="room-link" href="${escapeHtml(room.roomUrl)}" target="_blank">${escapeHtml(room.roomUrl)}</a><small>金额 ¥${escapeHtml(room.order.amount || "0")} · 更新 ${escapeHtml(formatTime(room.updatedAt))}</small></div><div class="room-actions"><a href="${escapeHtml(pageUrl("index.html", room.orderId))}" target="_blank">订单小票</a><a href="${escapeHtml(room.roomUrl)}" target="_blank">服务房间</a><a href="${escapeHtml(pageUrl("settlement.html", room.orderId))}" target="_blank">结单小票</a><button data-action="logs" type="button">查看日志</button><button class="danger" data-action="clear" type="button">删日志</button><button class="danger" data-action="delete" type="button">删房间</button></div></article>`;
  }).join("");
}

function logText(room) {
  const order = room.order || {};
  return `订单号：${room.orderId}\n类型：${order.type || order.project || "体验单"}\n金额：¥${order.amount || "0"}\n板板：${order.board || "待填写"}\n陪陪：${room.state?.currentCompanion || order.companion || "待填写"}\n备注：${order.remark || "无"}`;
}

function showLogs(orderId) {
  const room = rooms.find((item) => item.orderId === orderId) || discoverRooms().find((item) => item.orderId === orderId);
  if (!room) return;
  const state = room.state || {};
  $("logsTitle").textContent = `订单日志 · ${orderId}`;
  $("logsSubtitle").textContent = `状态：${room.status} · 房间创建于 ${formatTime(room.createdAt)}`;
  $("openOrderStep").href = pageUrl("index.html", orderId);
  $("openRoomStep").href = pageUrl("room.html", orderId);
  $("openSettlementStep").href = pageUrl("settlement.html", orderId);
  const serviceRecords = Array.isArray(state.records) ? state.records : [];
  const serviceHtml = serviceRecords.length ? serviceRecords.map((record) => `<div class="log-item"><small>${escapeHtml(record.time)}</small><strong>${escapeHtml(record.label)}</strong><span>余 ${escapeHtml(record.remaining)}W</span><div></div><small>${escapeHtml(record.detail)}</small></div>`).join("") : '<p class="dialog-copy">还没有服务操作记录。</p>';
  const settlementHtml = state.feedback ? `<div class="log-item"><small>${escapeHtml(state.feedback.submittedAt || state.endedAt || "已结单")}</small><strong>结单评价</strong><span>${escapeHtml(state.feedback.technical)} / ${escapeHtml(state.feedback.attitude)}</span><div></div><small>${escapeHtml(state.feedback.note || "无老板备注")}</small></div>` : '<p class="dialog-copy">尚未生成结单评价。</p>';
  $("logContent").innerHTML = `<section class="log-section"><h3>订单小票</h3><pre>${escapeHtml(logText(room))}</pre></section><section class="log-section"><h3>服务日志 · ${serviceRecords.length} 条</h3>${serviceHtml}</section><section class="log-section"><h3>结单小票</h3>${settlementHtml}</section>`;
  $("logsModal").hidden = false;
}

function clearLogs(orderId) {
  const state = readJson(`xuejin-service-room:${orderId}`, null);
  if (!state) { showToast("这个房间还没有可删除的日志。"); return; }
  if (!window.confirm(`确定要删除 ${orderId} 的订单、服务和结单日志吗？房间本身会保留。`)) return;
  const order = readJson(`xuejin-order:${orderId}`, {orderId});
  const cleaned = {...state, remaining:state.baseline, totalGames:0, successCount:0, totalEaten:0, records:[], feedback:null, endedAt:null, currentCompanion:order.companion || "", companionChanges:[]};
  writeJson(`xuejin-service-room:${orderId}`, cleaned);
  showToast("日志已删除，房间已保留。"); renderRooms();
}

function deleteRoom(orderId) {
  if (!window.confirm(`确定要删除房间 ${orderId} 及其全部日志吗？此操作不可恢复。`)) return;
  localStorage.removeItem(`xuejin-order:${orderId}`); localStorage.removeItem(`xuejin-service-room:${orderId}`);
  writeJson(roomIndexKey, readJson(roomIndexKey, []).filter((room) => room.orderId !== orderId));
  showToast("房间和相关日志已删除。"); renderRooms();
}

function createRoom() {
  const orderId = $("newOrderId").value.trim();
  if (!orderId) { $("createError").textContent = "请输入订单号。"; return; }
  const order = {orderId, amount:$("newAmount").value.trim(), type:$("newType").value.trim() || "体验单", project:$("newType").value.trim() || "体验单", companion:$("newCompanion").value.trim(), board:"", gameType:"", remark:"", date:""};
  writeJson(`xuejin-order:${orderId}`, order);
  const existing = readJson(roomIndexKey, []).filter((room) => room.orderId !== orderId);
  writeJson(roomIndexKey, [{orderId, roomUrl:pageUrl("room.html", orderId), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), status:"待开局"}, ...existing]);
  $("createModal").hidden = true; renderRooms(); showToast("房间已创建。");
  window.open(pageUrl("room.html", orderId), "_blank");
}

const adminAuthKey = "xuejin-admin-authenticated";
const adminPasswordHash = "c5a00f7e33dc53de93e423c01e25449588e4efa81dec57a35174abdc2c8fe8c7";
let adminBooted = false;

async function hashText(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function initializeAdmin() {
  if (adminBooted) return;
  adminBooted = true;
  $("adminGate").hidden = true;
  $("adminApp").hidden = false;
  $("openCreateRoom").addEventListener("click", () => { $("createError").textContent = ""; $("createModal").hidden = false; $("newOrderId").focus(); });
  $("createRoom").addEventListener("click", createRoom);
  $("newOrderId").addEventListener("keydown", (event) => { if (event.key === "Enter") createRoom(); });
  $("refreshRooms").addEventListener("click", renderRooms);
  $("searchRooms").addEventListener("input", renderRooms);
  $("statusFilter").addEventListener("change", renderRooms);
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => { $(button.dataset.close).hidden = true; }));
  $("roomsList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]"); if (!button) return;
    const card = button.closest("[data-order-id]"); const orderId = card?.dataset.orderId; if (!orderId) return;
    if (button.dataset.action === "logs") showLogs(orderId);
    if (button.dataset.action === "clear") clearLogs(orderId);
    if (button.dataset.action === "delete") deleteRoom(orderId);
  });
  updateClock(); window.setInterval(updateClock, 1000); renderRooms();
}

async function unlockAdmin() {
  const password = $("adminPassword").value;
  if (!password) { $("adminGateError").textContent = "请输入后台密码。"; return; }
  if (await hashText(password) !== adminPasswordHash) {
    $("adminGateError").textContent = "密码不正确，请重试。";
    $("adminPassword").select();
    return;
  }
  sessionStorage.setItem(adminAuthKey, "1");
  $("adminGateError").textContent = "";
  initializeAdmin();
}

$("adminGateForm").addEventListener("submit", (event) => { event.preventDefault(); unlockAdmin(); });
$("adminPassword").addEventListener("keydown", (event) => { if (event.key === "Enter") unlockAdmin(); });
if (sessionStorage.getItem(adminAuthKey) === "1") initializeAdmin();
