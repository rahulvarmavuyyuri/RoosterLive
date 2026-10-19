// Animated 3D background for the viewer page (uses three.js).
// Styles: "feathers", "hills", "field", or "none". Set in js/config.js.
// Respects reduced-motion (draws one still frame) and pauses when the tab is hidden.
(function () {
  const cfg = window.SITE_CONFIG || {};
  if (typeof THREE === "undefined") return;

  const dark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Palettes per style, light and dark.
  const PAL = {
    feathers: {
      light: { bg: 0xf4e2a8, fog: 0xf4e2a8, cols: [0x8a3b1c, 0x1e3a2c, 0xc46a1c, 0xfaf0cc, 0xb8232b, 0x5a3d28] },
      dark:  { bg: 0x1d1510, fog: 0x1d1510, cols: [0x8a3b1c, 0x2f5d3a, 0xc46a1c, 0xcdb48d, 0xb8232b, 0x6b4a32] },
    },
    hills: {
      light: { bg: 0xf7e6b4, fog: 0xf4e2a8, sun: 0xf28c28, hill: [0x7aa95a, 0x5f8b45, 0xb99a62, 0x8fb86a], cloud: 0xfffaf0 },
      dark:  { bg: 0x1a1830, fog: 0x1d1510, sun: 0xf5e6b0, hill: [0x2c4a2a, 0x223a22, 0x4a3826, 0x35552f], cloud: 0x3a3550 },
    },
    field: {
      light: { bg: 0xf7e6b4, fog: 0xf4e2a8, stalk: 0xc9a13c, head: 0xe0b84d, ground: 0xb99a62 },
      dark:  { bg: 0x1d1510, fog: 0x1d1510, stalk: 0x6b5424, head: 0x8a6d2c, ground: 0x2a1f17 },
    },
  };

  let current = null; // { renderer, scene, camera, update, dispose }
  let raf = 0;
  let pointer = { x: 0, y: 0 };

  const canvas = document.createElement("canvas");
  canvas.className = "bg3d";
  canvas.setAttribute("aria-hidden", "true");
  const veil = document.createElement("div");
  veil.className = "bg3d-veil";
  veil.setAttribute("aria-hidden", "true");

  function mount() {
    if (!canvas.isConnected) document.body.prepend(canvas, veil);
  }

  function makeRenderer() {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.setSize(window.innerWidth, window.innerHeight, false);
    return r;
  }

  // ---------- Style: drifting feathers ----------
  function featherGeometry() {
    const s = new THREE.Shape();
    s.moveTo(0, -1);
    s.bezierCurveTo(0.32, -0.6, 0.36, 0.3, 0.08, 1);
    s.lineTo(0, 1.08);
    s.lineTo(-0.08, 1);
    s.bezierCurveTo(-0.34, 0.3, -0.3, -0.6, 0, -1);
    const g = new THREE.ShapeGeometry(s, 10);
    // gentle curve so feathers catch the light
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.pow(p.getX(i), 2) * 1.2 + Math.sin(p.getY(i) * 1.5) * 0.06);
    g.computeVertexNormals();
    return g;
  }

  function sceneFeathers(pal) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(pal.bg);
    scene.fog = new THREE.Fog(pal.fog, 8, 26);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
    camera.position.set(0, 0, 12);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xfff1d0, 0.9);
    sun.position.set(4, 6, 8);
    scene.add(sun);

    const geo = featherGeometry();
    const shaftGeo = new THREE.CylinderGeometry(0.012, 0.02, 2.3, 4);
    const items = [];
    const n = window.innerWidth < 700 ? 22 : 38;
    for (let i = 0; i < n; i++) {
      const col = pal.cols[i % pal.cols.length];
      const mat = new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.1 });
      const f = new THREE.Group();
      f.add(new THREE.Mesh(geo, mat));
      const shaft = new THREE.Mesh(shaftGeo, new THREE.MeshStandardMaterial({ color: 0xf3e6c4 }));
      shaft.position.y = -0.1;
      f.add(shaft);
      const s = 0.45 + Math.random() * 0.6;
      f.scale.setScalar(s);
      f.position.set((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 16, -Math.random() * 14 + 2);
      f.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      f.userData = { fall: 0.25 + Math.random() * 0.35, sway: 0.6 + Math.random(), phase: Math.random() * 6, spin: (Math.random() - 0.5) * 0.6 };
      scene.add(f);
      items.push(f);
    }

    function update(t, dt) {
      for (const f of items) {
        const u = f.userData;
        f.position.y -= u.fall * dt;
        f.position.x += Math.sin(t * u.sway + u.phase) * 0.6 * dt;
        f.rotation.z = Math.sin(t * u.sway + u.phase) * 0.7;
        f.rotation.y += u.spin * dt;
        f.rotation.x = 0.4 + Math.cos(t * 0.5 + u.phase) * 0.3;
        if (f.position.y < -9) { f.position.y = 9; f.position.x = (Math.random() - 0.5) * 22; }
      }
      camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.03;
      camera.position.y += (-pointer.y * 0.8 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, 0);
    }
    return { scene, camera, update };
  }

  // ---------- Style: low-poly farm hills with sunrise ----------
  function sceneHills(pal) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(pal.bg);
    scene.fog = new THREE.Fog(pal.fog, 18, 62);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
    camera.position.set(0, 4.2, 14);
    camera.lookAt(0, 2, -20);
    scene.add(new THREE.HemisphereLight(0xfff4d6, 0x3a5a2a, 0.75));
    const light = new THREE.DirectionalLight(0xffe2b0, 0.85);
    light.position.set(-6, 10, -20);
    scene.add(light);

    const W = 90, D = 90, SEG = window.innerWidth < 700 ? 44 : 64;
    const geo = new THREE.PlaneGeometry(W, D, SEG, SEG).toNonIndexed();
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const base = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { base[i * 2] = pos.getX(i); base[i * 2 + 1] = pos.getZ(i); }
    const colors = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      tmp.setHex(pal.hill[Math.floor(Math.random() * pal.hill.length)]);
      for (let k = 0; k < 3; k++) { colors[(i + k) * 3] = tmp.r; colors[(i + k) * 3 + 1] = tmp.g; colors[(i + k) * 3 + 2] = tmp.b; }
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    scene.add(ground);

    const sun = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 16), new THREE.MeshBasicMaterial({ color: pal.sun, fog: false }));
    sun.position.set(-10, 2, -70);
    scene.add(sun);

    const clouds = [];
    const cloudMat = new THREE.MeshStandardMaterial({ color: pal.cloud, flatShading: true, roughness: 1 });
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + Math.random() * 0.9, 0), cloudMat);
        puff.position.set(k * 1.3 - 2, Math.random() * 0.6, Math.random() * 0.8);
        c.add(puff);
      }
      c.position.set((Math.random() - 0.5) * 70, 9 + Math.random() * 6, -20 - Math.random() * 40);
      c.userData.speed = 0.4 + Math.random() * 0.5;
      scene.add(c);
      clouds.push(c);
    }

    function height(x, z) {
      return Math.sin(x * 0.12) * 1.6 + Math.cos(z * 0.09) * 2.2 + Math.sin((x + z) * 0.21) * 0.7 + Math.max(0, -z - 10) * 0.08;
    }
    let travel = 0;
    function update(t, dt) {
      travel += dt * 1.2;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 2], z = base[i * 2 + 1];
        pos.setY(i, height(x, z - travel) - 1.5);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      sun.position.y = 2 + Math.sin(t * 0.05) * 1.5;
      for (const c of clouds) { c.position.x += c.userData.speed * dt; if (c.position.x > 40) c.position.x = -40; }
      camera.position.x += (pointer.x * 1.5 - camera.position.x) * 0.03;
      camera.lookAt(camera.position.x * 0.3, 2, -20);
    }
    return { scene, camera, update };
  }

  // ---------- Style: swaying grain field ----------
  function sceneField(pal) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(pal.bg);
    scene.fog = new THREE.Fog(pal.fog, 6, 30);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
    camera.position.set(0, 1.6, 8);
    camera.lookAt(0, 1, -10);
    scene.add(new THREE.HemisphereLight(0xfff4d6, 0x6b5424, 0.9));
    const light = new THREE.DirectionalLight(0xffe2b0, 0.7);
    light.position.set(5, 8, 4);
    scene.add(light);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: pal.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const N = window.innerWidth < 700 ? 700 : 1300;
    const stalkGeo = new THREE.CylinderGeometry(0.012, 0.02, 1, 3);
    stalkGeo.translate(0, 0.5, 0);
    const headGeo = new THREE.SphereGeometry(0.06, 5, 4);
    headGeo.scale(1, 3, 1);
    const stalks = new THREE.InstancedMesh(stalkGeo, new THREE.MeshStandardMaterial({ color: pal.stalk, roughness: 0.9 }), N);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: pal.head, roughness: 0.7 }), N);
    const data = [];
    for (let i = 0; i < N; i++) {
      data.push({
        x: (Math.random() - 0.5) * 30,
        z: 6 - Math.random() * 30,
        h: 0.9 + Math.random() * 0.8,
        p: Math.random() * 6,
      });
    }
    scene.add(stalks, heads);

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    function update(t) {
      for (let i = 0; i < N; i++) {
        const d = data[i];
        const bend = Math.sin(t * 1.3 + d.x * 0.35 + d.z * 0.2) * 0.22 + Math.sin(t * 2.7 + d.p) * 0.05;
        e.set(bend * 0.4, 0, bend);
        q.setFromEuler(e);
        sc.set(1, d.h, 1);
        m.compose(v.set(d.x, 0, d.z), q, sc);
        stalks.setMatrixAt(i, m);
        // head sits at the bent tip
        v.set(0, d.h, 0).applyQuaternion(q).add(sc.set(d.x, 0, d.z));
        sc.set(1, 1, 1);
        m.compose(v, q, sc);
        heads.setMatrixAt(i, m);
      }
      stalks.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
      camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.03;
      camera.lookAt(camera.position.x * 0.2, 1, -10);
    }
    return { scene, camera, update };
  }

  const BUILDERS = { feathers: sceneFeathers, hills: sceneHills, field: sceneField };

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function dispose() {
    stop();
    if (!current) return;
    current.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((mm) => mm.dispose());
    });
    current = null;
  }

  function resize() {
    if (!current) return;
    const w = window.innerWidth, h = window.innerHeight;
    current.renderer.setSize(w, h, false);
    current.camera.aspect = w / h;
    current.camera.updateProjectionMatrix();
  }

  let renderer = null;
  function start(style) {
    dispose();
    document.documentElement.dataset.bg = style || "none";
    if (!style || style === "none" || !BUILDERS[style]) { canvas.remove(); veil.remove(); return; }
    mount();
    try {
      renderer = renderer || makeRenderer();
    } catch (err) {
      console.warn("3D background unavailable:", err);
      canvas.remove(); veil.remove();
      return;
    }
    const pal = PAL[style][dark() ? "dark" : "light"];
    current = { renderer, style, ...BUILDERS[style](pal) };
    resize();

    let last = performance.now();
    const t0 = last;
    const frame = (now) => {
      if (!current) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      current.update((now - t0) / 1000, dt);
      renderer.render(current.scene, current.camera);
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    resume = () => { last = performance.now(); raf = requestAnimationFrame(frame); };
    if (reduce) { current.update(3, 0); renderer.render(current.scene, current.camera); }
    else resume();
  }
  let resume = null;

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX / window.innerWidth - 0.5;
    pointer.y = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!current || reduce) return;
    if (document.hidden) stop();
    else if (!raf && resume) resume();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => current && start(current.style));

  window.RoosterBackground = { start, styles: Object.keys(BUILDERS) };
  start(cfg.background || "feathers");
})();
