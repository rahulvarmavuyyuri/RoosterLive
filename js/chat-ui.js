// Shared chat rendering for the viewer and broadcaster pages.
(function () {
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); } catch { /* storage unavailable */ } },
  };

  function clean(text, max) {
    return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function timeLabel(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function createChat({ log, empty }) {
    function scrollToEnd() {
      const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
      if (nearBottom) log.scrollTop = log.scrollHeight;
    }

    function add(msg) {
      if (empty) empty.hidden = true;
      const li = document.createElement("li");
      if (msg.type === "system") {
        li.className = "sys";
        li.textContent = msg.text;
      } else {
        const who = document.createElement("span");
        who.className = "who" + (msg.host ? " host" : "");
        who.textContent = msg.name;
        who.title = timeLabel(msg.ts || Date.now());
        li.append(who, document.createTextNode(": " + msg.text));
      }
      log.append(li);
      while (log.children.length > 200) log.firstElementChild.remove();
      scrollToEnd();
    }

    function reset(messages = []) {
      log.replaceChildren();
      if (empty) empty.hidden = messages.length > 0;
      messages.forEach(add);
      log.scrollTop = log.scrollHeight;
    }

    return { add, reset };
  }

  window.RoosterChat = { createChat, clean, store };
})();
