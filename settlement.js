const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const orderId = (params.get("orderId") || "").trim();
const serviceKey = `xuejin-service-room:${orderId}`;
const orderKey = `xuejin-order:${orderId}`;
const scoreText = {1:"1 满意", 2:"2 一般", 3:"3 不满意"};
let saveInProgress = false;
let saveCooldownUntil = 0;

function roundW(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function plainNumber(value) { return String(roundW(value)).replace(/\.0+$/, ""); }
function beijingDate() {
  const parts = new Intl.DateTimeFormat("zh-CN", {timeZone:"Asia/Shanghai", year:"numeric", month:"numeric", day:"numeric"}).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {short:`${values.month}.${values.day}`, long:`${values.year}-${String(values.month).padStart(2,"0")}-${String(values.day).padStart(2,"0")}`};
}
function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; } catch { return fallback; } }

const state = readJson(serviceKey, {orderId, totalGames:0, successCount:0, totalEaten:0, records:[], feedback:{}});
const order = readJson(orderKey, {orderId});
const feedback = state.feedback || {};
const date = beijingDate();
const failures = Math.max(0, Number(state.totalGames || 0) - Number(state.successCount || 0));
const companionChanges = Array.isArray(state.companionChanges) ? state.companionChanges : [];
const companionTrail = companionChanges.length ? companionChanges.map((change) => `${change.from} → ${change.to}`).join("；") : "无陪陪修改记录";
const finalCompanion = state.currentCompanion || order.companion || "";

$("settlementDate").textContent = date.short;
$("settlementDateLong").textContent = date.long;
$("settlementType").textContent = order.type || order.project || "体验-体验单-128保688W";
$("settlementAmount").textContent = order.amount ? `¥${order.amount.replace(/[¥￥]/g, "")}` : "¥128";
$("settlementBoard").textContent = order.board || "";
$("settlementCompanion").textContent = finalCompanion;
$("settlementOrderId").textContent = orderId || "待填写";
$("settlementOrderNote").textContent = `备注：${companionTrail}`;
$("settlementRecord").textContent = `${Number(state.successCount || 0)}撤${failures}`;
$("settlementEaten").textContent = plainNumber(state.totalEaten || 0);
$("technicalSummary").textContent = scoreText[feedback.technical] || "未填写";
$("attitudeSummary").textContent = scoreText[feedback.attitude] || "未填写";
$("feedbackSummaryNote").textContent = feedback.note || "未填写";
$("returnRoom").href = `room.html?orderId=${encodeURIComponent(orderId)}`;

function escapeSvg(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;"}[character]));
}

function settlementSvg() {
  const safeOrder = orderId || "待填写";
  const type = order.type || order.project || "体验-体验单-128保688W";
  const amount = order.amount ? `¥${String(order.amount).replace(/[¥￥]/g, "")}` : "¥128";
  const board = order.board || "待填写";
  const companion = finalCompanion || "待填写";
  const record = `${Number(state.successCount || 0)}撤${failures}`;
  const eaten = plainNumber(state.totalEaten || 0);
  const technical = scoreText[feedback.technical] || "未填写";
  const attitude = scoreText[feedback.attitude] || "未填写";
  const note = feedback.note || "未填写";
  const row = (y, icon, label, value, className = "") => `<line x1="190" y1="${y - 25}" x2="810" y2="${y - 25}" stroke="#c9beb1" stroke-dasharray="5 6"/><text x="190" y="${y}" class="label"><tspan class="icon">${icon}</tspan> ${label}</text><text x="810" y="${y}" text-anchor="end" class="value ${className}">${escapeSvg(value)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1600" viewBox="0 0 1000 1600">
    <defs><pattern id="settleGrain" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".7" fill="#6d5946" opacity=".08"/><circle cx="9" cy="8" r=".5" fill="#6d5946" opacity=".06"/></pattern><filter id="settleShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#57443c" flood-opacity=".22"/></filter><style>.ink{fill:#29232b;font-family:'Noto Sans SC','Microsoft YaHei',sans-serif}.label{fill:#29232b;font-size:27px;font-weight:800}.value{fill:#4d3c4c;font-size:24px;font-family:'DM Mono','Microsoft YaHei',monospace}.icon{font-size:30px}.small{fill:#806f79;font-size:17px;font-family:'Noto Sans SC','Microsoft YaHei',sans-serif}.red{fill:#bd5148}.green{fill:#6f9872;font-weight:700}.title{fill:#29232b;font-size:61px;font-weight:800;letter-spacing:8px}</style></defs>
    <rect width="1000" height="1600" fill="#e9e0db"/><rect x="95" y="45" width="810" height="1510" rx="3" fill="#fffaf0" filter="url(#settleShadow)"/><rect x="95" y="45" width="810" height="1510" fill="url(#settleGrain)" opacity=".85"/>${Array.from({length:35}, (_, index) => `<circle cx="95" cy="${75 + index * 43}" r="7" fill="#e9e0db"/><circle cx="905" cy="${75 + index * 43}" r="7" fill="#e9e0db"/>`).join("")}
    <text x="145" y="105" class="red" font-size="20">✦　⌁　✦</text><text x="855" y="105" text-anchor="end" class="ink" font-size="22" font-weight="800">雪烬电竞·</text><text x="500" y="151" text-anchor="middle" class="ink" font-size="23" font-family="DM Mono">/\___/\</text><text x="500" y="177" text-anchor="middle" class="ink" font-size="22" font-family="DM Mono">꒰ ⸝⸝ɞ̴̶̷ ·̮ ɞ̴̶̷ ⸝⸝꒱‎</text><text x="500" y="254" text-anchor="middle" class="title">结单小票</text><rect x="346" y="276" width="308" height="42" rx="4" fill="#bd5148"/><text x="500" y="305" text-anchor="middle" fill="#fff9ef" font-size="23" font-weight="700" font-family="Noto Sans SC">✦ 三角洲小记 ✦</text>
    <circle cx="500" cy="397" r="62" fill="none" stroke="#2e2930" stroke-width="4"/><path d="M450 415 477 380 491 395 510 363 548 415M455 425h90M430 397h-27m144 0h-27M454 357l-18-18m110 18 18-18M453 441l-18 18m110-18 18 18" fill="none" stroke="#2e2930" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M487 430 500 410 513 430Z" fill="#2e2930"/><line x1="180" y1="472" x2="820" y2="472" stroke="#a99d91" stroke-width="2"/>
    ${row(530,"◷","时间",date.short)}${row(584,"⚔","类型",type)}${row(638,"▤","金额",amount,"amount")}${row(692,"⌁","板板",board)}${row(746,"⌁","陪陪",companion)}
    <line x1="180" y1="782" x2="820" y2="782" stroke="#c9beb1" stroke-dasharray="5 6"/><text x="190" y="820" class="label">▣ 订单号</text><text x="810" y="820" text-anchor="end" class="value" font-size="21">${escapeSvg(safeOrder)}</text><text x="190" y="858" class="small">备注：${escapeSvg(companionTrail)}</text>${row(900,"🫧","战绩",record)}${row(948,"🎀","共得吃",eaten)}<text x="190" y="1004" class="label">▦ 日期</text><text x="810" y="1004" text-anchor="end" class="value">${date.long}</text>
    <path d="M145 1085 210 1035 254 1068 323 968 378 1050 443 995 510 1065 589 959 654 1050 720 1000 784 1068 855 1023v95H145Z" fill="#2e2930"/><path d="M145 1087h710" stroke="#2e2930" stroke-width="4"/><g transform="translate(768 1040) rotate(-13)"><circle cx="0" cy="0" r="58" fill="#fffaf0" stroke="#bd5148" stroke-width="4"/><circle cx="0" cy="0" r="48" fill="none" stroke="#bd5148" stroke-width="2"/><text x="0" y="14" text-anchor="middle" font-size="34">🐾</text></g>
    <text x="500" y="1160" text-anchor="middle" class="small">୨୧ °˖⋆࿐໋₊　°˖⋆࿐໋₊　ᘏ▸◂ᘏ</text><text x="500" y="1193" text-anchor="middle" class="red" font-size="23" font-weight="700">ʚ🌸　感谢板板支持　🌸ɞ</text><line x1="180" y1="1230" x2="820" y2="1230" stroke="#bd5148" stroke-opacity=".35"/>
    <text x="190" y="1264" class="red" font-size="19" font-weight="700">本次服务评价</text><text x="190" y="1300" class="small">操作技术</text><text x="810" y="1300" text-anchor="end" class="small green">${escapeSvg(technical)}</text><text x="190" y="1335" class="small">服务态度</text><text x="810" y="1335" text-anchor="end" class="small green">${escapeSvg(attitude)}</text><text x="190" y="1370" class="small">老板备注</text><text x="810" y="1370" text-anchor="end" class="small">${escapeSvg(note)}</text><text x="500" y="1460" text-anchor="middle" class="red" font-size="21">╰ ────────── ╯</text>
  </svg>`;
}

function saveSettlementImage() {
  if (saveInProgress) return;
  if (Date.now() < saveCooldownUntil) return;
  saveInProgress = true;
  const button = $("saveImageButton");
  button.disabled = true;
  const unlock = () => { saveInProgress = false; saveCooldownUntil = Date.now() + 2000; button.disabled = false; };
  const svgUrl = URL.createObjectURL(new Blob([settlementSvg()], {type:"image/svg+xml;charset=utf-8"}));
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas"); canvas.width = 1000; canvas.height = 1600;
    const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
    canvas.toBlob((pngBlob) => {
      if (!pngBlob) { URL.revokeObjectURL(svgUrl); unlock(); return; }
      const downloadUrl = URL.createObjectURL(pngBlob); const link = document.createElement("a");
      const safeId = safeOrderId(orderId); link.href = downloadUrl; link.download = `雪烬电竞-结单小票-${safeId}.png`; link.click();
      URL.revokeObjectURL(downloadUrl); URL.revokeObjectURL(svgUrl); unlock();
    }, "image/png");
  };
  image.onerror = () => { URL.revokeObjectURL(svgUrl); unlock(); };
  image.src = svgUrl;
}

function safeOrderId(value) { return (value || "receipt").replace(/[^a-zA-Z0-9_-]/g, "-"); }
$("saveImageButton").addEventListener("click", saveSettlementImage);
