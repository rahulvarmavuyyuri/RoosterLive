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

  function say(id, text, kind) {
    const el = $(id);
    el.textContent = text;
    el.className = "status-line" + (kind ? " " + kind : "");
    el.hidden = !text;
  }

  // ---------- GitHub API ----------
  const api = (path) => `https://api.github.com/repos/${gh.owner}/${gh.repo}/${path}`;

  async function call(path, opts = {}) {
    if (!token) throw new Error("Save your GitHub key first.");
    let res;
    try {
      res = await fetch(api(path), {
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
  }

  $("m-token-save").addEventListener("click", async () => {
    const v = $("m-token").value.trim();
    if (!v || v.startsWith("•")) { say("m-key-status", "Paste your GitHub key first.", "err"); return; }
    token = v;
    say("m-key-status", "Checking the key…");
    try {
      const repo = await call("");
      if (!repo.permissions || !repo.permissions.push) throw new Error("The key can read RoosterLive but can't save. Set Contents to Read and write.");
      try { localStorage.setItem(KEY, token); } catch { /* ignore */ }
      say("m-key-status", "Key saved. You can add birds now.", "ok");
      renderKey();
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
      $("m-photo-preview").src = dataUrl;
      $("m-photo-preview").hidden = false;
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
  ];

  function renderVarieties() {
    $("m-varieties").replaceChildren(...VARIETIES.map((v) => {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "chip" });
      b.append(v.en, Object.assign(document.createElement("span"), { lang: "te", textContent: " " + v.te }));
      b.addEventListener("click", () => {
        if (!$("m-name").value.trim()) $("m-name").value = v.en;
        $("m-te").value = v.te;
        $("m-breed").value = v.plumage;
        if (!$("m-about").value.trim()) $("m-about").value = v.about;
        [...$("m-varieties").children].forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
        say("m-status-line", `Filled in ${v.en} (${v.te}). Check the details, then save.`, "ok");
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
    const editing = $("m-id").value;
    if (!editing && !photoData) { say("m-status-line", "Choose a photo for the new bird.", "err"); return; }

    $("m-save").disabled = true;
    say("m-status-line", "Saving to your site…");
    try {
      const { sha, list } = await readFlock();
      flock = list;
      const old = editing ? list.find((b) => b.id === editing) : null;
      const bird = old ? { ...old } : { id: slug(name) };
      for (const [k, id] of Object.entries(fields)) {
        const v = $(id).value.trim();
        if (v) bird[k] = v; else delete bird[k];
      }
      const price = Number($("m-price").value);
      bird.price = $("m-price").value !== "" && price > 0 ? Math.round(price) : null;
      const st = $("m-status").value;
      if (st === "none") delete bird.available; else bird.available = st === "sale";

      if (photoData) {
        const path = `images/flock/${bird.id}-${Date.now().toString(36)}.jpg`;
        say("m-status-line", "Uploading the photo…");
        await writeFile(path, photoData, `Host page: photo for ${bird.name}`);
        bird.photo = path;
      }

      const next = old ? list.map((b) => (b.id === bird.id ? bird : b)) : [...list, bird];
      say("m-status-line", "Updating Meet the flock…");
      await writeFile(FLOCK, toB64(JSON.stringify(next, null, 2) + "\n"), `Host page: ${old ? "update" : "add"} ${bird.name}`, sha);
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
      const { sha, list } = await readFlock();
      const next = list.filter((x) => x.id !== b.id);
      await writeFile(FLOCK, toB64(JSON.stringify(next, null, 2) + "\n"), `Host page: remove ${b.name}`, sha);
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
