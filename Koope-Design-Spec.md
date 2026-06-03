# Koope — Shopping List Redesign

**Design specification & build handoff**
Version 2.0 · Prepared for implementation · Single-page web app (mobile-first, desktop-capable)

---

## 0. TL;DR for the builder

Build a single-page **shopping list** web app called **Koope**. Products are grouped into collapsible categories. Each product row lets the user set a **quantity** (a stepper); any item with quantity > 0 is "in the list" and contributes to a running **estimated total**. Every product has a short numeric **#ID** that is *the* primary way users find things — the search box filters by name **and** ID, and matched IDs must visually pop.

- **Stack:** plain HTML + Tailwind CSS (CDN is fine) + a small amount of vanilla JS (or React if you prefer). No backend required; seed from a static product array. Persist state to `localStorage`.
- **Look:** bold, modern, high-contrast. Green accent (`#16a34a`). Slate neutrals. Strong type.
- **Layout:** mobile = full-width single column; desktop = same single column, centered, capped at `720px`.
- **Must-have:** the **#ID is a first-class, monospaced chip** on every row and **highlights in the accent color when it matches the current search**.
- **Tweaks panel:** accent color, density (comfortable/compact), light/dark, row style variant.

---

## 1. Product context

Koope is a **co-op / collective bulk-buying shopping list**. A group orders groceries together; this screen is where a member ticks through the full catalog and marks how many units of each product they want. Notable domain details to preserve:

- Products belong to **categories** (Drinks, Bier, Coffee & Espresso, Pasta & Noodles, Spices, Cleaning Products, etc.). Categories are collapsible accordions with a **count badge**.
- Each product has: **name**, optional **detail line** (size / variant, e.g. `0,5 L + 0,15 € Pfand` deposit), a numeric **#ID**, a **unit** (e.g. `Fl` = Flasche/bottle), and a **unit price** in euros.
- The header shows catalog size and a "last updated" date + version.
- There is a **running summary**: how many items are in the list and the **estimated total**.

> Language: **English UI labels**, but keep product names as-is (they are German brand names — e.g. "Rotkäppchen Sekt, alkoholfrei", "KiLiMo (Sauerkirschlimo)"). Currency stays **€** with German formatting (comma decimal: `13,12 €`).

---

## 2. What changed from v1 (and why)

| # | v1 problem | v2 fix |
|---|------------|--------|
| 1 | Right-hand **prices were clipped** on mobile (`1,3…`, `1,62…`). | Redesigned row grid with a fixed price column and `tabular-nums`; prices never truncate. |
| 2 | **Three stacked summary blocks** (progress bar + "My Shopping List" + "Estimated Total") doing overlapping jobs. | Collapsed into **one sticky summary bar** with a single expandable list. |
| 3 | **Redundant checkbox + stepper** (both signalled "in list"). | Dropped the checkbox as the add control. **Quantity > 0 = in list.** A separate, optional **"got it" tick** is available only on in-list rows for shopping-day use. |
| 4 | **Numeric index badges (1–10)** added noise. | Removed. The meaningful number — the **#ID** — is promoted instead. |
| 5 | **Flat hierarchy**; selected rows barely differed. | In-list rows get an accent left-border + tinted surface; clear visual anchor. |
| 6 | **No desktop layout** — just a stretched phone column. | Centered, width-capped single column with comfortable desktop spacing. |
| 7 | IDs were tiny grey suffixes glued to the name. | IDs are now **monospaced chips** that **light up on search match** (the user's #1 request). |

---

## 3. Design principles

1. **The ID is sacred.** Users hunt by number. It is always visible, monospaced, easy to scan, and it is the loudest thing on the row when searched.
2. **One way to add.** Quantity is the single source of truth for "in my list." No parallel checkbox to keep in sync.
3. **High contrast, confident type.** Bold weights, generous size, real hierarchy. No timid grey-on-grey.
4. **Fast triage.** Categories collapse so the user controls density. Counts and totals update instantly.
5. **Calm color.** Neutral slate canvas; green earns attention only where it matters (in-list state, totals, matched IDs, primary actions).

---

## 4. Design tokens

Implement as CSS custom properties on `:root` (and `:root[data-theme="dark"]`). Tailwind users: mirror these in `tailwind.config` `theme.extend` or use arbitrary values referencing the vars.

### 4.1 Color — light theme (default)

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#f6f7f9` | App background |
| `--surface` | `#ffffff` | Cards, rows, bars |
| `--surface-2` | `#f1f3f5` | Inset / stepper track / collapsed category fill |
| `--border` | `#e3e7ec` | Hairlines, dividers, control borders |
| `--text` | `#0f1115` | Primary text |
| `--text-muted` | `#5b6470` | Detail lines, meta |
| `--text-faint` | `#9aa3af` | Disabled, placeholder |
| `--accent` | `#16a34a` | Primary accent (green) |
| `--accent-strong` | `#15803d` | Hover/active accent |
| `--accent-tint` | `#ecfdf3` | In-list row fill, matched-ID chip bg |
| `--accent-contrast` | `#ffffff` | Text/icon on accent fills |
| `--danger` | `#dc2626` | Reset / destructive |

### 4.2 Color — dark theme (`[data-theme="dark"]`)

| Token | Value |
|-------|-------|
| `--bg` | `#0b0e12` |
| `--surface` | `#151a21` |
| `--surface-2` | `#1d242d` |
| `--border` | `#28313c` |
| `--text` | `#f3f5f7` |
| `--text-muted` | `#9aa6b2` |
| `--text-faint` | `#5e6b78` |
| `--accent` | `#22c55e` |
| `--accent-strong` | `#16a34a` |
| `--accent-tint` | `#10241a` |
| `--accent-contrast` | `#06140c` |
| `--danger` | `#f87171` |

> **Accent is a tweak.** The accent set above is the default (green). The accent tweak swaps `--accent`, `--accent-strong`, `--accent-tint`, `--accent-contrast` as a group. Provide 4 curated options — see §8.1. Never expose a free color picker.

### 4.3 Typography

Google Fonts (load 400/500/600/700):

- **Display / headings:** `Space Grotesk` — distinctive, modern, slightly geometric.
- **Body / UI:** `Hanken Grotesk` — clean, highly legible at small sizes.
- **Mono (IDs, prices, units):** `JetBrains Mono` — unambiguous digits, gives numbers their own visual register.

```
--font-display: "Space Grotesk", system-ui, sans-serif;
--font-body:    "Hanken Grotesk", system-ui, sans-serif;
--font-mono:    "JetBrains Mono", ui-monospace, monospace;
```

Type scale (mobile → desktop where noted):

| Role | Font | Size / line | Weight | Notes |
|------|------|-------------|--------|-------|
| App title "Koope" | display | 26 / 1.1 | 700 | Tight letter-spacing `-0.02em` |
| Header meta | mono | 12 / 1.3 | 500 | `--text-muted` |
| Summary total | display | 22 / 1.1 | 700 | Accent color, `tabular-nums` |
| Category title | display | 17 / 1.2 | 600 | |
| Category count badge | body | 12 / 1 | 600 | |
| Product name | body | 15.5 / 1.25 | 600 | `text-wrap: balance` |
| Product detail line | body | 12.5 / 1.3 | 500 | `--text-muted` |
| **#ID chip** | mono | 12.5 / 1 | 600 | letter-spacing `0.01em` |
| Unit price | mono | 14 / 1 | 600 | `font-variant-numeric: tabular-nums` |
| Unit suffix (Fl, L) | mono | 12 / 1 | 500 | `--text-muted` |
| Button label | body | 14 / 1 | 600 | |

> Always set `font-variant-numeric: tabular-nums` on prices, totals, and quantities so digits don't shift width as they change.

### 4.4 Spacing, radius, shadow, motion

```
--space: 4 8 12 16 20 24 32 40   /* px scale */
--radius-sm: 8px;   /* chips, small controls */
--radius-md: 12px;  /* rows, inputs */
--radius-lg: 16px;  /* cards, bars */
--radius-pill: 999px;

--shadow-sm: 0 1px 2px rgba(15,17,21,.06), 0 1px 1px rgba(15,17,21,.04);
--shadow-md: 0 4px 16px rgba(15,17,21,.08);
--shadow-sticky: 0 6px 24px rgba(15,17,21,.10); /* under sticky bars when scrolled */

--ease: cubic-bezier(.2,.7,.2,1);
--dur: 180ms;   /* most transitions */
--dur-accordion: 240ms;
```

Respect `prefers-reduced-motion: reduce` — disable height/transform transitions, keep instant state changes.

---

## 5. Layout & responsive behavior

```
┌─────────────────────────────────────┐  sticky, z-30
│  HEADER  (logo · title · meta · ◐)   │
├─────────────────────────────────────┤  sticky, z-20
│  SEARCH  [ 🔍 name or #ID … ]        │
│  SUMMARY BAR  in list 2 · 13,12 € ▾  │
├─────────────────────────────────────┤
│  ACTION ROW  Expand · Collapse · Reset│  scrolls away
├─────────────────────────────────────┤
│  ▸ CATEGORY  (accordion)             │
│     • product row                    │
│     • product row …                  │
│  ▸ CATEGORY …                        │
└─────────────────────────────────────┘
```

- **Page container:** `width: 100%`, `max-width: 720px`, `margin-inline: auto`. Side gutters: `16px` mobile, `24px` ≥ 768px.
- **Background:** `--bg` fills the full viewport; the centered column sits on it (on wide screens you see bg margins left/right — that's intended and keeps focus).
- **Sticky stack:** Header is sticky at top. Search + summary bar stick directly below the header (one combined sticky region). When the page is scrolled, sticky region gains `--shadow-sticky` and a `1px` bottom border.
- **Safe areas:** add `env(safe-area-inset-top/bottom)` padding so it sits well inside a phone PWA.
- **Min text size:** never below `12px`. Tap targets ≥ `44×44px` (steppers, chevrons, theme toggle).

Breakpoints: single breakpoint at `768px` only changes gutters and slightly increases row padding — **the column does not split**. (Per chosen direction: centered single column.)

---

## 6. Components

### 6.1 Header
- Left: circular **logo** slot (use an `<image-slot>`/placeholder, 36px, `--radius-pill`) + **"Koope"** title.
- Right: **theme toggle** (◐ icon button, 44px hit area) and a small round **avatar** placeholder (initial "A").
- Sub-line under title (mono, muted): `151 products · Updated 29.05.2026 · v1.2`. Product count is dynamic.

### 6.2 Search field
- Full-width input, `--radius-pill`, `--surface`, `1px --border`, leading 🔍 icon, height 44px.
- Placeholder: **"Search products or #ID…"**
- Clearing affordance (✕) appears when non-empty.
- **Behavior:** see §7.1 (search & ID matching) — this is the most important interaction.

### 6.3 Summary bar (replaces the 3 v1 blocks)
- A single pill/bar inside the sticky region:
  - Left: **"In list"** label + count of distinct in-list products (e.g. `2`).
  - Right: **Estimated total** in accent color, `tabular-nums` (e.g. `13,12 €`), then a **▾ chevron**.
- Tapping it expands an inline **"My list"** panel listing only in-list items: `qty × name … line total`, plus a footer **Estimated total** row. Each line has a quick `–`/`+` and remove.
- A thin **progress indicator** (in-list count ÷ catalog count) sits as a 2px bar along the bottom edge of the bar, accent-filled. Subtle, not a big block.

### 6.4 Action row
- Three text buttons, left-aligned, `gap: 8px`: **Expand all**, **Collapse all**, **Reset all**.
- `Expand/Collapse` = ghost buttons (`--surface`, `--border`). `Reset all` = ghost with `--danger` text; on click, confirm inline ("Reset list? · Confirm / Cancel") before zeroing all quantities.

### 6.5 Category accordion
- Header: `--surface`, `--radius-lg`, `--shadow-sm`. Contains: **category title** (display) + **count badge** + a small **"n in list"** accent sub-count if any items are selected, and a right **chevron** that rotates 90° when open.
- Count badge: pill, `--surface-2` bg, `--text-muted`. If the category has in-list items, badge turns accent-tinted with accent text.
- Open state: items render in a list below; smooth height/opacity transition (`--dur-accordion`, `--ease`). Collapsed by default **except** categories that contain in-list items (those auto-open on load).
- Spacing between categories: `10px`.

### 6.6 Product row — the core component

Grid (mobile), single line that wraps gracefully:

```
[ qty stepper ]  [ name + detail + #ID chip ]            [ price ]
   88px fixed         flex: 1 (min-width: 0)              auto, right
```

- **Name block** (`min-width:0` so it truncates/wraps, never pushes price off-screen):
  - Line 1: **product name** (600). Wraps to max 2 lines, then ellipsis.
  - Line 2 (meta row, `gap:8px`, wraps): **detail line** (size / Pfand) · **#ID chip**.
- **#ID chip:** `font-mono`, prefix `#`, padding `2px 7px`, `--radius-sm`, bg `--surface-2`, text `--text`. This is the anchor element for search matches (give it `id="prod-<ID>"` or a `data-id`). See §7.1 for its highlighted state.
- **Price:** mono, `tabular-nums`, right-aligned, fixed min-width (e.g. `64px`) so the column is stable. Show unit suffix (`Fl`) in muted mono just left of or above price as space allows. Format `4,84 €`.
- **Stepper:** `[ – ] [ value ] [ + ]`.
  - Container: `--surface-2` track, `--radius-pill`, height 36px.
  - `–` / `+`: 36px round tap targets; `+` is accent-filled when value is 0 (a clear "add" cue), neutral once value ≥ 1; `–` disabled (faint) at 0.
  - Value: mono, tabular, center, fixed 24px width.
- **In-list state (qty ≥ 1):** row gets `--accent-tint` background, a `3px` accent **left border** (inside `--radius-md`), and name weight stays 600. A small **"got it" circle-check** appears at the far right (toggles a struck-through, dimmed "acquired" sub-state for shopping day — does not remove it from totals).
- **Row separation:** depends on **row style tweak** (§8.4): `List` (hairline dividers, flat), `Card` (each row its own `--surface` card with `--shadow-sm`), or `Striped` (alternating `--surface` / `--surface-2`).
- Density tweak changes vertical padding: **comfortable** `12px`, **compact** `7px` (§8.2).

### 6.7 Empty / no-results state
- When search yields nothing: centered muted message "No products match **"<query>"**" + a "Clear search" button. If the query looks numeric, add hint: "No product with ID #<query>."

---

## 7. Interactions & state

### 7.1 Search & **ID emphasis** (priority feature)

The user's primary workflow is *"I know the number, find it."* Make it excellent:

1. **Match logic** (case-insensitive, diacritic-insensitive):
   - Match against product **name** AND **ID**.
   - If the query is **all digits** (optionally with a leading `#`), treat it as an **ID search**: match IDs that **start with** the digits first, then IDs that **contain** them. Name matches rank below ID matches.
2. **Filtering:** hide non-matching rows. Auto-expand any category containing a match; hide categories with zero matches. Show a live result count near the search field (e.g. `7 results`).
3. **ID highlight (the pop):** on every matching row, the **#ID chip** switches to its **matched state** — background `--accent`, text `--accent-contrast` (or accent-tinted with accent border in dark), subtle scale `1.04`, and the matched digit substring is **bold**. This makes the number the brightest element on the row.
4. **Name highlight:** wrap matched substrings in name with a `<mark>` using `--accent-tint` bg + inherit text (secondary to the ID pop).
5. **Jump-to:** if the query is an **exact full ID**, smooth-scroll that row to just under the sticky region and give it a one-shot **pulse ring** (accent outline that fades over 600ms). Do **not** use `scrollIntoView`; compute offset and use `window.scrollTo({top, behavior:'smooth'})`.
6. **Clearing** search restores prior expand/collapse state.

### 7.2 Quantity stepper
- `+` increments, `–` decrements, floor 0, sensible ceiling (e.g. 99).
- Crossing 0 → 1 adds in-list styling and bumps summary count/total with a brief count-up on the total.
- Crossing 1 → 0 removes in-list styling; if it was the last in-list item in a category that had auto-opened, leave it open (don't yank it shut under the user).
- All steppers `aria-label`ed; value is an accessible live region for the total.

### 7.3 Accordions
- Tap header toggles. Chevron rotates. Expand all / Collapse all operate on every category.
- Persist open/closed set in `localStorage`.

### 7.4 Persistence
- `localStorage` keys: quantities map `{id: qty}`, "got it" set, theme, accent, density, row-style, open-categories set, last search (optional). Re-hydrate on load. Debounce writes.

### 7.5 Reset all
- Inline confirm. On confirm: zero all quantities, clear "got it", collapse to default. Animate the summary total back to `0,00 €`.

---

## 8. Tweaks panel

A small, toggleable in-page control panel (gear button, bottom-right or in header). Title it **"Tweaks"**. Hidden unless opened. Each tweak persists to `localStorage` and applies instantly via the token system. Provide these four:

### 8.1 Accent color (4 curated swatches — no free picker)
| Option | `--accent` / `--accent-strong` / `--accent-tint` (light) |
|--------|-----------|
| **Green** (default) | `#16a34a` / `#15803d` / `#ecfdf3` |
| **Blue** | `#2563eb` / `#1d4ed8` / `#eef2ff` |
| **Orange** | `#ea580c` / `#c2410c` / `#fff3ec` |
| **Teal** | `#0d9488` / `#0f766e` / `#ecfdf6` |

(Provide matching dark-theme tints — bump lightness, dim the tint as in §4.2.)

### 8.2 Density — segmented control: **Comfortable** / **Compact**
- Comfortable: row padding 12px, category gap 10px.
- Compact: row padding 7px, category gap 6px, smaller stepper (32px).

### 8.3 Theme — segmented control: **Light** / **Dark** (default follows `prefers-color-scheme` on first load).

### 8.4 Row style — segmented control: **List** / **Card** / **Striped** (see §6.6).

> Implement with a tiny state object → sets `data-*` attributes / CSS vars on `:root`. Keep the panel itself ≤ 320px wide, `--shadow-md`, `--radius-lg`.

---

## 9. Accessibility

- All interactive elements are real `<button>` / `<input>` with visible `:focus-visible` ring (`2px --accent`, `2px` offset).
- Color is never the only signal: in-list state also uses the left border + stepper value; matched IDs also bold the substring.
- Contrast ≥ 4.5:1 for text (verify accent-on-tint and muted text in both themes).
- Search input has a `<label>` (visually hidden ok). Result count and total are `aria-live="polite"`.
- Steppers: `aria-label="Decrease/Increase quantity of <name>"`; value exposed.
- Honor `prefers-reduced-motion`.
- Full keyboard path: Tab through search → actions → category headers (Enter toggles) → steppers.

---

## 10. Data model

```ts
type Product = {
  id: string;        // "270" — the searchable number; render as "#270"
  name: string;      // "Rotkäppchen Sekt, alkoholfrei"
  detail?: string;   // "0,5 L + 0,15 € Pfand"  (size / deposit line)
  unit: string;      // "Fl"
  price: number;     // 4.84  -> format as "4,84 €"
  category: string;  // "Drinks"
};

type Category = { name: string; order: number };

// runtime state (persisted)
type State = {
  qty: Record<string, number>;        // id -> quantity
  got: Record<string, boolean>;        // id -> acquired (shopping-day tick)
  openCats: Record<string, boolean>;
  theme: "light" | "dark";
  accent: "green" | "blue" | "orange" | "teal";
  density: "comfortable" | "compact";
  rowStyle: "list" | "card" | "striped";
};
```

**Number formatting:** euros use German locale — `new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n)` → `4,84 €`. Estimated total = Σ qty×price over in-list items.

**Seed data:** reproduce the catalog from the v1 screenshot (Drinks fully itemized; remaining categories with their counts). Drinks examples:

| ID | Name | Detail | Unit | Price |
|----|------|--------|------|-------|
| 270 | Rotkäppchen Sekt, alkoholfrei | Flasche | Fl | 4,84 |
| 331 | Natumi Haferdrink Natur | 1 L | Fl | 1,64 |
| 267 | Jolle Mate – zickzack | 0,5 L + 0,15 € Pfand | Fl | 1,3x |
| 266 | KiLiMo (Sauerkirschlimo) – zickzack | 0,5 L + 0,15 € Pfand | Fl | 1,7x |
| 268 | Kolla Cola – zickzack | 0,5 L + 0,15 € Pfand | Fl | 1,72 |
| 264 | Kolle Mate – zickzack | 0,5 L + 0,15 € Pfand | Fl | 1,90 |
| 263 | Lipz Rhabarber | 0,5 L + 0,15 € Pfand | Fl | 2,15 |
| 262 | Lipz Schwarze Johannisbeere | 0,5 L + 0,15 € Pfand | Fl | 1,62 |
| 261 | Quipz (Quitte-Apfel-Schorle) | 0,5 L + 0,15 € Pfand | Fl | 2,27 |
| 265 | Zotrine (Zitronenlimonade) – zickzack | 0,5 L + 0,15 € Pfand | Fl | (price) |

Remaining categories & counts (collapsed by default): Bier (2), Milk Alternatives (3), Coffee & Espresso (3), Tea (6), Pasta & Noodles (4), Grains & Flour (10), Muesli & Flakes (3), Rice & Legumes (9), Nuts & Seeds (10), Nut Butter (6), Savory Spreads (9), Fruit Spreads (3), Ready Meals (2), Tofu – Tofurei Leipzig (4), Canned & Jarred Goods (2), Oils (4), Vinegar & Sauces (3), Salt & Sugar (3), Broth & Seasoning (1), Spices (9), Herbs (6), Dried Fruit (8), Oliven (1), Chocolate & Sweets (4), Ice Cream & Sorbet (2), Personal Care & Soaps (6), Cleaning Products (Sonett) (11), Non-Food & Household (7).

> Fill in real names/prices for non-Drinks categories where known; otherwise generate plausible placeholders matching the counts so layout is exercised.

---

## 11. Acceptance criteria

- [ ] App renders mobile-first; identical centered single column capped at 720px on desktop with no horizontal scroll and **no clipped prices** at 320px width.
- [ ] Typing a number filters to matching products; **the #ID chip turns accent-colored and the matched digits are bold**; an exact-ID query smooth-scrolls and pulses the row.
- [ ] Search also matches names (with `<mark>` highlight) and shows a live result count.
- [ ] Setting quantity > 0 marks a row in-list (tint + accent left border), increments the summary count, and updates the estimated total in `de-DE` format instantly.
- [ ] Summary bar expands to show only in-list items with per-line totals and a grand total; progress sliver reflects in-list/total.
- [ ] Categories collapse/expand individually and via Expand/Collapse all; categories with in-list items auto-open on load.
- [ ] Reset all asks for inline confirmation, then zeroes everything.
- [ ] Tweaks panel changes accent / density / theme / row-style live and persists across reload; all state persists via localStorage.
- [ ] Meets a11y: focus-visible rings, aria-live total, 44px targets, reduced-motion respected, contrast ≥ 4.5:1 in both themes.
- [ ] Fonts: Space Grotesk (headings), Hanken Grotesk (body), JetBrains Mono (IDs/prices/units), all with `tabular-nums` on numerics.

---

## 12. Build notes

- Tailwind: enable the CDN with a small inline `tailwind.config` mapping the tokens, or use CSS vars + arbitrary values (`bg-[var(--surface)]`). Either is fine; keep the **token layer** authoritative so tweaks work by swapping vars.
- Keep DOM canonical (explicitly close elements, quote attributes) for maintainability.
- Component order in source: tokens/`<style>` → header → sticky search+summary → actions → category list → tweaks panel → script.
- No `scrollIntoView`; compute scroll offsets manually so the sticky region never covers the target.
- Ship a single `index.html` (or `index.html` + `app.js` + `data.js`). Seed catalog in `data.js`.
