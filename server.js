const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "xuejin.sqlite");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);

fs.mkdirSync(DATA_DIR, { recursive: true });
const database = new DatabaseSync(DB_PATH);
database.exec(fs.readFileSync(path.join(ROOT, "schema.sql"), "utf8"));

const roomClients = new Map();
const allClients = new Set();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function isoNow() {
  return new Date().toISOString();
}

function normalizeId(value) {
  const id = String(value || "").trim();
  if (!id || id.length > 200 || id.includes("/")) return "";
  return id;
}

function roomFromRow(row) {
  if (!row) return null;
  const orderId = row.order_id;
  const meta = parseJson(row.meta_json, {});
  return {
    orderId,
    order: parseJson(row.order_json, { orderId }),
    service: parseJson(row.service_json, { orderId }),
    meta: {
      ...meta,
      orderId,
      roomUrl: meta.roomUrl || `/room.html?orderId=${encodeURIComponent(orderId)}`,
      createdAt: meta.createdAt || row.created_at,
      updatedAt: row.updated_at
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getRoom(orderId) {
  return roomFromRow(database.prepare("SELECT * FROM rooms WHERE order_id = ?").get(orderId));
}

function listRooms() {
  return database.prepare("SELECT * FROM rooms ORDER BY updated_at DESC").all().map(roomFromRow);
}

function saveRoom(orderId, patch) {
  const current = getRoom(orderId);
  const now = isoNow();
  const order = patch.order === undefined ? (current?.order || { orderId }) : patch.order;
  const service = patch.service === undefined ? (current?.service || { orderId }) : patch.service;
  const meta = {
    ...(current?.meta || {}),
    ...(patch.meta || {}),
    orderId,
    updatedAt: now,
    createdAt: current?.meta?.createdAt || current?.createdAt || now
  };
  const createdAt = current?.createdAt || meta.createdAt || now;
  database.prepare(`
    INSERT INTO rooms (order_id, order_json, service_json, meta_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET
      order_json = excluded.order_json,
      service_json = excluded.service_json,
      meta_json = excluded.meta_json,
      updated_at = excluded.updated_at
  `).run(orderId, JSON.stringify(order || { orderId }), JSON.stringify(service || { orderId }), JSON.stringify(meta), createdAt, now);
  return getRoom(orderId);
}

function deleteRoom(orderId) {
  database.prepare("DELETE FROM rooms WHERE order_id = ?").run(orderId);
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > 2 * 1024 * 1024) {
        reject(new Error("请求内容过大"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function broadcast(orderId, room, removed = false) {
  const message = `data: ${JSON.stringify(removed ? { orderId, removed: true } : room)}\n\n`;
  const write = (client) => {
    try { client.response.write(message); } catch { closeSse(client); }
  };
  (roomClients.get(orderId) || new Set()).forEach(write);
  allClients.forEach(write);
}

function closeSse(client) {
  clearInterval(client.heartbeat);
  client.set.delete(client);
  try { client.response.end(); } catch {}
}

function openSse(request, response, set) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  response.write(": connected\n\n");
  const client = { request, response, set, heartbeat: null };
  set.add(client);
  client.heartbeat = setInterval(() => {
    try { response.write(": heartbeat\n\n"); } catch { closeSse(client); }
  }, 25000);
  request.on("close", () => closeSse(client));
}

function routeApi(request, response, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api") return false;

  if (request.method === "GET" && url.pathname === "/api/rooms") {
    sendJson(response, 200, { rooms: listRooms() });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/events") {
    openSse(request, response, allClients);
    return true;
  }
  if (parts[1] !== "rooms") {
    sendError(response, 404, "接口不存在");
    return true;
  }

  let orderId;
  try { orderId = normalizeId(decodeURIComponent(parts[2] || "")); } catch { orderId = ""; }
  if (!orderId) {
    sendError(response, 400, "缺少有效订单号");
    return true;
  }

  if (request.method === "GET" && parts[3] === "events") {
    if (!roomClients.has(orderId)) roomClients.set(orderId, new Set());
    openSse(request, response, roomClients.get(orderId));
    return true;
  }
  if (request.method === "GET" && parts.length === 3) {
    const room = getRoom(orderId);
    if (!room) { sendError(response, 404, "房间不存在"); return true; }
    sendJson(response, 200, room);
    return true;
  }
  if ((request.method === "PUT" || request.method === "PATCH") && parts.length === 3) {
    readBody(request).then((raw) => {
      const patch = parseJson(raw, null);
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) { sendError(response, 400, "请求数据格式错误"); return; }
      const room = saveRoom(orderId, patch);
      sendJson(response, 200, room);
      broadcast(orderId, room);
    }).catch((error) => sendError(response, 400, error.message || "读取请求失败"));
    return true;
  }
  if (request.method === "DELETE" && parts.length === 3) {
    deleteRoom(orderId);
    sendJson(response, 200, { orderId, removed: true });
    broadcast(orderId, null, true);
    return true;
  }

  sendError(response, 404, "接口不存在");
  return true;
}

function serveStatic(request, response, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "方法不允许");
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { sendError(response, 400, "地址格式错误"); return; }
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) { sendError(response, 403, "禁止访问"); return; }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) { sendError(response, 404, "页面不存在"); return; }
    const headers = {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    };
    response.writeHead(200, headers);
    if (request.method === "HEAD") response.end(); else fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (!routeApi(request, response, url)) serveStatic(request, response, url);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendError(response, 500, "服务器内部错误"); else response.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`雪烬电竞已启动：http://localhost:${PORT}`);
  console.log(`SQL 数据库：${DB_PATH}`);
});

function closeAll() {
  [...allClients].forEach(closeSse);
  [...roomClients.values()].flatMap((set) => [...set]).forEach(closeSse);
  database.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", closeAll);
process.on("SIGTERM", closeAll);
