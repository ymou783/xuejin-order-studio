const $ = (id) => document.getElementById(id);

const fields = {
  notice: $("noticeInput"), orderId: $("orderId"), amount: $("amount"), project: $("project"),
  gameType: $("gameType"), receiptType: $("receiptType"), board: $("boardName"), companion: $("companionName"),
  date: $("dateValue"), remark: $("remark")
};

const preview = {
  date: $("previewDate"), type: $("previewType"), amount: $("previewAmount"), board: $("previewBoard"),
  companion: $("previewCompanion"), orderId: $("previewOrderId"), note: $("previewNote"), extra: $("previewExtra"), dateLong: $("previewDateLong")
};

let saveInProgress = false;
let saveCooldownUntil = 0;
const roomIndexKey = "xuejin-room-index";

function beijingParts() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric"
  }).formatToParts(new Date());
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function updateBeijingClock() {
  const now = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).format(new Date());
  $("beijingClock").textContent = now;
  const date = beijingParts();
  fields.date.value = `${date.month}月${date.day}日`;
}

function readLine(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^\\s*${escaped}\\s*(?:[:：]|\\s)\\s*(.+?)\\s*$`, "mi"));
  return match ? match[1].trim() : "";
}

function readCompanionFromRemark(remark) {
  const match = String(remark).match(/派(?:单)?\s*[:：]?\s*(.+)$/);
  return match ? match[1].trim() : "";
}

function parseNotice() {
  const text = fields.notice.value;
  if (!text.trim()) {
    renderReceipt();
    setStatus("等待粘贴订单通知。", false);
    return;
  }
  const values = {
    orderId: readLine(text, "订单号"), amount: readLine(text, "订单金额"), project: readLine(text, "陪玩项目"),
    gameType: readLine(text, "游戏类型"), remark: readLine(text, "下单项目")
  };
  if (values.amount) values.amount = values.amount.replace(/[¥￥,\s]/g, "");
  values.remark = values.remark.replace(/^备注\s*[:：]\s*/, "").trim();
  const companion = readCompanionFromRemark(values.remark);
  if (values.project) fields.receiptType.value = values.project;
  if (companion) fields.companion.value = companion;
  Object.entries(values).forEach(([key, value]) => { if (value) fields[key].value = value; });
  renderReceipt();
  setStatus("已解析通知，内容已同步到下方字段。", true);
}

function renderReceipt() {
  const date = beijingParts();
  const dateText = `${date.month}月${date.day}日`;
  const dateLong = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  fields.date.value = dateText;
  preview.date.textContent = dateText;
  preview.dateLong.textContent = dateLong;
  preview.type.textContent = fields.receiptType.value.trim() || "体验单";
  preview.amount.textContent = fields.amount.value.trim() || "0";
  const board = fields.board.value.trim();
  preview.board.textContent = board || "待填写";
  preview.board.classList.toggle("empty-value", !board);
  preview.companion.textContent = fields.companion.value.trim() || "待填写";
  preview.orderId.textContent = fields.orderId.value.trim() || "待填写";
  const note = fields.remark.value.trim();
  preview.note.textContent = note ? `备注：${note}` : "";
  preview.note.hidden = !note;
  const extras = [fields.project.value.trim(), fields.gameType.value.trim()].filter(Boolean).join(" · ");
  preview.extra.textContent = extras;
  preview.extra.hidden = !extras;
}

function receiptText() {
  const board = fields.board.value.trim() || "待填写";
  const companion = fields.companion.value.trim() || "待填写";
  const note = fields.remark.value.trim();
  const extras = [fields.project.value.trim(), fields.gameType.value.trim()].filter(Boolean).join(" · ");
  const lines = [
    "/\\__/\\       ⛰雪烬电竞·",
    "   ꒰ ⸝⸝ɞ̴̶̷ ·̮ ɞ̴̶̷ ⸝⸝꒱‎   订单小票",
    "╭ ── 🅻🅾🆅🅴 ᰔᩚᥫᩣ ── ╮",
    "ᕳ♡ᕲ 三角洲小记",
    `🎀时间：${fields.date.value}`,
    `🫧类型：${fields.receiptType.value.trim() || "体验单"}`,
    `🎀金额：${fields.amount.value.trim() || "0"}`,
    `🫧板板：${board}`,
    `🎀陪陪：${companion}`,
    `订单号：${fields.orderId.value.trim() || "待填写"}`
  ];
  if (note) lines.push(`备注：${note}`);
  if (extras) lines.push(extras);
  return lines.join("\n");
}

function setStatus(message, success = false) {
  const status = $("statusLine");
  status.textContent = message;
  status.style.color = success ? "#779475" : "";
}

function readRoomIndex() {
  try { const rooms = JSON.parse(localStorage.getItem(roomIndexKey) || "[]"); return Array.isArray(rooms) ? rooms : []; } catch { return []; }
}

function writeRoomIndex(rooms) { localStorage.setItem(roomIndexKey, JSON.stringify(rooms)); }

function roomUrlFor(orderId) {
  const roomUrl = new URL("room.html", window.location.href);
  roomUrl.searchParams.set("orderId", orderId);
  return roomUrl.href;
}

function currentOrderData() {
  return {
    orderId: fields.orderId.value.trim(), type: fields.receiptType.value.trim(), amount: fields.amount.value.trim(), board: fields.board.value.trim(),
    companion: fields.companion.value.trim(), date: fields.date.value.trim(), project: fields.project.value.trim(), gameType: fields.gameType.value.trim(), remark: fields.remark.value.trim()
  };
}

function showRoomLink(roomUrl) {
  const row = $("roomLinkRow");
  if (!roomUrl) { row.hidden = true; return; }
  $("roomLink").href = roomUrl;
  $("roomLink").textContent = roomUrl;
  row.hidden = false;
}

function ensureRoomCreated() {
  const order = currentOrderData();
  if (!order.orderId) {
    setStatus("请先填写订单号，才能创建房间。", false);
    fields.orderId.focus();
    return "";
  }
  localStorage.setItem(`xuejin-order:${order.orderId}`, JSON.stringify(order));
  const rooms = readRoomIndex();
  const existing = rooms.find((room) => room.orderId === order.orderId);
  const roomUrl = roomUrlFor(order.orderId);
  const room = {
    ...(existing || {}), orderId: order.orderId, roomUrl, orderUpdatedAt: new Date().toISOString(),
    createdAt: existing?.createdAt || new Date().toISOString(), status: existing?.status || "待开局"
  };
  writeRoomIndex([room, ...rooms.filter((item) => item.orderId !== order.orderId)]);
  showRoomLink(roomUrl);
  return roomUrl;
}

function loadOrderFromQuery() {
  const queryOrderId = new URLSearchParams(window.location.search).get("orderId");
  if (!queryOrderId) return false;
  try {
    const order = JSON.parse(localStorage.getItem(`xuejin-order:${queryOrderId}`) || "null");
    if (!order) return false;
    Object.entries({orderId:"orderId", amount:"amount", project:"project", gameType:"gameType", receiptType:"type", board:"board", companion:"companion", date:"date", remark:"remark"}).forEach(([field, key]) => {
      if (typeof order[key] === "string" && fields[field]) fields[field].value = order[key];
    });
    showRoomLink(roomUrlFor(queryOrderId));
    return true;
  } catch { return false; }
}

function startServiceRoom() {
  const orderId = fields.orderId.value.trim();
  if (!orderId) {
    setStatus("请先填写订单号，再开始服务。", false);
    fields.orderId.focus();
    return;
  }
  renderReceipt();
  const roomUrl = ensureRoomCreated();
  if (roomUrl) window.location.href = roomUrl;
}

function escapeSvg(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;"}[character]));
}

function exportReceiptSvg() {
  const date = beijingParts();
  const dateShort = `${date.month}月${date.day}日`;
  const dateLong = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  const type = fields.receiptType.value.trim() || "体验单";
  const amount = fields.amount.value.trim() || "0";
  const board = fields.board.value.trim() || "待填写";
  const companion = fields.companion.value.trim() || "待填写";
  const orderId = fields.orderId.value.trim() || "待填写";
  const note = fields.remark.value.trim();
  const project = fields.project.value.trim();
  const gameType = fields.gameType.value.trim();
  const extras = [project, gameType].filter(Boolean).join(" · ");
  const row = (y, icon, label, value, valueClass = "") => `<line x1="190" y1="${y - 22}" x2="810" y2="${y - 22}" stroke="#c9beb1" stroke-dasharray="5 6"/><text x="190" y="${y}" class="label"><tspan class="icon">${icon}</tspan> ${label}</text><text x="810" y="${y}" text-anchor="end" class="value ${valueClass}">${escapeSvg(value)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500">
    <defs>
      <pattern id="grain" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".7" fill="#6d5946" opacity=".08"/><circle cx="9" cy="8" r=".5" fill="#6d5946" opacity=".06"/></pattern>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#57443c" flood-opacity=".22"/></filter>
      <style>
        .ink{fill:#29232b;font-family:'Noto Sans SC','Microsoft YaHei',sans-serif}.label{fill:#29232b;font-size:27px;font-weight:800}.value{fill:#4d3c4c;font-size:25px;font-family:'DM Mono','Microsoft YaHei',monospace}.icon{font-size:31px}.tiny{fill:#8b7c87;font-size:20px;font-family:'Noto Sans SC','Microsoft YaHei',sans-serif}.red{fill:#bd5148}.title{fill:#29232b;font-size:62px;font-weight:800;letter-spacing:8px}.small{fill:#29232b;font-size:22px;font-weight:700}.amount{fill:#b94f43;font-size:27px;font-weight:800}
      </style>
    </defs>
    <rect width="1000" height="1500" fill="#e9e0db"/>
    <rect x="95" y="45" width="810" height="1410" rx="3" fill="#fffaf0" filter="url(#shadow)"/>
    <rect x="95" y="45" width="810" height="1410" fill="url(#grain)" opacity=".85"/>
    ${Array.from({length:33}, (_, i) => `<circle cx="95" cy="${75 + i * 43}" r="7" fill="#e9e0db"/><circle cx="905" cy="${75 + i * 43}" r="7" fill="#e9e0db"/>`).join("")}
    <text x="145" y="105" class="red" font-size="20">✦　⌁　✦</text><text x="855" y="105" text-anchor="end" class="ink" font-size="22" font-weight="800">雪烬电竞·</text>
    <text x="500" y="151" text-anchor="middle" class="ink" font-size="23" font-family="DM Mono">/\\___/\\</text><text x="500" y="177" text-anchor="middle" class="ink" font-size="22" font-family="DM Mono">꒰ ⸝⸝ɞ̴̶̷ ·̮ ɞ̴̶̷ ⸝⸝꒱‎</text>
    <text x="500" y="254" text-anchor="middle" class="title">订单小票</text>
    <rect x="346" y="276" width="308" height="42" rx="4" fill="#bd5148"/><text x="500" y="305" text-anchor="middle" fill="#fff9ef" font-size="23" font-weight="700" font-family="Noto Sans SC">✦ 三角洲小记 ✦</text>
    <circle cx="500" cy="396" r="62" fill="none" stroke="#2e2930" stroke-width="4"/><path d="M450 414 477 380 491 395 510 363 548 414M455 424h90M430 396h-27m144 0h-27M454 356l-18-18m110 18 18-18M453 440l-18 18m110-18 18 18" fill="none" stroke="#2e2930" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M487 429 500 410 513 429Z" fill="#2e2930"/>
    <line x1="180" y1="472" x2="820" y2="472" stroke="#a99d91" stroke-width="2"/>
    ${row(530, "◷", "时间", dateShort)}
    ${row(584, "⚔", "类型", type)}
    ${row(638, "▤", "金额", `¥${amount}`, "amount")}
    ${row(692, "⌁", "板板", board)}
    ${row(746, "⌁", "陪陪", companion)}
    <line x1="180" y1="782" x2="820" y2="782" stroke="#c9beb1" stroke-dasharray="5 6"/><text x="190" y="820" class="label">▣ 订单号</text><text x="810" y="820" text-anchor="end" class="value" font-size="21">${escapeSvg(orderId)}</text>
    ${note ? `<text x="190" y="860" class="tiny">备注：${escapeSvg(note)}</text>` : ""}
    ${extras ? `<text x="190" y="894" class="red" font-size="20" font-family="Noto Sans SC">${escapeSvg(extras)}</text>` : ""}
    <text x="190" y="945" class="label">▦ 日期</text><text x="810" y="945" text-anchor="end" class="value">${dateLong}</text>
    <path d="M145 1065 210 1015 254 1048 323 948 378 1030 443 975 510 1045 589 939 654 1030 720 980 784 1048 855 1003v95H145Z" fill="#2e2930"/><path d="M145 1067h710M323 948l-18 52 36-18 28 39M589 939l-25 67 36-22 37 50M443 975l-14 55 29-22 30 40M190 1067v-39m-16 39 16-25 16 25M810 1067v-45m-18 45 18-28 18 28" fill="none" stroke="#2e2930" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(768 1020) rotate(-13)"><circle cx="0" cy="0" r="58" fill="#fffaf0" stroke="#bd5148" stroke-width="4"/><circle cx="0" cy="0" r="48" fill="none" stroke="#bd5148" stroke-width="2"/><text x="0" y="14" text-anchor="middle" font-size="34">🐾</text></g>
    <text x="160" y="1150" class="red" font-size="18">✦</text><text x="500" y="1150" text-anchor="middle" class="tiny">谢谢惠顾 · Have a nice game</text><text x="840" y="1150" class="red" font-size="18">✦</text>
  </svg>`;
}

function exportReceiptSvgCompact() {
  const date = beijingParts();
  const dateShort = `${date.month}月${date.day}日`;
  const dateLong = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  const type = fields.receiptType.value.trim() || "体验单";
  const amount = fields.amount.value.trim() || "0";
  const board = fields.board.value.trim() || "待填写";
  const companion = fields.companion.value.trim() || "待填写";
  const orderId = fields.orderId.value.trim() || "待填写";
  const note = fields.remark.value.trim();
  const extras = [fields.project.value.trim(), fields.gameType.value.trim()].filter(Boolean).join(" · ");
  const row = (y, icon, label, value, valueClass = "") => `<line x1="180" y1="${y - 25}" x2="820" y2="${y - 25}" stroke="#c9beb1" stroke-dasharray="5 6"/><text x="190" y="${y}" dominant-baseline="middle" class="label"><tspan class="icon">${icon}</tspan> ${label}</text><text x="810" y="${y}" dominant-baseline="middle" text-anchor="end" class="value ${valueClass}">${escapeSvg(value)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1380" viewBox="0 0 1000 1380">
    <defs>
      <pattern id="grain-compact" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".7" fill="#6d5946" opacity=".08"/><circle cx="9" cy="8" r=".5" fill="#6d5946" opacity=".06"/></pattern>
      <filter id="shadow-compact" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#57443c" flood-opacity=".22"/></filter>
      <style>
        .ink{fill:#29232b;font-family:'Noto Sans SC','Microsoft YaHei',sans-serif}.label{fill:#29232b;font-size:27px;font-weight:800}.value{fill:#4d3c4c;font-size:25px;font-family:'DM Mono','Microsoft YaHei',monospace}.icon{font-size:31px}.tiny{fill:#8b7c87;font-size:19px;font-family:'Noto Sans SC','Microsoft YaHei',sans-serif}.red{fill:#bd5148}.title{fill:#29232b;font-size:58px;font-weight:900;letter-spacing:7px}
      </style>
    </defs>
    <rect width="1000" height="1380" fill="#e9e0db"/>
    <rect x="88" y="36" width="824" height="1308" rx="3" fill="#fffaf0" filter="url(#shadow-compact)"/>
    <rect x="88" y="36" width="824" height="1308" fill="url(#grain-compact)" opacity=".85"/>
    ${Array.from({length:30}, (_, i) => `<circle cx="88" cy="${66 + i * 43}" r="7" fill="#e9e0db"/><circle cx="912" cy="${66 + i * 43}" r="7" fill="#e9e0db"/>`).join("")}
    <text x="142" y="97" class="red" font-size="20">✦　⌁　✦</text><text x="858" y="97" text-anchor="end" class="ink" font-size="22" font-weight="800">雪烬电竞·</text>
    <text x="500" y="150" text-anchor="middle" class="ink" font-size="23" font-family="DM Mono">/\\___/\\</text><text x="500" y="177" text-anchor="middle" class="ink" font-size="22" font-family="DM Mono">꒰ ⸝⸝ɞ̴̶̷ ·̮ ɞ̴̶̷ ⸝⸝꒱‎</text>
    <text x="500" y="252" text-anchor="middle" class="title">订单小票</text>
    <rect x="344" y="275" width="312" height="42" rx="4" fill="#bd5148"/><text x="500" y="304" text-anchor="middle" fill="#fff9ef" font-size="23" font-weight="700" font-family="Noto Sans SC">✦ 三角洲小记 ✦</text>
    <circle cx="500" cy="391" r="60" fill="none" stroke="#2e2930" stroke-width="4"/><path d="M451 411 477 378 491 393 510 360 549 411M455 421h91M430 391h-27m144 0h-27M454 352l-18-18m110 18 18-18M453 437l-18 18m110-18 18 18" fill="none" stroke="#2e2930" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M487 426 500 407 513 426Z" fill="#2e2930"/>
    <line x1="180" y1="468" x2="820" y2="468" stroke="#a99d91" stroke-width="2"/>
    ${row(526, "◷", "时间", dateShort)}
    ${row(580, "⚔", "类型", type)}
    ${row(634, "▤", "金额", `¥${amount}`, "amount")}
    ${row(688, "⌁", "板板", board)}
    ${row(742, "⌁", "陪陪", companion)}
    <line x1="180" y1="778" x2="820" y2="778" stroke="#c9beb1" stroke-dasharray="5 6"/><text x="190" y="817" dominant-baseline="middle" class="label">▣ 订单号</text><text x="810" y="817" dominant-baseline="middle" text-anchor="end" class="value" font-size="21">${escapeSvg(orderId)}</text>
    ${note ? `<text x="190" y="855" class="tiny">备注：${escapeSvg(note)}</text>` : ""}
    ${extras ? `<text x="190" y="888" class="red" font-size="20" font-family="Noto Sans SC">${escapeSvg(extras)}</text>` : ""}
    <text x="190" y="945" dominant-baseline="middle" class="label">▦ 日期</text><text x="810" y="945" dominant-baseline="middle" text-anchor="end" class="value">${dateLong}</text>
    <path d="M145 1178 205 1134 254 1167 322 1088 376 1152 440 1111 501 1167 570 1082 634 1150 700 1110 766 1166 855 1110" fill="none" stroke="#2e2930" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M145 1192 215 1148 279 1192 348 1135 416 1192 486 1142 557 1192 628 1133 701 1192 773 1146 855 1192" fill="none" stroke="#81746f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M145 1195h710M199 1195v-34m-14 34 14-23 14 23M810 1195v-34m-14 34 14-23 14 23" fill="none" stroke="#2e2930" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(770 1134) rotate(-13)"><circle cx="0" cy="0" r="55" fill="#fffaf0" stroke="#bd5148" stroke-width="4"/><circle cx="0" cy="0" r="46" fill="none" stroke="#bd5148" stroke-width="2"/><circle cx="-10" cy="-8" r="5" fill="#bd5148"/><circle cx="0" cy="-13" r="5" fill="#bd5148"/><circle cx="10" cy="-8" r="5" fill="#bd5148"/><path d="M-11 5c0-9 22-9 22 0 0 9-22 9-22 0Z" fill="#bd5148"/></g>
    <text x="165" y="1268" class="red" font-size="18">✦</text><text x="500" y="1268" text-anchor="middle" class="tiny">谢谢惠顾 · Have a nice game</text><text x="835" y="1268" class="red" font-size="18">✦</text>
  </svg>`;
}

async function saveReceiptImage() {
  if (saveInProgress) {
    setStatus("小票图片正在保存，请稍候。", false);
    return;
  }
  if (Date.now() < saveCooldownUntil) return;
  saveInProgress = true;
  const saveButton = $("saveButton");
  saveButton.disabled = true;
  const unlockSave = () => { saveInProgress = false; saveCooldownUntil = Date.now() + 2000; saveButton.disabled = false; };
  renderReceipt();
  const svg = polishReceiptSvg(exportReceiptSvgCompact());
  const svgBlob = new Blob([svg], {type: "image/svg+xml;charset=utf-8"});
  const svgUrl = URL.createObjectURL(svgBlob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000; canvas.height = 1380;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    canvas.toBlob((pngBlob) => {
      if (!pngBlob) {
        unlockSave();
        setStatus("图片生成失败，请再试一次。", false);
        return;
      }
      const downloadUrl = URL.createObjectURL(pngBlob);
      const link = document.createElement("a");
      const safeId = (fields.orderId.value.trim() || "receipt").replace(/[^a-zA-Z0-9_-]/g, "-");
      link.href = downloadUrl; link.download = `雪烬电竞-订单小票-${safeId}.png`; link.click();
      URL.revokeObjectURL(downloadUrl); URL.revokeObjectURL(svgUrl);
      unlockSave();
      $("toast").textContent = "小票 PNG 已生成，浏览器已开始下载。";
      setStatus("图片已保存为 PNG。", true);
    }, "image/png");
  };
  image.onerror = () => {
    unlockSave();
    URL.revokeObjectURL(svgUrl);
    setStatus("图片生成失败，请再试一次。", false);
  };
  image.src = svgUrl;
  $("toast").textContent = "小票图片已生成，正在保存。";
  $("toast").classList.add("show");
  setStatus("已生成 PNG 小票图片。", true);
  window.setTimeout(() => $("toast").classList.remove("show"), 2200);
}

function polishReceiptSvg(svg) {
  return svg
    .replace(/\s*<text x="500" y="150"[\s\S]*?<\/text><text x="500" y="177"[\s\S]*?<\/text>/, "")
    .replace(/font-size="22" font-weight="800">雪烬电竞·/, 'font-size="30" font-weight="800">雪烬电竞·')
    .replace(/font-size:27px/g, "font-size:30px")
    .replace(/font-size:25px/g, "font-size:28px")
    .replace(/font-size:19px/g, "font-size:21px")
    .replace(/font-size:58px/g, "font-size:64px");
}

async function copyReceipt() {
  renderReceipt();
  const text = receiptText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text; helper.style.position = "fixed"; helper.style.opacity = "0";
    document.body.appendChild(helper); helper.select(); document.execCommand("copy"); helper.remove();
  }
  $("toast").textContent = "小票已复制，可以直接粘贴发送。";
  $("toast").classList.add("show");
  setStatus("已复制小票文案。", true);
  window.setTimeout(() => $("toast").classList.remove("show"), 2200);
}

$("parseButton").addEventListener("click", parseNotice);
$("clearNoticeButton").addEventListener("click", () => {
  fields.notice.value = "";
  fields.notice.focus();
  setStatus("已清空粘贴框。", true);
});
$("generateButton").addEventListener("click", () => { renderReceipt(); if (ensureRoomCreated()) setStatus("小票已生成，独立服务房间也已创建。", true); });
$("copyButton").addEventListener("click", copyReceipt);
$("saveButton").addEventListener("click", saveReceiptImage);
$("startServiceButton").addEventListener("click", startServiceRoom);
$("copyRoomLink").addEventListener("click", async () => {
  const link = $("roomLink").href;
  if (!link || link.endsWith("#")) return;
  try { await navigator.clipboard.writeText(link); } catch { const helper = document.createElement("textarea"); helper.value = link; document.body.appendChild(helper); helper.select(); document.execCommand("copy"); helper.remove(); }
  setStatus("房间链接已复制。", true);
});
Object.values(fields).forEach((field) => field.addEventListener("input", () => { if (field !== fields.notice) renderReceipt(); }));

updateBeijingClock();
if (loadOrderFromQuery()) renderReceipt(); else parseNotice();
window.setInterval(updateBeijingClock, 1000);
