// Broadcaster: captures the camera, sends it to every viewer, and relays chat.
(function () {
  const cfg = window.ROOSTER_CONFIG;
  const { createChat, clean, store } = window.RoosterChat;
  const $ = (id) => document.getElementById(id);

  const preview = $("preview");
  const startBtn = $("start");
  const stopBtn = $("stop");
  const micBtn = $("mic");
  const snapBtn = $("snapshot");
  const cameraSel = $("camera");
  const qualitySel = $("quality");
  const statusLine = $("status-line");
  const chatText = $("chat-text");
  const chatSend = $("chat-send");
  const hostName = $("chat-name");

  const chat = createChat({ log: $("chat-log"), empty: $("chat-empty") });

  let stream = null;
  let peer = null;
  let wakeLock = null;
  const viewers = new Map(); // peerId -> { conn, call, lastMsg }
  const history = [];

  hostName.value = store.get("rooster-host") || hostName.value;

  function status(text, kind) {
    statusLine.textContent = text;
    statusLine.className = "status-line" + (kind ? " " + kind : "");
  }

  function setLive(live) {
    $("status-badge").textContent = live ? "Live" : "Not live";
    $("status-badge").classList.toggle("live", live);
    startBtn.disabled = live;
    stopBtn.disabled = !live;
    chatText.disabled = !live;
    chatSend.disabled = !live;
  }

  // ---------- Camera ----------
  function constraints(deviceId) {
    const h = Number(qualitySel.value);
    const video = { height: { ideal: h }, width: { ideal: Math.round((h * 16) / 9) }, frameRate: { ideal: 24, max: 30 } };
    if (deviceId) video.deviceId = { exact: deviceId };
    else video.facingMode = "environment";
    return { video, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } };
  }

  async function openCamera(deviceId) {
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia(constraints(deviceId));
    } catch (err) {
      if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
        // retry without audio / without exact constraints
        s = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId } : true, audio: true })
          .catch(() => navigator.mediaDevices.getUserMedia({ video: true }));
      } else {
        throw err;
      }
    }
    return s;
  }

  async function listCameras(activeId) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    cameraSel.replaceChildren(
      ...cams.map((d, i) => {
        const o = new Option(d.label || `Camera ${i + 1}`, d.deviceId);
        o.selected = d.deviceId === activeId;
        return o;
      })
    );
    cameraSel.disabled = cams.length < 2;
  }

  async function swapStream(newStream) {
    const old = stream;
    stream = newStream;
    preview.srcObject = stream;
    applyMic();
    for (const v of viewers.values()) {
      const pc = v.call && v.call.peerConnection;
      if (!pc) continue;
      for (const sender of pc.getSenders()) {
        if (!sender.track) continue;
        const next = stream.getTracks().find((t) => t.kind === sender.track.kind);
        if (next) sender.replaceTrack(next).catch(console.error);
      }
    }
    if (old) old.getTracks().forEach((t) => t.stop());
  }

  cameraSel.addEventListener("change", async () => {
    if (!stream) return;
    try { await swapStream(await openCamera(cameraSel.value)); }
    catch (err) { status("Couldn't switch camera: " + err.message, "err"); }
  });

  qualitySel.addEventListener("change", async () => {
    if (!stream) return;
    const id = stream.getVideoTracks()[0]?.getSettings().deviceId;
    try { await swapStream(await openCamera(id)); }
    catch (err) { status("Couldn't change quality: " + err.message, "err"); }
  });

  // ---------- Mic ----------
  let micOn = true;
  function applyMic() {
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = micOn));
    micBtn.disabled = stream.getAudioTracks().length === 0;
    micBtn.textContent = micOn ? "Mute sound" : "Turn sound on";
  }
  micBtn.addEventListener("click", () => { micOn = !micOn; applyMic(); });

  // ---------- Viewers & chat ----------
  function sendAll(msg) {
    for (const v of viewers.values()) if (v.conn.open) v.conn.send(msg);
  }

  function pushChat(msg) {
    history.push(msg);
    while (history.length > cfg.chat.historySize) history.shift();
    chat.add(msg);
    sendAll(msg);
  }

  function updateCount() {
    const n = viewers.size;
    const label = n === 1 ? "1 watching" : `${n} watching`;
    $("viewer-badge").textContent = label;
    $("viewer-badge").hidden = !peer;
    $("chat-count").textContent = label;
    sendAll({ type: "count", n });
  }

  function removeViewer(id) {
    const v = viewers.get(id);
    if (!v) return;
    viewers.delete(id);
    if (v.call) v.call.close();
    if (v.conn.open) v.conn.close();
    updateCount();
  }

  function onViewer(conn) {
    conn.on("open", () => {
      const v = { conn, call: null, lastMsg: 0 };
      viewers.set(conn.peer, v);
      conn.send({ type: "history", messages: history });
      v.call = peer.call(conn.peer, stream);
      if (v.call) v.call.on("close", () => { if (viewers.get(conn.peer) === v) v.call = null; });
      updateCount();
    });

    conn.on("data", (msg) => {
      const v = viewers.get(conn.peer);
      if (!v || !msg || msg.type !== "chat") return;
      const now = Date.now();
      if (now - v.lastMsg < 1500) return; // simple flood protection
      v.lastMsg = now;
      const name = clean(msg.name, 24);
      const text = clean(msg.text, cfg.chat.maxLength);
      if (!name || !text) return;
      pushChat({ type: "chat", name, text, ts: now });
    });

    conn.on("close", () => removeViewer(conn.peer));
    conn.on("error", () => removeViewer(conn.peer));
  }

  // ---------- Start / stop ----------
  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    } catch { /* not supported or refused */ }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && peer) requestWakeLock();
  });

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      status("This browser can't use the camera. Open this page over https in Chrome, Safari or Firefox.", "err");
      return;
    }
    startBtn.disabled = true;
    status("Opening the camera…");
    try {
      stream = await openCamera();
    } catch (err) {
      startBtn.disabled = false;
      status(err.name === "NotAllowedError"
        ? "Camera access was blocked. Allow camera and microphone for this site, then try again."
        : "Couldn't open the camera: " + err.message, "err");
      return;
    }
    preview.srcObject = stream;
    $("overlay").hidden = true;
    micOn = true;
    applyMic();
    snapBtn.disabled = false;
    listCameras(stream.getVideoTracks()[0]?.getSettings().deviceId).catch(() => {});

    status("Connecting to the stream server…");
    peer = new Peer(cfg.streamId, { config: { iceServers: cfg.iceServers } });

    peer.on("open", () => {
      setLive(true);
      status("You're live. Viewers can open the site now.", "ok");
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
        status("Another broadcast is already live with this stream ID. Stop it first, or wait a minute and try again.", "err");
        stop();
      } else if (err.type === "peer-unavailable") {
        // a viewer left mid-handshake; ignore
      } else {
        status("Stream error: " + (err.message || err.type), "err");
      }
    });
  }

  function stop() {
    for (const id of [...viewers.keys()]) removeViewer(id);
    if (peer) { peer.destroy(); peer = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    preview.srcObject = null;
    $("overlay").hidden = false;
    $("viewer-badge").hidden = true;
    $("chat-count").textContent = "";
    micBtn.disabled = true;
    snapBtn.disabled = true;
    cameraSel.disabled = true;
    setLive(false);
    if (!statusLine.classList.contains("err")) status("Broadcast stopped.");
  }

  startBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", stop);
  window.addEventListener("beforeunload", (e) => { if (peer) e.preventDefault(); });

  // ---------- Snapshot ----------
  snapBtn.addEventListener("click", () => {
    if (!preview.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = preview.videoWidth;
    canvas.height = preview.videoHeight;
    canvas.getContext("2d").drawImage(preview, 0, 0);
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `coop-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/jpeg", 0.9);
  });

  // ---------- Host chat ----------
  $("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = clean(hostName.value, 24);
    const text = clean(chatText.value, cfg.chat.maxLength);
    if (!name || !text || !peer) return;
    store.set("rooster-host", name);
    pushChat({ type: "chat", name, text, host: true, ts: Date.now() });
    chatText.value = "";
    chatText.focus();
  });

  setLive(false);
  if (typeof Peer === "undefined") status("The streaming library didn't load. Check your connection and reload.", "err");
})();
