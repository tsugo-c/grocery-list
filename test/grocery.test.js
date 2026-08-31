const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../grocery.js");

function memoryStore(initial) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    data,
  };
}

test("first tap moves to cart and does not remove the item", () => {
  const state = G.createState();
  const item = G.addItem(state, { name: "Milk" });
  assert.equal(state.items.length, 1);
  G.advance(state, item.id);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].stage, "cart");
});

test("second tap moves cart to got it", () => {
  const state = G.createState();
  const item = G.addItem(state, { name: "Milk" });
  G.advance(state, item.id);
  G.advance(state, item.id);
  assert.equal(state.items[0].stage, "bought");
});

test("got it can return to the list", () => {
  const state = G.createState();
  const item = G.addItem(state, { name: "Milk" });
  G.advance(state, item.id);
  G.advance(state, item.id);
  G.advance(state, item.id);
  assert.equal(state.items[0].stage, "todo");
});

test("new shop clears only got it", () => {
  const state = G.createState();
  const milk = G.addItem(state, { name: "Milk" });
  const eggs = G.addItem(state, { name: "Eggs" });
  const bread = G.addItem(state, { name: "Bread" });
  G.advance(state, milk.id);
  G.advance(state, milk.id);
  G.advance(state, eggs.id);
  assert.equal(G.newShop(state), true);
  const names = state.items.map((i) => i.name).sort();
  assert.deepEqual(names, ["Bread", "Eggs"]);
  assert.equal(state.items.find((i) => i.name === "Bread").stage, "todo");
  assert.equal(state.items.find((i) => i.name === "Eggs").stage, "cart");
});

test("new shop is a no-op without bought items", () => {
  const state = G.createState();
  G.addItem(state, { name: "Milk" });
  assert.equal(G.newShop(state), false);
  assert.equal(state.items.length, 1);
});

test("undo restores the previous items snapshot", () => {
  const state = G.createState();
  const item = G.addItem(state, { name: "Milk" });
  G.advance(state, item.id);
  assert.equal(G.undo(state), true);
  assert.equal(state.items[0].stage, "todo");
});

test("qty and aisle are optional and editable", () => {
  const state = G.createState();
  const item = G.addItem(state, { name: "Milk", qty: "2", aisle: "4" });
  assert.equal(item.qty, "2");
  assert.equal(item.aisle, "4");
  G.editItem(state, item.id, { name: "Semi-skimmed", qty: "", aisle: "Dairy" });
  assert.equal(state.items[0].name, "Semi-skimmed");
  assert.equal(state.items[0].qty, "");
  assert.equal(state.items[0].aisle, "Dairy");
});

test("reorder stays within a stage", () => {
  const state = G.createState();
  const a = G.addItem(state, { name: "A" });
  const b = G.addItem(state, { name: "B" });
  G.addItem(state, { name: "C" });
  G.advance(state, b.id);
  assert.equal(G.moveItem(state, a.id, 1), true);
  const todo = state.items.filter((i) => i.stage === "todo").map((i) => i.name);
  assert.deepEqual(todo, ["C", "A"]);
});

test("does not aisle-group the got-it pile", () => {
  const state = G.createState();
  const pasta = G.addItem(state, { name: "Pasta", aisle: "7" });
  G.addItem(state, { name: "Milk", aisle: "4" });
  G.advance(state, pasta.id);
  G.advance(state, pasta.id);
  const groups = G.groupedItems(state, "bought");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "");
  assert.deepEqual(
    groups[0].items.map((i) => i.name),
    ["Pasta"]
  );
});

test("groups to-get items by aisle while shopping", () => {
  const state = G.createState();
  G.addItem(state, { name: "Pasta", aisle: "7" });
  G.addItem(state, { name: "Milk", aisle: "4" });
  G.addItem(state, { name: "Butter", aisle: "4" });
  G.addItem(state, { name: "Batteries" });
  const groups = G.groupedItems(state, "todo");
  assert.deepEqual(
    groups.map((g) => [g.label, g.items.map((i) => i.name)]),
    [
      ["4", ["Milk", "Butter"]],
      ["7", ["Pasta"]],
      ["No aisle", ["Batteries"]],
    ]
  );
});

test("loads v1 localStorage without wiping items", () => {
  const v1 = {
    items: [
      { id: "abc", name: "Milk", qty: "1", aisle: "4", stage: "cart" },
      { id: "def", name: "Eggs", qty: "", aisle: "", stage: "todo" },
    ],
    history: [[{ id: "abc", name: "Milk", qty: "1", aisle: "4", stage: "todo" }]],
  };
  const store = memoryStore({ [G.KEY]: JSON.stringify(v1) });
  const loaded = G.readStorage(store);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.state.items.length, 2);
  assert.equal(loaded.state.items[0].stage, "cart");
  G.advance(loaded.state, "abc");
  const written = G.writeStorage(loaded.state, store);
  assert.equal(written.ok, true);
  const roundtrip = JSON.parse(store.getItem(G.KEY));
  assert.equal(roundtrip.items.find((i) => i.id === "abc").stage, "bought");
  assert.equal(roundtrip.items.find((i) => i.id === "def").name, "Eggs");
});

test("corrupt storage does not report ok so the UI can refuse to overwrite", () => {
  const store = memoryStore({ [G.KEY]: "{not-json" });
  const loaded = G.readStorage(store);
  assert.equal(loaded.ok, false);
  assert.equal(loaded.hadData, true);
  assert.equal(store.getItem(G.KEY), "{not-json");
});

test("salvages malformed items instead of dropping the whole list", () => {
  const state = G.normalizeState({
    items: [
      { id: "1", name: "Milk", stage: "nope" },
      { name: "   " },
      { id: "2", name: "Bread" },
    ],
  });
  assert.equal(state.items.length, 2);
  assert.equal(state.items[0].stage, "todo");
  assert.equal(state.items[1].name, "Bread");
});
