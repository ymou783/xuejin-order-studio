(function () {
  const config = window.XUEJIN_CLOUDBASE_CONFIG || {};
  const roomCollection = config.collection || "xuejin_rooms";
  const readyCallbacks = [];
  let database = null;
  let collection = null;
  let enabled = false;
  let suppressLocalSync = false;
  let allListener = null;
  const roomListeners = new Map();
  const pendingWrites = new Map();

  const json = (value, fallback = null) => {
    try { return JSON.parse(value); } catch { return fallback; }
  };
  const readLocal = (key, fallback = null) => json(localStorage.getItem(key), fallback);
  const orderKey = (orderId) => `xuejin-order:${orderId}`;
  const serviceKey = (orderId) => `xuejin-service-room:${orderId}`;
  const orderIdFromKey = (key) => {
    if (key.startsWith("xuejin-order:")) return key.slice("xuejin-order:".length);
    if (key.startsWith("xuejin-service-room:")) return key.slice("xuejin-service-room:".length);
    return "";
  };

  function localSet(key, value) {
    suppressLocalSync = true;
    try { localStorage.setItem(key, JSON.stringify(value)); } finally { suppressLocalSync = false; }
  }

  function updateLocalRoomIndex(room) {
    if (!room?.orderId) return;
    const existing = readLocal("xuejin-room-index", []);
    const list = Array.isArray(existing) ? existing : [];
    const current = list.find((item) => item.orderId === room.orderId) || {};
    const meta = room.meta || {};
    const next = {
      ...current,
      ...meta,
      orderId: room.orderId,
      roomUrl: meta.roomUrl || current.roomUrl || new URL("room.html", window.location.href).href,
      createdAt: meta.createdAt || current.createdAt || room.createdAt || new Date().toISOString(),
      updatedAt: room.updatedAt || current.updatedAt || new Date().toISOString()
    };
    localSet("xuejin-room-index", [next, ...list.filter((item) => item.orderId !== room.orderId)]);
  }

  function applyRemoteRoom(room) {
    if (!room?.orderId) return;
    if (room.order) localSet(orderKey(room.orderId), room.order);
    if (room.service) localSet(serviceKey(room.orderId), room.service);
    updateLocalRoomIndex(room);
    window.dispatchEvent(new CustomEvent("xuejin-cloud-updated", { detail: { orderId: room.orderId, room } }));
  }

  function removeLocalRoom(orderId) {
    if (!orderId) return;
    suppressLocalSync = true;
    try {
      localStorage.removeItem(orderKey(orderId));
      localStorage.removeItem(serviceKey(orderId));
      const list = readLocal("xuejin-room-index", []);
      localStorage.setItem("xuejin-room-index", JSON.stringify((Array.isArray(list) ? list : []).filter((item) => item.orderId !== orderId)));
    } finally { suppressLocalSync = false; }
    window.dispatchEvent(new CustomEvent("xuejin-cloud-updated", { detail: { orderId, removed: true } }));
  }

  function normalizeDoc(doc) {
    if (!doc) return null;
    return { ...doc, orderId: doc.orderId || doc._id };
  }

  async function ensureAuth(app) {
    if (!config.anonymousAuth) return;
    try {
      const auth = app.auth();
      if (auth?.anonymousAuthProvider) {
        await auth.anonymousAuthProvider().signIn();
      }
    } catch (error) {
      console.warn("CloudBase anonymous login is not available. Check the console login setting.", error);
    }
  }

  async function hydrateAll() {
    if (!collection) return;
    try {
      const result = await collection.get();
      const docs = Array.isArray(result?.data) ? result.data : [];
      docs.map(normalizeDoc).filter(Boolean).forEach(applyRemoteRoom);
    } catch (error) {
      console.warn("CloudBase room hydration failed. Local data will remain available.", error);
    }
  }

  async function writePatch(orderId, patch) {
    if (!enabled || !collection || !orderId) return;
    const doc = collection.doc(orderId);
    const timestamp = new Date().toISOString();
    const update = { ...patch, orderId, updatedAt: timestamp };
    try {
      await doc.update(update);
    } catch {
      const localOrder = readLocal(orderKey(orderId), null);
      const localService = readLocal(serviceKey(orderId), null);
      const localIndex = (readLocal("xuejin-room-index", []) || []).find((item) => item.orderId === orderId) || {};
      try {
        await doc.set({
          orderId,
          order: patch.order || localOrder,
          service: patch.service || localService,
          meta: { ...localIndex, ...(patch.meta || {}) },
          createdAt: localIndex.createdAt || timestamp,
          updatedAt: timestamp
        });
      } catch (error) {
        console.warn("CloudBase room write failed. The local copy is still saved.", error);
      }
    }
  }

  function scheduleKeySync(key, value) {
    if (!enabled || suppressLocalSync) return;
    const id = orderIdFromKey(key);
    if (!id) return;
    const field = key.startsWith("xuejin-order:") ? "order" : "service";
    window.clearTimeout(pendingWrites.get(id));
    pendingWrites.set(id, window.setTimeout(() => {
      pendingWrites.delete(id);
      writePatch(id, { [field]: value });
    }, 80));
  }

  function installLocalStorageBridge() {
    const storagePrototype = window.Storage?.prototype;
    if (!storagePrototype || storagePrototype.__xuejinCloudBridge) return;
    const originalSet = storagePrototype.setItem;
    const originalRemove = storagePrototype.removeItem;
    storagePrototype.setItem = function (key, value) {
      originalSet.call(this, key, value);
      if (this === window.localStorage) scheduleKeySync(key, json(value, value));
    };
    storagePrototype.removeItem = function (key) {
      originalRemove.call(this, key);
      if (this === window.localStorage && !suppressLocalSync && orderIdFromKey(key)) {
        window.dispatchEvent(new CustomEvent("xuejin-cloud-updated", { detail: { orderId: orderIdFromKey(key) } }));
      }
    };
    storagePrototype.__xuejinCloudBridge = true;
  }

  function watchRoom(orderId, callback) {
    if (!enabled || !collection || !orderId) return () => {};
    const previous = roomListeners.get(orderId);
    if (previous) previous();
    const listener = collection.doc(orderId).watch({
      onChange(snapshot) {
        const removal = snapshot?.docChanges?.find((change) => change.type === "REMOVE");
        if (removal) {
          const removedId = removal.doc?.orderId || removal.doc?._id || orderId;
          removeLocalRoom(removedId);
          callback?.({ orderId: removedId, removed: true });
          return;
        }
        const doc = normalizeDoc(snapshot?.docs?.[0] || snapshot?.docChanges?.[0]?.doc);
        if (doc) {
          applyRemoteRoom(doc);
          callback?.(doc);
        }
      },
      onError(error) { console.warn("CloudBase room realtime listener stopped.", error); }
    });
    const close = () => { try { listener?.close?.(); } catch {} roomListeners.delete(orderId); };
    roomListeners.set(orderId, close);
    return close;
  }

  function watchAll(callback) {
    if (!enabled || !collection) return () => {};
    if (allListener) try { allListener.close?.(); } catch {}
    allListener = collection.watch({
      onChange(snapshot) {
        if (Array.isArray(snapshot?.docChanges)) {
          snapshot.docChanges.forEach((change) => {
            const doc = normalizeDoc(change.doc);
            if (change.type === "REMOVE") {
              removeLocalRoom(doc?.orderId || doc?._id);
              callback?.({ orderId: doc?.orderId || doc?._id, removed: true });
            } else if (doc) {
              applyRemoteRoom(doc);
              callback?.(doc);
            }
          });
          return;
        }
        if (Array.isArray(snapshot?.docs)) snapshot.docs.map(normalizeDoc).filter(Boolean).forEach((doc) => { applyRemoteRoom(doc); callback?.(doc); });
      },
      onError(error) { console.warn("CloudBase admin realtime listener stopped.", error); }
    });
    return () => { try { allListener?.close?.(); } catch {} allListener = null; };
  }

  async function deleteRoom(orderId) {
    if (!enabled || !collection || !orderId) return;
    try { await collection.doc(orderId).remove(); } catch (error) { console.warn("CloudBase room deletion failed.", error); }
  }

  async function boot() {
    installLocalStorageBridge();
    if (!config.enabled || !config.env || !window.cloudbase) return false;
    try {
      const initConfig = { env: config.env, region: config.region || "ap-shanghai" };
      if (config.accessKey) initConfig.accessKey = config.accessKey;
      const app = window.cloudbase.init(initConfig);
      await ensureAuth(app);
      database = app.database();
      collection = database.collection(roomCollection);
      enabled = true;
      await hydrateAll();
      return true;
    } catch (error) {
      console.warn("CloudBase is not ready. Local storage mode remains active.", error);
      return false;
    }
  }

  window.XuejinCloud = {
    isEnabled: () => enabled,
    watchRoom,
    watchAll,
    deleteRoom,
    syncRoom: (orderId) => writePatch(orderId, { order: readLocal(orderKey(orderId)), service: readLocal(serviceKey(orderId)) })
  };
  window.XuejinSyncReady = boot();
})();
