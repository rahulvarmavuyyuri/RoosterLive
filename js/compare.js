// "Compare birds": viewers pick any two birds and see them side by side
// with price, details and an "Ask to buy" button (WhatsApp).
(function () {
  const cfg = window.SITE_CONFIG;
  const box = document.getElementById("compare");
  if (!box || !window.FarmData) return;

  const fmtPrice = (p) => (typeof p === "number" && p > 0
    ? cfg.currency + p.toLocaleString("en-IN")
    : null);

  function el(tag, props = {}, ...kids) {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids.filter((k) => k != null));
    return n;
  }

  function buyLink(b) {
    const num = String(cfg.whatsapp || "").replace(/\D/g, "");
    if (!num) return null;
    const text = `Hi, I'm interested in buying ${b.name}${b.nameTe ? " (" + b.nameTe + ")" : ""}. Is it available?`;
    return el("a", {
      className: "btn primary",
      href: `https://wa.me/${num}?text=${encodeURIComponent(text)}`,
      target: "_blank",
      rel: "noopener",
      textContent: "Ask to buy",
    });
  }

  function column(birds, index, side) {
    const col = el("div", { className: "cmp" });
    const sel = el("select", { id: `cmp-${side}`, ariaLabel: `Bird ${side === "a" ? "one" : "two"}` });
    birds.forEach((b, i) => sel.append(new Option(b.name, String(i), false, i === index)));
    const body = el("div", { className: "cmp" });
    function render() {
      const b = birds[Number(sel.value)];
      const price = fmtPrice(b.price);
      const rows = [["Plumage", b.breed], ["Age", b.age], ["Weight", b.weight], ["Comb", b.comb], ["Bloodline", b.bloodline]]
        .filter(([, v]) => v);
      body.replaceChildren(...[
        el("img", { src: b.photo, alt: `${b.name}, ${b.breed || "rooster"}` }),
        el("h3", {}, b.name, b.nameTe ? el("span", { className: "name-te", lang: "te", textContent: " " + b.nameTe }) : null),
        el("div", { className: "price" + (price ? "" : " ask"), textContent: price || "Price on request" }),
        rows.length ? el("dl", {}, ...rows.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })])) : null,
        b.available === false ? el("span", { className: "status keep", textContent: "Not for sale" }) : buyLink(b),
      ].filter(Boolean));
    }
    sel.addEventListener("change", render);
    render();
    col.append(sel, body);
    return col;
  }

  window.FarmData.ready.then(({ birds }) => {
    if (birds.length < 2) {
      box.replaceWith(el("p", { className: "compare-note", textContent: "Add at least two birds to data/flock.json to compare them." }));
      return;
    }
    box.replaceChildren(column(birds, 0, "a"), column(birds, 1, "b"));
    if (!String(cfg.whatsapp || "").replace(/\D/g, "")) {
      document.getElementById("compare-note").textContent = "Add your WhatsApp number in js/config.js to show \"Ask to buy\" buttons.";
    }
  });
})();
