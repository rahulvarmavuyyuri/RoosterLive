// Loads racers and schedule, renders those sections, and keeps them in sync
// with live race state. Exposes window.RaceData.
(function () {
  const cfg = window.RACE_CONFIG;
  const { fmtLap } = window.Race;
  const $ = (id) => document.getElementById(id);

  document.querySelectorAll("[data-site-name]").forEach((el) => (el.textContent = cfg.siteName));
  document.querySelectorAll("[data-track-name]").forEach((el) => (el.textContent = cfg.trackName));

  const fmtWhen = new Intl.DateTimeFormat([], {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: cfg.timeZone,
  });

  function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((c) => c != null));
    return node;
  }

  function plate(number) {
    return el("span", { className: "plate", textContent: number });
  }

  async function load(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }

  let live = { race: null, results: {} };
  let data = { racers: [], racersById: {}, schedule: [] };

  const ready = Promise.all([
    load("data/racers.json").catch((e) => (console.error(e), [])),
    load("data/schedule.json").catch((e) => (console.error(e), [])),
  ]).then(([racers, schedule]) => {
    schedule.sort((a, b) => new Date(a.start) - new Date(b.start));
    data = { racers, racersById: Object.fromEntries(racers.map((r) => [r.id, r])), schedule };
    renderRacers();
    renderSchedule();
    return data;
  });

  // ---------- Racers ----------
  function bestToday(id) {
    let best = null;
    for (const rows of Object.values(live.results || {})) {
      for (const r of rows) if (r.id === id && r.bestLap != null) best = best == null ? r.bestLap : Math.min(best, r.bestLap);
    }
    return best;
  }

  function renderRacers() {
    const list = $("racers");
    if (!list) return;
    if (!data.racers.length) {
      list.replaceChildren(el("li", { className: "board-empty", textContent: "Add drivers to data/racers.json to show them here." }));
      return;
    }
    list.replaceChildren(...data.racers.map((r) => {
      const today = bestToday(r.id);
      const card = el("li", { className: "racer" },
        el("img", { src: r.photo, alt: `${r.name}'s ${r.car}`, loading: "lazy" }),
        el("div", { className: "racer-body" },
          el("h3", {}, plate(r.number), el("span", { textContent: r.name })),
          el("dl", {},
            el("dt", { textContent: "Car" }), el("dd", { textContent: r.car }),
            el("dt", { textContent: "Class" }), el("dd", { textContent: r.class }),
            el("dt", { textContent: "Personal best" }), el("dd", { textContent: r.personalBest ? fmtLap(r.personalBest * 1000) : "—" }),
            today != null ? el("dt", { textContent: "Best today" }) : null,
            today != null ? el("dd", { textContent: fmtLap(today) }) : null,
          )
        )
      );
      card.style.setProperty("--racer-color", r.color || "var(--ink)");
      return card;
    }));
  }

  // ---------- Schedule ----------
  function raceStatus(race) {
    if (live.race && live.race.id === race.id) {
      if (live.race.status === "running") return { cls: "is-live", text: "Live now" };
      if (live.race.status === "finished") return { cls: "is-done", text: winnerText(race.id) || "Finished" };
      return { cls: "is-live", text: "On the grid" };
    }
    if (live.results && live.results[race.id]) return { cls: "is-done", text: winnerText(race.id) };
    if (new Date(race.start) < Date.now()) return { cls: "", text: "" };
    return { cls: "", text: "" };
  }

  function winnerText(raceId) {
    const rows = live.results && live.results[raceId];
    const w = rows && rows[0];
    if (!w) return "";
    const r = data.racersById[w.id];
    return `Won by ${r ? r.name : w.id}`;
  }

  function renderSchedule() {
    const list = $("schedule");
    if (!list) return;
    if (!data.schedule.length) {
      list.replaceChildren(el("li", { textContent: "No races scheduled yet. Add them to data/schedule.json." }));
      return;
    }
    list.replaceChildren(...data.schedule.map((race) => {
      const names = (race.racers || []).map((id) => (data.racersById[id] ? `#${data.racersById[id].number}` : id)).join(", ");
      const st = raceStatus(race);
      return el("li", { className: st.cls },
        el("time", { dateTime: race.start, textContent: fmtWhen.format(new Date(race.start)) }),
        el("div", {},
          el("div", { className: "race-name", textContent: race.name }),
          el("div", { className: "race-meta", textContent: `${race.class}, ${race.laps} laps, ${names}` })
        ),
        el("div", { className: "race-state", textContent: st.text })
      );
    }));
  }

  function tickCountdown() {
    const box = $("next-race");
    if (!box) return;
    const now = Date.now();
    const next = data.schedule.find((r) => new Date(r.start) > now && !(live.results || {})[r.id]);
    if (!next || (live.race && live.race.status === "running")) { box.hidden = true; return; }
    const diff = new Date(next.start) - now;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = (n) => String(n).padStart(2, "0");
    $("next-name").textContent = next.name;
    $("next-countdown").textContent = (d ? `${d}d ` : "") + `${pad(h)}:${pad(m)}:${pad(s)}`;
    box.hidden = false;
  }
  ready.then(() => { tickCountdown(); setInterval(tickCountdown, 1000); });

  let resultsKey = "{}";
  function update(race, results) {
    live = { race, results: results || {} };
    renderSchedule();
    const key = JSON.stringify(live.results);
    if (key !== resultsKey) { resultsKey = key; renderRacers(); }
    tickCountdown();
  }

  window.RaceData = { ready, update, get: () => data };
})();
