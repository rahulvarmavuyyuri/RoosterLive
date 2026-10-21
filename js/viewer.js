// Viewer: watches any online farm camera, follows the host for chat and the
// spotlight bird. Everything goes peer-to-peer through PeerJS.
(function () {
  const cfg = window.SITE_CONFIG;
  const ids = window.SITE_IDS;
  const { createChat, clean, store } = window.SiteChat;
  const $ = (id) => document.getElementById(id);

  const video = $("video");
  const overlay = $("overlay");
  const chat = createChat({ log: $("chat-log"), empty: $("chat-empty") });

  let peer = null;
  let selected = null;     // camera id being watched
  let userPicked = false;  // user chose a camera themselves
  let mediaCall = null;
  let hubConn = null;
  let hubRetry = null;
  let spotlight = { bird: null, camera: null };
  // The password is remembered only until this tab is closed, so every new
  // visit asks again. (Older versions kept it forever in localStorage.)
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch { /* ignore */ } },
  };
  store.set("viewer-pass", "");
  try { localStorage.removeItem("viewer-pass"); } catch { /* ignore */ }
  let accessKey = session.get("viewer-pass") || "";
  let verified = false;   // a camera or the host accepted the password
  let waitTimer = null;

  const cams = new Map(cfg.cameras.map((c) => [c.id, { ...c, conn: null, online: false, retry: null, tab: null }]));
  const peerToCam = new Map(cfg.cameras.map((c) => [ids.camera(c.id), c.id]));

  $("chat-name").value = store.get("viewer-name") || "";

  // ---------- Overlay & badges ----------
  function showOverlay(title, text) {
    $("overlay-title").textContent = title;
    $("overlay-text").textContent = text;
    overlay.hidden = false;
  }

  function setLiveBadge(live) {
    $("status-badge").textContent = live ? "Live" : "Offline";
    $("status-badge").classList.toggle("live", live);
  }

  function refreshOverlay() {
    const anyOnline = [...cams.values()].some((c) => c.online);
    if (!anyOnline) {
      setLiveBadge(false);
      showOverlay("No cameras are live", "The farm cameras aren't streaming right now. This page connects by itself when one starts.");
    } else if (selected && !cams.get(selected).online) {
      setLiveBadge(false);
      showOverlay(`${cams.get(selected).label} is offline`, "Pick another camera above.");
    }
  }

  // ---------- Camera tabs ----------
  function renderTabs() {
    const wrap = $("cam-tabs");
    if (!wrap.children.length) {
      for (const cam of cams.values()) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cam-tab";
        b.textContent = cam.label;
        b.addEventListener("click", () => { userPicked = true; select(cam.id); });
        cam.tab = b;
        wrap.append(b);
      }
    }
    for (const cam of cams.values()) {
      cam.tab.classList.toggle("online", cam.online);
      cam.tab.disabled = !cam.online;
      cam.tab.setAttribute("aria-pressed", String(cam.id === selected));
      cam.tab.title = cam.online ? `Watch ${cam.label}` : `${cam.label} is offline`;
    }
  }

  function select(id) {
    if (id === selected && mediaCall) return;
    const prev = selected && cams.get(selected);
    if (prev && prev.conn && prev.conn.open) prev.conn.send({ type: "unwatch" });
    if (mediaCall) { mediaCall.close(); mediaCall = null; }
    video.srcObject = null;
    selected = id;
    const cam = cams.get(id);
    renderTabs();
    if (cam && cam.online && cam.conn.open) {
      showOverlay(cam.label, "Starting the video…");
      cam.conn.send({ type: "watch" });
    } else {
      refreshOverlay();
    }
  }

  // Only switch automatically when nothing (or an offline camera) is selected.
  function autoSelect() {
    const current = selected && cams.get(selected);
    if (current && current.online) return;
    const first = [...cams.values()].find((c) => c.online);
    if (first) select(first.id);
  }

  // ---------- Camera connections ----------
  function probe(cam) {
    clearTimeout(cam.retry);
    if (!peer || peer.destroyed) return;
    if (peer.disconnected) { cam.retry = setTimeout(() => probe(cam), 8000); return; }
    const c = peer.connect(ids.camera(cam.id), { reliable: true, metadata: { key: accessKey } });
    cam.conn = c;
    c.on("data", (msg) => {
      if (cam.conn !== c || !msg) return;
      if (msg.type === "denied") { denied(); return; }
      accepted();
      if (msg.type === "photos" && Array.isArray(msg.photos)) setPhotos(cam.id, msg.photos);
    });
    c.on("open", () => {
      if (cam.conn !== c) return;
      cam.online = true;
      renderTabs();
      if (selected === cam.id && !mediaCall) select(cam.id);
      else autoSelect();
      if (spotlight.camera === cam.id) renderSpotlight();
    });
    const lost = () => {
      if (cam.conn !== c) return;
      camOffline(cam);
    };
    c.on("close", lost);
    c.on("error", lost);
  }

  function camOffline(cam) {
    cam.online = false;
    cam.conn = null;
    if (selected === cam.id) {
      if (mediaCall) { mediaCall.close(); mediaCall = null; }
      video.srcObject = null;
      userPicked = false;
    }
    renderTabs();
    refreshOverlay();
    autoSelect();
    clearTimeout(cam.retry);
    cam.retry = setTimeout(() => probe(cam), 8000);
  }

  // ---------- Host (chat + spotlight) ----------
  function connectHub() {
    clearTimeout(hubRetry);
    if (!peer || peer.destroyed) return;
    if (peer.disconnected) { hubRetry = setTimeout(connectHub, 8000); return; }
    const c = peer.connect(ids.hub(), { reliable: true, metadata: { key: accessKey } });
    hubConn = c;
    const current = () => hubConn === c;

    c.on("open", () => {
      if (!current()) return;
      $("chat-text").disabled = false;
      $("chat-send").disabled = false;
      $("chat-empty").textContent = "No messages yet. Say hello.";
    });
    c.on("data", (msg) => {
      if (!current() || !msg || typeof msg !== "object") return;
      if (msg.type !== "denied") accepted();
      switch (msg.type) {
        case "denied": denied(); return;
        case "ok": accepted(); break;
        case "history": chat.reset(Array.isArray(msg.messages) ? msg.messages : []); break;
        case "chat":
        case "system": chat.add(msg); break;
        case "count": setCount(Number(msg.n) || 0); break;
        case "spotlight":
          spotlight = { bird: msg.bird || null, camera: msg.camera || null };
          renderSpotlight();
          break;
      }
    });
    const lost = () => { if (current()) hubOffline(); };
    c.on("close", lost);
    c.on("error", lost);
  }

  function hubOffline() {
    hubConn = null;
    $("chat-text").disabled = true;
    $("chat-send").disabled = true;
    $("chat-empty").textContent = "Chat opens when the host is online.";
    $("viewer-badge").hidden = true;
    $("chat-count").textContent = "";
    clearTimeout(hubRetry);
    hubRetry = setTimeout(connectHub, 8000);
  }

  function setCount(n) {
    const label = n === 1 ? "1 watching" : `${n} watching`;
    $("viewer-badge").textContent = label;
    $("viewer-badge").hidden = false;
    $("chat-count").textContent = label;
  }

  // ---------- Spotlight ----------
  function renderSpotlight() {
    const cam = spotlight.camera && cams.get(spotlight.camera);
    window.FarmData.setSpotlight(spotlight.bird, cam ? cam.label : null);
    // Follow the host to the spotlight camera unless the viewer picked one themselves.
    if (cam && cam.online && !userPicked && selected !== cam.id) select(cam.id);
  }

  // ---------- Peer ----------
  function startPeer() {
    peer = new Peer({ config: { iceServers: cfg.iceServers } });

    // "open" fires on first connect and again after a reconnect.
    peer.on("open", () => {
      for (const cam of cams.values()) if (!cam.conn) probe(cam);
      if (!hubConn) connectHub();
    });

    peer.on("disconnected", () => setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 3000));

    peer.on("call", (call) => {
      const camId = peerToCam.get(call.peer);
      if (camId !== selected) { call.close(); return; }
      if (mediaCall) mediaCall.close();
      mediaCall = call;
      call.answer();
      call.on("stream", (stream) => {
        if (mediaCall !== call) return;
        video.srcObject = stream;
        video.play().catch(() => {});
        overlay.hidden = true;
        setLiveBadge(true);
        $("unmute").hidden = !video.muted || stream.getAudioTracks().length === 0;
      });
      call.on("close", () => {
        if (mediaCall !== call) return;
        mediaCall = null;
        video.srcObject = null;
        refreshOverlay();
      });
    });

    peer.on("error", (err) => {
      if (err.type === "peer-unavailable") {
        const target = (String(err.message).match(/peer (\S+)/) || [])[1];
        if (target === ids.hub()) { if (hubConn) hubOffline(); return; }
        const cam = cams.get(peerToCam.get(target));
        if (cam) camOffline(cam);
        return;
      }
      if (["network", "server-error", "socket-error", "socket-closed"].includes(err.type)) {
        setLiveBadge(false);
        showOverlay("Can't reach the stream server", "Check your internet connection. Retrying…");
        return;
      }
      console.error("PeerJS error", err);
    });
  }

  // ---------- Photos shared from the cameras ----------
  const photosByCam = {};
  function setPhotos(camId, list) {
    photosByCam[camId] = list
      .filter((p) => p && typeof p.src === "string" && p.src.startsWith("data:image/"))
      .slice(0, 12)
      .map((p) => ({ src: p.src, caption: String(p.caption || "").slice(0, 80), ts: Number(p.ts) || 0 }));
    renderPhotos();
  }
  function renderPhotos() {
    const all = Object.values(photosByCam).flat().sort((a, b) => b.ts - a.ts);
    $("photos-empty").hidden = all.length > 0;
    $("photo-grid").replaceChildren(...all.map((p) => {
      const li = document.createElement("li");
      const btn = Object.assign(document.createElement("button"), { type: "button" });
      btn.append(Object.assign(document.createElement("img"), { src: p.src, alt: p.caption || "Photo from the farm", loading: "lazy" }));
      if (p.caption) btn.append(Object.assign(document.createElement("span"), { textContent: p.caption }));
      btn.addEventListener("click", () => {
        $("photo-view-img").src = p.src;
        $("photo-view-img").alt = p.caption || "Photo from the farm";
        $("photo-view-cap").textContent = p.caption;
        $("photo-view").showModal();
      });
      li.append(btn);
      return li;
    }));
  }
  $("photo-view").addEventListener("click", (e) => { if (e.target === $("photo-view")) $("photo-view").close(); });

  // ---------- Password gate ----------
  // Only the live area (video, farm photos, chat) is locked. The flock,
  // and compare sections are open to everyone. The video stays
  // covered until a live camera or the host confirms the password.
  function gateNote(text) {
    $("gate-note").textContent = text || "";
    $("gate-note").hidden = !text;
  }

  function showGate(error) {
    $("gate-error").textContent = error || "";
    $("gate-error").hidden = !error;
    gateNote("");
    $("gate-form").classList.remove("checking");
    $("gate").hidden = false;
    $("gate-pass").value = "";
    // Focus only after a mistake, so the keyboard doesn't pop up on arrival.
    if (error) setTimeout(() => $("gate-pass").focus({ preventScroll: true }), 50);
  }

  function checking() {
    $("gate-error").hidden = true;
    $("gate-form").classList.add("checking");
    $("gate").hidden = false;
    gateNote("Checking the password with the farm…");
    clearTimeout(waitTimer);
    waitTimer = setTimeout(() => {
      if (!verified) gateNote("The farm isn't live right now, so the password can't be checked yet. Keep this page open: it opens by itself when a camera goes live.");
    }, 10000);
  }

  function accepted() {
    if (verified) return;
    verified = true;
    clearTimeout(waitTimer);
    session.set("viewer-pass", accessKey);
    $("gate").hidden = true;
    $("photos-empty").textContent = "Photos shared from the farm cameras will appear here.";
  }

  // A camera or the host rejected our password: stop everything and ask again.
  function denied() {
    if (!peer) return;
    accessKey = "";
    verified = false;
    clearTimeout(waitTimer);
    session.set("viewer-pass", "");
    for (const cam of cams.values()) { clearTimeout(cam.retry); cam.conn = null; cam.online = false; }
    clearTimeout(hubRetry);
    hubConn = null;
    $("chat-text").disabled = true;
    $("chat-send").disabled = true;
    $("viewer-badge").hidden = true;
    $("chat-count").textContent = "";
    if (mediaCall) { mediaCall.close(); mediaCall = null; }
    video.srcObject = null;
    const p = peer;
    peer = null;
    p.destroy();
    renderTabs();
    setLiveBadge(false);
    showOverlay("Password needed", "Enter the farm's password to watch.");
    showGate("That password didn't work. Ask the farm for the current one.");
  }

  $("gate-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const key = $("gate-pass").value.trim();
    if (key.length < 4) { showGate("The password has at least 4 characters."); return; }
    accessKey = key;
    checking();
    // A new password while still checking: reconnect so it gets sent.
    if (peer) {
      for (const cam of cams.values()) { clearTimeout(cam.retry); cam.conn = null; cam.online = false; }
      clearTimeout(hubRetry);
      hubConn = null;
      const p = peer;
      peer = null;
      p.destroy();
    }
    if (typeof Peer !== "undefined") startPeer();
  });

  // ---------- Controls ----------
  $("unmute").addEventListener("click", () => {
    video.muted = false;
    video.play().catch(() => {});
    $("unmute").hidden = true;
  });

  $("fullscreen").addEventListener("click", () => {
    const target = $("screen");
    if (document.fullscreenElement) document.exitFullscreen();
    else if (target.requestFullscreen) target.requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  });

  $("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = clean($("chat-name").value, 24);
    const text = clean($("chat-text").value, cfg.chat.maxLength);
    if (!name || !text || !hubConn || !hubConn.open) return;
    store.set("viewer-name", name);
    hubConn.send({ type: "chat", name, text });
    $("chat-text").value = "";
    $("chat-text").focus();
  });

  renderTabs();
  setLiveBadge(false);
  window.FarmData.ready.then(renderSpotlight);
  if (typeof Peer === "undefined") {
    showGate("The video player didn't load. Turn off content blockers for this page and reload.");
  } else if (!accessKey) {
    showOverlay("Password needed", "Enter the farm's password to watch.");
    showGate();
  } else {
    checking();
    startPeer();
  }
})();
