(function () {
  const G = window.Grocery;
  const $ = (id) => document.getElementById(id);

  let state = G.createState();
  let loadError = false;
  let editingId = null;
  let sheetId = null;
  let deferredPrompt = null;

  const live = $("live");

  function announce(msg) {
    live.textContent = msg;
  }

  function haptic() {
    try {
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (_) {}
  }

  function persist() {
    if (loadError) return;
    const result = G.writeStorage(state);
    if (!result.ok && result.error === "quota") {
      announce("Could not save: storage is full.");
    }
  }

  function stageLabel(stage) {
    if (stage === "todo") return "To get";
    if (stage === "cart") return "In the cart";
    return "Got it";
  }

  function advanceLabel(stage) {
    if (stage === "todo") return "In cart";
    if (stage === "cart") return "Got it";
    return "Back to list";
  }

  function metaText(item) {
    return [item.qty, item.aisle].filter(Boolean).join(" · ");
  }

  function renderItem(item) {
    const li = document.createElement("li");
    li.className = "item " + item.stage;
    li.dataset.id = item.id;

    const more = document.createElement("button");
    more.type = "button";
    more.className = "icon";
    more.dataset.act = "more";
    more.setAttribute("aria-label", "More actions for " + item.name);
    more.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="6" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="18" r="1.7" fill="currentColor"/></svg>';

    const main = document.createElement("button");
    main.type = "button";
    main.className = "main";
    main.dataset.act = "advance";
    main.setAttribute(
      "aria-label",
      item.name + ". " + advanceLabel(item.stage)
    );
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = item.name;
    main.appendChild(name);
    const meta = metaText(item);
    if (meta) {
      const m = document.createElement("div");
      m.className = "meta";
      m.textContent = meta;
      main.appendChild(m);
    }

    const advance = document.createElement("button");
    advance.type = "button";
    advance.className = "advance";
    advance.dataset.act = "advance";
    advance.textContent = advanceLabel(item.stage);

    li.appendChild(more);
    li.appendChild(main);
    li.appendChild(advance);

    li.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "advance") doAdvance(item.id);
      if (act === "more") openSheet(item.id);
    });
    return li;
  }

  function renderList(stage) {
    const ul = $(stage + "-list");
    ul.replaceChildren();
    const groups = G.groupedItems(state, stage);
    const empty = $(stage + "-empty");
    const count = $(stage + "-count");
    const n = G.counts(state)[stage];
    count.textContent = n ? String(n) : "";
    count.hidden = n === 0;
    empty.hidden = n > 0;

    groups.forEach((group) => {
      if (group.label && group.items.length) {
        const head = document.createElement("li");
        head.className = "aisle";
        head.textContent = group.label;
        ul.appendChild(head);
      }
      group.items.forEach((item) => ul.appendChild(renderItem(item)));
    });
  }

  function render() {
    renderList("todo");
    renderList("cart");
    renderList("bought");
    $("undo").disabled = state.history.length === 0;
    $("new-shop").disabled = !state.items.some((i) => i.stage === "bought");
    $("corrupt").hidden = !loadError;
  }

  function doAdvance(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    const from = item.stage;
    if (!G.advance(state, id)) return;
    persist();
    render();
    haptic();
    const now = state.items.find((i) => i.id === id);
    announce(item.name + " moved to " + stageLabel(now ? now.stage : from));
  }

  function openSheet(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    sheetId = id;
    $("sheet-title").textContent = item.name;
    $("sheet-up").disabled = !G.canMove(state, id, -1);
    $("sheet-down").disabled = !G.canMove(state, id, 1);
    $("sheet").showModal();
  }

  function closeSheet() {
    sheetId = null;
    $("sheet").close();
  }

  function openEdit(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    editingId = id;
    $("edit-name").value = item.name;
    $("edit-qty").value = item.qty || "";
    $("edit-aisle").value = item.aisle || "";
    $("edit-dialog").showModal();
    $("edit-name").focus();
  }

  function confirmNewShop() {
    if (!state.items.some((i) => i.stage === "bought")) return;
    $("confirm-title").textContent = "Start a new shop?";
    $("confirm-body").textContent =
      "Clears Got it only. To get and In the cart stay.";
    $("confirm-ok").textContent = "New shop";
    $("confirm-ok").className = "";
    $("confirm-dialog").dataset.mode = "shop";
    $("confirm-dialog").showModal();
  }

  function confirmDelete(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    $("confirm-title").textContent = "Delete " + item.name + "?";
    $("confirm-body").textContent = "This removes it from the list.";
    $("confirm-ok").textContent = "Delete";
    $("confirm-ok").className = "warn";
    $("confirm-dialog").dataset.mode = "delete";
    $("confirm-dialog").dataset.id = id;
    $("confirm-dialog").showModal();
  }

  $("add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("name").value.trim();
    if (!name) return;
    const item = G.addItem(state, {
      name,
      qty: $("qty").value,
      aisle: $("aisle").value,
    });
    if (!item) return;
    $("add-form").reset();
    $("name").focus();
    persist();
    render();
    announce("Added " + item.name);
  });

  $("edit-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (
      G.editItem(state, editingId, {
        name: $("edit-name").value,
        qty: $("edit-qty").value,
        aisle: $("edit-aisle").value,
      })
    ) {
      persist();
      render();
      announce("Saved");
    }
    editingId = null;
    $("edit-dialog").close();
  });

  $("edit-cancel").addEventListener("click", () => $("edit-dialog").close());
  $("undo").addEventListener("click", () => {
    if (!G.undo(state)) return;
    persist();
    render();
    announce("Undone");
  });
  $("new-shop").addEventListener("click", confirmNewShop);

  $("sheet-up").addEventListener("click", () => {
    if (G.moveItem(state, sheetId, -1)) {
      persist();
      render();
    }
    closeSheet();
  });
  $("sheet-down").addEventListener("click", () => {
    if (G.moveItem(state, sheetId, 1)) {
      persist();
      render();
    }
    closeSheet();
  });
  $("sheet-edit").addEventListener("click", () => {
    const id = sheetId;
    closeSheet();
    openEdit(id);
  });
  $("sheet-del").addEventListener("click", () => {
    const id = sheetId;
    closeSheet();
    confirmDelete(id);
  });
  $("sheet-cancel").addEventListener("click", closeSheet);
  $("sheet").addEventListener("click", (e) => {
    if (e.target === $("sheet")) closeSheet();
  });

  $("confirm-cancel").addEventListener("click", () => $("confirm-dialog").close());
  $("confirm-ok").addEventListener("click", () => {
    const mode = $("confirm-dialog").dataset.mode;
    if (mode === "shop") {
      if (G.newShop(state)) {
        persist();
        render();
        announce("New shop started. Got it cleared.");
      }
    }
    if (mode === "delete") {
      const id = $("confirm-dialog").dataset.id;
      const item = state.items.find((i) => i.id === id);
      if (G.removeItem(state, id)) {
        persist();
        render();
        announce((item ? item.name : "Item") + " deleted");
      }
    }
    if (mode === "reset") {
      loadError = false;
      state = G.createState();
      persist();
      render();
      announce("List reset");
    }
    $("confirm-dialog").close();
  });

  $("reset-list").addEventListener("click", () => {
    $("confirm-title").textContent = "Reset the list?";
    $("confirm-body").textContent =
      "The saved data could not be read. Resetting starts a new empty list and then writes over it.";
    $("confirm-ok").textContent = "Reset";
    $("confirm-ok").className = "warn";
    $("confirm-dialog").dataset.mode = "reset";
    $("confirm-dialog").showModal();
  });

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function showInstall() {
    if (isStandalone()) return;
    if (sessionStorage.getItem("hide-install") === "1") return;
    $("install").classList.add("show");
  }

  $("install-dismiss").addEventListener("click", () => {
    $("install").classList.remove("show");
    sessionStorage.setItem("hide-install", "1");
  });

  $("install-btn").addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      $("install").classList.remove("show");
      return;
    }
    $("install-help").hidden = !$("install-help").hidden;
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("install-btn").textContent = "Install";
    showInstall();
  });

  const loaded = G.readStorage();
  if (!loaded.ok && loaded.hadData) {
    loadError = true;
    state = G.createState();
  } else {
    state = loaded.state;
  }
  render();
  showInstall();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
})();
