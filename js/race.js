// Shared race maths and formatting for viewer and race control.
(function () {
  function fmtLap(ms) {
    if (ms == null || !isFinite(ms)) return "—";
    const s = ms / 1000;
    if (s < 60) return s.toFixed(3);
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(3).padStart(6, "0")}`;
  }

  function fmtClock(ms) {
    if (ms == null || !isFinite(ms) || ms < 0) ms = 0;
    const total = Math.floor(ms / 100);
    const tenths = total % 10;
    const secs = Math.floor(total / 10) % 60;
    const mins = Math.floor(total / 600);
    return `${mins}:${String(secs).padStart(2, "0")}.${tenths}`;
  }

  // race: { racerIds, startedAt, taps: { id: [timestamps] }, laps }
  // Returns rows sorted by position.
  function standings(race, racersById) {
    if (!race) return [];
    const rows = (race.racerIds || []).map((id) => {
      const taps = (race.taps && race.taps[id]) || [];
      const lapTimes = taps.map((t, i) => t - (i === 0 ? race.startedAt : taps[i - 1]));
      return {
        id,
        racer: racersById[id] || { id, name: id, number: "?", color: "#888" },
        laps: taps.length,
        lastTap: taps.length ? taps[taps.length - 1] : null,
        lastLap: lapTimes.length ? lapTimes[lapTimes.length - 1] : null,
        bestLap: lapTimes.length ? Math.min(...lapTimes) : null,
        total: taps.length ? taps[taps.length - 1] - race.startedAt : null,
        finished: race.laps ? taps.length >= race.laps : false,
      };
    });

    rows.sort((a, b) =>
      b.laps - a.laps ||
      (a.lastTap ?? Infinity) - (b.lastTap ?? Infinity) ||
      String(a.racer.number).localeCompare(String(b.racer.number), undefined, { numeric: true })
    );

    const leader = rows[0];
    rows.forEach((r, i) => {
      r.position = i + 1;
      if (i === 0 || !r.laps) r.gap = i === 0 ? "Leader" : "—";
      else if (r.laps === leader.laps) r.gap = "+" + fmtLap(r.lastTap - leader.lastTap);
      else {
        const down = leader.laps - r.laps;
        r.gap = `+${down} lap${down > 1 ? "s" : ""}`;
      }
    });

    const fastest = Math.min(...rows.map((r) => r.bestLap ?? Infinity));
    rows.forEach((r) => (r.fastest = r.bestLap != null && r.bestLap === fastest));
    return rows;
  }

  window.Race = { fmtLap, fmtClock, standings };
})();
