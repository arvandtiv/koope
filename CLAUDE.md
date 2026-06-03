# Koope Leipzig – Codebase Guide

Food cooperative shopping list app. Static HTML/CSS/JS, no build step. Deploy = push to `main` → GitHub Pages auto-deploys.

**Live URL:** `arvandtiv.github.io/koope/`

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main shopping list app — DOM skeleton + design-token CSS (loads `data.js` then `app.js`) |
| `app.js` | All app logic: catalog rendering, search, summary, tweaks, Supabase sync |
| `data.js` | Product catalog data — `window.KOOPE_CATEGORIES` + `window.KOOPE_PRODUCTS` (151 items) |
| `login.html` | Login / register page |
| `koope-logo.svg` | Official Koope brand logo |
| `404.html` | GitHub Pages fallback — redirects unknown paths to `/` |
| `koope_einkaufsliste.md` | Plain-text product catalog source |
| `Koope-Design-Spec.md` | v2.0 redesign specification (build handoff) |
| `.github/workflows/pages.yml` | GitHub Pages deploy workflow |

## Tech stack

- Pure static HTML/CSS/JS — no framework, no bundler. App split into `index.html` + `app.js` + `data.js`.
- **Supabase** for shared state and auth (real-time Postgres)
- GitHub Pages for hosting
- Supabase CDN: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">`
- Google Fonts: Space Grotesk (display), Hanken Grotesk (body), JetBrains Mono (IDs/prices/numerics)

## Supabase

- Project URL: `https://yxkkseauqoiemyswknsx.supabase.co`
- Anon key: `sb_publishable_xQZU1Hvm5eOzNSaZE8wL1w_7YObMr-M`

### Tables

**`shopping_state`** — one row per (user, item)
```
user_id     text        — FK to users.username
item_id     int         — 1–151 (the internal `seq`, NOT the catalog #ID)
checked     bool        — repurposed in v2 as the "got it" / acquired tick
quantity    text        — stepper value; quantity > 0 means "in list"
updated_at  timestamptz
PRIMARY KEY (user_id, item_id)
```

**`users`** — auth table
```
username      text PRIMARY KEY
password_hash text  — SHA-256 of password (no salt, simple)
```

RLS: anon SELECT + INSERT allowed on both tables.

## Product IDs — two numbers, don't confuse them

- **`seq`** (1–151): internal sequential index = the `item_id` Supabase key. Stable per catalog position.
- **`id`** (e.g. `270`): the koope catalog **#ID** shown as a chip and used by search. This is the
  user-facing number. Never used as a DB key.

## Auth flow

1. `login.html` — user enters username + password
2. SHA-256 hash computed client-side via Web Crypto API
3. If username not in `users` → insert (auto-register)
4. If username exists → compare hash
5. On success → cache `{ username, hash }` in `localStorage('koope-auth')`
6. `index.html` (`app.js`) reads `localStorage` on load → redirects to `login.html` if missing
7. Sign-out clears `localStorage` and redirects to `login.html`

## Per-user list provisioning

First login for a new user: SELECT returns 0 rows → `app.js` upserts 151 default rows for that `user_id`. Subsequent logins load existing state.

## App architecture (`app.js`)

- `state[seq] = { qty: number, got: boolean }` (in-memory cache).
  - `qty` ↔ `shopping_state.quantity` (text); `qty > 0` = in list.
  - `got` ↔ `shopping_state.checked` (bool); the optional shopping-day "acquired" tick.
- Catalog DOM is **built by JS** from `window.KOOPE_PRODUCTS` / `KOOPE_CATEGORIES` (no static rows).
- All DB reads/writes filtered by `USER_ID` (username from localStorage).
- Real-time: `db.channel('shopping-' + USER_ID)` with filter `user_id=eq.<USER_ID>`.
- Qty changes debounced 600ms before Supabase write; "got it" writes immediately.
- Reset All: inline confirm → upserts all 151 rows with `checked: false, quantity: ''`.
- Prices: per-item string (`"4,84 €"` or `"7,77 €/kg"`). Per-kg items count grams, so
  line total = `qty/1000 × price`. Totals formatted via `Intl.NumberFormat('de-DE', …)`.

## UI / design system

- Design tokens are CSS custom properties on `:root` (light) and `:root[data-theme="dark"]`.
  Accent group (`--accent`, `--accent-strong`, `--accent-tint`, `--accent-contrast`) is injected
  by JS (`applyAccent`) per theme+accent — see `ACCENTS` table in `app.js`.
- **Tweaks panel** (gear, bottom-right): accent (4 swatches), density (comfortable/compact),
  theme (light/dark), row style (list/card/striped). Persisted to `localStorage('koope-prefs:<user>')`.
- Header: logo + "Koope" title + meta line, theme toggle, avatar chip (tap to sign out).
- Sticky region: search field + summary bar (in-list count, estimated total, expandable "My list").
- Custom accordions (grid-template-rows 0fr↔1fr transition); auto-open categories with in-list items.
- Product row: stepper `[− value +]`, name + detail + #ID chip, price + unit, "got it" tick on in-list rows.
- Stepper: gram items step 50, all others step 1. `touch-action: manipulation`. 44px tap targets.
- Search: matches name + #ID; numeric query = ID search (matched #ID chip pops accent, digits bold);
  name matches get `<mark>`; exact-ID query smooth-scrolls + pulses the row; live result count.
- Accessibility: `:focus-visible` rings, `aria-live` total/result count, `prefers-reduced-motion` honored.

## Catalog

- 151 products, 29 categories — lives in `data.js`.
- Last updated: 29.05.2026
- When a new catalog arrives: update `data.js` (products + category `ids`), update product count + date
  in the header meta line (`app.js` init), bump version.

## Versioning

Header meta format: `151 products · Updated DD.MM.YYYY · vX.Y` (set in `app.js` init).
Current version: **v2.0**
