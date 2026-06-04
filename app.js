/* ============================================================================
   Koope — Shopping List app logic (v2.0)
   Static, no build step. Supabase for shared per-user state + auth.

   State mapping onto the existing `shopping_state` schema (no migration):
     quantity (text) -> stepper value; quantity > 0 means "in list"
     checked  (bool) -> the optional shopping-day "got it" (acquired) tick
   ========================================================================== */

(function () {
  'use strict';

  // ── Supabase + auth guard ───────────────────────────────────────────────
  const SUPABASE_URL = 'https://yxkkseauqoiemyswknsx.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_xQZU1Hvm5eOzNSaZE8wL1w_7YObMr-M';
  const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const _auth = JSON.parse(localStorage.getItem('koope-auth') || 'null');
  const USER_ID = _auth && _auth.username ? _auth.username : '';
  if (!USER_ID) { window.location.replace('login.html'); return; }

  const PRODUCTS = window.KOOPE_PRODUCTS;
  const CATEGORIES = window.KOOPE_CATEGORIES;
  const TOTAL = PRODUCTS.length;
  const bySeq = {};
  PRODUCTS.forEach(p => { bySeq[p.seq] = p; });

  // ── Runtime state ───────────────────────────────────────────────────────
  // state[seq] = { qty: number, got: boolean }
  const state = {};
  PRODUCTS.forEach(p => { state[p.seq] = { qty: 0, got: false }; });

  // ── Preferences (localStorage, per user) ────────────────────────────────
  const PREF_KEY = 'koope-prefs:' + USER_ID;
  const prefs = Object.assign({
    theme: null,            // null -> follow prefers-color-scheme on first load
    accent: 'green',
    density: 'comfortable',
    rowStyle: 'list',
    openCats: null          // {badge: bool}; null -> auto (open cats with in-list items)
  }, JSON.parse(localStorage.getItem(PREF_KEY) || '{}'));

  let _prefTimer;
  function savePrefs() {
    clearTimeout(_prefTimer);
    _prefTimer = setTimeout(() => localStorage.setItem(PREF_KEY, JSON.stringify(prefs)), 200);
  }

  // ── Formatting & price helpers ──────────────────────────────────────────
  const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  function fmtEur(n) { return eur.format(n); }

  // Each product price string is either "4,84 €" (per unit) or "7,77 €/kg" (by weight).
  // Per-kg items are measured in kilograms (stepper adds 0.1 kg each press), so the
  // quantity unit always matches the price unit and line total = qty * price.
  const _priceCache = {};
  function parsePrice(str) {
    if (_priceCache[str]) return _priceCache[str];
    const perKg = str.indexOf('/kg') !== -1;
    const m = str.replace(/\./g, '').replace(',', '.').match(/[\d.]+/);
    const out = { value: m ? parseFloat(m[0]) : 0, perKg };
    _priceCache[str] = out;
    return out;
  }
  function isWeighed(p) { return parsePrice(p.price).perKg; }
  function stepFor(p) { return isWeighed(p) ? 0.1 : 1; }
  function roundQty(p, q) { return isWeighed(p) ? Math.round(q * 10) / 10 : Math.round(q); }
  function lineTotal(seq) {
    const q = state[seq].qty;
    return q > 0 ? q * parsePrice(bySeq[seq].price).value : 0;
  }
  // Display quantity: kg items use German decimals ("0,5", "1", "1,2"); counts are integers.
  function fmtQty(p, q) {
    return isWeighed(p) ? q.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : String(q);
  }
  // Parse a typed quantity, accepting either comma or dot as the decimal separator.
  function parseTyped(s) { const n = parseFloat(String(s).replace(',', '.')); return isFinite(n) ? n : 0; }

  // ── Diacritic-insensitive normalisation for search ──────────────────────
  function norm(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  // ── SVG icons ───────────────────────────────────────────────────────────
  const SVG_MINUS = '<svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const SVG_PLUS  = '<svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const SVG_CHEV  = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style="width:16px;height:16px"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // ── Theme / accent / density / row-style ────────────────────────────────
  const ACCENTS = {
    green:  { hex: '#16a34a', light: ['#16a34a', '#15803d', '#ecfdf3', '#ffffff'], dark: ['#22c55e', '#16a34a', '#10241a', '#06140c'] },
    blue:   { hex: '#2563eb', light: ['#2563eb', '#1d4ed8', '#eef2ff', '#ffffff'], dark: ['#60a5fa', '#3b82f6', '#11203a', '#06101f'] },
    orange: { hex: '#ea580c', light: ['#ea580c', '#c2410c', '#fff3ec', '#ffffff'], dark: ['#fb923c', '#f97316', '#2a1709', '#1a0c03'] },
    teal:   { hex: '#0d9488', light: ['#0d9488', '#0f766e', '#ecfdf6', '#ffffff'], dark: ['#2dd4bf', '#14b8a6', '#0c2420', '#03140f'] }
  };
  const root = document.documentElement;

  function effectiveTheme() {
    return prefs.theme || 'dark';   // dark is the default; explicit user choice wins
  }
  function applyTheme() {
    const t = effectiveTheme();
    root.setAttribute('data-theme', t);
    applyAccent();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0b0e12' : '#f6f7f9');
    syncTweakUI();
  }
  function applyAccent() {
    const set = ACCENTS[prefs.accent][effectiveTheme()];
    root.style.setProperty('--accent', set[0]);
    root.style.setProperty('--accent-strong', set[1]);
    root.style.setProperty('--accent-tint', set[2]);
    root.style.setProperty('--accent-contrast', set[3]);
  }
  function applyDensity() { root.setAttribute('data-density', prefs.density); }
  function applyRowStyle() { root.setAttribute('data-row', prefs.rowStyle); }

  // ── Build the catalog DOM from data ─────────────────────────────────────
  const catalogEl = document.getElementById('catalog');

  function buildCatalog() {
    const frag = document.createDocumentFragment();
    CATEGORIES.forEach(cat => {
      const section = document.createElement('section');
      section.className = 'cat';
      section.dataset.badge = cat.badge;

      const head = document.createElement('button');
      head.className = 'cat-head';
      head.type = 'button';
      head.setAttribute('aria-expanded', 'false');
      head.innerHTML =
        '<span class="cat-title"></span>' +
        '<span class="cat-new" hidden></span>' +
        '<span class="cat-sub" hidden></span>' +
        '<span class="cat-badge"></span>' +
        '<span class="cat-chev">' + SVG_CHEV + '</span>';
      head.querySelector('.cat-title').textContent = cat.title;
      // "N neu" count — static (set by the daily sync, not by user actions)
      const newCount = cat.ids.filter(seq => bySeq[seq].isNew).length;
      if (newCount > 0) {
        const cn = head.querySelector('.cat-new');
        cn.hidden = false; cn.textContent = newCount + ' neu';
      }
      head.addEventListener('click', () => toggleCat(cat.badge));

      const body = document.createElement('div');
      body.className = 'cat-body';
      const inner = document.createElement('div');
      inner.className = 'cat-body-inner';

      cat.ids.forEach(seq => inner.appendChild(buildRow(bySeq[seq])));
      body.appendChild(inner);
      section.appendChild(head);
      section.appendChild(body);
      frag.appendChild(section);
    });
    catalogEl.appendChild(frag);
  }

  function buildRow(p) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.seq = p.seq;
    row.dataset.id = p.id;
    if (p.isNew) row.classList.add('is-new');
    if (p.unavailable) row.classList.add('is-unavailable');

    // stepper
    const stepper = document.createElement('div');
    stepper.className = 'stepper';
    const minus = document.createElement('button');
    minus.type = 'button'; minus.className = 'step minus';
    minus.setAttribute('aria-label', 'Decrease quantity of ' + p.name);
    minus.innerHTML = SVG_MINUS;
    const val = document.createElement('input');
    val.className = 'step-val';
    val.type = 'text';
    val.inputMode = isWeighed(p) ? 'decimal' : 'numeric';
    val.autocomplete = 'off';
    val.setAttribute('aria-label', 'Quantity of ' + p.name + (isWeighed(p) ? ' in kg' : ''));
    val.value = '0';
    val.addEventListener('focus', () => val.select());
    val.addEventListener('input', () => setQty(p.seq, parseTyped(val.value), true));
    val.addEventListener('blur', () => applyRow(p.seq));      // normalize display on exit
    val.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); val.blur(); } });
    const plus = document.createElement('button');
    plus.type = 'button'; plus.className = 'step plus';
    plus.setAttribute('aria-label', 'Increase quantity of ' + p.name);
    plus.innerHTML = SVG_PLUS;
    minus.addEventListener('click', () => bump(p.seq, -stepFor(p)));
    plus.addEventListener('click', () => bump(p.seq, stepFor(p)));
    stepper.append(minus, val, plus);

    // name + meta
    const main = document.createElement('div');
    main.className = 'row-main';
    const name = document.createElement('div');
    name.className = 'row-name';
    name.textContent = p.name;
    const meta = document.createElement('div');
    meta.className = 'row-meta';
    if (p.detail) {
      const d = document.createElement('span');
      d.className = 'row-detail'; d.textContent = p.detail;
      meta.appendChild(d);
    }
    const chip = document.createElement('span');
    chip.className = 'id-chip';
    chip.textContent = '#' + p.id;
    meta.appendChild(chip);
    if (p.isNew) {
      const nb = document.createElement('span');
      nb.className = 'new-badge'; nb.textContent = 'NEU';
      meta.appendChild(nb);
    }
    if (p.unavailable) {
      const ub = document.createElement('span');
      ub.className = 'gone-tag'; ub.textContent = 'nicht verfügbar';
      meta.appendChild(ub);
    }
    main.append(name, meta);

    // price
    const price = document.createElement('div');
    price.className = 'row-price';
    price.innerHTML =
      '<span class="price-unit">' + p.unit + '</span>' +
      '<span class="price-val">' + escapeHtml(p.price) + '</span>';

    // Note: the "got it" tick + strike-through live only in the My-list panel (§6.6),
    // not on the store catalog rows.
    row.append(stepper, main, price);
    return row;
  }

  function rowEl(seq) { return catalogEl.querySelector('.row[data-seq="' + seq + '"]'); }

  // ── Quantity stepper (§7.2) ─────────────────────────────────────────────
  // Local state is the source of truth while the user edits. We debounce the
  // DB write and remember which items have a write in flight so the realtime
  // echo of our own change doesn't clobber the UI (see subscribe()).
  const _qTimer = {};
  const _pendingWrites = new Set();
  function commitQty(seq) {
    clearTimeout(_qTimer[seq]);
    _pendingWrites.add(seq);
    _qTimer[seq] = setTimeout(() => {
      const q = state[seq].qty; // read latest value at flush time
      db.from('shopping_state')
        .update({ quantity: q > 0 ? String(q) : '', updated_at: new Date().toISOString() })
        .eq('user_id', USER_ID).eq('item_id', seq)
        .then(({ error }) => {
          if (error) console.error('qty sync error', error);
          _pendingWrites.delete(seq);
        });
    }, 600);
  }

  function setQty(seq, q, persist) {
    q = Math.max(0, Math.min(99999, roundQty(bySeq[seq], q)));
    const was = state[seq].qty;
    state[seq].qty = q;
    if (q === 0 && state[seq].got) setGot(seq, false, persist); // can't be acquired if not in list
    applyRow(seq);
    if (was > 0 !== q > 0) updateCatHeader(bySeq[seq].cat);
    updateSummary();
    if (persist !== false) commitQty(seq);
  }
  function bump(seq, delta) { setQty(seq, state[seq].qty + delta, true); }

  function toggleGot(seq) { setGot(seq, !state[seq].got, true); }
  function setGot(seq, v, persist) {
    state[seq].got = v;
    if (document.getElementById('mylist').classList.contains('open')) renderMyList();
    if (persist !== false) {
      db.from('shopping_state')
        .update({ checked: v, updated_at: new Date().toISOString() })
        .eq('user_id', USER_ID).eq('item_id', seq)
        .then(({ error }) => { if (error) console.error('got sync error', error); });
    }
  }

  // ── Apply state to a row ────────────────────────────────────────────────
  function applyRow(seq) {
    const row = rowEl(seq);
    if (!row) return;
    const p = bySeq[seq];
    const q = state[seq].qty;
    const inList = q > 0;
    row.classList.toggle('in-list', inList);
    const valEl = row.querySelector('.step-val');
    if (document.activeElement !== valEl) valEl.value = q > 0 ? fmtQty(p, q) : '0';
    const minus = row.querySelector('.step.minus');
    const plus = row.querySelector('.step.plus');
    minus.classList.toggle('off', q <= 0);
    minus.disabled = q <= 0;
    plus.classList.toggle('add', q <= 0);
  }

  // ── Category header counts (§6.5) ───────────────────────────────────────
  function updateCatHeader(badge) {
    const cat = CATEGORIES.find(c => c.badge === badge);
    const section = catalogEl.querySelector('.cat[data-badge="' + badge + '"]');
    if (!cat || !section) return;
    const inCount = cat.ids.filter(s => state[s].qty > 0).length;
    const badgeEl = section.querySelector('.cat-badge');
    const subEl = section.querySelector('.cat-sub');
    badgeEl.textContent = cat.ids.length;
    badgeEl.classList.toggle('active', inCount > 0);
    if (inCount > 0) { subEl.hidden = false; subEl.textContent = inCount + ' in list'; }
    else subEl.hidden = true;
  }
  function updateAllCatHeaders() { CATEGORIES.forEach(c => updateCatHeader(c.badge)); }

  // ── Summary bar + my-list panel (§6.3) ──────────────────────────────────
  const summaryCountEl = document.getElementById('summary-count');
  const summaryTotalEl = document.getElementById('summary-total');
  const progressFill = document.getElementById('progress-fill');
  let _displayedTotal = 0;

  function updateSummary() {
    let count = 0, total = 0;
    for (const p of PRODUCTS) {
      if (state[p.seq].qty > 0) { count++; total += lineTotal(p.seq); }
    }
    summaryCountEl.textContent = count;
    summaryCountEl.classList.toggle('active', count > 0);
    animateTotal(total);
    progressFill.style.width = (count / TOTAL * 100) + '%';
    if (document.getElementById('mylist').classList.contains('open')) renderMyList();
  }

  let _totalRAF = 0, _totalSettle = 0;
  function settleTotal(target) { _displayedTotal = target; summaryTotalEl.textContent = fmtEur(target); }
  function animateTotal(target) {
    if (_totalRAF) { cancelAnimationFrame(_totalRAF); _totalRAF = 0; }
    clearTimeout(_totalSettle);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || Math.abs(target - _displayedTotal) < 0.01) { settleTotal(target); return; }
    const start = _displayedTotal, t0 = performance.now(), dur = 280;
    // Guaranteed final value even if rAF is throttled (background tab / reduced timers).
    _totalSettle = setTimeout(() => { _totalRAF && cancelAnimationFrame(_totalRAF); _totalRAF = 0; settleTotal(target); }, dur + 60);
    function tick(now) {
      const k = Math.max(0, Math.min(1, (now - t0) / dur));
      summaryTotalEl.textContent = fmtEur(start + (target - start) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) { _totalRAF = requestAnimationFrame(tick); }
      else { _totalRAF = 0; clearTimeout(_totalSettle); _displayedTotal = target; }
    }
    _totalRAF = requestAnimationFrame(tick);
  }

  const mylistInner = document.getElementById('mylist-inner');
  function renderMyList() {
    const items = PRODUCTS.filter(p => state[p.seq].qty > 0);
    if (!items.length) {
      mylistInner.innerHTML = '<div class="mylist-empty">No items yet — set a quantity to add one.</div>';
      return;
    }
    let total = 0;
    const frag = document.createDocumentFragment();
    items.forEach(p => {
      const lt = lineTotal(p.seq); total += lt;
      const qLabel = fmtQty(p, state[p.seq].qty) + (isWeighed(p) ? ' kg' : '');
      const el = document.createElement('div');
      el.className = 'mylist-item' + (state[p.seq].got ? ' acquired' : '');
      el.innerHTML =
        '<button class="mli-got" data-act="got" aria-pressed="' + !!state[p.seq].got + '" aria-label="Mark ' + p.name + ' as in the basket">✓</button>' +
        '<button class="mli-step" data-act="dec" aria-label="Decrease ' + p.name + '">−</button>' +
        '<button class="mli-step" data-act="inc" aria-label="Increase ' + p.name + '">+</button>' +
        '<span class="mli-name"><span class="mli-id">#' + escapeHtml(p.id) + '</span> <span class="mli-q">' + qLabel + ' ×</span> ' + escapeHtml(p.name) + '</span>' +
        '<span class="mli-total mono">' + fmtEur(lt) + '</span>' +
        '<button class="mli-remove" data-act="rm" aria-label="Remove ' + p.name + '">✕</button>';
      el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'inc') bump(p.seq, stepFor(p));
        else if (act === 'dec') bump(p.seq, -stepFor(p));
        else if (act === 'got') toggleGot(p.seq);
        else setQty(p.seq, 0, true);
      }));
      frag.appendChild(el);
    });
    const totalRow = document.createElement('div');
    totalRow.className = 'mylist-total';
    totalRow.innerHTML = '<span>Estimated total</span><span class="amt mono">' + fmtEur(total) + '</span>';
    mylistInner.innerHTML = '';
    mylistInner.appendChild(frag);
    mylistInner.appendChild(totalRow);
  }

  function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  const summaryBar = document.getElementById('summary-bar');
  const mylist = document.getElementById('mylist');
  function toggleMyList() {
    const open = !mylist.classList.contains('open');
    mylist.classList.toggle('open', open);
    summaryBar.classList.toggle('open', open);
    summaryBar.setAttribute('aria-expanded', String(open));
    if (open) renderMyList();
  }
  summaryBar.addEventListener('click', toggleMyList);
  summaryBar.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMyList(); }
  });

  // ── Accordions (§7.3) ───────────────────────────────────────────────────
  function isOpen(badge) {
    const sec = catalogEl.querySelector('.cat[data-badge="' + badge + '"]');
    return sec ? sec.classList.contains('open') : false;
  }
  function setCatOpen(badge, open) {
    const sec = catalogEl.querySelector('.cat[data-badge="' + badge + '"]');
    if (!sec) return;
    sec.classList.toggle('open', open);
    sec.querySelector('.cat-head').setAttribute('aria-expanded', String(open));
  }
  function persistOpenState() {
    prefs.openCats = {};
    CATEGORIES.forEach(c => { prefs.openCats[c.badge] = isOpen(c.badge); });
    savePrefs();
  }
  function toggleCat(badge) {
    if (document.getElementById('search').value.trim()) return; // ignore while filtering
    setCatOpen(badge, !isOpen(badge));
    persistOpenState();
  }
  document.getElementById('expand-all').addEventListener('click', () => {
    CATEGORIES.forEach(c => setCatOpen(c.badge, true)); persistOpenState();
  });
  document.getElementById('collapse-all').addEventListener('click', () => {
    CATEGORIES.forEach(c => setCatOpen(c.badge, false)); persistOpenState();
  });

  // ── Search & ID emphasis (§7.1) ─────────────────────────────────────────
  const searchEl = document.getElementById('search');
  const searchClear = document.getElementById('search-clear');
  const searchCount = document.getElementById('search-count');
  const noResults = document.getElementById('no-results');
  let _savedOpen = null; // expand/collapse state to restore after clearing search

  function clearRowHighlight(row) {
    const nameEl = row.querySelector('.row-name');
    if (nameEl.dataset.orig !== undefined) { nameEl.textContent = nameEl.dataset.orig; delete nameEl.dataset.orig; }
    const chip = row.querySelector('.id-chip');
    chip.classList.remove('match');
    chip.textContent = '#' + row.dataset.id;
  }

  function doSearch(raw) {
    const trimmed = raw.trim();
    searchClear.classList.toggle('on', trimmed.length > 0);

    if (!trimmed) {
      // restore highlights + previous open state
      catalogEl.querySelectorAll('.row').forEach(clearRowHighlight);
      catalogEl.querySelectorAll('.cat, .row').forEach(el => el.classList.remove('hidden'));
      catalogEl.querySelectorAll('.cat').forEach(c => c.style.display = '');
      if (_savedOpen) { CATEGORIES.forEach(c => setCatOpen(c.badge, !!_savedOpen[c.badge])); _savedOpen = null; }
      searchCount.textContent = '';
      noResults.hidden = true;
      return;
    }

    if (!_savedOpen) { _savedOpen = {}; CATEGORIES.forEach(c => { _savedOpen[c.badge] = isOpen(c.badge); }); }

    const digits = trimmed.replace(/^#/, '');
    const isNumeric = /^\d+$/.test(digits);
    const qn = norm(trimmed.replace(/^#/, ''));
    let total = 0, exactSeq = null;

    CATEGORIES.forEach(cat => {
      const section = catalogEl.querySelector('.cat[data-badge="' + cat.badge + '"]');
      let hits = 0;
      cat.ids.forEach(seq => {
        const p = bySeq[seq];
        const row = rowEl(seq);
        clearRowHighlight(row);

        const idStr = p.id;
        const nameNorm = norm(p.name);
        const idMatch = isNumeric ? idStr.indexOf(digits) !== -1 : false;
        const nameMatch = qn.length > 0 && nameNorm.indexOf(qn) !== -1;
        const match = idMatch || nameMatch;

        row.classList.toggle('hidden', !match);
        if (!match) return;
        hits++; total++;
        if (isNumeric && idStr === digits) exactSeq = seq;

        // ID chip pop (the priority feature)
        const chip = row.querySelector('.id-chip');
        chip.classList.add('match');
        if (isNumeric && idMatch) {
          const i = idStr.indexOf(digits);
          chip.innerHTML = '#' + escapeHtml(idStr.slice(0, i)) +
            '<b>' + escapeHtml(idStr.slice(i, i + digits.length)) + '</b>' +
            escapeHtml(idStr.slice(i + digits.length));
        }
        // Name <mark> highlight
        if (nameMatch) {
          const nameEl = row.querySelector('.row-name');
          nameEl.dataset.orig = p.name;
          const j = nameNorm.indexOf(qn);
          nameEl.innerHTML = escapeHtml(p.name.slice(0, j)) +
            '<mark>' + escapeHtml(p.name.slice(j, j + qn.length)) + '</mark>' +
            escapeHtml(p.name.slice(j + qn.length));
        }
      });
      section.style.display = hits ? '' : 'none';
      if (hits) setCatOpen(cat.badge, true);
    });

    searchCount.textContent = total ? total + (total === 1 ? ' result' : ' results') : '';
    if (total === 0) {
      noResults.hidden = false;
      noResults.innerHTML = 'No products match <span class="nr-q">"' + escapeHtml(trimmed) + '"</span>.' +
        (isNumeric ? '<br>No product with ID #' + escapeHtml(digits) + '.' : '') +
        '<br><button id="nr-clear">Clear search</button>';
      document.getElementById('nr-clear').addEventListener('click', clearSearch);
    } else {
      noResults.hidden = true;
    }

    // Jump-to exact full ID (§7.1.5)
    if (exactSeq != null) requestAnimationFrame(() => jumpToRow(exactSeq));
  }

  function jumpToRow(seq) {
    const row = rowEl(seq);
    if (!row) return;
    const stickyH = document.getElementById('sticky-region').offsetHeight;
    const headerH = document.querySelector('.app-header').offsetHeight;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = row.getBoundingClientRect().top + window.scrollY - headerH - stickyH - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
    row.classList.remove('pulse'); void row.offsetWidth; row.classList.add('pulse');
    setTimeout(() => row.classList.remove('pulse'), 650);
  }

  function clearSearch() { searchEl.value = ''; doSearch(''); searchEl.focus(); }
  searchEl.addEventListener('input', () => doSearch(searchEl.value));
  searchEl.addEventListener('keydown', e => { if (e.key === 'Escape') clearSearch(); });
  searchClear.addEventListener('click', clearSearch);

  // ── Reset all (§7.5) ────────────────────────────────────────────────────
  const resetBtn = document.getElementById('reset-all');
  const resetConfirm = document.getElementById('reset-confirm');
  resetBtn.addEventListener('click', () => { resetBtn.hidden = true; resetConfirm.hidden = false; });
  document.getElementById('reset-no').addEventListener('click', () => { resetConfirm.hidden = true; resetBtn.hidden = false; });
  document.getElementById('reset-yes').addEventListener('click', () => {
    resetConfirm.hidden = true; resetBtn.hidden = false;
    PRODUCTS.forEach(p => { state[p.seq] = { qty: 0, got: false }; applyRow(p.seq); });
    updateAllCatHeaders();
    updateSummary();
    const rows = PRODUCTS.map(p => ({
      user_id: USER_ID, item_id: p.seq, checked: false, quantity: '', updated_at: new Date().toISOString()
    }));
    db.from('shopping_state').upsert(rows).then(({ error }) => { if (error) console.error('reset sync error', error); });
  });

  // ── Tweaks panel (§8) ───────────────────────────────────────────────────
  function buildSwatches() {
    const wrap = document.getElementById('tw-accent');
    Object.keys(ACCENTS).forEach(key => {
      const b = document.createElement('button');
      b.className = 'swatch'; b.type = 'button';
      b.dataset.val = key;
      b.style.background = ACCENTS[key].hex;
      b.setAttribute('aria-label', key + ' accent');
      b.addEventListener('click', () => { prefs.accent = key; applyAccent(); savePrefs(); syncTweakUI(); });
      wrap.appendChild(b);
    });
  }
  function wireSegment(id, key, apply) {
    document.querySelectorAll('#' + id + ' button').forEach(b => {
      b.addEventListener('click', () => { prefs[key] = b.dataset.val; apply(); savePrefs(); syncTweakUI(); });
    });
  }
  function syncTweakUI() {
    document.querySelectorAll('#tw-accent .swatch').forEach(s => s.classList.toggle('sel', s.dataset.val === prefs.accent));
    const map = { 'tw-density': prefs.density, 'tw-theme': effectiveTheme(), 'tw-row': prefs.rowStyle };
    Object.keys(map).forEach(id => {
      document.querySelectorAll('#' + id + ' button').forEach(b => b.classList.toggle('sel', b.dataset.val === map[id]));
    });
  }

  const tweaksPanel = document.getElementById('tweaks-panel');
  document.getElementById('tweaks-fab').addEventListener('click', () => { tweaksPanel.hidden = !tweaksPanel.hidden; });
  document.getElementById('tweaks-close').addEventListener('click', () => { tweaksPanel.hidden = true; });
  document.getElementById('theme-toggle').addEventListener('click', () => {
    prefs.theme = effectiveTheme() === 'dark' ? 'light' : 'dark'; applyTheme(); savePrefs();
  });

  // ── Real-time sync ──────────────────────────────────────────────────────
  function subscribe() {
    db.channel('shopping-' + USER_ID)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shopping_state', filter: 'user_id=eq.' + USER_ID },
        payload => {
          const r = payload.new;
          const seq = r.item_id;
          if (!state[seq]) return;
          // Our own write in flight — local state wins, ignore the echo.
          if (_pendingWrites.has(seq)) return;
          const qty = parseFloat(r.quantity) || 0;
          const got = !!r.checked;
          // No actual change vs. what we already show (self-echo) — skip the
          // re-render so the total doesn't re-animate / flicker.
          if (state[seq].qty === qty && state[seq].got === got) return;
          state[seq] = { qty, got };
          applyRow(seq);
          updateCatHeader(bySeq[seq].cat);
          updateSummary();
        })
      .subscribe();
  }

  // ── Sticky shadow on scroll ─────────────────────────────────────────────
  const stickyRegion = document.getElementById('sticky-region');
  window.addEventListener('scroll', () => {
    stickyRegion.classList.toggle('scrolled', window.scrollY > 4);
  }, { passive: true });

  // ── Init ────────────────────────────────────────────────────────────────
  async function init() {
    // theme / appearance first to avoid flash
    applyTheme(); applyDensity(); applyRowStyle();
    buildSwatches();
    wireSegment('tw-density', 'density', applyDensity);
    wireSegment('tw-row', 'rowStyle', applyRowStyle);
    document.querySelectorAll('#tw-theme button').forEach(b => {
      b.addEventListener('click', () => { prefs.theme = b.dataset.val; applyTheme(); savePrefs(); });
    });

    document.getElementById('header-meta').textContent =
      TOTAL + ' products · Updated ' + (window.KOOPE_UPDATED || '29.05.2026') + ' · v2.1';

    buildCatalog();

    // avatar / sign-out
    const avatar = document.getElementById('user-avatar');
    avatar.textContent = USER_ID.charAt(0).toUpperCase();
    avatar.title = USER_ID + ' · tap to sign out';
    avatar.addEventListener('click', () => {
      if (confirm('Sign out as ' + USER_ID + '?')) {
        localStorage.removeItem('koope-auth');
        window.location.replace('login.html');
      }
    });

    // load DB state
    const { data, error } = await db.from('shopping_state')
      .select('item_id, checked, quantity').eq('user_id', USER_ID);
    if (error) {
      document.getElementById('overlay').textContent = 'Could not connect. Check your internet connection.';
      return;
    }
    data.forEach(r => {
      if (state[r.item_id]) state[r.item_id] = { qty: parseFloat(r.quantity) || 0, got: !!r.checked };
    });
    if (data.length === 0) {
      const seed = PRODUCTS.map(p => ({
        user_id: USER_ID, item_id: p.seq, checked: false, quantity: '', updated_at: new Date().toISOString()
      }));
      await db.from('shopping_state').upsert(seed);
    }

    // One-time migration: v1 stored weighed items in grams; v2 measures them in kg.
    // Convert this user's existing gram quantities to kg, once, then remember.
    const MIG_KEY = 'koope-kgmig:' + USER_ID;
    if (!localStorage.getItem(MIG_KEY)) {
      const updates = [];
      PRODUCTS.forEach(p => {
        if (isWeighed(p) && state[p.seq].qty >= 1) {           // ≥1 means it was grams, not kg
          const kg = Math.max(0.1, Math.round(state[p.seq].qty / 100) / 10);
          state[p.seq].qty = kg;
          updates.push({ user_id: USER_ID, item_id: p.seq, quantity: String(kg), updated_at: new Date().toISOString() });
        }
      });
      if (updates.length) await db.from('shopping_state').upsert(updates);
      localStorage.setItem(MIG_KEY, '1');
    }

    // paint rows + headers
    PRODUCTS.forEach(p => applyRow(p.seq));
    updateAllCatHeaders();
    updateSummary();

    // open-category state: saved prefs, else auto-open categories with in-list items
    CATEGORIES.forEach(cat => {
      let open;
      if (prefs.openCats && prefs.openCats[cat.badge] !== undefined) open = prefs.openCats[cat.badge];
      else open = cat.ids.some(s => state[s].qty > 0);
      setCatOpen(cat.badge, open);
    });

    document.getElementById('overlay').style.display = 'none';
    subscribe();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
