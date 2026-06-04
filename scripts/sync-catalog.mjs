#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Koope catalog sync — logs into shop.koope.de, scrapes the flat
// "Alle Produkte" listing, and merges it into ../data.js.
//
//   • Existing products (matched by catalog #ID): PRICE is updated; the
//     curated name / detail / unit / category / seq are left untouched.
//   • New products: appended with a fresh `seq` (so Supabase item_id keys
//     stay stable), auto-filed into a category by their name prefix, and
//     tagged `isNew: true`.
//   • Products that vanished from the shop: tagged `unavailable: true`
//     (never deleted — that would orphan users' Supabase rows).
//
// The shop is the single source of truth: `isNew` is recomputed every run
// purely from the diff against the previous catalog (no time-based state).
//
// Usage:  node scripts/sync-catalog.mjs            (dry run — prints summary)
//         node scripts/sync-catalog.mjs --write    (rewrites data.js)
//
// Credentials: env KOOPE_USER / KOOPE_PASS, or a local .koope-creds file
// (KEY=value lines). Never logged.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_JS = join(ROOT, 'data.js');
const WRITE = process.argv.includes('--write');

const BASE = 'https://shop.koope.de';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605';

// ── credentials ───────────────────────────────────────────────────────────
function loadCreds() {
  let user = process.env.KOOPE_USER, pass = process.env.KOOPE_PASS;
  const f = join(ROOT, '.koope-creds');
  if ((!user || !pass) && existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(KOOPE_USER|KOOPE_PASS)\s*=\s*(.*?)\s*$/);
      if (m) { if (m[1] === 'KOOPE_USER') user = m[2]; else pass = m[2]; }
    }
  }
  if (!user || !pass) { console.error('✗ Missing KOOPE_USER / KOOPE_PASS'); process.exit(1); }
  return { user, pass };
}

// ── cookie jar + fetch helpers ─────────────────────────────────────────────
const jar = {};
function store(res) {
  for (const c of (res.headers.getSetCookie?.() ?? [])) {
    const [kv] = c.split(';'); const i = kv.indexOf('=');
    jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
}
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie() }, redirect: 'manual' });
  store(res); return res;
}

// ── login (CakePHP FormProtection token replay) ────────────────────────────
async function login({ user, pass }) {
  let res = await get(BASE + '/anmelden');
  const html = await res.text();
  const form = html.match(/<form[^>]*id="LoginForm"[\s\S]*?<\/form>/i)?.[0];
  if (!form) throw new Error('login form not found');
  const fields = {};
  for (const m of form.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    const name = tag.match(/\bname="([^"]*)"/i)?.[1];
    const value = tag.match(/\bvalue="([^"]*)"/i)?.[1] ?? '';
    if (name) fields[name] = value;
  }
  fields.email = user; fields.passwd = pass;
  res = await fetch(BASE + '/anmelden', {
    method: 'POST', redirect: 'manual',
    headers: { 'User-Agent': UA, Cookie: cookie(), 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE, Referer: BASE + '/anmelden' },
    body: new URLSearchParams(fields).toString(),
  });
  store(res);
  if (res.status !== 302) throw new Error('login failed (status ' + res.status + ')');
}

// ── scrape all "Alle Produkte" pages ───────────────────────────────────────
function decode(s) {
  return s.replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}
async function scrape() {
  const products = new Map(); // id -> { id, shopName, price, byWeight, shopUnit }
  for (let page = 1; page <= 50; page++) {
    const res = await get(`${BASE}/kategorie/20-Alle-Produkte?page=${page}`);
    if (res.status >= 300 && res.status < 400) { // page=1 redirects to canonical
      const loc = new URL(res.headers.get('location'), BASE).href;
      const r2 = await get(loc); var html = await r2.text();
    } else { var html = await res.text(); }
    if (/id="LoginForm"/.test(html)) throw new Error('not logged in on page ' + page);
    // Iterate by each product-name occurrence (variants can share one
    // `<div class="pw">` wrapper, so splitting by wrapper would drop them).
    const matches = [...html.matchAll(/<a class="product-name" href="\/produkt\/(\d+)-[^"]*">([\s\S]*?)<\/a>/gi)];
    let found = 0;
    for (let k = 0; k < matches.length; k++) {
      const m = matches[k];
      const id = m[1];
      // block = from this product-name to the next one (where its price/unit live)
      const block = html.slice(m.index, k + 1 < matches.length ? matches[k + 1].index : html.length);
      if (products.has(id)) continue;
      const shopName = decode(m[2]);
      const priceM = block.match(/<div class="price"[^>]*>([\s\S]*?)<\/div>/i);
      const price = priceM ? decode(priceM[1]) : '';
      const byWeight = /price-incl-per-unit|price-asterisk/.test(block);
      const unitM = block.match(/<div class="unity">[\s\S]*?<span class="value">([\s\S]*?)<\/span>/i);
      const shopUnit = unitM ? decode(unitM[1]) : '';
      products.set(id, { id, shopName, price, byWeight, shopUnit });
      found++;
    }
    // stop when a page yields no products (past the last page)
    if (found === 0) break;
    const hasNext = new RegExp(`page=${page + 1}\\b`).test(html);
    if (!hasNext) break;
  }
  return products;
}

// shop price → data.js price string, matching existing per-kg vs package style
function fmtPrice(p) {
  const num = (p.price.match(/[\d.,]+/) || [''])[0];
  if (!num) return null;
  return p.byWeight ? `${num} €/kg` : `${num} €`;
}

// ── category auto-filing for NEW products (German name prefix → badge) ──────
const PREFIX_MAP = [
  [/^getränke/, 'getraenke'], [/^bier/, 'bier'],
  [/^(kaffee|espresso|lupinenkaffee)/, 'kaffee'], [/^tee/, 'tee'],
  [/^nudeln/, 'nudeln'], [/^müsli/, 'muesli'],
  [/^(reis|linsen|bohnen|kichererbsen|sojaschnetzel)/, 'reis'],
  [/^(mehl|polenta|couscous|backpulver|grieß|haferflocken|getreide)/, 'getreide'],
  [/^(nüsse|sesam|kürbiskerne|sonnenblumenkerne|mandeln|leinsaat|saaten)/, 'nuesse'],
  [/^nussmus/, 'nussmus'], [/^(aufstrich|pesto)/, 'aufstriche'],
  [/^fruchtaufstrich/, 'frucht'], [/^fertiggericht/, 'fertig'], [/^tofu/, 'tofu'],
  [/^konserven/, 'konserven'], [/^öl/, 'oele'],
  [/^(essig|shoyu|sojasoße|sojasauce|sauce)/, 'essig'], [/^salz/, 'salz'],
  [/^(gemüsebrühe|brühe)/, 'bruehe'], [/^gewürze/, 'gewuerze'], [/^kräuter/, 'kraeuter'],
  [/^(trockenobst|trockenfrüchte)/, 'trocken'], [/^oliven/, 'oliven'],
  [/^(schokolade|kakaopulver|kakao|süßigkeiten)/, 'schoko'], [/^eis/, 'eis'],
  [/^(seife|körperpflege|shampoo|zahn)/, 'koerperpflege'],
  [/^(sonett|waschsoda|waschmittel|spülmittel|reiniger)/, 'reinigung'],
  [/^non-food/, 'nonfood'],
  [/^(haferdrink|kokosmilch|natumi|pflanzendrink|haferdrinkpulver)/, 'milch'],
];
function fileCategory(shopName) {
  const n = shopName.toLowerCase();
  for (const [re, badge] of PREFIX_MAP) if (re.test(n)) return badge;
  return 'neu'; // unknown → review bucket
}

// ── load existing data.js via sandbox ──────────────────────────────────────
function loadCatalog() {
  const src = readFileSync(DATA_JS, 'utf8');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { products: ctx.window.KOOPE_PRODUCTS, categories: ctx.window.KOOPE_CATEGORIES };
}

// ── serialize back to data.js (preserving the existing hand style) ──────────
function q(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
function serialize(products, categories, updated) {
  const cat = categories.map(c =>
    `  { badge: ${q(c.badge)}, title: ${q(c.title)}, ids: [${c.ids.join(',')}] },`).join('\n');
  const prod = products.map(p => {
    let s = `  { seq: ${p.seq}, id: ${q(p.id)}, name: ${q(p.name)}, detail: ${q(p.detail || '')}, unit: ${q(p.unit || '')}, price: ${q(p.price)}, cat: ${q(p.cat)}`;
    if (p.isNew) s += `, isNew: true`;
    if (p.unavailable) s += `, unavailable: true`;
    return s + ' },';
  }).join('\n');
  return `// Koope catalog — ${products.length} products, ${categories.length} categories. Generated data layer (v2.0).\n`
    + `// Each product: id = koope catalog #ID (searchable), seq = internal key for Supabase.\n`
    + `// Auto-synced from shop.koope.de — see scripts/sync-catalog.mjs.\n\n`
    + `window.KOOPE_UPDATED = ${q(updated)};\n\n`
    + `window.KOOPE_CATEGORIES = [\n${cat}\n];\n\n`
    + `window.KOOPE_PRODUCTS = [\n${prod}\n];\n`;
}

// ── merge ───────────────────────────────────────────────────────────────────
async function main() {
  await login(loadCreds());
  const shop = await scrape();
  console.log(`Scraped ${shop.size} products from shop.`);

  const { products, categories } = loadCatalog();
  const byId = new Map(products.map(p => [String(p.id), p]));
  const catByBadge = new Map(categories.map(c => [c.badge, c]));
  let maxSeq = products.reduce((m, p) => Math.max(m, p.seq), 0);

  const changes = { priced: [], added: [], unavailable: [], restored: [] };

  // 1. existing products: update price, clear stale flags, detect removals
  for (const p of products) {
    const s = shop.get(String(p.id));
    if (s) {
      const np = fmtPrice(s);
      if (np && np !== p.price) { changes.priced.push(`#${p.id} ${p.price} → ${np}`); p.price = np; }
      if (p.unavailable) { changes.restored.push(`#${p.id}`); delete p.unavailable; }
    } else if (!p.unavailable) {
      p.unavailable = true; changes.unavailable.push(`#${p.id} ${p.name}`);
    }
    // isNew is NOT cleared here — it persists until you curate the product
    // (the shop dictates additions; we don't auto-expire the badge).
  }

  // 2. new products: append with fresh seq, auto-file, tag isNew
  for (const s of shop.values()) {
    if (byId.has(s.id)) continue;
    const badge = fileCategory(s.shopName);
    if (!catByBadge.has(badge)) { // ensure review bucket exists
      const c = { badge: 'neu', title: 'Neu / Unsortiert', ids: [] };
      categories.push(c); catByBadge.set('neu', c);
    }
    const seq = ++maxSeq;
    // Keep the full shop name for new (uncurated) rows; you rename to taste.
    const np = { seq, id: s.id, name: s.shopName, detail: s.shopUnit || '',
      unit: s.byWeight ? 'kg' : (s.shopUnit || ''), price: fmtPrice(s) || '', cat: badge, isNew: true };
    products.push(np); byId.set(s.id, np);
    catByBadge.get(badge).ids.push(seq);
    changes.added.push(`#${s.id} → ${badge}: ${np.name} (${np.price})`);
  }

  // ── report ──
  const today = new Date();
  const updated = `${String(today.getDate()).padStart(2,'0')}.${String(today.getMonth()+1).padStart(2,'0')}.${today.getFullYear()}`;
  console.log(`\n  price updates : ${changes.priced.length}`);
  console.log(`  new products  : ${changes.added.length}`);
  console.log(`  now unavailable: ${changes.unavailable.length}`);
  console.log(`  restored      : ${changes.restored.length}`);
  if (changes.added.length) console.log('\nNEW:\n  ' + changes.added.join('\n  '));
  if (changes.unavailable.length) console.log('\nUNAVAILABLE:\n  ' + changes.unavailable.join('\n  '));
  if (changes.priced.length) console.log('\nPRICES:\n  ' + changes.priced.slice(0, 60).join('\n  '));

  const out = serialize(products, categories, updated);
  if (WRITE) { writeFileSync(DATA_JS, out); console.log(`\n✓ Wrote ${DATA_JS}`); }
  else { console.log('\n(dry run — pass --write to update data.js)'); }
}
main().catch(e => { console.error('✗', e.message); process.exit(1); });
