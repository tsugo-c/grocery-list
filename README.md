# Two-stage grocery list

A local-first grocery list for a real supermarket trip: one-handed, offline, and it does not lie.

First tap moves an item into **In the cart**. Second tap means you actually have it (**Got it**). Nothing vanishes on the first tap.

## Open it

After GitHub Pages is enabled on this repo (Settings → Pages → Deploy from branch `main` / root):

**https://tsugo-c.github.io/grocery-list/**

Or open `index.html` over `http` (a local static server). Service workers do not run from `file://`.

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080/`.

## Add to Home Screen

The list is a static PWA. Add it to the home screen so it opens full-screen and works in the shop with no signal.

**iPhone / iPad (Safari)**

1. Open the live page in Safari.
2. Tap Share.
3. Tap **Add to Home Screen**.
4. Tap Add. Open it from the icon, not from a leftover browser tab.

**Android (Chrome)**

1. Open the live page in Chrome.
2. Tap the menu (⋮).
3. Tap **Install app** or **Add to Home Screen**.

Data stays in that browser (`localStorage`, key `two-stage-grocery-v1`). Clearing site data clears the list. There is no account.

If you already used a copy of this list on the same origin, your items load from that key. Corrupt data is not overwritten until you choose Reset.

## In the shop

- Tap the item or **In cart** when you pick it up.
- Tap **Got it** when it is actually yours.
- Optional quantity and aisle. Aisles group **To get** and **In the cart** while you shop.
- Edit, delete, and reorder sit behind the ⋮ menu so a thumb can advance without hitting them.
- **Undo** walks back the last change.
- **New shop** clears only **Got it**. **To get** and **In the cart** stay.

## Files

Static only: `index.html` at the repo root, plus CSS, JS, a service worker, and icons. No backend.
