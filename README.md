# Koope Leipzig – Shopping List

An interactive, per-user shopping list for the [Koope Leipzig](https://koope.de) food
cooperative, generated from the current product catalog. Static site, no build step —
deploys to GitHub Pages on push to `main`.

**Live:** `arvandtiv.github.io/koope/`

## Files

| File | Description |
|------|-------------|
| `index.html` | Shopping list app — structure + design tokens (CSS) |
| `app.js` | App logic: rendering, search, summary, tweaks, Supabase sync |
| `data.js` | Product catalog — 151 products, 29 categories |
| `login.html` | Username/password sign-in (auto-registers new users) |
| `koope-logo.svg` | Brand logo |
| `404.html` | GitHub Pages fallback redirect |
| `koope_einkaufsliste.md` | Plain-text product catalog source |
| `Koope-Design-Spec.md` | v2.0 design specification |

## How to use

Open the live URL and sign in. A new username + password creates an account
automatically; your list is private to you and syncs in real time across devices
via Supabase.

**Features (v2.0):**
- Quantity steppers — any item with quantity > 0 is "in your list" (gram items step 50)
- Search by **name or #ID**; the catalog #ID chip lights up in the accent color and the
  matched digits go bold. An exact-ID query scrolls to and pulses the row.
- One sticky **summary bar** — in-list count + estimated total (German `13,57 €` format),
  expandable to a per-line "My list" with totals and quick edit/remove
- Collapsible category accordions with count + "n in list" sub-counts (auto-open when they
  contain in-list items)
- Optional "got it" tick on in-list rows for shopping day (strike-through, kept in totals)
- **Tweaks panel:** accent color (4 swatches), density, light/dark theme, row style —
  all persist in `localStorage`
- Reset all with inline confirm
- Real-time multi-device sync; accessible (focus rings, aria-live totals, 44px targets,
  reduced-motion honored)

## Local development

No tooling required. Serve the folder over any static server, e.g.:

```
python3 -m http.server 8000
```

then open `http://localhost:8000/`.

## Product categories

Drinks · Beer · Milk Alternatives · Coffee & Espresso · Tea · Pasta · Grains & Flour ·
Muesli · Rice & Legumes · Nuts & Seeds · Nut Butter · Savory Spreads · Fruit Spreads ·
Ready Meals · Tofu · Jarred Goods · Oils · Vinegar & Sauces · Salt & Sugar · Broth ·
Spices · Herbs · Dried Fruit · Olives · Chocolate & Sweets · Ice Cream · Personal Care ·
Cleaning Products · Non-Food & Household

## Pickup info

- **Pickup day:** Friday
- **Format:** Self-service (Lager)
- **Current catalog:** May 2026 · 151 products
