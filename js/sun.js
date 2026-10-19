// Minimal sunrise/sunset calculator (same astronomy as the SunCalc library,
// trimmed to what RoosterLive needs). Exposes window.SunCalc.getTimes().
(function () {
  const PI = Math.PI, rad = PI / 180, dayMs = 86400000;
  const J1970 = 2440588, J2000 = 2451545, J0 = 0.0009;
  const e = rad * 23.4397; // obliquity of the Earth

  const toJulian = (date) => date.valueOf() / dayMs - 0.5 + J1970;
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
  const toDays = (date) => toJulian(date) - J2000;

  const declination = (l) => Math.asin(Math.sin(e) * Math.sin(l));
  const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
  function eclipticLongitude(M) {
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    return M + C + rad * 102.9372 + PI;
  }

  const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * PI));
  const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * PI) + n;
  const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const hourAngle = (h, phi, dec) =>
    Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));

  function getTimes(date, lat, lng) {
    const lw = rad * -lng, phi = rad * lat;
    const n = julianCycle(toDays(date), lw);
    const ds = approxTransit(0, lw, n);
    const M = solarMeanAnomaly(ds);
    const L = eclipticLongitude(M);
    const dec = declination(L);
    const Jnoon = solarTransitJ(ds, M, L);
    const w = hourAngle(-0.833 * rad, phi, dec); // NaN during polar day/night
    const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
    const Jrise = Jnoon - (Jset - Jnoon);
    return { solarNoon: fromJulian(Jnoon), sunrise: fromJulian(Jrise), sunset: fromJulian(Jset) };
  }

  window.SunCalc = { getTimes };
})();
