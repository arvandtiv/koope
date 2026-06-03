# Koope Leipzig – Codebase Guide

Food cooperative shopping list app. Static HTML/CSS/JS, no build step. Deploy = push to `main` → GitHub Pages auto-deploys.

**Live URL:** `arvandtiv.github.io/koope/`

## Files

| File | Purpose |
|------|---------|
| `index.html` | Login / register page |
| `koope_einkaufszettel.html` | Main shopping list app |
| `koope-logo.svg` | Official Koope brand logo |
| `404.html` | GitHub Pages fallback — redirects unknown paths to `/` |
| `koope_einkaufsliste.md` | Plain-text product catalog source |
| `.github/workflows/pages.yml` | GitHub Pages deploy workflow |

## Tech stack

- Pure static HTML/CSS/JS — no framework, no bundler
- **Supabase** for shared state and auth (real-time Postgres)
- GitHub Pages for hosting
- Supabase CDN: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">`

## Supabase

- Project URL: `https://yxkkseauqoiemyswknsx.supabase.co`
- Anon key: `sb_publishable_xQZU1Hvm5eOzNSaZE8wL1w_7YObMr-M`

### Tables

**`shopping_state`** — one row per (user, item)
```
user_id     text        — FK to users.username
item_id     int         — 1–151
checked     bool
quantity    text
updated_at  timestamptz
PRIMARY KEY (user_id, item_id)
```

**`users`** — auth table
```
username      text PRIMARY KEY
password_hash text  — SHA-256 of password (no salt, simple)
```

RLS: anon SELECT + INSERT allowed on both tables.

## Auth flow

1. `index.html` — user enters username + password
2. SHA-256 hash computed client-side via Web Crypto API
3. If username not in `users` → insert (auto-register)
4. If username exists → compare hash
5. On success → cache `{ username, hash }` in `localStorage('koope-auth')`
6. `koope_einkaufszettel.html` reads `localStorage` on load → redirects to `index.html` if missing
7. Sign-out clears `localStorage` and redirects to `index.html`

## Per-user list provisioning

First login for a new user: SELECT returns 0 rows → app upserts 151 default rows for that `user_id`. Subsequent logins load existing state.

## App architecture

- `state` object (in-memory cache): `state[item_id] = { checked, quantity }`
- All DB reads/writes filtered by `USER_ID` (username from localStorage)
- Real-time: `db.channel('shopping-' + USER_ID)` with filter `user_id=eq.<USER_ID>`
- Qty changes debounced 600ms before Supabase write
- Reset All: upserts all 151 rows for current user with `checked: false, quantity: ''`

## UI

- Header: Koope logo (left) + user avatar chip showing first letter of username (top-right, tap to sign out)
- CSS custom properties for light/dark mode (`prefers-color-scheme`)
- `<details>`/`<summary>` collapsible category sections
- Each item: checkbox, label, `[−]` stepper, qty input, `[+]` stepper, unit, price
- Stepper: gram items step 50, all others step 1
- `touch-action: manipulation` on buttons (no 300ms tap delay)

## Catalog

- 151 products, 29 categories
- Last updated: 29.05.2026
- When a new catalog arrives: update items in HTML, update product count + date in subtitle, bump version

## Versioning

Subtitle format: `151 products · Updated DD.MM.YYYY · vX.Y`
Current version: **v1.3.1**
