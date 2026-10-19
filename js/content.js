// Fills in the flock and gallery sections from data/*.json.
(function () {
  const cfg = window.ROOSTER_CONFIG;
  document.querySelectorAll("[data-coop-name]").forEach((el) => (el.textContent = cfg.coop.name));

  function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  }

  async function load(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }

  async function renderFlock() {
    const list = document.getElementById("flock");
    if (!list) return;
    try {
      const birds = await load("data/flock.json");
      list.replaceChildren(
        ...birds.map((b) =>
          el("li", { className: "bird" },
            el("img", { src: b.photo, alt: `${b.name}, ${b.breed}`, loading: "lazy" }),
            el("h3", { textContent: b.name }),
            el("p", { className: "breed", textContent: b.breed }),
            el("p", { textContent: b.about })
          )
        )
      );
    } catch (err) {
      console.error(err);
      list.replaceWith(el("p", { className: "empty-note", textContent: "Add your birds to data/flock.json to show them here." }));
    }
  }

  async function renderGallery() {
    const list = document.getElementById("gallery");
    if (!list) return;
    let photos = [];
    try { photos = await load("data/gallery.json"); } catch (err) { console.error(err); }

    if (!photos.length) {
      list.replaceWith(el("p", { className: "empty-note",
        textContent: "No photos yet. Take snapshots from the broadcast page, put them in images/gallery/ and list them in data/gallery.json." }));
      return;
    }

    const box = document.getElementById("lightbox");
    const big = document.getElementById("lightbox-img");
    const cap = document.getElementById("lightbox-cap");

    list.replaceChildren(
      ...photos.map((p) => {
        const btn = el("button", { type: "button", ariaLabel: `Open photo: ${p.caption}` },
          el("img", { src: p.src, alt: p.caption, loading: "lazy" }));
        btn.addEventListener("click", () => {
          big.src = p.src;
          big.alt = p.caption;
          cap.textContent = p.caption + (p.date ? ` (${p.date})` : "");
          box.showModal();
        });
        return el("li", {}, btn);
      })
    );
    box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
  }

  renderFlock();
  renderGallery();
})();
