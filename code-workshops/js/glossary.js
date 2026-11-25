/* Vocabulary helper (מילון מונחים) - self-contained add-on. Vanilla ES2020, no dependencies.
 * Attaches itself to the page from outside: floating button + panel, and auto-links known terms in the app text.
 * Public API: window.CWGlossary = { open(termIdOrGuideId?), close(), terms }.
 * Only network access: one fetch of data/glossary.json (fails silently). Nothing is logged anywhere. */
(function () {
  'use strict';
  if (window.CWGlossary) return;

  var SCRIPT = document.currentScript;
  var DATA_URL = 'data/glossary.json';
  try { if (SCRIPT && SCRIPT.src) DATA_URL = new URL('../data/glossary.json', SCRIPT.src).href; } catch (e) { /* keep relative */ }
  var PREF_KEY = 'cw:glossary:link';

  /* ---------------------------------------------------------------- state */
  var terms = [], guides = [], byId = {}, guideById = {}, cats = [];
  var loaded = false, pendingOpen = null;
  var linkRe = null, formToId = {};
  var linkOn = readPref();
  var fab = null, panel = null, backdrop = null, panelOpen = false, opener = null;
  var homeEl = null, cardEl = null, searchEl = null, listEl = null, chipsEl = null, guideBtn = null, switchEl = null;
  var query = '', activeCat = '';

  var EXCL = 'input, textarea, button, a, select, option, pre, code, .CodeMirror, [contenteditable], [dir="ltr"], .console, .con-out, ' +
    '.sortboard, .slist, .fillcode, .stepper, header, nav, h1, h2, .gl-panel, .gl-pop, [data-noglossary], .gl-term, ' +
    '.sim, .tests-pane, .outpane, .vtable, .counter, label, [aria-live], [role="status"], .toast-host, .gl-fab, .gl-backdrop, script, style, svg';
  var CONT = '.qcard, .hint-card, .feedback, .story-text, .io-col, .ws-card, .field, .note, .lead, .hero-copy, .process li, .stage';
  var OWN = '.gl-fab, .gl-panel, .gl-pop, .gl-backdrop';
  var NOMEM = { 'קלט': 1, 'פלט': 1, 'ערך קבוע': 1 };

  /* ---------------------------------------------------------------- utils */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  function svg(inner, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', cls || 'gl-ico'); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.innerHTML = inner; // static strings only
    return s;
  }
  var ICO_BOOK = '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 012-2h13"/><path d="M9 7h6"/>';
  var ICO_X = '<path d="M6 6l12 12M18 6L6 18"/>';
  var ICO_BACK = '<path d="M5 12h14M13 6l6 6-6 6"/>'; // arrow pointing to the right = "back" in RTL
  /* `text` in backticks = inline code: rendered LTR so operators and identifiers keep their order inside Hebrew text */
  function rich(text) { return String(text == null ? '' : text).split('`').map(function (p, i) { return i % 2 ? h('code', { class: 'gl-inl', dir: 'ltr' }, p) : p; }); }
  function plain(text) { return String(text == null ? '' : text).replace(/`/g, ''); }
  function readPref() { try { return localStorage.getItem(PREF_KEY) !== '0'; } catch (e) { return true; } }
  function writePref(v) { try { localStorage.setItem(PREF_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } }
  function reduced() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function isLoginScreen() { return !!document.getElementById('f-name'); }
  function inOwn(node) {
    var el = node && node.nodeType === 1 ? node : node && node.parentElement;
    return !!(el && el.closest && el.closest(OWN));
  }

  /* search normalisation: lower-case, no niqqud. The index keeps every word raw and with its Hebrew prefix letter stripped;
   * a query word matches through itself and through its prefix-stripped variants (so "בשארית" finds "שארית"). */
  var PRE = 'הבלומכש';
  function stripPre(w) { return (w.length > 3 && PRE.indexOf(w.charAt(0)) >= 0 && /[\u05D0-\u05EA]/.test(w.charAt(0))) ? w.slice(1) : w; }
  function words(s) { return String(s || '').toLowerCase().replace(/[\u0591-\u05C7]/g, '').split(/\s+/).filter(Boolean); }
  function norm(s) { return words(s).map(function (w) { return w + ' ' + stripPre(w); }).join(' '); }
  function variants(w) { var a = [w], b = stripPre(w); if (b !== w) { a.push(b); var c = stripPre(b); if (c !== b) a.push(c); } return a; }
  function hasTok(hay, w) { return variants(w).some(function (v) { return hay.indexOf(v) >= 0; }); }

  /* ---------------------------------------------------------------- data */
  function init(data) {
    terms = (data && data.terms) || (Array.isArray(data) ? data : []);
    guides = (data && data.guides) || [];
    if (!terms.length) return;
    terms.forEach(function (t) {
      byId[t.id] = t;
      t._k = norm([t.term].concat(t.aka || []).join(' '));
      t._t = norm(plain((t.short || '') + ' ' + (t.more || '')));
      if (cats.indexOf(t.cat) < 0) cats.push(t.cat);
      (t.match || []).forEach(function (f) {
        f = String(f).replace(/\s+/g, ' ').trim();
        if (f.length >= 3 && !formToId[f]) formToId[f] = t.id;
      });
    });
    guides.forEach(function (g) { guideById[g.id] = g; g._k = norm(g.title + ' ' + g.short + ' פעולות פונקציות'); });
    var forms = Object.keys(formToId).sort(function (a, b) { return b.length - a.length; });
    var alt = forms.map(function (f) { return f.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&').replace(/ /g, '\\s+'); }).join('|');
    var W = '[\\u0590-\\u05FFA-Za-z0-9_]';
    linkRe = new RegExp('(?<!' + W + ')((?:[וש]|כש)?[הבלמכ]?)(' + alt + ')(?!' + W + ')', 'g');
    loaded = true;
    window.CWGlossary.terms = terms;
    buildFab();
    scheduleScan(document.getElementById('main') || document.body);
    startObserver();
    if (pendingOpen !== null) { var p = pendingOpen; pendingOpen = null; openPanel(p || undefined); }
  }

  /* ---------------------------------------------------------------- floating button */
  function buildFab() {
    fab = h('button', { type: 'button', class: 'gl-fab', 'aria-label': 'מילון מונחים', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: function () { panelOpen ? closePanel() : openPanel(); } },
      svg(ICO_BOOK, 'gl-ico'), h('span', { class: 'gl-fab-l' }, 'מילון'));
    document.body.appendChild(fab);
    updateFab();
  }
  function updateFab() {
    if (!fab) return;
    var hide = isLoginScreen();
    if (fab.hidden !== hide) fab.hidden = hide;
    if (hide && panelOpen) closePanel(true);
  }

  /* ---------------------------------------------------------------- panel */
  function buildPanel() {
    backdrop = h('div', { class: 'gl-backdrop', hidden: true, onclick: function () { closePanel(); } });
    var title = h('h2', { class: 'gl-title', id: 'gl-title' }, 'מילון מונחים');
    var x = h('button', { type: 'button', class: 'gl-x', 'aria-label': 'סגירת המילון', onclick: function () { closePanel(); } }, svg(ICO_X));
    var head = h('div', { class: 'gl-ph' }, svg(ICO_BOOK, 'gl-ico gl-ph-ico'), title, x);

    searchEl = h('input', { type: 'search', class: 'gl-search', placeholder: 'חיפוש מונח או סימן, למשל שארית או %', 'aria-label': 'חיפוש במילון', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search', oninput: function () { query = searchEl.value; renderList(); } });
    chipsEl = h('div', { class: 'gl-chips', role: 'group', 'aria-label': 'סינון לפי נושא' });
    guideBtn = h('button', { type: 'button', class: 'gl-guide', onclick: function () { showGuide('functions'); } },
      svg(ICO_BOOK, 'gl-ico'), h('span', { class: 'gl-guide-t' }, h('strong', null, 'מדריך קצר: פעולות/פונקציות'), h('small', null, 'איך בנויה פעולה, מה זה פרמטר ומה זה return')));
    listEl = h('ul', { class: 'gl-list', onkeydown: listKeys });
    homeEl = h('div', { class: 'gl-home' }, searchEl, chipsEl, guideBtn, listEl);
    cardEl = h('div', { class: 'gl-view', hidden: true });

    switchEl = h('input', { type: 'checkbox', role: 'switch', class: 'gl-sw', id: 'gl-sw', onchange: function () { setLinking(switchEl.checked); } });
    switchEl.checked = linkOn;
    var foot = h('div', { class: 'gl-pf' }, h('label', { class: 'gl-swl', for: 'gl-sw' }, switchEl, h('span', { class: 'gl-track', 'aria-hidden': 'true' }), h('span', null, 'סימון מונחים בטקסט')));

    panel = h('div', { class: 'gl-panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'gl-title', hidden: true, onkeydown: panelKeys },
      head, h('div', { class: 'gl-scroll' }, homeEl, cardEl), foot);
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    var all = h('button', { type: 'button', class: 'gl-chip', 'aria-pressed': 'true', 'data-cat': '', onclick: function () { setCat(''); } }, 'הכול');
    chipsEl.appendChild(all);
    cats.forEach(function (c) { chipsEl.appendChild(h('button', { type: 'button', class: 'gl-chip', 'aria-pressed': 'false', 'data-cat': c, onclick: function () { setCat(c); } }, c)); });
    renderList();
  }
  function setCat(c) {
    activeCat = c;
    Array.prototype.forEach.call(chipsEl.children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cat') === c ? 'true' : 'false'); });
    renderList();
  }
  function filtered() {
    var toks = words(query);
    var out = [];
    terms.forEach(function (t, i) {
      if (activeCat && t.cat !== activeCat) return;
      if (!toks.length) { out.push({ t: t, s: 0, i: i }); return; }
      var inK = toks.every(function (k) { return hasTok(t._k, k); });
      if (inK) { out.push({ t: t, s: 0, i: i }); return; }
      var inAll = toks.every(function (k) { return hasTok(t._k, k) || hasTok(t._t, k); });
      if (inAll) out.push({ t: t, s: 1, i: i });
    });
    if (toks.length) out.sort(function (a, b) { return a.s - b.s || a.i - b.i; });
    return out;
  }
  function renderList() {
    if (!listEl) return;
    var res = filtered(), toks = words(query);
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    var g = guideById.functions;
    guideBtn.hidden = !g || (toks.length > 0 && !toks.every(function (k) { return hasTok(g._k, k); })) || (!!activeCat && !toks.length);
    if (!res.length) { listEl.appendChild(h('li', { class: 'gl-empty', role: 'status' }, 'לא נמצא מונח כזה. נסו מילה אחרת או סימן אחר.')); return; }
    var last = null, first = true;
    res.forEach(function (r) {
      if (!query && !activeCat && r.t.cat !== last) { last = r.t.cat; listEl.appendChild(h('li', { class: 'gl-cat', 'aria-hidden': 'true' }, last)); }
      var b = h('button', { type: 'button', class: 'gl-item', tabindex: first ? '0' : '-1', 'data-id': r.t.id, onclick: function () { showCard(r.t.id); } },
        h('span', { class: 'gl-item-t' }, h('bdi', null, r.t.term)), h('span', { class: 'gl-item-s' }, plain(r.t.short)));
      first = false;
      listEl.appendChild(h('li', null, b));
    });
  }
  function items() { return Array.prototype.slice.call(listEl.querySelectorAll('.gl-item')); }
  function listKeys(e) {
    var its = items(), i = its.indexOf(document.activeElement), n = -2;
    if (e.key === 'ArrowDown') n = i + 1; else if (e.key === 'ArrowUp') n = i - 1; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = its.length - 1; else return;
    e.preventDefault();
    if (n < 0 && e.key === 'ArrowUp') { searchEl.focus(); return; }
    if (n >= its.length) n = its.length - 1;
    its.forEach(function (b) { b.tabIndex = -1; });
    its[n].tabIndex = 0; its[n].focus();
  }
  function panelKeys(e) {
    if (e.key === 'ArrowDown' && e.target === searchEl) {
      var its = items(); if (its.length) { e.preventDefault(); its[0].focus(); }
      return;
    }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(panel.querySelectorAll('button, input, [tabindex="0"]'), function (el) {
      return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0;
    });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function codeBlock(text) { return h('pre', { class: 'gl-code', dir: 'ltr' }, h('code', null, text)); }
  function guideLink() { return h('button', { type: 'button', class: 'gl-link', onclick: function () { showGuide('functions'); } }, svg(ICO_BOOK, 'gl-ico'), 'למדריך המלא על פעולות'); }
  function backBtn() { return h('button', { type: 'button', class: 'gl-back', onclick: showHome }, svg(ICO_BACK), 'חזרה לרשימה'); }
  function setView(el) {
    while (cardEl.firstChild) cardEl.removeChild(cardEl.firstChild);
    cardEl.appendChild(el);
    homeEl.hidden = true; cardEl.hidden = false;
    panel.querySelector('.gl-scroll').scrollTop = 0;
  }
  function showHome() {
    cardEl.hidden = true; homeEl.hidden = false;
    var cur = listEl.querySelector('.gl-item[data-id="' + (cardEl.getAttribute('data-last') || '') + '"]');
    (cur || searchEl).focus();
  }
  function showCard(id) {
    var t = byId[id]; if (!t) return;
    cardEl.setAttribute('data-last', id);
    var card = h('article', { class: 'gl-card' }, backBtn(),
      h('div', { class: 'gl-card-h' }, h('h3', { class: 'gl-card-t' }, h('bdi', null, t.term)), h('span', { class: 'gl-badge' }, t.cat)));
    if (t.aka && t.aka.length) card.appendChild(h('div', { class: 'gl-aka', 'aria-label': 'נקרא גם' }, t.aka.map(function (a) { return h('span', { class: 'gl-aka-i', dir: 'auto' }, a); })));
    card.appendChild(h('p', { class: 'gl-short' }, rich(t.short)));
    if (t.more) card.appendChild(h('p', { class: 'gl-more' }, rich(t.more)));
    if (t.example) card.appendChild(codeBlock(t.example));
    if (t.result) card.appendChild(h('p', { class: 'gl-result' }, h('strong', null, 'התוצאה: '), rich(t.result)));
    if (t.guide && guideById[t.guide]) card.appendChild(guideLink());
    setView(card);
    var b = card.querySelector('.gl-back'); if (b) b.focus();
  }
  function showGuide(id) {
    var g = guideById[id]; if (!g) return;
    cardEl.setAttribute('data-last', '');
    var card = h('article', { class: 'gl-card gl-guide-card' }, backBtn(), h('h3', { class: 'gl-card-t' }, g.title), h('p', { class: 'gl-short' }, rich(g.intro)));
    (g.sections || []).forEach(function (s) {
      var sec = h('section', { class: 'gl-sec' }, h('h4', null, s.h));
      if (s.p) sec.appendChild(h('p', null, rich(s.p)));
      (s.items || []).forEach(function (it) { sec.appendChild(h('div', { class: 'gl-part' }, codeBlock(it.code), h('p', { class: 'gl-label' }, rich(it.label)))); });
      if (s.list) sec.appendChild(h('ul', { class: 'gl-ul' }, s.list.map(function (x) { return h('li', null, rich(x)); })));
      card.appendChild(sec);
    });
    setView(card);
    var b = card.querySelector('.gl-back'); if (b) b.focus();
  }

  function openPanel(id) {
    if (!loaded) { pendingOpen = id || ''; return; }
    if (isLoginScreen()) return;
    closePop();
    if (!panel) buildPanel();
    if (!panelOpen) opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : fab;
    if (!panelOpen) { query = ''; searchEl.value = ''; setCat(''); }
    panelOpen = true;
    panel.hidden = false;
    backdrop.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    switchEl.checked = linkOn;
    if (id && guideById[id]) showGuide(id);
    else if (id && byId[id]) showCard(id);
    else { cardEl.hidden = true; homeEl.hidden = false; searchEl.focus(); }
  }
  function closePanel(noFocus) {
    if (!panel || !panelOpen) return;
    panelOpen = false;
    panel.hidden = true; backdrop.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    var back = opener && opener.isConnected && !opener.hidden ? opener : fab;
    opener = null;
    if (!noFocus && back && !fab.hidden) { try { back.focus(); } catch (e) { /* ignore */ } }
  }

  /* ---------------------------------------------------------------- linking on/off */
  function setLinking(on) {
    linkOn = !!on; writePref(linkOn);
    if (switchEl) switchEl.checked = linkOn;
    closePop();
    if (!linkOn) { unwrapAll(); }
    else { processed = new WeakSet(); scheduleScan(document.getElementById('main') || document.body); }
  }
  function unwrapAll() {
    stopObserver();
    Array.prototype.slice.call(document.querySelectorAll('button.gl-term')).forEach(function (b) {
      var p = b.parentNode; if (!p) return;
      p.replaceChild(document.createTextNode(b.textContent), b);
      p.normalize();
    });
    Array.prototype.slice.call(document.querySelectorAll('span.gl-run')).forEach(function (r) {
      var p = r.parentNode; if (!p) return;
      p.replaceChild(document.createTextNode(r.textContent), r); p.normalize();
    });
    queue = []; dirty.clear();
    startObserver();
  }

  /* ---------------------------------------------------------------- auto-linking */
  var processed = new WeakSet(), queue = [], dirty = new Set(), seenMap = new WeakMap(), scheduled = false, obs = null;
  var BUDGET = 40;

  function scheduleScan(root) { if (root) dirty.add(root); schedule(); }
  function schedule() { if (scheduled) return; scheduled = true; requestAnimationFrame(run); }
  function startObserver() {
    if (!window.MutationObserver) return;
    if (!obs) obs = new MutationObserver(function (recs) { collect(recs); schedule(); });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function stopObserver() { if (obs) { collect(obs.takeRecords()); obs.disconnect(); } }
  function collect(recs) {
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (r.type === 'characterData') {
        if (!inOwn(r.target) && r.target.parentNode) dirty.add(r.target.parentNode);
      } else if (r.addedNodes.length && !inOwn(r.target)) {
        for (var j = 0; j < r.addedNodes.length; j++) {
          var n = r.addedNodes[j];
          if (n.nodeType === 1) { if (!inOwn(n)) dirty.add(n); }
          else if (n.nodeType === 3 && r.target.nodeType === 1) dirty.add(r.target);
        }
      }
    }
  }
  function run() {
    scheduled = false;
    updateFab();
    if (!linkOn || !linkRe) { dirty.clear(); queue = []; return; }
    collect(obs ? obs.takeRecords() : []);
    if (obs) obs.disconnect();
    try { work(); } catch (e) { /* never break the app */ }
    startObserver();
    if (queue.length || dirty.size) schedule();
  }
  function gather(root) {
    if (!root.isConnected) return;
    if (root.nodeType === 1 && root.closest(EXCL)) return;
    if (root.nodeType === 1 && inOwn(root)) return;
    if (root.nodeType === 3) { queue.push(root); return; }
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) return n.matches(EXCL) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        return (n.nodeValue.length >= 3 && !processed.has(n)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var n; while ((n = tw.nextNode())) queue.push(n);
  }
  function work() {
    if (!queue.length && dirty.size) {
      var roots = Array.from(dirty); dirty.clear();
      roots = roots.filter(function (r) { return r.isConnected && !roots.some(function (o) { return o !== r && o.nodeType === 1 && o.contains(r); }); });
      seenMap = new WeakMap();
      roots.forEach(gather);
    }
    var t0 = performance.now(), n = 0;
    while (queue.length && n < BUDGET && performance.now() - t0 < 8) { n++; linkNode(queue.shift()); }
  }
  function containerOf(node) {
    var p = node.parentElement; if (!p) return null;
    return p.closest(CONT) || p.closest('p, li, div, section, article, aside') || p;
  }
  function seenFor(c) {
    var s = seenMap.get(c);
    if (!s) {
      s = {};
      Array.prototype.forEach.call(c.querySelectorAll('button.gl-term'), function (b) { s[b.getAttribute('data-term')] = 1; });
      seenMap.set(c, s);
    }
    return s;
  }
  function linkNode(node) {
    if (!node.isConnected || processed.has(node)) return;
    processed.add(node);
    var p = node.parentElement;
    if (!p || p.closest(EXCL)) return;
    var text = node.nodeValue;
    if (text.length < 3) return;
    var cont = null, seen = null, segs = [], last = 0, m;
    linkRe.lastIndex = 0;
    while ((m = linkRe.exec(text))) {
      var pre = m[1], form = m[2].replace(/\s+/g, ' ');
      var id = formToId[form];
      if (!id) continue;
      if (pre.indexOf('מ') >= 0 && NOMEM[form]) continue;
      if (id === 'method' && /^\s+(חשבון|חשבוניות)/.test(text.slice(m.index + m[0].length))) continue;
      if (!cont) { cont = containerOf(node); if (!cont) return; seen = seenFor(cont); }
      if (seen[id]) continue;
      seen[id] = 1;
      var start = m.index + pre.length;
      segs.push({ s: start, e: start + m[2].length, id: id });
    }
    if (!segs.length) return;
    var frag = document.createDocumentFragment(), fresh = [];
    segs.forEach(function (sg) {
      if (sg.s > last) { var tn = document.createTextNode(text.slice(last, sg.s)); fresh.push(tn); frag.appendChild(tn); }
      frag.appendChild(h('button', { type: 'button', class: 'gl-term', 'data-term': sg.id }, text.slice(sg.s, sg.e)));
      last = sg.e;
    });
    if (last < text.length) { var rest = document.createTextNode(text.slice(last)); fresh.push(rest); frag.appendChild(rest); }
    fresh.forEach(function (t) { processed.add(t); });
    var disp = '';
    try { disp = getComputedStyle(p).display; } catch (e) { /* ignore */ }
    if (/flex|grid/.test(disp)) { // keep the text one flex/grid item, so splitting it causes no layout shift
      var run = document.createElement('span'); run.className = 'gl-run'; run.appendChild(frag); p.replaceChild(run, node);
    } else p.replaceChild(frag, node);
  }

  /* ---------------------------------------------------------------- popover on a term */
  var pop = null, popBtn = null, pinned = false, showT = null, hideT = null, popScroll = 0, popSeq = 0;

  function closePop(refocus) {
    clearTimeout(showT); clearTimeout(hideT);
    if (!pop) return;
    var b = popBtn, wasPinned = pinned;
    if (b) { b.removeAttribute('aria-describedby'); b.setAttribute('aria-expanded', 'false'); }
    if (pop.parentNode) pop.parentNode.removeChild(pop);
    pop = null; popBtn = null; pinned = false;
    if (refocus && wasPinned && b && b.isConnected) { try { b.focus(); } catch (e) { /* ignore */ } }
  }
  function showPop(btn, pin) {
    var t = byId[btn.getAttribute('data-term')]; if (!t) return;
    clearTimeout(showT); clearTimeout(hideT);
    if (pop && popBtn === btn && pinned === !!pin) return;
    closePop();
    var id = 'gl-pop-' + (++popSeq);
    pop = h('div', { class: 'gl-pop', id: id, role: pin ? 'dialog' : 'tooltip', 'aria-label': pin ? t.term : null },
      h('div', { class: 'gl-pop-t' }, h('bdi', null, t.term), h('span', { class: 'gl-badge' }, t.cat)),
      h('p', { class: 'gl-pop-s' }, rich(t.short)));
    if (t.example) pop.appendChild(codeBlock(t.example));
    if (t.result) pop.appendChild(h('p', { class: 'gl-pop-r' }, h('strong', null, 'התוצאה: '), rich(t.result)));
    if (pin) pop.appendChild(h('button', { type: 'button', class: 'gl-pop-more', onclick: function () { var tid = t.id; closePop(); openPanel(tid); } }, 'עוד במילון'));
    pop.addEventListener('mouseenter', function () { clearTimeout(hideT); });
    pop.addEventListener('mouseleave', function () { if (!pinned) scheduleHide(); });
    document.body.appendChild(pop);
    popBtn = btn; pinned = !!pin; popScroll = window.pageYOffset;
    btn.setAttribute('aria-describedby', id); btn.setAttribute('aria-expanded', pin ? 'true' : 'false');
    placePop();
  }
  function placePop() {
    if (!pop || !popBtn || !popBtn.isConnected) { closePop(); return; }
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var rects = popBtn.getClientRects(), r = rects.length ? rects[0] : popBtn.getBoundingClientRect();
    var w = pop.offsetWidth, hh = pop.offsetHeight, gap = 8, m = 8;
    var left = r.left + r.width / 2 - w / 2;
    left = Math.max(m, Math.min(left, vw - w - m));
    var top = r.bottom + gap;
    if (top + hh > vh - m) {
      var above = r.top - gap - hh;
      top = above >= m ? above : Math.max(m, Math.min(top, vh - hh - m));
    }
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
  }
  function scheduleHide() { clearTimeout(hideT); hideT = setTimeout(function () { if (!pinned) closePop(); }, 220); }
  function termOf(e) { return e.target && e.target.closest ? e.target.closest('button.gl-term') : null; }

  document.addEventListener('mouseover', function (e) {
    var b = termOf(e);
    if (b) {
      clearTimeout(hideT);
      if (pinned && popBtn !== b) return;
      if (popBtn === b) return;
      clearTimeout(showT);
      showT = setTimeout(function () { if (!pinned) showPop(b, false); }, 250);
    }
  });
  document.addEventListener('mouseout', function (e) {
    var b = termOf(e);
    if (b) {
      clearTimeout(showT);
      var to = e.relatedTarget;
      if (to && (b.contains(to) || (pop && pop.contains(to)))) return;
      if (!pinned) scheduleHide();
    }
  });
  function awayCheck(e, on) {
    // while a student types in the program console (bottom-left), the button steps aside so it never covers the input
    if (fab && e.target && e.target.closest && e.target.closest('.console, .con-in')) fab.classList.toggle('gl-away', on);
  }
  document.addEventListener('focusin', function (e) {
    awayCheck(e, true);
    var b = termOf(e);
    if (b && !pinned) showPop(b, false);
    else if (!b && pop && !pinned && !(pop.contains(e.target))) closePop();
  });
  document.addEventListener('focusout', function (e) {
    awayCheck(e, false);
    if (!pinned && termOf(e) && !(e.relatedTarget && pop && pop.contains(e.relatedTarget))) scheduleHide();
  });
  document.addEventListener('click', function (e) {
    var b = termOf(e);
    if (!b) return;
    e.stopPropagation(); e.preventDefault();
    clearTimeout(showT);
    if (pop && popBtn === b && pinned) closePop(); else showPop(b, true);
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (pop) { e.preventDefault(); closePop(true); }
    else if (panelOpen) { e.preventDefault(); closePanel(); }
  });
  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    if (pop && !pop.contains(t) && !(popBtn && popBtn.contains(t))) closePop();
    if (panelOpen && panel && !panel.contains(t) && !(fab && fab.contains(t)) && !(pop && pop.contains(t))) {
      // on phones the backdrop handles it; on desktop close when clicking outside
      closePanel(true);
    }
  }, true);
  var rafScroll = 0;
  window.addEventListener('scroll', function () {
    if (!pop) return;
    if (Math.abs(window.pageYOffset - popScroll) > 140) { closePop(); return; }
    if (!rafScroll) rafScroll = requestAnimationFrame(function () { rafScroll = 0; placePop(); });
  }, true);
  window.addEventListener('resize', function () { if (pop) placePop(); });
  window.addEventListener('hashchange', function () { closePop(); schedule(); });

  /* ---------------------------------------------------------------- public API + start */
  window.CWGlossary = { open: function (id) { openPanel(id); }, close: function () { closePop(); closePanel(); }, terms: terms };

  function start() {
    if (!window.fetch) return;
    fetch(DATA_URL, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); })
      .then(init).catch(function () { /* silent */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
