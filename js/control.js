// Race control: runs races, records laps by tapping, and is the hub that sends
// race state and chat to every viewer.
(function () {
  const cfg = window.RACE_CONFIG;
  const ids = window.RACE_IDS;
  const { createChat, clean, store } = window.RaceChat;
  const { standings, fmtLap, fmtClock } = window.Race;
  const $ = (id) => document.getElementById(id);

  const chat = createChat({ log: $("chat-log"), empty: $("chat-empty") });
  const DOUBLE_TAP_MS = 2000;
  const SAVE_KEY = "race-control-state";

  let racers = [];
  let racersById = {};
  let schedule = [];
  let peer = null;
  const viewers = new Map(); // peerId -> { conn, lastMsg }

  // Saved so a page refresh mid-race loses nothing.
  let state = { race: null, results: {}, history: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (saved && typeof saved === "object") state = { race: null, results: {}, history: [], ...saved };
  } catch { /* storage unavailable */ }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }

  $("chat-name").value = store.get("race-host") || $("chat-name").value;

  function status(text, kind) {
    $("status-line").textContent = text;
    $("status-line").className = "status-line" + (kind ? " " + kind : "");
  }

  // ---------- Sending to viewers ----------
  function sendAll(msg) {
    for (const v of viewers.values()) if (v.conn.open) v.conn.send(msg);
  }

  function raceMessage() {
    return { type: "race", race: state.race, results: state.results, now: Date.now() };
  }

  function changed() {
    save();
    render();
    sendAll(raceMessage());
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

  // ---------- Race actions ----------
  function loadRace(id) {
    const s = schedule.find((r) => r.id === id);
    if (!s) return;
    if (state.race && state.race.status === "running" && !confirm(`${state.race.name} is still running. Abandon it and load ${s.name}?`)) return;
    if (state.results[s.id] && !confirm(`${s.name} already has results. Run it again and replace them?`)) return;
    state.race = {
      id: s.id, name: s.name, class: s.class, laps: Number(s.laps) || 10,
      racerIds: (s.racers || []).filter((r) => racersById[r]),
      status: "ready", startedAt: null, finishedAt: null, taps: {},
    };
    changed();
    pushChat({ type: "system", text: `${s.name} is on the grid.`, ts: Date.now() });
  }

  function startRace() {
    const r = state.race;
    if (!r || r.status !== "ready") return;
    r.status = "running";
    r.startedAt = Date.now();
    r.taps = {};
    changed();
    pushChat({ type: "system", text: `${r.name} has started.`, ts: Date.now() });
  }

  function finishRace(endedAt) {
    const r = state.race;
    if (!r || r.status !== "running") return;
    r.status = "finished";
    r.finishedAt = endedAt || Date.now();
    const rows = standings(r, racersById);
    state.results[r.id] = rows.map((x) => ({ id: x.id, position: x.position, laps: x.laps, bestLap: x.bestLap, total: x.total }));
    changed();
    const w = rows[0];
    pushChat({ type: "system", text: w && w.laps ? `${r.name} finished. ${w.racer.name} wins!` : `${r.name} finished.`, ts: Date.now() });
  }

  function tap(racerId) {
    const r = state.race;
    if (!r || r.status !== "running") return;
    const taps = (r.taps[racerId] = r.taps[racerId] || []);
    if (taps.length >= r.laps) return;
    const now = Date.now();
    const last = taps.length ? taps[taps.length - 1] : r.startedAt;
    if (now - last < DOUBLE_TAP_MS) return;
    taps.push(now);
    flash(racerId);
    if (r.racerIds.every((id) => (r.taps[id] || []).length >= r.laps)) finishRace(now);
    else changed();
  }

  function undo() {
    const r = state.race;
    if (!r || !r.startedAt) return;
    let latestId = null, latest = -Infinity;
    for (const [id, taps] of Object.entries(r.taps)) {
      const t = taps[taps.length - 1];
      if (t != null && t > latest) { latest = t; latestId = id; }
    }
    if (!latestId) return;
    r.taps[latestId].pop();
    if (r.status === "finished") {
      // reopen the race so the corrected lap can be re-recorded
      r.status = "running";
      r.finishedAt = null;
      delete state.results[r.id];
    }
    changed();
  }

  // ---------- Rendering ----------
  const tapButtons = new Map();

  function flash(id) {
    const b = tapButtons.get(id);
    if (!b) return;
    b.classList.add("flash");
    setTimeout(() => b.classList.remove("flash"), 250);
  }

  function renderTaps() {
    const grid = $("taps");
    const r = state.race;
    const want = r ? r.racerIds.join(",") : "";
    if (grid.dataset.racers !== want) {
      grid.dataset.racers = want;
      tapButtons.clear();
      grid.replaceChildren(...(r ? r.racerIds : []).map((id) => {
        const racer = racersById[id];
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tap";
        b.style.setProperty("--racer-color", racer.color || "var(--ink)");
        const plate = Object.assign(document.createElement("span"), { className: "plate", textContent: racer.number });
        const name = Object.assign(document.createElement("span"), { className: "tap-name", textContent: racer.name });
        const laps = Object.assign(document.createElement("span"), { className: "tap-laps" });
        b.append(plate, name, laps);
        b.addEventListener("pointerdown", (e) => { e.preventDefault(); tap(id); });
        b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tap(id); } });
        tapButtons.set(id, b);
        return b;
      }));
    }
    if (!r) return;
    for (const [id, b] of tapButtons) {
      const n = (r.taps[id] || []).length;
      const done = n >= r.laps;
      b.disabled = r.status !== "running" || done;
      b.querySelector(".tap-laps").textContent = done ? `Finished, ${n} laps` : `Lap ${n} of ${r.laps}`;
      b.setAttribute("aria-label", `Record lap for ${racersById[id].name}, ${n} of ${r.laps} done`);
    }
  }

  function renderBoard() {
    const rows = standings(state.race, racersById);
    $("board").hidden = !rows.length;
    $("board-empty").hidden = !!rows.length;
    $("board-rows").replaceChildren(...rows.map((x) => {
      const tr = document.createElement("tr");
      if (x.finished) tr.className = "done";
      const td = (text, cls) => Object.assign(document.createElement("td"), { textContent: text, className: cls || "" });
      const who = document.createElement("td");
      const wrap = Object.assign(document.createElement("div"), { className: "who" });
      wrap.append(
        Object.assign(document.createElement("span"), { className: "plate", textContent: x.racer.number }),
        Object.assign(document.createElement("span"), { textContent: x.racer.name })
      );
      who.append(wrap);
      tr.append(td(x.position, "pos"), who, td(x.laps, "r"), td(fmtLap(x.lastLap), "r"),
        td(fmtLap(x.bestLap), "r hide-sm" + (x.fastest ? " fast" : "")), td(x.gap, "r"));
      return tr;
    }));
  }

  function renderPicker() {
    const pick = $("race-pick");
    const keep = pick.value;
    pick.replaceChildren(...schedule.map((s) =>
      new Option(`${s.name} (${s.class}, ${s.laps} laps)${state.results[s.id] ? ", done" : ""}`, s.id)));
    if (keep) pick.value = keep;
  }

  function render() {
    const r = state.race;
    renderPicker();
    $("race-title").textContent = r ? r.name : "No race loaded";
    $("race-state").textContent = r ? { ready: "On the grid", running: "Racing", finished: "Finished" }[r.status] + `, ${r.laps} laps` : "";
    $("start").disabled = !r || r.status !== "ready";
    $("end").disabled = !r || r.status !== "running";
    $("undo").disabled = !r || !Object.values(r.taps || {}).some((t) => t.length);
    renderTaps();
    renderBoard();
    tickClock();
  }

  function tickClock() {
    const r = state.race;
    let ms = 0;
    if (r && r.startedAt) ms = (r.status === "finished" ? r.finishedAt : Date.now()) - r.startedAt;
    $("clock").textContent = fmtClock(ms);
  }
  setInterval(tickClock, 100);

  $("load").addEventListener("click", () => loadRace($("race-pick").value));
  $("start").addEventListener("click", startRace);
  $("end").addEventListener("click", () => { if (confirm("End the race now?")) finishRace(); });
  $("undo").addEventListener("click", undo);

  // ---------- Hub ----------
  function onViewer(conn) {
    conn.on("open", () => {
      viewers.set(conn.peer, { conn, lastMsg: 0 });
      conn.send({ type: "history", messages: state.history });
      conn.send(raceMessage());
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
      status("Online. Viewers receive lap times and chat.", "ok");
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
        status("Race control is already open on another device or tab. Close it there, then reload this page.", "err");
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
    store.set("race-host", name);
    pushChat({ type: "chat", name, text, host: true, ts: Date.now() });
    $("chat-text").value = "";
    $("chat-text").focus();
  });

  window.addEventListener("beforeunload", (e) => {
    if (state.race && state.race.status === "running") e.preventDefault();
  });

  // ---------- Boot ----------
  Promise.all([
    fetch("data/racers.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("data/schedule.json", { cache: "no-cache" }).then((r) => r.json()),
  ]).then(([rs, sc]) => {
    racers = rs;
    racersById = Object.fromEntries(rs.map((r) => [r.id, r]));
    schedule = sc.sort((a, b) => new Date(a.start) - new Date(b.start));
    renderPicker();
    const next = schedule.find((s) => !state.results[s.id]);
    if (state.race) $("race-pick").value = state.race.id;
    else if (next) $("race-pick").value = next.id;
    chat.reset(state.history);
    render();
  }).catch((err) => {
    status("Couldn't load data/racers.json or data/schedule.json: " + err.message, "err");
  });

  if (typeof Peer === "undefined") status("The streaming library didn't load. Check your connection and reload.", "err");
  else goOnline();
})();
