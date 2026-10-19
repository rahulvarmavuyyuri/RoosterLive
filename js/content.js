// Loads the flock and schedule, renders those sections, and shows which bird
// is in the spotlight. Exposes window.FarmData.
(function () {
  const cfg = window.SITE_CONFIG;
  const $ = (id) => document.getElementById(id);

  document.querySelectorAll("[data-site-name]").forEach((el) => (el.textContent = cfg.siteName));
  document.querySelectorAll("[data-farm-name]").forEach((el) => (el.textContent = cfg.farmName));

  function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((c) => c != null));
    return node;
  }

  async function load(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }

  let birds = [];
  let byId = {};
  const onCamTags = {};

  function renderFlock() {
    const list = $("flock");
    if (!list) return;
    if (!birds.length) {
      list.replaceWith(el("p", { className: "empty-note", textContent: "Add your birds to data/flock.json to show them here." }));
      return;
    }
    list.replaceChildren(...birds.map((b) => {
      const tag = el("span", { className: "oncam", textContent: "On camera", hidden: true });
      onCamTags[b.id] = tag;
      const details = [["Age", b.age], ["Weight", b.weight], ["Comb", b.comb], ["Bloodline", b.bloodline]].filter(([, v]) => v);
      return el("li", { className: "bird" },
        el("img", { src: b.photo, alt: `${b.name}, ${b.breed}`, loading: "lazy" }),
        el("h3", {}, el("span", { textContent: b.name }), tag),
        el("p", { className: "breed", textContent: b.breed }),
        b.about ? el("p", { textContent: b.about }) : null,
        el("dl", {}, ...details.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })])),
        el("span", {
          className: "status " + (b.available ? "avail" : "keep"),
          textContent: b.available ? "Available for breeding" : "Farm's own, not available",
        })
      );
    }));
  }

  function renderDay(items) {
    const list = $("day");
    if (!list) return;
    list.replaceChildren(...items.map((i) =>
      el("li", {},
        el("time", { textContent: i.time }),
        el("div", {}, el("div", { className: "what", textContent: i.title }), el("div", { className: "desc", textContent: i.details })),
        el("div", { className: "when", textContent: i.when || "" })
      )
    ));
  }

  const ready = Promise.all([
    load("data/flock.json").catch((e) => (console.error(e), [])),
    load("data/schedule.json").catch((e) => (console.error(e), [])),
  ]).then(([flock, day]) => {
    birds = flock;
    byId = Object.fromEntries(flock.map((b) => [b.id, b]));
    renderFlock();
    renderDay(day);
    return { birds, byId };
  });

  // Show a bird in the "On camera now" panel and caption (null clears it).
  function setSpotlight(id, cameraLabel) {
    const b = id && byId[id];
    Object.entries(onCamTags).forEach(([bid, tag]) => (tag.hidden = bid !== id));
    const spot = $("spot");
    const caption = $("caption");
    if (!spot) return;
    if (!b) {
      spot.hidden = true;
      $("spot-empty").hidden = false;
      if (caption) caption.hidden = true;
      return;
    }
    spot.replaceChildren(
      el("img", { src: b.photo, alt: "" }),
      el("div", {},
        el("h3", { textContent: b.name }),
        el("p", { className: "breed", textContent: [b.breed, b.age].filter(Boolean).join(", ") }),
        b.about ? el("p", { textContent: b.about }) : null)
    );
    spot.hidden = false;
    $("spot-empty").hidden = true;
    if (caption) {
      caption.replaceChildren(el("strong", { textContent: b.name }),
        document.createTextNode(`, ${b.breed}${cameraLabel ? `, on the ${cameraLabel.toLowerCase()} camera` : ""}`));
      caption.hidden = false;
    }
  }

  window.FarmData = { ready, setSpotlight, get: () => ({ birds, byId }) };
})();
