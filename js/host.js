// Host: runs chat for all viewers and sets which bird is in the spotlight.
(function () {
  const cfg = window.SITE_CONFIG;
  const ids = window.SITE_IDS;
  const { createChat, clean, store } = window.SiteChat;
  const $ = (id) => document.getElementById(id);

  const chat = createChat({ log: $("chat-log"), empty: $("chat-empty") });
  const SAVE_KEY = "rooster-host-state";

  let birds = [];
  let byId = {};
  let peer = null;
  const viewers = new Map(); // peerId -> { conn, lastMsg }
  let passKey = "";
  try { passKey = localStorage.getItem("farm-viewer-pass") || ""; } catch { /* ignore */ }
  $("pass").value = passKey;

  // Saved so a page refresh keeps chat history and the spotlight.
  let state = { spotlight: { bird: null, camera: null }, history: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (saved && typeof saved === "object") state = { ...state, ...saved };
  } catch { /* storage unavailable */ }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* ignore */ } }

  $("chat-name").value = store.get("host-name") || $("chat-name").value;

  function status(text, kind) {
    $("status-line").textContent = text;
    $("status-line").className = "status-line" + (kind ? " " + kind : "");
  }

  function sendAll(msg) {
    for (const v of viewers.values()) if (v.conn.open) v.conn.send(msg);
  }

  function spotlightMessage() {
    return { type: "spotlight", bird: state.spotlight.bird, camera: state.spotlight.camera };
  }

  function pushChat(msg) {
    state.history.push(msg);
    while (state.history.length > cfg.chat.historySize) state.history.shift();
    save();
    chat.add(msg);
    sendAll(msg);
  }

  function updateCount() {
    const n = viewers.size;
    $("viewer-count").textContent = n === 1 ? "1 watching" : `${n} watching`;
    sendAll({ type: "count", n });
  }

  // ---------- Spotlight ----------
  function setSpotlight(birdId) {
    const camera = $("spot-cam").value || null;
    state.spotlight = { bird: birdId, camera: birdId ? camera : null };
    save();
    renderPicks();
    sendAll(spotlightMessage());
    if (birdId) {
      const cam = cfg.cameras.find((c) => c.id === camera);
      const where = cam ? ` on the ${cam.label.toLowerCase()} camera` : "";
      pushChat({ type: "system", text: `${byId[birdId].name} is${where} now.`, ts: Date.now() });
    }
  }

  function renderPicks() {
    const grid = $("picks");
    if (!grid.children.length) {
      grid.replaceChildren(...birds.map((b) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pick";
        btn.dataset.id = b.id;
        const img = Object.assign(document.createElement("img"), { src: b.photo, alt: "" });
        btn.append(img,
          Object.assign(document.createElement("span"), { className: "pick-name", textContent: b.name }),
          Object.assign(document.createElement("span"), { className: "pick-breed", textContent: b.breed }));
        btn.addEventListener("click", () => setSpotlight(state.spotlight.bird === b.id ? null : b.id));
        return btn;
      }));
    }
    for (const btn of grid.children) btn.setAttribute("aria-pressed", String(btn.dataset.id === state.spotlight.bird));
    const b = byId[state.spotlight.bird];
    const cam = cfg.cameras.find((c) => c.id === state.spotlight.camera);
    $("spot-meta").textContent = b ? `${b.name}${cam ? ` on the ${cam.label.toLowerCase()} camera` : ""}` : "Nobody in the spotlight";
  }

  $("spot-cam").replaceChildren(...cfg.cameras.map((c) => new Option(c.label, c.id)));
  if (state.spotlight.camera) $("spot-cam").value = state.spotlight.camera;
  $("spot-cam").addEventListener("change", () => {
    if (state.spotlight.bird) setSpotlight(state.spotlight.bird);
  });
  $("clear").addEventListener("click", () => setSpotlight(null));

  // ---------- Hub ----------
  function onViewer(conn) {
    conn.on("open", () => {
      if (!conn.metadata || conn.metadata.key !== passKey) {
        try { conn.send({ type: "denied" }); } catch { /* ignore */ }
        setTimeout(() => conn.close(), 800);
        return;
      }
      viewers.set(conn.peer, { conn, lastMsg: 0 });
      conn.send({ type: "history", messages: state.history });
      conn.send(spotlightMessage());
      updateCount();
    });
    conn.on("data", (msg) => {
      const v = viewers.get(conn.peer);
      if (!v || !msg || msg.type !== "chat") return;
      const now = Date.now();
      if (now - v.lastMsg < 1500) return; // flood protection
      v.lastMsg = now;
      const name = clean(msg.name, 24);
      const text = clean(msg.text, cfg.chat.maxLength);
      if (name && text) pushChat({ type: "chat", name, text, ts: now });
    });
    const gone = () => { if (viewers.delete(conn.peer)) updateCount(); };
    conn.on("close", gone);
    conn.on("error", gone);
  }

  function goOnline() {
    peer = new Peer(ids.hub(), { config: { iceServers: cfg.iceServers } });
    peer.on("open", () => {
      status("Online. Viewers can chat and see who's in the spotlight.", "ok");
      $("chat-text").disabled = false;
      $("chat-send").disabled = false;
      updateCount();
    });
    peer.on("connection", onViewer);
    peer.on("disconnected", () => {
      status("Lost the stream server connection. Reconnecting…", "err");
      setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 2000);
    });
    peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        status("The host page is already open on another device or tab. Close it there, then reload this page.", "err");
        peer.destroy();
        peer = null;
      } else if (err.type !== "peer-unavailable") {
        status("Connection problem: " + (err.message || err.type) + ". Retrying…", "err");
      }
    });
  }

  $("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = clean($("chat-name").value, 24);
    const text = clean($("chat-text").value, cfg.chat.maxLength);
    if (!name || !text) return;
    store.set("host-name", name);
    pushChat({ type: "chat", name, text, host: true, ts: Date.now() });
    $("chat-text").value = "";
    $("chat-text").focus();
  });

  function setBirds(flock) {
    birds = flock;
    byId = Object.fromEntries(flock.map((b) => [b.id, b]));
    if (state.spotlight.bird && !byId[state.spotlight.bird]) state.spotlight = { bird: null, camera: null };
    $("picks").replaceChildren();
    renderPicks();
  }
  window.HostFlock = { setBirds };

  // ---------- Boot ----------
  fetch("data/flock.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then(setBirds)
    .catch((err) => status("Couldn't load data/flock.json: " + err.message, "err"));
  chat.reset(state.history);

  $("pass-save").addEventListener("click", () => {
    const pass = $("pass").value.trim();
    if (pass.length < 4) { status("The viewer password needs at least 4 characters.", "err"); $("pass").focus(); return; }
    const changed = pass !== passKey;
    passKey = pass;
    try { localStorage.setItem("farm-viewer-pass", pass); } catch { /* ignore */ }
    if (changed) for (const v of viewers.values()) v.conn.close(); // everyone re-enters the new password
    if (!peer && typeof Peer !== "undefined") goOnline();
    else status("Password saved. Online.", "ok");
  });

  if (typeof Peer === "undefined") status("The streaming library didn't load. Check your connection and reload.", "err");
  else if (passKey.length < 4) status("Set a viewer password to go online.", "err");
  else goOnline();
})();
