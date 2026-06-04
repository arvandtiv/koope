# Koope v3 — Thoughts & Ideas

Working draft. Captures candidate features for the next version. Nothing here is
committed scope yet — it's a backlog to shape together. Open questions are marked **[?]**.

---

## 1. Language switch — German ⇄ English  *(headline feature)*

Today the UI is English-only; product names are German brand names (kept as-is). A
Leipzig co-op is mostly German-speaking, so a language toggle is the obvious v3 win.

### What changes vs. stays
| Element | Behavior |
|---|---|
| **UI chrome** (header meta, search placeholder, "In list", "Estimated total", Expand/Collapse/Reset, Tweaks panel labels, login page, confirm prompts, aria-labels) | **Translated** via a string table. |
| **Category titles** | **Bilingual.** German names already exist in `koope_einkaufsliste.md` (Getränke, Milchalternativen, …); English already in `data.js`. Carry both. |
| **Product names** | **Never translated** — they're German brand names ("Rotkäppchen Sekt", "KiLiMo"). Same in both modes. |
| **Detail lines** | **Left verbatim** in both languages (`Flasche`, `0,5 L + 0,15 € Pfand`, `nach Gewicht`) — authentic store terms, not translated. |
| **Units** (Fl, Glas, Pack, Stk, kg) | **Kept as-is** (German abbreviations) in both languages — compact and unambiguous. |
| **Currency / numbers** | **Always German format** (`4,84 €`) regardless of language — it's a German store; avoids separator confusion. |

### Approach (fits the no-build, static stack)
- A `LANG` dictionary in a new `i18n.js`: `{ de: {...}, en: {...} }`, keyed by string id.
- A `t('key')` helper in `app.js`; replace the ~35 inline strings in `app.js` + ~16 labels in
  `index.html` (rendered ones can use `data-i18n` attributes hydrated on load).
- Category data gains a `title_de` alongside the existing `title` (en) in `data.js`.
- `login.html` gets its own small string set (separate page) + the same header toggle.
- Persist as `prefs.lang` in `localStorage('koope-prefs:<user>')`; set `<html lang>` to match.
- Re-render text + re-localize on toggle **without reload** (same live pattern as theme/accent).

### Decisions — LOCKED
1. **Default language: German.** Brand-new visitor starts in German; English is opt-in. Applied pre-paint (like the dark default) to avoid a flash of English.
2. **Toggle: header quick toggle** — a small `DE / EN` control in the header, one tap away (also present on `login.html`). No Tweaks-panel entry needed.
3. **Currency: always German format** (`4,84 €`) in both languages.
4. **Scope: UI chrome + category names only.** Product names, detail lines, and unit abbreviations stay verbatim German in both modes.

---

## 2. Backlog — other v3 candidates

Seed list to react to / prune / expand — tell me which matter and add your own:

- **Export / share my list** — copy as text or a shareable link, or PDF for the pickup day.
- **PWA install + offline** — installable app icon, works offline (cache shell + last-synced list).
- **Order-day reminders** — surface the pickup date / pre-order deadlines (e.g. Tofu) more prominently, optional notification.
- **Sort & view options** — sort within a category by price/name; "show only my list" filter.
- **Quantity presets** for weighed items (250 g / 500 g / 1 kg quick chips) on top of the 0.1 stepper.
- **Catalog freshness** — easier catalog updates (e.g. generate `data.js` from the `.md` source), show "last updated" diff.
- **Shared / household lists** — optionally merge a few members into one order.

---

## Notes
- Stays static, no build step; ships on free GitHub Pages (`arvandtiv.github.io/koope/`).
- Keep the v2 token system authoritative so new UI inherits theming automatically.
