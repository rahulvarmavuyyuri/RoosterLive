// Host page: add, edit and remove birds in "Meet the flock".
// Saves straight to the GitHub repo (data/flock.json + images/flock/) using a
// GitHub key that is stored only on this device. The site updates about a
// minute later, when GitHub Pages rebuilds.
(function () {
  const cfg = window.SITE_CONFIG;
  const gh = cfg.github || {};
  const $ = (id) => document.getElementById(id);
  const KEY = "rooster-gh-key";
  const FLOCK = "data/flock.json";

  let token = "";
  try { token = localStorage.getItem(KEY) || ""; } catch { /* ignore */ }
  let flock = [];
  let photoData = null; // base64 JPEG (no prefix) of a newly chosen photo
  let uploadedPath = null; // where photoData was already saved, if it was

  function say(id, text, kind) {
    const el = $(id);
    el.textContent = text;
    el.className = "status-line" + (kind ? " " + kind : "");
    el.hidden = !text;
  }

  // ---------- GitHub API ----------
  const api = (path) => `https://api.github.com/repos/${gh.owner}/${gh.repo}${path ? "/" + path : ""}`;

  async function call(path, opts = {}) {
    if (!token) throw new Error("Save your GitHub key first.");
    let res;
    try {
      res = await fetch(api(path), {
        cache: "no-store",
        ...opts,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", ...(opts.headers || {}) },
      });
    } catch {
      throw new Error("Couldn't reach GitHub. Check your internet connection.");
    }
    if (res.status === 401) throw new Error("GitHub didn't accept the key. Check it was copied fully, or make a new one.");
    if (res.status === 403) throw new Error("The key can't save to RoosterLive. Give it Contents: Read and write for this repository.");
    if (res.status === 404) throw new Error("GitHub couldn't find the file or repository. Check the key has access to RoosterLive.");
    if (res.status === 409) throw new Error("The site changed while saving. Tap Save again.");
    if (!res.ok) throw new Error(`GitHub said ${res.status}. Try again in a minute.`);
    return res.status === 204 ? null : res.json();
  }

  const toB64 = (text) => {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  };
  const fromB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

  async function readFlock() {
    const f = await call(`contents/${FLOCK}?ref=${encodeURIComponent(gh.branch)}`);
    return { sha: f.sha, list: JSON.parse(fromB64(f.content)) };
  }

  async function writeFile(path, b64, message, sha) {
    return call(`contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({ message, content: b64, branch: gh.branch, ...(sha ? { sha } : {}) }),
    });
  }

  // ---------- Key ----------
  function renderKey() {
    $("m-token").value = token ? "••••••••••••" : "";
    $("m-token-forget").hidden = !token;
    $("m-key-summary").textContent = token ? "GitHub key: saved ✓" : "GitHub key: not set (tap to add)";
    $("m-key-box").classList.toggle("ok", !!token);
  }

  $("m-token-save").addEventListener("click", async () => {
    const v = $("m-token").value.replace(/[^\x21-\x7E]/g, "");
    if (!v || v.startsWith("•")) { say("m-key-status", "Paste your GitHub key first.", "err"); return; }
    token = v;
    say("m-key-status", "Checking the key…");
    try {
      const repo = await call("");
      if (!repo.permissions || !repo.permissions.push) throw new Error("The key can read RoosterLive but can't save. Set Contents to Read and write.");
      try { localStorage.setItem(KEY, token); } catch { /* ignore */ }
      say("m-key-status", "", "");
      renderKey();
      $("m-key-box").open = false;
    } catch (err) {
      token = "";
      say("m-key-status", err.message, "err");
    }
  });

  $("m-token-forget").addEventListener("click", () => {
    token = "";
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    renderKey();
    say("m-key-status", "Key removed from this device.", "ok");
  });

  // ---------- Photo ----------
  $("m-photo").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    photoData = null;
    $("m-photo-preview").hidden = true;
    if (!file) return;
    if (!file.type.startsWith("image/")) { say("m-status-line", "That file isn't a photo.", "err"); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", 0.82); // re-encoding also drops hidden photo data
      photoData = dataUrl.split(",")[1];
      uploadedPath = null;
      $("m-photo-preview").src = dataUrl;
      $("m-photo-preview").hidden = false;
      if (!$("m-id").value) {
        const guess = guessVariety(img);
        const v = guess && VARIETIES.find((x) => x.en === guess);
        const chip = v && [...$("m-varieties").children].find((c) => c.dataset.variety === v.en);
        if (v && chip) {
          applyVariety(v, chip);
          say("m-status-line", `From the photo's colours this looks like ${v.en} (${v.te}). It's only a guess: tap a different variety below if it's wrong.`, "ok");
        } else {
          say("m-status-line", "Couldn't tell the variety from this photo's colours. Tap the variety below.", "");
        }
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { say("m-status-line", "Couldn't open that photo. Try a JPG or PNG.", "err"); URL.revokeObjectURL(url); };
    img.src = url;
  });

  // ---------- Quick fill by Andhra variety name ----------
  // Names used in Andhra Pradesh for rooster plumage types, with what the words mean.
  const VARIETIES = [
    { en: "Kaki", te: "కాకి", plumage: "Crow-black plumage", about: "Black from head to tail, like a crow." },
    { en: "Pacha Kaki", te: "పచ్చ కాకి", plumage: "Black with a green sheen", about: "Black feathers that shine green in the sun." },
    { en: "Dega", te: "డేగ", plumage: "Hawk-streaked plumage", about: "Golden-brown feathers streaked like a hawk's." },
    { en: "Yerra Dega", te: "ఎర్ర డేగ", plumage: "Red hawk-streaked plumage", about: "Reddish hawk-like streaked feathers." },
    { en: "Kaki Dega", te: "కాకి డేగ", plumage: "Black body, golden neck", about: "Crow-black body with golden neck feathers." },
    { en: "Nemali", te: "నెమలి", plumage: "Showy peacock-like plumage", about: "Bright, mixed colours like a peacock." },
    { en: "Tella Nemali", te: "తెల్ల నెమలి", plumage: "White peacock-like plumage", about: "Mostly white with showy markings." },
    { en: "Pingala", te: "పింగళ", plumage: "Red-brown plumage", about: "Deep red-brown, tawny feathers." },
    // Colour clear from the Telugu words
    { en: "Nalla Kaki", te: "నల్ల కాకి", plumage: "Jet-black plumage", about: "Deep, glossy black all over." },
    { en: "Erra Kaki Dega", te: "ఎర్ర కాకి డేగ", plumage: "Black body, red-gold neck", about: "Dark body with reddish hawk-like hackles." },
    { en: "Kaki Nemali", te: "కాకి నెమలి", plumage: "Black with a showy sheen", about: "Black feathers with bright, peacock-like shine." },
    { en: "Nemali Pingala", te: "నెమలి పింగళ", plumage: "Red-brown with showy markings", about: "Red-brown feathers with bright, mixed markings." },
    // Names used in Andhra; colour not filled in, add your own
    { en: "Parla", te: "పర్ల", plumage: "", about: "" },
    { en: "Abras", te: "అబ్రాస్", plumage: "", about: "" },
    { en: "Maila", te: "మైల", plumage: "", about: "" },
    { en: "Seetuva", te: "సేతువ", plumage: "", about: "" },
    { en: "Kokkirai", te: "కొక్కిరాయి", plumage: "", about: "" },
    { en: "Rasangi", te: "రసంగి", plumage: "", about: "" },
  ];

  // ---------- Colour guess from the photo ----------
  // Looks at the bird's main colours (ignoring colours that also fill the photo's
  // edges, which are usually background) and suggests the closest variety.
  function guessVariety(img) {
    const scale = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.max(1, Math.round(img.naturalWidth * scale));
    const H = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, W, H);
    let px;
    try { px = ctx.getImageData(0, 0, W, H).data; } catch { return null; }
    const Q = 24, at = (x, y) => (y * W + x) * 4;
    const key = (i) => `${Math.floor(px[i] / Q)},${Math.floor(px[i + 1] / Q)},${Math.floor(px[i + 2] / Q)}`;
    const border = new Map(); let total = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x < W * 0.12 || x > W * 0.88 || y < H * 0.1 || y > H * 0.9) {
        const k = key(at(x, y)); border.set(k, (border.get(k) || 0) + 1); total++;
      }
    }
    const bg = new Set([...border].filter(([, v]) => v / total > 0.004).map(([k]) => k));
    const n = { black: 0, white: 0, red: 0, gold: 0, grey: 0 }; let count = 0;
    for (let y = Math.floor(H * 0.15); y < H * 0.85; y++) for (let x = Math.floor(W * 0.18); x < W * 0.82; x++) {
      const i = at(x, y);
      if (bg.has(key(i))) continue;
      const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      let h = 0;
      if (d) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
      if (s > 0.25 && h >= 70 && h <= 260) continue; // leaves, nets, sky
      count++;
      if (l < 0.18) n.black++;
      else if (l > 0.68 && s < 0.45) n.white++;
      else if (s < 0.18) n.grey++;
      else if (h < 20 || h > 335 || (h < 45 && l < 0.4)) n.red++;
      else if (h < 70) n.gold++;
      else n.grey++;
    }
    if (count < 300) return null;
    const p = (k) => (100 * n[k]) / count;
    if (p("grey") >= 60) return null;                        // can't tell
    if (p("white") >= 35) return "Tella Nemali";
    if (p("black") >= 55) return p("gold") >= 10 ? "Kaki Dega" : "Kaki";
    if (p("red") + p("gold") >= 70 && p("black") < 15) return "Dega";
    if (p("black") >= 30 && p("red") >= 15) return "Pingala";
    return "Nemali";
  }

  // Replace a field when it's empty or still holds text from another variety;
  // keep it when you've typed your own.
  function isVarietyText(value, field) {
    const t = value.trim();
    return !t || VARIETIES.some((x) => x[field] === t);
  }
  function applyVariety(v, chip) {
    if (isVarietyText($("m-name").value, "en")) $("m-name").value = v.en;
    $("m-te").value = v.te;
    // Names without a known colour leave plumage and About for you to fill in.
    if (v.plumage || isVarietyText($("m-breed").value, "plumage")) $("m-breed").value = v.plumage;
    if (isVarietyText($("m-about").value, "about")) $("m-about").value = v.about;
    [...$("m-varieties").children].forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
  }

  function renderVarieties() {
    $("m-varieties").replaceChildren(...VARIETIES.map((v) => {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "chip" });
      b.append(v.en, Object.assign(document.createElement("span"), { lang: "te", textContent: " " + v.te }));
      b.dataset.variety = v.en;
      b.addEventListener("click", () => {
        applyVariety(v, b);
        say("m-status-line", v.plumage
          ? `Filled in ${v.en} (${v.te}). Check the details, then save.`
          : `Filled in the name ${v.en} (${v.te}). Add the plumage and About yourself, then save.`, "ok");
      });
      b.setAttribute("aria-pressed", "false");
      return b;
    }));
  }

  // ---------- Form ----------
  const fields = { name: "m-name", nameTe: "m-te", breed: "m-breed", age: "m-age", weight: "m-weight", comb: "m-comb", bloodline: "m-line", about: "m-about" };

  function slug(name) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bird";
    let id = base, n = 2;
    while (flock.some((b) => b.id === id)) id = `${base}-${n++}`;
    return id;
  }

  function resetForm() {
    $("m-form").reset();
    [...$("m-varieties").children].forEach((c) => c.setAttribute("aria-pressed", "false"));
    $("m-id").value = "";
    photoData = null;
    uploadedPath = null;
    $("m-photo-preview").hidden = true;
    $("m-form-title").textContent = "Add a bird";
    $("m-save").textContent = "Save bird";
    $("m-cancel").hidden = true;
  }

  function editBird(b) {
    resetForm();
    $("m-id").value = b.id;
    for (const [k, id] of Object.entries(fields)) $(id).value = b[k] || "";
    $("m-price").value = typeof b.price === "number" ? b.price : "";
    $("m-status").value = b.available === true ? "sale" : b.available === false ? "keep" : "none";
    if (b.photo) { $("m-photo-preview").src = b.photo; $("m-photo-preview").hidden = false; }
    $("m-form-title").textContent = `Edit ${b.name}`;
    $("m-save").textContent = "Save changes";
    $("m-cancel").hidden = false;
    $("m-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("m-cancel").addEventListener("click", resetForm);

  $("m-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("m-name").value.trim();
    if (!name) { say("m-status-line", "Give the bird a name.", "err"); return; }
    if (!token) {
      $("m-key-box").open = true;
      say("m-key-status", "Add your GitHub key first, then tap Save bird again.", "err");
      $("m-key-box").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const editing = $("m-id").value;
    if (!editing && !photoData) { say("m-status-line", "Choose a photo for the new bird.", "err"); return; }

    $("m-save").disabled = true;
    say("m-status-line", "Saving to your site…");
    try {
      // If the list changed on GitHub meanwhile, re-read it and save again (up to 3 tries).
      let next, bird, old;
      for (let attempt = 1; ; attempt++) {
        const { sha, list } = await readFlock();
        flock = list;
        old = editing ? list.find((b) => b.id === editing) : null;
        bird = old ? { ...old } : { id: slug(name) };
        for (const [k, id] of Object.entries(fields)) {
          const v = $(id).value.trim();
          if (v) bird[k] = v; else delete bird[k];
        }
        const price = Number($("m-price").value);
        bird.price = $("m-price").value !== "" && price > 0 ? Math.round(price) : null;
        const st = $("m-status").value;
        if (st === "none") delete bird.available; else bird.available = st === "sale";

        if (photoData) {
          if (!uploadedPath) {
            const path = `images/flock/${bird.id}-${Date.now().toString(36)}.jpg`;
            say("m-status-line", "Uploading the photo…");
            await writeFile(path, photoData, `Host page: photo for ${bird.name}`);
            uploadedPath = path;
          }
          bird.photo = uploadedPath;
        }

        next = old ? list.map((b) => (b.id === bird.id ? bird : b)) : [...list, bird];
        say("m-status-line", "Updating Meet the flock…");
        try {
          await writeFile(FLOCK, toB64(JSON.stringify(next, null, 2) + "\n"), `Host page: ${old ? "update" : "add"} ${bird.name}`, sha);
          break;
        } catch (err) {
          if (attempt >= 3 || !/changed while saving/.test(err.message)) throw err;
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
      flock = next;
      renderList();
      window.HostFlock && window.HostFlock.setBirds(flock);
      resetForm();
      say("m-status-line", `Saved ${bird.name}. The live site shows it in about a minute.`, "ok");
    } catch (err) {
      say("m-status-line", err.message, "err");
    } finally {
      $("m-save").disabled = false;
    }
  });

  async function removeBird(b, btn) {
    if (btn.dataset.armed !== "1") {
      btn.dataset.armed = "1";
      btn.textContent = "Tap again to remove";
      setTimeout(() => { btn.dataset.armed = ""; btn.textContent = "Remove"; }, 4000);
      return;
    }
    btn.disabled = true;
    say("m-status-line", `Removing ${b.name}…`);
    try {
      let next;
      for (let attempt = 1; ; attempt++) {
        const { sha, list } = await readFlock();
        next = list.filter((x) => x.id !== b.id);
        try {
          await writeFile(FLOCK, toB64(JSON.stringify(next, null, 2) + "\n"), `Host page: remove ${b.name}`, sha);
          break;
        } catch (err) {
          if (attempt >= 3 || !/changed while saving/.test(err.message)) throw err;
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
      flock = next;
      renderList();
      window.HostFlock && window.HostFlock.setBirds(flock);
      if ($("m-id").value === b.id) resetForm();
      say("m-status-line", `Removed ${b.name}. The live site updates in about a minute.`, "ok");
    } catch (err) {
      btn.disabled = false;
      say("m-status-line", err.message, "err");
    }
  }

  // ---------- List ----------
  function renderList() {
    $("m-count").textContent = flock.length ? `${flock.length} birds` : "";
    $("m-list").replaceChildren(...flock.map((b) => {
      const li = document.createElement("li");
      const img = Object.assign(document.createElement("img"), { src: b.photo, alt: "" });
      const price = typeof b.price === "number" && b.price > 0 ? `${cfg.currency || "₹"}${b.price.toLocaleString("en-IN")}` : "Price on request";
      const text = Object.assign(document.createElement("span"), { textContent: `${b.name}${b.nameTe ? " " + b.nameTe : ""}, ${price}` });
      const actions = Object.assign(document.createElement("span"), { className: "m-actions" });
      const edit = Object.assign(document.createElement("button"), { type: "button", className: "btn small", textContent: "Edit" });
      edit.addEventListener("click", () => editBird(b));
      const del = Object.assign(document.createElement("button"), { type: "button", className: "btn small", textContent: "Remove" });
      del.addEventListener("click", () => removeBird(b, del));
      actions.append(edit, del);
      li.append(img, text, actions);
      return li;
    }));
  }

  renderKey();
  renderVarieties();
  fetch(FLOCK, { cache: "no-cache" })
    .then((r) => r.json())
    .then((list) => { flock = list; renderList(); })
    .catch(() => say("m-status-line", "Couldn't load the current flock.", "err"));
})();
