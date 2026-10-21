// Farm camera: streams this device's camera to viewers who choose this spot.
(function () {
  const cfg = window.SITE_CONFIG;
  const ids = window.SITE_IDS;
  const $ = (id) => document.getElementById(id);

  const preview = $("preview");
  const slotSel = $("slot");
  const deviceSel = $("device");
  const qualitySel = $("quality");
  const startBtn = $("start");
  const stopBtn = $("stop");
  const micBtn = $("mic");

  let stream = null;
  let peer = null;
  let wakeLock = null;
  let micOn = true;
  const viewers = new Map(); // peerId -> { conn, call }
  const passInput = $("pass");
  let passKey = "";
  try { passInput.value = localStorage.getItem("farm-viewer-pass") || ""; } catch { /* ignore */ }

  const params = new URLSearchParams(location.search);
  let savedSlot = params.get("cam");
  try { savedSlot = savedSlot || localStorage.getItem("farm-cam-slot"); } catch { /* ignore */ }
  slotSel.replaceChildren(...cfg.cameras.map((c) => {
    const o = new Option(c.label, c.id);
    o.selected = c.id === savedSlot;
    return o;
  }));

  function status(text, kind) {
    $("status-line").textContent = text;
    $("status-line").className = "status-line" + (kind ? " " + kind : "");
  }

  // Going live needs at least one photo for viewers.
  let isLive = false;
  function updateStartLock() {
    const n = typeof shared === "undefined" ? 0 : shared.length;
    startBtn.disabled = isLive || n === 0;
    const lock = document.getElementById("live-lock");
    if (lock) lock.hidden = isLive || n > 0;
    const step = document.getElementById("step-photos");
    if (step) step.classList.toggle("done", n > 0);
  }

  function setLive(live) {
    $("status-badge").textContent = live ? "Live" : "Not live";
    $("status-badge").classList.toggle("live", live);
    isLive = live;
    updateStartLock();
    stopBtn.disabled = !live;
    const snap = document.getElementById("share-snap");
    if (snap) snap.disabled = !live;
    slotSel.disabled = live;
  }

  function updateCount() {
    const n = [...viewers.values()].filter((v) => v.call).length;
    $("viewer-badge").textContent = n === 1 ? "1 watching" : `${n} watching`;
    $("viewer-badge").hidden = !peer;
  }

  // ---------- Camera ----------
  function constraints(deviceId) {
    const h = Number(qualitySel.value);
    const video = { height: { ideal: h }, width: { ideal: Math.round((h * 16) / 9) }, frameRate: { ideal: 30 } };
    if (deviceId) video.deviceId = { exact: deviceId };
    else video.facingMode = "environment";
    return { video, audio: { echoCancellation: false, noiseSuppression: false } };
  }

  async function openCamera(deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints(deviceId));
    } catch (err) {
      if (err.name === "NotAllowedError") throw err;
      return navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: true }));
    }
  }

  async function listDevices(activeId) {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    deviceSel.replaceChildren(...cams.map((d, i) => {
      const o = new Option(d.label || `Camera ${i + 1}`, d.deviceId);
      o.selected = d.deviceId === activeId;
      return o;
    }));
    deviceSel.disabled = cams.length < 2;
  }

  function applyMic() {
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = micOn));
    micBtn.disabled = stream.getAudioTracks().length === 0;
    micBtn.textContent = micOn ? "Mute sound" : "Turn sound on";
  }

  async function swapStream(next) {
    const old = stream;
    stream = next;
    preview.srcObject = stream;
    applyMic();
    for (const v of viewers.values()) {
      const pc = v.call && v.call.peerConnection;
      if (!pc) continue;
      for (const sender of pc.getSenders()) {
        if (!sender.track) continue;
        const t = stream.getTracks().find((x) => x.kind === sender.track.kind);
        if (t) sender.replaceTrack(t).catch(console.error);
      }
    }
    if (old) old.getTracks().forEach((t) => t.stop());
  }

  deviceSel.addEventListener("change", async () => {
    if (!stream) return;
    try { await swapStream(await openCamera(deviceSel.value)); }
    catch (err) { status("Couldn't switch camera: " + err.message, "err"); }
  });
  qualitySel.addEventListener("change", async () => {
    if (!stream) return;
    try { await swapStream(await openCamera(stream.getVideoTracks()[0]?.getSettings().deviceId)); }
    catch (err) { status("Couldn't change quality: " + err.message, "err"); }
  });
  micBtn.addEventListener("click", () => { micOn = !micOn; applyMic(); });

  // ---------- Viewers ----------
  function stopWatching(v) {
    if (v.call) { v.call.close(); v.call = null; }
  }

  function onViewer(conn) {
    conn.on("open", () => {
      // Only viewers who entered the right password get video.
      if (!conn.metadata || conn.metadata.key !== passKey) {
        try { conn.send({ type: "denied" }); } catch { /* ignore */ }
        setTimeout(() => conn.close(), 800);
        return;
      }
      viewers.set(conn.peer, { conn, call: null });
      if (shared.length) conn.send({ type: "photos", photos: shared });
      updateCount();
    });
    conn.on("data", (msg) => {
      const v = viewers.get(conn.peer);
      if (!v || !msg) return;
      if (msg.type === "watch" && stream) {
        stopWatching(v);
        v.call = peer.call(conn.peer, stream);
        if (v.call) {
          const call = v.call;
          call.on("close", () => { if (v.call === call) { v.call = null; updateCount(); } });
        }
        updateCount();
      } else if (msg.type === "unwatch") {
        stopWatching(v);
        updateCount();
      }
    });
    const gone = () => {
      const v = viewers.get(conn.peer);
      if (!v) return;
      stopWatching(v);
      viewers.delete(conn.peer);
      updateCount();
    };
    conn.on("close", gone);
    conn.on("error", gone);
  }

  // ---------- Start / stop ----------
  async function requestWakeLock() {
    try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch { /* unsupported */ }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && peer) requestWakeLock();
  });

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      status("This browser can't use the camera. Open the page over https in Chrome, Safari or Firefox.", "err");
      return;
    }
    if (!shared.length) {
      status("Add at least one photo first (step 1), then go live.", "err");
      document.getElementById("step-photos")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const pass = passInput.value.trim();
    if (pass.length < 4) {
      status("Set a viewer password of at least 4 characters first.", "err");
      passInput.focus();
      return;
    }
    passKey = pass;
    try { localStorage.setItem("farm-viewer-pass", pass); } catch { /* ignore */ }
    passInput.disabled = true;
    const slot = slotSel.value;
    const label = cfg.cameras.find((c) => c.id === slot)?.label || slot;
    try { localStorage.setItem("farm-cam-slot", slot); } catch { /* ignore */ }

    startBtn.disabled = true;
    status("Opening the camera…");
    try {
      stream = await openCamera();
    } catch (err) {
      startBtn.disabled = false;
      passInput.disabled = false;
      status(err.name === "NotAllowedError"
        ? "Camera access was blocked. Allow camera and microphone for this site, then try again."
        : "Couldn't open the camera: " + err.message, "err");
      return;
    }
    preview.srcObject = stream;
    $("overlay").hidden = true;
    micOn = true;
    applyMic();
    listDevices(stream.getVideoTracks()[0]?.getSettings().deviceId).catch(() => {});

    status("Connecting to the stream server…");
    peer = new Peer(ids.camera(slot), { config: { iceServers: cfg.iceServers } });
    peer.on("open", () => {
      window.dispatchEvent(new CustomEvent("farmcam:live", { detail: { pass: passKey } }));
      setLive(true);
      status(`You're live as ${label}.`, "ok");
      updateCount();
      requestWakeLock();
    });
    peer.on("connection", onViewer);
    peer.on("disconnected", () => {
      status("Lost the stream server connection. Reconnecting…", "err");
      setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 2000);
    });
    peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        status(`Another phone is already live as ${label}. Pick a different spot.`, "err");
        stop(true);
      } else if (err.type !== "peer-unavailable") {
        status("Stream error: " + (err.message || err.type), "err");
      }
    });
  }

  function stop(keepStatus) {
    for (const v of viewers.values()) { stopWatching(v); if (v.conn.open) v.conn.close(); }
    viewers.clear();
    if (peer) { peer.destroy(); peer = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    preview.srcObject = null;
    $("overlay").hidden = false;
    $("viewer-badge").hidden = true;
    micBtn.disabled = true;
    deviceSel.disabled = true;
    passInput.disabled = false;
    window.dispatchEvent(new Event("farmcam:stopped"));
    setLive(false);
    if (keepStatus !== true) status("Camera stopped.");
  }

  // ---------- Share a photo ----------
  const MAX_SHARED = 12;
  const shared = []; // { id, src, caption, ts }

  function sendPhotos() {
    for (const v of viewers.values()) if (v.conn.open) v.conn.send({ type: "photos", photos: shared });
    renderShared();
  }

  function shareStatus(text, kind) {
    const el = $("share-status");
    el.textContent = text;
    el.className = "status-line" + (kind ? " " + kind : "");
    el.hidden = !text;
  }

  // Draw an image or video frame onto a canvas, at most 1000px on the long side.
  function toJpeg(source, w, h) {
    const scale = Math.min(1, 1000 / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  }

  function addShared(src) {
    const caption = $("share-caption").value.replace(/\s+/g, " ").trim().slice(0, 80);
    shared.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), src, caption, ts: Date.now() });
    shared.length = Math.min(shared.length, MAX_SHARED);
    $("share-caption").value = "";
    sendPhotos();
    shareStatus(peer ? "Shared with viewers." : "Photo added. You can go live now.", "ok");
  }

  function renderShared() {
    updateStartLock();
    $("share-count").textContent = shared.length ? `${shared.length} shared` : "";
    $("share-list").replaceChildren(...shared.map((p) => {
      const li = document.createElement("li");
      const img = Object.assign(document.createElement("img"), { src: p.src, alt: p.caption || "Shared photo" });
      const cap = Object.assign(document.createElement("span"), { textContent: p.caption || "No caption" });
      const del = Object.assign(document.createElement("button"), { type: "button", className: "btn small", textContent: "Remove" });
      del.addEventListener("click", () => {
        const i = shared.findIndex((x) => x.id === p.id);
        if (i >= 0) shared.splice(i, 1);
        sendPhotos();
        shareStatus("Removed.", "ok");
      });
      li.append(img, cap, del);
      return li;
    }));
  }

  $("share-snap").addEventListener("click", () => {
    if (!preview.videoWidth) { shareStatus("Start the camera first.", "err"); return; }
    addShared(toJpeg(preview, preview.videoWidth, preview.videoHeight));
  });

  $("share-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { shareStatus("That file isn't a photo.", "err"); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { addShared(toJpeg(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(url); };
    img.onerror = () => { shareStatus("Couldn't open that photo. Try a JPG or PNG.", "err"); URL.revokeObjectURL(url); };
    img.src = url;
  });

  startBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", () => stop());
  window.addEventListener("beforeunload", (e) => { if (peer) e.preventDefault(); });

  setLive(false);
  if (typeof Peer === "undefined") status("The streaming library didn't load. Check your connection and reload.", "err");
})();
