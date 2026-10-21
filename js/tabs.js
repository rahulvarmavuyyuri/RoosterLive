// Simple tabs for the camera page. Remembers the last tab on this phone.
(function () {
  // Tabs marked hidden in the page are switched off and skipped.
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter((t) => !t.hidden);
  if (!tabs.length) return;
  function show(tab, focus) {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    }
    if (focus) tab.focus();
    try { localStorage.setItem("camera-tab", tab.id); } catch { /* ignore */ }
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => show(t));
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) { e.preventDefault(); show(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });
  let saved = null;
  try { saved = document.getElementById(localStorage.getItem("camera-tab")); } catch { /* ignore */ }
  show(saved && tabs.includes(saved) ? saved : tabs[0]);
})();
