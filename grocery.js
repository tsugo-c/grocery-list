(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.Grocery = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KEY = "two-stage-grocery-v1";
  const HISTORY_LIMIT = 20;
  const STAGES = ["todo", "cart", "bought"];
  const NEXT_STAGE = { todo: "cart", cart: "bought", bought: "todo" };
  const EMPTY_AISLE_KEY = "\uFFFF";

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID().slice(0, 8);
    }
    return Math.random().toString(36).slice(2, 10);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function aisleKey(item) {
    const trimmed = String(item && item.aisle != null ? item.aisle : "").trim();
    return trimmed ? trimmed.toLowerCase() : EMPTY_AISLE_KEY;
  }

  function aisleLabel(item) {
    const trimmed = String(item && item.aisle != null ? item.aisle : "").trim();
    return trimmed || "No aisle";
  }

  function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function normalizeItem(raw, index) {
    if (!raw || typeof raw !== "object") return null;
    const name = String(raw.name || "").trim();
    if (!name) return null;
    const stage = STAGES.includes(raw.stage) ? raw.stage : "todo";
    return {
      id: String(raw.id || "").trim() || uid() + String(index),
      name,
      qty: String(raw.qty != null ? raw.qty : "").trim(),
      aisle: String(raw.aisle != null ? raw.aisle : "").trim(),
      stage,
    };
  }

  function normalizeState(raw) {
    let parsed = raw;
    if (Array.isArray(parsed)) parsed = { items: parsed, history: [] };
    if (!parsed || typeof parsed !== "object") parsed = {};
    const items = Array.isArray(parsed.items)
      ? parsed.items.map(normalizeItem).filter(Boolean)
      : [];
    const history = Array.isArray(parsed.history)
      ? parsed.history
          .map((snap) =>
            Array.isArray(snap) ? snap.map(normalizeItem).filter(Boolean) : null
          )
          .filter(Boolean)
          .slice(-HISTORY_LIMIT)
      : [];
    return { items, history };
  }

  function createState() {
    return { items: [], history: [] };
  }

  function snapshot(state) {
    return clone(state.items);
  }

  function pushHistory(state) {
    state.history.push(snapshot(state));
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
  }

  function findIndex(state, id) {
    return state.items.findIndex((item) => item.id === id);
  }

  function addItem(state, fields) {
    const name = String(fields && fields.name != null ? fields.name : "").trim();
    if (!name) return null;
    pushHistory(state);
    const item = {
      id: uid(),
      name,
      qty: String(fields.qty != null ? fields.qty : "").trim(),
      aisle: String(fields.aisle != null ? fields.aisle : "").trim(),
      stage: "todo",
    };
    state.items.push(item);
    return item;
  }

  function editItem(state, id, fields) {
    const item = state.items.find((it) => it.id === id);
    if (!item) return false;
    const name = String(fields && fields.name != null ? fields.name : "").trim();
    if (!name) return false;
    pushHistory(state);
    item.name = name;
    item.qty = String(fields.qty != null ? fields.qty : "").trim();
    item.aisle = String(fields.aisle != null ? fields.aisle : "").trim();
    return true;
  }

  function advance(state, id) {
    const item = state.items.find((it) => it.id === id);
    if (!item) return false;
    pushHistory(state);
    item.stage = NEXT_STAGE[item.stage] || "todo";
    return true;
  }

  function removeItem(state, id) {
    const idx = findIndex(state, id);
    if (idx < 0) return false;
    pushHistory(state);
    state.items.splice(idx, 1);
    return true;
  }

  function sameGroup(a, b, grouped) {
    if (a.stage !== b.stage) return false;
    if (!grouped) return true;
    return aisleKey(a) === aisleKey(b);
  }

  function stageHasAisles(state, stage) {
    if (stage === "bought") return false;
    return state.items.some(
      (item) => item.stage === stage && String(item.aisle || "").trim()
    );
  }

  function moveItem(state, id, dir) {
    const idx = findIndex(state, id);
    if (idx < 0) return false;
    const item = state.items[idx];
    const grouped = stageHasAisles(state, item.stage);
    const same = state.items
      .map((it, i) => ({ it, i }))
      .filter((x) => sameGroup(x.it, item, grouped));
    const pos = same.findIndex((x) => x.it.id === id);
    const swap = same[pos + dir];
    if (!swap) return false;
    pushHistory(state);
    const j = swap.i;
    const items = state.items;
    [items[idx], items[j]] = [items[j], items[idx]];
    return true;
  }

  function canMove(state, id, dir) {
    const idx = findIndex(state, id);
    if (idx < 0) return false;
    const item = state.items[idx];
    const grouped = stageHasAisles(state, item.stage);
    const same = state.items.filter((it) => sameGroup(it, item, grouped));
    const pos = same.findIndex((it) => it.id === id);
    return Boolean(same[pos + dir]);
  }

  function newShop(state) {
    if (!state.items.some((item) => item.stage === "bought")) return false;
    pushHistory(state);
    state.items = state.items.filter((item) => item.stage !== "bought");
    return true;
  }

  function undo(state) {
    const prev = state.history.pop();
    if (!prev) return false;
    state.items = prev;
    return true;
  }

  function counts(state) {
    const out = { todo: 0, cart: 0, bought: 0 };
    state.items.forEach((item) => {
      if (out[item.stage] != null) out[item.stage] += 1;
    });
    return out;
  }

  function groupedItems(state, stage) {
    const list = state.items.filter((item) => item.stage === stage);
    const grouped = stage !== "bought" && list.some((item) => String(item.aisle || "").trim());
    if (!grouped) {
      return [{ key: "", label: "", items: list }];
    }
    const map = new Map();
    list.forEach((item) => {
      const key = aisleKey(item);
      if (!map.has(key)) {
        map.set(key, { key, label: aisleLabel(item), items: [] });
      }
      map.get(key).items.push(item);
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === EMPTY_AISLE_KEY) return 1;
      if (b.key === EMPTY_AISLE_KEY) return -1;
      return naturalCompare(a.label, b.label);
    });
  }

  function readStorage(storage) {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store) return { ok: true, state: createState(), hadData: false };
    let raw = null;
    try {
      raw = store.getItem(KEY);
    } catch (err) {
      return { ok: false, error: "unreadable", state: createState(), hadData: false };
    }
    if (raw == null || raw === "") {
      return { ok: true, state: createState(), hadData: false };
    }
    try {
      const parsed = JSON.parse(raw);
      return { ok: true, state: normalizeState(parsed), hadData: true };
    } catch (err) {
      return {
        ok: false,
        error: "corrupt",
        state: createState(),
        hadData: true,
        raw,
      };
    }
  }

  function writeStorage(state, storage) {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store) return { ok: false, error: "unavailable" };
    try {
      store.setItem(
        KEY,
        JSON.stringify({
          items: state.items,
          history: state.history.slice(-HISTORY_LIMIT),
        })
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: "quota" };
    }
  }

  return {
    KEY,
    HISTORY_LIMIT,
    STAGES,
    NEXT_STAGE,
    createState,
    normalizeState,
    addItem,
    editItem,
    advance,
    removeItem,
    moveItem,
    canMove,
    newShop,
    undo,
    counts,
    groupedItems,
    readStorage,
    writeStorage,
    aisleKey,
    aisleLabel,
  };
});
