// Sunrise, sunset and "next crow" countdown for the coop's location.
(function () {
  const cfg = window.ROOSTER_CONFIG;
  const $ = (id) => document.getElementById(id);
  if (!$("countdown") || !window.SunCalc) return;

  const { latitude, longitude, timeZone } = cfg.coop;
  const crowLead = (cfg.crowMinutesBeforeSunrise || 0) * 60 * 1000;
  const DAY = 86400000;

  const fmtTime = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit", timeZone });
  const fmtDay = new Intl.DateTimeFormat([], { weekday: "short", hour: "numeric", minute: "2-digit", timeZone });

  // Sun events for yesterday, today and tomorrow, sorted.
  function events(now) {
    const list = [];
    for (const offset of [-1, 0, 1, 2]) {
      const t = SunCalc.getTimes(new Date(now.getTime() + offset * DAY), latitude, longitude);
      if (!isNaN(t.sunrise)) list.push({ kind: "rise", at: t.sunrise });
      if (!isNaN(t.sunset)) list.push({ kind: "set", at: t.sunset });
    }
    list.sort((a, b) => a.at - b.at);
    // drop near-duplicates produced by overlapping days
    return list.filter((e, i) => i === 0 || e.at - list[i - 1].at > 3600000);
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function placeBody(fraction, isDay) {
    const angle = Math.PI * (1 - Math.min(1, Math.max(0, fraction)));
    const dot = $("sun-dot");
    dot.setAttribute("cx", (300 + 260 * Math.cos(angle)).toFixed(1));
    dot.setAttribute("cy", (220 - 190 * Math.sin(angle)).toFixed(1));
    dot.setAttribute("class", isDay ? "sun" : "moon");
  }

  function tick() {
    const now = new Date();
    const ev = events(now);

    const prev = [...ev].reverse().find((e) => e.at <= now);
    const next = ev.find((e) => e.at > now);
    const nextRise = ev.find((e) => e.kind === "rise" && e.at - crowLead > now);
    const nextSet = ev.find((e) => e.kind === "set" && e.at > now);

    if (prev && next) {
      placeBody((now - prev.at) / (next.at - prev.at), prev.kind === "rise");
      const riseLabel = prev.kind === "rise" ? prev.at : next.at;
      const setLabel = prev.kind === "rise" ? next.at : prev.at;
      $("arc-rise").textContent = "Sunrise " + fmtTime.format(riseLabel);
      $("arc-set").textContent = "Sunset " + fmtTime.format(setLabel);
    }

    if (nextRise) {
      const crowAt = new Date(nextRise.at.getTime() - crowLead);
      const diff = Math.max(0, crowAt - now);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      $("countdown").textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
      $("crow-at").textContent = fmtDay.format(crowAt);
      $("sunrise").textContent = fmtDay.format(nextRise.at);
    }
    if (nextSet) $("sunset").textContent = fmtDay.format(nextSet.at);
    $("coop-time").textContent = fmtDay.format(now);
  }

  tick();
  setInterval(tick, 1000);
})();
