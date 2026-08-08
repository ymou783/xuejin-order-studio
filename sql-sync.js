(function () {
  const roomIndexKey = "xuejin-room-index";
  const orderKey = (orderId) => `xuejin-order:${orderId}`;
  const serviceKey = (orderId) => `xuejin-service-room:${orderId}`;
  const orderIdFromKey = (key) => {
    if (key.startsWith("xuejin-order:")) return key.slice("xuejin-order:".length);
    if (key.startsWith("xuejin-service-room:")) return key.slice("xuejin-service-room:".length);
    return "";
  };
  const readJson = (key, fallback = null) => {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
  };

  let online = false;
  let suppressLocalSync = false;
  let allSource = null;
  const roomSources = new Map();
  const pendingWrites = new Map();

  function localSet(key, value) {
    suppressLocalSync = true;
    try { localStorage.setItem(key, JSON.stringify(value)); } finally { suppressLocalSync = false; }
  }

  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
    return payload;
  }

  function updateLocalRoomIndex(room) {
    if (!room?.orderId) return;
    const existing = readJson(roomIndexKey, []);
    const list = Array.isArray(existing) ? existing : [];
    const current = list.find((item) => item.orderId === room.orderId) || {};
    const meta = room.meta || {};
    const next = {
      ...current,
      ...meta,
      orderId: room.orderId,
      roomUrl: meta.roomUrl || current.roomUrl || new URL("room.html", window.location.href).href,
      createdAt: meta.createdAt || current.createdAt || room.createdAt || new Date().toISOString(),
      updatedAt: room.updatedAt || new Date().toISOString()
    };
    localSet(roomIndexKey, [next, ...list.filter((item) => item.orderId !== room.orderId)]);
  }

  function applyRemoteRoom(room) {
    if (!room?.orderId) return;
    if (room.order) localSet(orderKey(room.orderId), room.order);
    if (room.service) localSet(serviceKey(room.orderId), room.service);
    updateLocalRoomIndex(room);
    window.dispatchEvent(new CustomEvent("xuejin-sql-updated", { detail: { orderId: room.orderId, room } }));
  }

  function removeLocalRoom(orderId) {
    if (!orderId) return;
    suppressLocalSync = true;
    try {
      localStorage.removeItem(orderKey(orderId));
      localStorage.removeItem(serviceKey(orderId));
      const list = readJson(roomIndexKey, []);
      localStorage.setItem(roomIndexKey, JSON.stringify((Array.isArray(list) ? list : []).filter((item) => item.orderId !== orderId)));
    } finally { suppressLocalSync = false; }
    window.dispatchEvent(new CustomEvent("xuejin-sql-updated", { detail: { orderId, removed: true } }));
  }

  function localRoomPayload(orderId) {
    const index = (readJson(roomIndexKey, []) || []).find((item) => item.orderId === orderId) || {};
    return {
      order: readJson(orderKey(orderId), { orderId }),
      service: readJson(serviceKey(orderId), { orderId }),
      meta: index
    };
  }

  async function writeRoom(orderId) {
    if (!online || !orderId) return;
    try { applyRemoteRoom(await api(`/api/rooms/${encodeURIComponent(orderId)}`, { method: "PUT", body: JSON.stringify(localRoomPayload(orderId)) })); }
    catch (error) { console.warn("SQL 数据保存失败，本地页面仍会继续工作。", error); }
  }

  function scheduleKeySync(key) {
    if (!online || suppressLocalSync) return;
    const orderId = orderIdFromKey(key);
    if (!orderId) return;
    window.clearTimeout(pendingWrites.get(orderId));
    pendingWrites.set(orderId, window.setTimeout(() => {
      pendingWrites.delete(orderId);
      writeRoom(orderId);
    }, 80));
  }

  function installLocalStorageBridge() {
    const storagePrototype = window.Storage?.prototype;
    if (!storagePrototype || storagePrototype.__xuejinSqlBridge) return;
    const originalSet = storagePrototype.setItem;
    const originalRemove = storagePrototype.removeItem;
    storagePrototype.setItem = function (key, value) {
      originalSet.call(this, key, value);
      if (this === window.localStorage) scheduleKeySync(key);
    };
    storagePrototype.removeItem = function (key) {
      originalRemove.call(this, key);
      if (this === window.localStorage && !suppressLocalSync && orderIdFromKey(key)) {
        window.dispatchEvent(new CustomEvent("xuejin-sql-updated", { detail: { orderId: orderIdFromKey(key) } }));
      }
    };
    storagePrototype.__xuejinSqlBridge = true;
  }

  function handleEvent(data, callback) {
    if (!data) return;
    if (data.removed) { removeLocalRoom(data.orderId); callback?.(data); return; }
    applyRemoteRoom(data);
    callback?.(data);
  }

  function watchRoom(orderId, callback) {
    if (!online || !orderId || typeof EventSource === "undefined") return () => {};
    const previous = roomSources.get(orderId);
    previous?.close();
    const source = new EventSource(`/api/rooms/${encodeURIComponent(orderId)}/events`);
    source.onmessage = (event) => { try { handleEvent(JSON.parse(event.data), callback); } catch {} };
    source.onerror = () => { /* EventSource automatically retries. */ };
    roomSources.set(orderId, source);
    return () => { source.close(); if (roomSources.get(orderId) === source) roomSources.delete(orderId); };
  }

  function watchAll(callback) {
    if (!online || typeof EventSource === "undefined") return () => {};
    allSource?.close();
    allSource = new EventSource("/api/events");
    allSource.onmessage = (event) => { try { handleEvent(JSON.parse(event.data), callback); } catch {} };
    allSource.onerror = () => { /* EventSource automatically retries. */ };
    return () => { allSource?.close(); allSource = null; };
  }

  async function migrateLocalRooms(remoteRooms) {
    const remoteIds = new Set((remoteRooms || []).map((room) => room.orderId));
    const localIds = new Set();
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || "";
      const orderId = orderIdFromKey(key);
      if (orderId) localIds.add(orderId);
    }
    for (const orderId of localIds) {
      if (!remoteIds.has(orderId)) await writeRoom(orderId);
    }
  }

  async function boot() {
    installLocalStorageBridge();
    try {
      const first = await api("/api/rooms");
      online = true;
      await migrateLocalRooms(first.rooms || []);
      const latest = await api("/api/rooms");
      (latest.rooms || []).forEach(applyRemoteRoom);
      return true;
    } catch (error) {
      online = false;
      console.warn("SQL 服务器暂不可用，本地数据模式继续运行。", error);
      return false;
    }
  }

  window.XuejinSql = {
    isEnabled: () => online,
    watchRoom,
    watchAll,
    deleteRoom: async (orderId) => {
      if (!online || !orderId) return;
      try { await api(`/api/rooms/${encodeURIComponent(orderId)}`, { method: "DELETE" }); }
      catch (error) { console.warn("SQL 房间删除失败。", error); }
    },
    syncRoom: writeRoom
  };
  window.XuejinSyncReady = boot();
})();
