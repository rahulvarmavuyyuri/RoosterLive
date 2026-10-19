// Viewer: connects to the broadcaster over PeerJS, plays the stream, runs chat.
(function () {
  const cfg = window.ROOSTER_CONFIG;
  const { createChat, clean, store } = window.RoosterChat;
  const $ = (id) => document.getElementById(id);

  const video = $("video");
  const overlay = $("overlay");
  const statusBadge = $("status-badge");
  const viewerBadge = $("viewer-badge");
  const unmuteBtn = $("unmute");
  const chatText = $("chat-text");
  const chatSend = $("chat-send");
  const chatName = $("chat-name");

  const chat = createChat({ log: $("chat-log"), empty: $("chat-empty") });

  let peer = null;
  let conn = null;
  let retryTimer = null;
  let lastMediaCall = null;

  chatName.value = store.get("rooster-name") || "";

  function showOverlay(title, text) {
    $("overlay-title").textContent = title;
    $("overlay-text").textContent = text;
    overlay.hidden = false;
  }

  function setLive(live) {
    statusBadge.textContent = live ? "Live" : "Offline";
    statusBadge.classList.toggle("live", live);
    chatText.disabled = !live;
    chatSend.disabled = !live;
    if (!live) {
      viewerBadge.hidden = true;
      $("chat-count").textContent = "";
    }
  }

  function setViewers(n) {
    const label = n === 1 ? "1 watching" : `${n} watching`;
    viewerBadge.textContent = label;
    viewerBadge.hidden = false;
    $("chat-count").textContent = label;
  }

  function scheduleRetry(delay = 6000) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, delay);
  }

  function goOffline() {
    setLive(false);
    video.srcObject = null;
    unmuteBtn.hidden = true;
    showOverlay("The coop is off air", "The camera isn't streaming right now. This page reconnects by itself when it's back.");
    scheduleRetry();
  }

  function connect() {
    clearTimeout(retryTimer);
    if (!peer || peer.destroyed) return startPeer();
    if (peer.disconnected) { peer.reconnect(); return; }

    const old = conn;
    const c = peer.connect(cfg.streamId, { reliable: true });
    conn = c;
    if (old) old.close(); // its handlers ignore events once it's no longer current

    const current = () => c === conn;

    c.on("open", () => {
      if (!current()) return;
      setLive(true);
      showOverlay("Coop found", "Starting the video…");
    });

    c.on("data", (msg) => {
      if (!current()) return;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "history") chat.reset(Array.isArray(msg.messages) ? msg.messages : []);
      else if (msg.type === "chat" || msg.type === "system") chat.add(msg);
      else if (msg.type === "count") setViewers(Number(msg.n) || 0);
    });

    c.on("close", () => { if (current()) goOffline(); });
    c.on("error", () => { if (current()) goOffline(); });
  }

  function startPeer() {
    peer = new Peer({ config: { iceServers: cfg.iceServers } });

    peer.on("open", connect);
    peer.on("disconnected", () => scheduleRetry(3000));

    peer.on("call", (call) => {
      if (lastMediaCall) lastMediaCall.close();
      lastMediaCall = call;
      call.answer();
      call.on("stream", (stream) => {
        video.srcObject = stream;
        video.play().catch(() => {});
        overlay.hidden = true;
        unmuteBtn.hidden = !video.muted || stream.getAudioTracks().length === 0;
      });
      call.on("close", () => { if (lastMediaCall === call) video.srcObject = null; });
    });

    peer.on("error", (err) => {
      if (err.type === "peer-unavailable") {
        goOffline();
      } else if (["network", "server-error", "socket-error", "socket-closed"].includes(err.type)) {
        setLive(false);
        showOverlay("Can't reach the stream server", "Check your internet connection. Retrying…");
        scheduleRetry(8000);
      } else {
        console.error("PeerJS error", err);
        scheduleRetry(8000);
      }
    });
  }

  // ---- Controls ----
  unmuteBtn.addEventListener("click", () => {
    video.muted = false;
    video.play().catch(() => {});
    unmuteBtn.hidden = true;
  });

  $("fullscreen").addEventListener("click", () => {
    const target = video.parentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (target.requestFullscreen) target.requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iOS Safari
  });

  $("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = clean(chatName.value, 24);
    const text = clean(chatText.value, cfg.chat.maxLength);
    if (!name || !text || !conn || !conn.open) return;
    store.set("rooster-name", name);
    conn.send({ type: "chat", name, text });
    chatText.value = "";
    chatText.focus();
  });

  setLive(false);
  if (typeof Peer === "undefined") {
    showOverlay("Video player didn't load", "A script was blocked. Try disabling content blockers for this page and reload.");
  } else {
    startPeer();
  }
})();
