/* Code workshops - student front-end. Vanilla JS, no build step.
 * Sections: utils, icons, storage/state, scoring, shared widgets (sortable lists), views, stages, code stage, boot. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ utils */
  var CFG = window.CW_CONFIG || {};
  var STAGES = [
    { key: 'understand', label: 'הבנה', long: 'הבנת השאלה', icon: 'eye' },
    { key: 'plan', label: 'תכנון', long: 'תכנון הפתרון', icon: 'map' },
    { key: 'tests', label: 'בדיקות', long: 'חיזוי ובדיקות', icon: 'flask' },
    { key: 'skeleton', label: 'שלד', long: 'שלד האלגוריתם', icon: 'blocks' },
    { key: 'code', label: 'קוד', long: 'כתיבת הקוד', icon: 'code' },
    { key: 'reflect', label: 'רפלקציה', long: 'רפלקציה והגשה', icon: 'flag' }
  ];
  var WORKSHOP_IDS = ['w1', 'w2', 'w3'];
  var MODE_LABEL = { parsons: 'סידור שורות', fill: 'השלמת חסר', blank: 'דף ריק' };

  function qs(sel, root) { return (root || document).querySelector(sel); }

  /* Hyperscript helper. Strings become text nodes (never HTML), so content is always escaped. */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') { for (var sk in v) { if (sk.slice(0, 2) === '--') el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; } }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), safe(v));
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    if (c.nodeType) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /* Wrap handlers so one failure shows a friendly toast instead of breaking the page */
  function safe(fn) {
    return function () {
      try {
        var r = fn.apply(this, arguments);
        if (r && typeof r.catch === 'function') r.catch(reportError);
        return r;
      } catch (e) { reportError(e); }
    };
  }
  function reportError(e) {
    try { console.error(e); } catch (x) { /* noop */ }
    toast('אירעה תקלה קטנה. העבודה שלכם שמורה - אפשר להמשיך או לרענן את הדף.', 'err');
  }

  var toastTimer = null;
  function toast(msg, kind) {
    var host = qs('#toast');
    if (!host) return;
    clear(host).appendChild(h('div', { class: 'toast ' + (kind || '') }, msg));
    host.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { host.classList.remove('on'); }, 4200);
  }

  function debounce(fn, ms) {
    var t = null;
    var d = function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { t = null; fn.apply(c, a); }, ms); };
    d.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
    return d;
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function sameArr(a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }
  function lines(s) { return String(s == null ? '' : s).replace(/\r/g, '').split('\n'); }
  function reducedMotion() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ------------------------------------------------------------------ icons (inline SVG, stroke style) */
  var ICONS = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    next: '<path d="M14 6l-6 6 6 6"/>',
    prev: '<path d="M10 6l6 6-6 6"/>',
    first: '<path d="M17 6l-6 6 6 6M7 6v12"/>',
    run: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
    test: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 001.8 3h10.4a2 2 0 001.8-3l-5-9V3"/><path d="M8 15h8"/>',
    step: '<circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2" fill="currentColor"/><path d="M8 12h2M14 12h2"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
    reset: '<path d="M4 12a8 8 0 108-8H8M8 4L5 7l3 3"/>',
    up: '<path d="M6 14l6-6 6 6"/>',
    down: '<path d="M6 10l6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
    grip: '<circle cx="9" cy="6" r="1.4" fill="currentColor"/><circle cx="15" cy="6" r="1.4" fill="currentColor"/><circle cx="9" cy="12" r="1.4" fill="currentColor"/><circle cx="15" cy="12" r="1.4" fill="currentColor"/><circle cx="9" cy="18" r="1.4" fill="currentColor"/><circle cx="15" cy="18" r="1.4" fill="currentColor"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 001.8 3h10.4a2 2 0 001.8-3l-5-9V3"/>',
    blocks: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="8" y="13" width="8" height="8" rx="1.5"/>',
    code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/>',
    swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    home: '<path d="M4 11l8-7 8 7M6 10v10h12V10"/>',
    arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    cloud: '<path d="M7 18a4 4 0 010-8 5.5 5.5 0 0110.6 1.3A3.4 3.4 0 0117 18z"/>',
    cloudOff: '<path d="M7 18a4 4 0 010-8 5.5 5.5 0 0110.6 1.3A3.4 3.4 0 0117 18zM3 3l18 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2M12 17v.5"/>',
    star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.3l1.1-6.2L3 9.7l6.2-.9z"/>',
    book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 012-2h13"/>',
    cactus: '<path d="M12 21V6a2 2 0 014 0v6M12 21V9a2 2 0 00-4 0v4a2 2 0 002 2h2M8 21h8"/>'
  };
  function ico(name, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ico ' + (cls || ''));
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.innerHTML = ICONS[name] || ''; // static trusted strings only
    return s;
  }
  function btn(label, opts) {
    opts = opts || {};
    var b = h('button', { type: 'button', class: 'btn ' + (opts.cls || ''), onClick: opts.onClick, disabled: opts.disabled, title: opts.title, 'aria-label': opts.aria },
      opts.icon ? ico(opts.icon) : null, label ? h('span', null, label) : null);
    return b;
  }

  /* ------------------------------------------------------------------ storage + state */
  var Store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } }
  };
  var PARAMS = new URLSearchParams(location.search);
  var DEMO = PARAMS.get('demo') === '1';
  var DEMO_STUDENT = { name: 'הדגמה', phone: '0500000000' };

  var S = {
    student: null,          // {name, phone}
    workshops: {},          // id -> workshop json | {error}
    tasks: {},              // taskId -> task state (cache of localStorage)
    dispose: [],            // cleanup callbacks of the current view
    activeTask: null        // {ws, task} while a task view is shown
  };

  function normalizePhone(raw) {
    var s = String(raw || '').replace(/[\s\-.()]/g, '');
    if (/^\+?972/.test(s)) s = '0' + s.replace(/^\+?972/, '');
    return s;
  }
  function validateStudent(name, phoneRaw) {
    var errs = {};
    var n = String(name || '').replace(/\s+/g, ' ').trim();
    var words = n.split(' ').filter(function (w) { return w.length >= 2; });
    if (!n) errs.name = 'נא לכתוב שם מלא.';
    else if (words.length < 2) errs.name = 'נא לכתוב שם פרטי ושם משפחה (למשל: דנה כהן).';
    else if (!/[A-Za-z֐-׿]/.test(n)) errs.name = 'השם צריך להכיל אותיות.';
    var p = normalizePhone(phoneRaw);
    if (!phoneRaw || !String(phoneRaw).trim()) errs.phone = 'נא לכתוב מספר טלפון נייד.';
    else if (!/^\d+$/.test(p)) errs.phone = 'מספר הטלפון צריך להכיל ספרות בלבד.';
    else if (!/^05\d{8}$/.test(p)) errs.phone = 'מספר נייד ישראלי מתחיל ב-05 ומכיל 10 ספרות (למשל 0501234567).';
    return { ok: !errs.name && !errs.phone, errs: errs, name: n, phone: p };
  }

  function tkey(taskId) { return 'cw:t:' + S.student.phone + ':' + taskId; }
  function newTaskState() {
    return { v: 1, done: {}, a: { understand: {}, plan: {}, tests: {}, skeleton: {}, code: {}, reflect: {} },
      hints: 0, runs: 0, testRuns: 0, best: 0, total: 0, activeSec: 0, submitted: false, score: null,
      forced: false, started: Date.now(), last: Date.now() };
  }
  function getTask(taskId) {
    if (S.tasks[taskId] && S.tasks[taskId]._phone === S.student.phone) return S.tasks[taskId];
    var t = Store.get(tkey(taskId), null) || newTaskState();
    // fill any missing keys for forward compatibility
    var base = newTaskState();
    Object.keys(base).forEach(function (k) { if (t[k] === undefined) t[k] = base[k]; });
    Object.keys(base.a).forEach(function (k) { if (!t.a[k]) t.a[k] = {}; });
    Object.defineProperty(t, '_phone', { value: S.student.phone, enumerable: false, writable: true });
    S.tasks[taskId] = t;
    return t;
  }
  var pendingSaves = {};
  function saveTaskNow(taskId) {
    var t = S.tasks[taskId]; if (!t || !S.student) return;
    t.last = Date.now();
    if (!Store.set(tkey(taskId), t)) toast('אין מקום לשמור בדפדפן - נסו לרענן ולהמשיך.', 'err');
    delete pendingSaves[taskId];
  }
  var saveDebounced = {};
  function saveTask(taskId, immediate) {
    pendingSaves[taskId] = true;
    if (immediate) { saveTaskNow(taskId); return; }
    if (!saveDebounced[taskId]) saveDebounced[taskId] = debounce(function () { saveTaskNow(taskId); }, 450);
    saveDebounced[taskId]();
  }
  function flushSaves() { Object.keys(pendingSaves).forEach(saveTaskNow); }
  window.addEventListener('pagehide', flushSaves);
  document.addEventListener('visibilitychange', function () { if (document.hidden) flushSaves(); });

  function maxStageIdx(T) {
    for (var i = 0; i < STAGES.length; i++) if (!T.done[STAGES[i].key]) return i;
    return STAGES.length - 1;
  }
  function doneCount(T) { return STAGES.filter(function (s) { return T.done[s.key]; }).length; }
  function hasLocalProgress(phone) {
    try {
      var pre = 'cw:t:' + phone + ':';
      for (var i = 0; i < localStorage.length; i++) if (localStorage.key(i).indexOf(pre) === 0) return true;
    } catch (e) { /* noop */ }
    return false;
  }

  /* ------------------------------------------------------------------ text matching helpers */
  function normLine(s) { return String(s).trim().replace(/\s+/g, ' ').replace(/\.$/, ''); }
  function nonEmptyLines(s) { return lines(s).map(normLine).filter(function (x) { return x.length; }); }
  /* Comparison for the "predict the output" stage: delegates to CSRun.matchOutput (suffix match, word boundary). */
  function predictionMatches(prediction, realOutput) {
    var real = nonEmptyLines(realOutput), pred = nonEmptyLines(prediction);
    if (!real.length) return pred.length === 0;
    if (!pred.length) return false;
    if (window.CSRun && typeof CSRun.matchOutput === 'function') {
      // (a) the student wrote full lines: every real line must be found in the prediction
      if (CSRun.matchOutput(pred.join('\n'), real, 'ordered-contains').pass) return true;
      // (b) the student wrote only the values (one per output line): their lines must be suffixes of the real lines
      return pred.length === real.length && CSRun.matchOutput(real.join('\n'), pred, 'ordered-contains').pass;
    }
    return pred.length === real.length && pred.every(function (l, i) { return l === real[i]; });
  }

  /* ------------------------------------------------------------------ scoring (SPEC section 4) */
  function computeScore(task, T) {
    var st = task.stages || {};
    var ua = T.a.understand || {};
    var qs_ = (st.understand && st.understand.questions) || [];
    var mcPts = 0, textOk = false, textQs = 0, textGood = 0;
    qs_.forEach(function (q) {
      var r = ua[q.id] || {};
      if (q.type === 'mc') { if (r.first === true) mcPts += 3; }
      else { textQs++; if ((r.text || '').trim().length >= (q.minChars || 10)) textGood++; }
    });
    textOk = textQs > 0 && textGood === textQs;
    var understand = Math.min(8, mcPts + (textOk ? 2 : 0));
    var pf = (st.plan && st.plan.fields) || [];
    var pa = T.a.plan || {};
    var filled = pf.filter(function (f) { return (pa[f.id] || '').trim().length >= 5; }).length;
    var plan = pf.length ? 7 * filled / pf.length : 0;
    var ta = T.a.tests || {};
    var pc = ta.predCorrect || [];
    var pred = pc.length ? 5 * pc.filter(Boolean).length / pc.length : 0;
    var sk = T.a.skeleton || {};
    var skel = sk.correct ? (sk.firstTry ? 5 : 3) : 0;
    var planning = Math.round(understand) + Math.round(plan) + Math.round(pred) + skel;
    var tests = T.total ? Math.round(60 * T.best / T.total) : 0;
    var rq = (st.reflect && st.reflect.questions) || [];
    var ra = T.a.reflect || {};
    var good = rq.filter(function (q) { return (ra[q.id] || '').trim().length >= (q.minChars || 10); }).length;
    var reflection = rq.length ? Math.round(15 * good / rq.length) : 0;
    var hintPenalty = Math.min(9, 3 * Math.max(0, T.hints - 1));
    var total = Math.max(0, Math.min(100, tests + planning + reflection - hintPenalty));
    return { total: total, tests: tests, planning: planning, reflection: reflection, hintPenalty: hintPenalty,
      detail: { understand: Math.round(understand), plan: Math.round(plan), predictions: Math.round(pred), skeleton: skel } };
  }

  /* ------------------------------------------------------------------ SortBoard: shared drag/drop + buttons list widget */
  /* opts: { lists:[{key,title,cls,empty,reorder,mono,numbered,action:{to,label,icon}}], items:{id:{text,locked}},
   *         state:{key:[ids]}, onChange(state), onSelect(id) } */
  function SortBoard(opts) {
    var self = { el: h('div', { class: 'sortboard' }), state: opts.state, markers: {}, readOnly: false, selected: null, focus: null };
    var dragId = null;

    function locate(id) {
      for (var i = 0; i < opts.lists.length; i++) {
        var k = opts.lists[i].key, ix = self.state[k].indexOf(id);
        if (ix >= 0) return { key: k, index: ix };
      }
      return null;
    }
    function move(id, toKey, toIndex) {
      var loc = locate(id); if (!loc) return;
      var arr = self.state[loc.key]; arr.splice(loc.index, 1);
      var dest = self.state[toKey];
      if (toIndex == null || toIndex > dest.length) toIndex = dest.length;
      if (loc.key === toKey && loc.index < toIndex) toIndex--;
      dest.splice(Math.max(0, toIndex), 0, id);
      changed();
    }
    function changed() { if (opts.onChange) opts.onChange(self.state); self.render(); }

    function itemEl(L, id, idx) {
      var it = opts.items[id];
      var locked = !!it.locked;
      var arr = self.state[L.key];
      var mk = self.markers[id];
      var li = h('li', { class: 'sitem' + (locked ? ' locked' : '') + (mk ? ' ' + mk : '') + (self.selected === id ? ' sel' : ''),
        'data-id': id, tabindex: locked || self.readOnly ? null : '0',
        draggable: (!locked && !self.readOnly) ? 'true' : null });
      if (L.numbered) li.appendChild(h('span', { class: 'ln' }, String(idx + 1)));
      else li.appendChild(h('span', { class: 'grip' }, locked ? ico('lock') : (self.readOnly ? null : ico('grip'))));
      li.appendChild(h('span', { class: 'stext' + (L.mono ? ' mono' : ''), dir: L.mono ? 'ltr' : null }, it.text === '' ? ' ' : it.text));
      if (!locked && !self.readOnly) {
        var acts = h('span', { class: 'sacts' });
        if (L.reorder) {
          acts.appendChild(h('button', { type: 'button', class: 'ibtn', 'data-act': 'up', title: 'הזזה למעלה', 'aria-label': 'הזזה למעלה', disabled: idx === 0,
            onClick: function (e) { e.stopPropagation(); self.focus = { id: id, act: 'up' }; move(id, L.key, idx - 1); } }, ico('up')));
          acts.appendChild(h('button', { type: 'button', class: 'ibtn', 'data-act': 'down', title: 'הזזה למטה', 'aria-label': 'הזזה למטה', disabled: idx === arr.length - 1,
            onClick: function (e) { e.stopPropagation(); self.focus = { id: id, act: 'down' }; move(id, L.key, idx + 2); } }, ico('down')));
        }
        if (L.action) {
          acts.appendChild(h('button', { type: 'button', class: 'ibtn act', 'data-act': 'move', title: L.action.label, 'aria-label': L.action.label,
            onClick: function (e) {
              e.stopPropagation();
              self.focus = null;
              var ix = L.action.insertIndex ? L.action.insertIndex(id) : null;
              move(id, L.action.to, ix);
              if (opts.onSelect && L.action.select) { self.selected = id; self.render(); }
            } }, ico(L.action.icon || 'plus'), h('span', { class: 'ilabel' }, L.action.short || '')));
        }
        li.appendChild(acts);
        li.addEventListener('keydown', function (e) {
          if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && L.reorder) {
            e.preventDefault();
            self.focus = { id: id, act: null };
            move(id, L.key, e.key === 'ArrowUp' ? idx - 1 : idx + 2);
          }
        });
        li.addEventListener('click', function () { if (opts.onSelect) { self.selected = id; opts.onSelect(id); self.render(); } });
        li.addEventListener('dragstart', function (e) {
          dragId = id; li.classList.add('dragging');
          try { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; } catch (x) { /* noop */ }
        });
        li.addEventListener('dragend', function () { dragId = null; li.classList.remove('dragging'); clearDrop(); });
      }
      if (locked && opts.onSelect && !self.readOnly && L.selectable) {
        // Locked lines can still be chosen as the insertion point ("add after this line")
        li.setAttribute('tabindex', '0'); li.setAttribute('title', 'לחצו כדי להוסיף שורות אחרי השורה הזו');
        li.classList.add('pickable');
        var pick = function () { self.selected = id; opts.onSelect(id); self.render(); };
        li.addEventListener('click', pick);
        li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.focus = { id: id, act: null }; pick(); } });
      }
      li.addEventListener('dragover', function (e) {
        if (!dragId || self.readOnly) return;
        e.preventDefault(); e.stopPropagation();
        var r = li.getBoundingClientRect();
        var after = (e.clientY - r.top) > r.height / 2;
        clearDrop(); li.classList.add(after ? 'drop-after' : 'drop-before');
      });
      li.addEventListener('drop', function (e) {
        if (!dragId || self.readOnly) return;
        e.preventDefault(); e.stopPropagation();
        var r = li.getBoundingClientRect();
        var after = (e.clientY - r.top) > r.height / 2;
        var id0 = dragId; dragId = null; clearDrop();
        if (id0 !== id) move(id0, L.key, idx + (after ? 1 : 0));
      });
      return li;
    }
    function clearDrop() {
      self.el.querySelectorAll('.drop-before,.drop-after,.drop-end').forEach(function (n) { n.classList.remove('drop-before', 'drop-after', 'drop-end'); });
    }

    self.render = function () {
      clear(self.el);
      opts.lists.forEach(function (L) {
        var ul = h('ul', { class: 'slist ' + (L.cls || ''), 'data-list': L.key, 'aria-label': L.title });
        var arr = self.state[L.key];
        arr.forEach(function (id, i) { ul.appendChild(itemEl(L, id, i)); });
        if (!arr.length) ul.appendChild(h('li', { class: 'sempty' }, L.empty || ''));
        ul.addEventListener('dragover', function (e) {
          if (!dragId || self.readOnly) return; e.preventDefault(); clearDrop(); ul.classList.add('drop-end');
        });
        ul.addEventListener('dragleave', function (e) { if (e.target === ul) ul.classList.remove('drop-end'); });
        ul.addEventListener('drop', function (e) {
          if (!dragId || self.readOnly) return; e.preventDefault();
          var id0 = dragId; dragId = null; clearDrop(); move(id0, L.key, null);
        });
        self.el.appendChild(h('section', { class: 'scol ' + (L.cls || '') },
          h('h4', { class: 'scol-title' }, L.title, h('span', { class: 'count' }, String(arr.length))), ul));
      });
      if (self.focus) {
        var f = self.focus; self.focus = null;
        var li = self.el.querySelector('li[data-id="' + f.id + '"]');
        if (li) {
          var target = f.act ? li.querySelector('[data-act="' + f.act + '"]:not([disabled])') : null;
          (target || li).focus({ preventScroll: false });
        }
      }
    };
    self.setMarkers = function (m) { self.markers = m || {}; self.render(); };
    self.setReadOnly = function (b) { self.readOnly = !!b; self.render(); };
    self.getState = function () { return self.state; };
    self.render();
    return self;
  }

  /* ------------------------------------------------------------------ app shell: header, router */
  function renderHeader() {
    var host = qs('#hdr'); clear(host);
    var chip = h('span', { class: 'sync-chip', id: 'syncChip', role: 'status', 'aria-live': 'polite' });
    host.appendChild(h('div', { class: 'hdr-in' },
      h('a', { class: 'brand', href: '#home', 'aria-label': 'דף הבית' },
        h('span', { class: 'brand-mark' }, ico('cactus')),
        h('span', { class: 'brand-text' }, h('strong', null, 'סדנאות כתיבת קוד'), h('small', null, CFG.CLASS_LABEL || ''))),
      h('div', { class: 'hdr-end' },
        chip,
        S.student ? h('div', { class: 'who' },
          h('span', { class: 'who-name' }, ico('user'), h('span', null, S.student.name)),
          DEMO ? h('span', { class: 'demo-tag' }, 'הדגמה') :
            h('button', { type: 'button', class: 'linkbtn', onClick: switchStudent }, ico('swap'), h('span', null, 'החלפת תלמיד'))) : null)));
    updateChip(CWSync.status());
  }
  function updateChip(s) {
    var c = qs('#syncChip'); if (!c) return;
    var map = {
      saved: ['ok', 'cloud', 'נשמר'],
      pending: ['wait', 'cloud', 'ממתין לשליחה (' + s.n + ')'],
      offline: ['off', 'cloudOff', 'אין חיבור - הנתונים שמורים במחשב'],
      practice: ['prac', 'cloud', 'מצב תרגול - הנתונים נשמרים במחשב'],
      demo: ['prac', 'sun', 'מצב הדגמה - לא נשלחים נתונים']
    };
    var m = map[s.state] || map.saved;
    clear(c); c.className = 'sync-chip ' + m[0];
    c.appendChild(ico(m[1])); c.appendChild(h('span', null, m[2]));
  }

  function switchStudent() {
    flushSaves(); CWSync.flushAgg(); CWSync.flush(true);
    Store.del('cw:student'); S.student = null; S.tasks = {}; CWSync.setStudent(null);
    renderHeader(); location.hash = '#login'; route();
  }

  function cleanupView() {
    S.dispose.forEach(function (f) { try { f(); } catch (e) { /* noop */ } });
    S.dispose = []; S.activeTask = null;
  }

  function route() {
    flushSaves();
    cleanupView();
    var main = qs('#main'); clear(main);
    document.body.classList.remove('is-task');
    try {
      if (!S.student) { renderLogin(main); return; }
      var hash = (location.hash || '#home').replace(/^#/, '') || 'home';
      var m;
      if (hash === 'home' || hash === 'login') { renderHome(main); setTitle(''); return; }
      if ((m = /^(w\d+)$/.exec(hash))) { renderWorkshop(main, m[1]); return; }
      if ((m = /^(w\d+)t(\d+)(?:\/([a-z]+))?$/.exec(hash))) { renderTaskRoute(main, m[1], m[1] + 't' + m[2], m[3]); return; }
      location.hash = '#home';
    } catch (e) { showFatal(main, e); }
  }
  function setTitle(t) { document.title = (t ? t + ' | ' : '') + 'סדנאות כתיבת קוד'; }
  function showFatal(main, e) {
    try { console.error(e); } catch (x) { /* noop */ }
    clear(main).appendChild(h('div', { class: 'wrap' }, h('div', { class: 'errbox' },
      h('h2', null, 'משהו השתבש במסך הזה'),
      h('p', null, 'לא נורא - כל העבודה שלכם נשמרה במחשב. אפשר לחזור לדף הבית או לרענן את הדף.'),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#home' }, 'לדף הבית'),
        btn('רענון הדף', { onClick: function () { location.reload(); } })),
      h('details', null, h('summary', null, 'פרטים טכניים (למורה)'), h('pre', { dir: 'ltr' }, String(e && e.stack || e))))));
  }

  /* ------------------------------------------------------------------ login */
  function renderLogin(main) {
    setTitle('כניסה');
    var last = Store.get('cw:lastStudent', null) || {};
    var nameIn = h('input', { type: 'text', id: 'f-name', name: 'name', autocomplete: 'name', value: last.name || '', placeholder: 'למשל: דנה כהן', 'aria-describedby': 'e-name' });
    var phoneIn = h('input', { type: 'tel', id: 'f-phone', name: 'tel', autocomplete: 'tel', inputmode: 'tel', dir: 'ltr', value: last.phone || '', placeholder: '050-123-4567', 'aria-describedby': 'e-phone' });
    var eName = h('div', { class: 'ferr', id: 'e-name', 'aria-live': 'polite' });
    var ePhone = h('div', { class: 'ferr', id: 'e-phone', 'aria-live': 'polite' });
    var busy = h('div', { class: 'login-busy' });
    var form = h('form', { class: 'card login-card', novalidate: true, onSubmit: function (e) {
      e.preventDefault();
      var v = validateStudent(nameIn.value, phoneIn.value);
      eName.textContent = v.errs.name || ''; ePhone.textContent = v.errs.phone || '';
      nameIn.classList.toggle('bad', !!v.errs.name); phoneIn.classList.toggle('bad', !!v.errs.phone);
      if (!v.ok) { (v.errs.name ? nameIn : phoneIn).focus(); return; }
      doLogin(v.name, v.phone, busy, form);
    } },
      h('div', { class: 'login-ico' }, ico('cactus')),
      h('h1', null, 'ברוכים הבאים למעבדת הקוד'),
      h('p', { class: 'muted' }, 'כותבים שם מלא ומספר נייד כדי שהמורה יוכל לראות את ההתקדמות שלכם. אפשר לחזור ולהמשיך בכל זמן.'),
      h('div', { class: 'field' }, h('label', { for: 'f-name' }, 'שם מלא'), nameIn, eName),
      h('div', { class: 'field' }, h('label', { for: 'f-phone' }, 'טלפון נייד'), phoneIn, ePhone,
        h('div', { class: 'hint' }, 'אפשר עם רווחים או מקפים - נסדר אוטומטית.')),
      h('button', { type: 'submit', class: 'btn primary lg' }, ico('arrowL'), h('span', null, 'כניסה')),
      busy);
    main.appendChild(h('div', { class: 'login-wrap' }, form,
      h('p', { class: 'login-foot' }, 'גרסה ' + (CFG.VERSION || ''))));
    setTimeout(function () { (nameIn.value ? phoneIn : nameIn).focus(); }, 50);
  }

  function doLogin(name, phone, busyEl, form) {
    var student = { name: name, phone: phone };
    Store.set('cw:student', student); Store.set('cw:lastStudent', student);
    S.student = student; S.tasks = {};
    CWSync.setStudent(student);
    CWSync.event('login', { payload: { ua: navigator.userAgent.slice(0, 120), w: window.innerWidth, h: window.innerHeight, version: CFG.VERSION } });
    var needRestore = CWSync.hasEndpoint() && !hasLocalProgress(phone);
    var go = function () { renderHeader(); location.hash = '#home'; route(); };
    if (!needRestore) { go(); return; }
    clear(busyEl).appendChild(h('span', null, 'מחפשים התקדמות קודמת...'));
    form.classList.add('busy');
    CWSync.fetchProgress(name, phone).then(function (j) { if (j) restoreProgress(j); go(); }).catch(go);
  }

  function restoreProgress(j) {
    var tasks = j.tasks || {};
    Object.keys(tasks).forEach(function (id) {
      var r = tasks[id] || {};
      var T = newTaskState();
      Object.defineProperty(T, '_phone', { value: S.student.phone, enumerable: false, writable: true });
      var si = r.submitted ? STAGES.length : Math.max(0, Math.min(STAGES.length, r.stageIndex | 0));
      for (var i = 0; i < si && i < STAGES.length; i++) T.done[STAGES[i].key] = true;
      T.best = r.bestPassed | 0; T.total = r.testsTotal | 0;
      T.submitted = !!r.submitted; T.score = r.score != null ? { total: r.score, restored: true } : null;
      if (r.code) { T.a.code.text = r.code; T.a.code.restoredCode = r.code; }
      S.tasks[id] = T; saveTask(id, true);
    });
  }

  /* ------------------------------------------------------------------ media + progress dots */
  function media(src, cls) {
    var fig = h('div', { class: 'media ' + (cls || '') });
    if (src) {
      var img = h('img', { src: src, alt: '', loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', function () { img.remove(); });
      fig.appendChild(img);
    }
    return fig;
  }
  function dots(T, current) {
    var wrap = h('span', { class: 'dots', role: 'img', 'aria-label': 'התקדמות: ' + doneCount(T) + ' מתוך 6 שלבים' });
    STAGES.forEach(function (s, i) {
      wrap.appendChild(h('i', { class: 'dot' + (T.done[s.key] ? ' on' : (i === maxStageIdx(T) && doneCount(T) < 6 && current ? ' cur' : '')), title: s.label }));
    });
    return wrap;
  }

  /* ------------------------------------------------------------------ home */
  function renderHome(main) {
    var wrap = h('div', { class: 'wrap' });
    var hero = h('section', { class: 'hero' },
      media('img/hero.webp', 'hero-media'),
      h('div', { class: 'hero-copy' },
        h('span', { class: 'kicker' }, ico('sun'), 'מעבדת קוד בערבה'),
        h('h1', null, 'כותבים קוד שעובד - צעד אחר צעד'),
        h('p', null, 'שלוש סדנאות, תשע משימות. בכל משימה עוברים מסלול של שישה שלבים: מבינים, מתכננים, חוזים תוצאות, בונים שלד, כותבים ומסכמים. התוכנית רצה כאן בדפדפן, ואפשר אפילו לצפות בה רצה שורה אחרי שורה.')));
    wrap.appendChild(hero);

    var map = h('ol', { class: 'process', 'aria-label': 'ששת שלבי המשימה' });
    var desc = ['קוראים ומוודאים שהבנו מה מבקשים', 'מחליטים מה הקלט, העיבוד והפלט', 'חוזים מה התוכנית תדפיס לפני שמריצים', 'מסדרים את שלבי האלגוריתם', 'כותבים, מריצים ובודקים', 'מסכמים מה למדנו ומגישים'];
    STAGES.forEach(function (s, i) {
      map.appendChild(h('li', null, h('span', { class: 'pn' }, ico(s.icon)), h('b', null, (i + 1) + '. ' + s.label), h('span', null, desc[i])));
    });
    wrap.appendChild(h('section', { class: 'process-box' }, h('h2', null, 'מפת המשימה'), map));

    wrap.appendChild(h('h2', { class: 'sec-title' }, 'הסדנאות'));
    var grid = h('div', { class: 'ws-grid' });
    WORKSHOP_IDS.forEach(function (id) { grid.appendChild(workshopCard(id)); });
    wrap.appendChild(grid);
    main.appendChild(wrap);
  }

  function workshopCard(id) {
    var ws = S.workshops[id];
    var card = h('article', { class: 'ws-card ' + id });
    if (!ws) { card.appendChild(h('div', { class: 'ws-body' }, h('p', { class: 'muted' }, 'טוענים...'))); return card; }
    if (ws.error) {
      card.appendChild(media('', 'ws-media'));
      card.appendChild(h('div', { class: 'ws-body' }, h('h3', null, 'הסדנה לא נטענה'),
        h('p', { class: 'muted' }, 'בדקו חיבור לרשת ונסו שוב.'),
        btn('נסו שוב', { onClick: function () { loadWorkshops().then(route); } })));
      return card;
    }
    var link = h('a', { class: 'ws-link', href: '#' + id }, media(ws.image, 'ws-media'));
    card.appendChild(link);
    var body = h('div', { class: 'ws-body' },
      h('span', { class: 'badge' }, 'פרק ' + ws.chapter + (ws.minutes ? ' - כ-' + ws.minutes + ' דקות' : '')),
      h('h3', null, h('a', { href: '#' + id }, ws.title)),
      h('p', { class: 'muted' }, ws.subtitle || ''),
      h('ul', { class: 'chips' }, (ws.concepts || []).slice(0, 5).map(function (c) { return h('li', null, c); })));
    var list = h('ul', { class: 'ws-tasks' });
    (ws.tasks || []).forEach(function (t) {
      var T = getTask(t.id);
      list.appendChild(h('li', null, h('a', { href: '#' + t.id },
        h('span', { class: 'tt' }, t.title), dots(T, true),
        T.submitted ? h('span', { class: 'sc', title: 'ציון אוטומטי' }, (T.score && T.score.total != null ? T.score.total : '')) : null)));
    });
    body.appendChild(list);
    card.appendChild(body);
    return card;
  }

  /* ------------------------------------------------------------------ workshop page */
  function renderWorkshop(main, id) {
    var ws = S.workshops[id];
    if (!ws || ws.error) { main.appendChild(h('div', { class: 'wrap' }, h('div', { class: 'errbox' }, h('h2', null, 'הסדנה לא נמצאה'), h('a', { class: 'btn primary', href: '#home' }, 'לדף הבית')))); return; }
    setTitle(ws.title);
    var wrap = h('div', { class: 'wrap' });
    wrap.appendChild(crumbs([['דף הבית', '#home'], [ws.title]]));
    wrap.appendChild(h('section', { class: 'ws-hero ' + id },
      media(ws.image, 'ws-hero-media'),
      h('div', { class: 'ws-hero-copy' },
        h('span', { class: 'badge light' }, 'פרק ' + ws.chapter),
        h('h1', null, ws.title), h('p', { class: 'sub' }, ws.subtitle || ''),
        h('p', null, ws.intro || ''),
        h('ul', { class: 'chips light' }, (ws.concepts || []).map(function (c) { return h('li', null, c); })))));
    wrap.appendChild(h('p', { class: 'order-note' }, ico('info'), 'כל המשימות פתוחות, אבל מומלץ להתקדם לפי הסדר: מסידור שורות, דרך השלמת חסר, ועד כתיבה מאפס.'));
    var grid = h('div', { class: 'task-grid' });
    (ws.tasks || []).forEach(function (t, i) {
      var T = getTask(t.id);
      var n = doneCount(T);
      var label = T.submitted ? 'הוגש' : (n === 0 ? 'התחלה' : 'המשך');
      grid.appendChild(h('article', { class: 'task-card' },
        h('div', { class: 'tc-top' }, h('span', { class: 'tc-num' }, String(i + 1)), h('span', { class: 'mode-badge ' + t.mode }, MODE_LABEL[t.mode] || t.mode),
          i === 0 ? h('span', { class: 'rec' }, 'מומלץ להתחיל כאן') : null),
        h('h3', null, t.title),
        h('p', { class: 'muted clamp' }, t.story || ''),
        h('div', { class: 'tc-bottom' }, dots(T, true),
          T.submitted ? h('span', { class: 'score-pill' }, ico('star'), (T.score && T.score.total != null ? T.score.total : '-') + '/100') : h('span', { class: 'muted small' }, n + '/6 שלבים')),
        h('a', { class: 'btn primary', href: '#' + t.id }, ico('arrowL'), h('span', null, label))));
    });
    wrap.appendChild(grid);
    main.appendChild(wrap);
  }
  function crumbs(parts) {
    var ol = h('ol', { class: 'crumbs', 'aria-label': 'נתיב' });
    parts.forEach(function (p, i) {
      ol.appendChild(h('li', null, p[1] ? h('a', { href: p[1] }, p[0]) : h('span', { 'aria-current': 'page' }, p[0])));
    });
    return h('nav', null, ol);
  }

  /* ------------------------------------------------------------------ task page shell */
  function renderTaskRoute(main, wsId, taskId, stageParam) {
    var ws = S.workshops[wsId];
    var task = ws && !ws.error && (ws.tasks || []).filter(function (t) { return t.id === taskId; })[0];
    if (!task) {
      main.appendChild(h('div', { class: 'wrap' }, h('div', { class: 'errbox' }, h('h2', null, 'המשימה לא נמצאה'), h('a', { class: 'btn primary', href: '#home' }, 'לדף הבית'))));
      return;
    }
    var T = getTask(taskId);
    var max = maxStageIdx(T);
    var idx = STAGES.map(function (s) { return s.key; }).indexOf(stageParam);
    if (idx < 0 || idx > max) {
      idx = idx < 0 ? max : max;
      try { history.replaceState(null, '', '#' + taskId + '/' + STAGES[idx].key); } catch (e) { /* noop */ }
    }
    var stage = STAGES[idx];
    document.body.classList.add('is-task');
    setTitle(task.title + ' - ' + stage.label);
    S.activeTask = { ws: ws, task: task };
    window.scrollTo(0, 0);

    var ctx = {
      ws: ws, task: task, T: T, stage: stage, idx: idx,
      save: function (now) { saveTask(taskId, now); },
      go: function (key) { location.hash = '#' + taskId + '/' + key; },
      complete: function (key, extra, opts) {
        T.done[key] = true; saveTask(taskId, true);
        var f = { workshop: ws.id, task: taskId, stage: key, hintsUsed: T.hints,
          payload: Object.assign({ answers: T.a[key] || {}, activeSec: T.activeSec }, extra || {}) };
        if (key === 'code') { f.code = codeText(T); f.testsPassed = T.best; f.testsTotal = T.total; }
        CWSync.event('stage_complete', f);
        if (!(opts && opts.stay)) {
          var next = STAGES[STAGES.map(function (s) { return s.key; }).indexOf(key) + 1];
          if (next) ctx.go(next.key); else route();
        }
      }
    };

    var wrap = h('div', { class: 'wrap task-wrap' });
    wrap.appendChild(crumbs([['דף הבית', '#home'], [ws.title, '#' + ws.id], [task.title]]));
    wrap.appendChild(h('div', { class: 'task-head' },
      h('h1', null, task.title), h('span', { class: 'mode-badge ' + task.mode }, MODE_LABEL[task.mode] || task.mode)));
    wrap.appendChild(buildStepper(ctx));
    wrap.appendChild(buildStory(task));
    var host = h('section', { class: 'stage stage-' + stage.key, 'aria-labelledby': 'stage-h' });
    host.appendChild(h('h2', { id: 'stage-h', class: 'stage-title' },
      h('span', { class: 'stage-n' }, String(idx + 1)), stage.long));
    wrap.appendChild(host);
    main.appendChild(wrap);

    // Time on task: count 5 s ticks while the tab is visible
    var tick = setInterval(function () { if (!document.hidden) { T.activeSec += 5; saveTask(taskId); } }, 5000);
    S.dispose.push(function () { clearInterval(tick); });

    var fn = { understand: stageUnderstand, plan: stagePlan, tests: stageTests, skeleton: stageSkeleton, code: stageCode, reflect: stageReflect }[stage.key];
    try { fn(host, ctx); } catch (e) {
      console.error(e);
      host.appendChild(h('div', { class: 'errbox' }, h('h3', null, 'השלב הזה לא נטען כמו שצריך'),
        h('p', null, 'העבודה שלכם שמורה. נסו לרענן, או חזרו לשלב קודם.'), btn('רענון', { onClick: function () { location.reload(); } })));
    }
  }

  function buildStepper(ctx) {
    var T = ctx.T, max = maxStageIdx(T);
    var ol = h('ol', { class: 'stepper', 'aria-label': 'שלבי המשימה' });
    STAGES.forEach(function (s, i) {
      var done = !!T.done[s.key], cur = i === ctx.idx, locked = i > max;
      var b = h('button', { type: 'button', class: 'stp' + (done ? ' done' : '') + (cur ? ' cur' : '') + (locked ? ' locked' : ''),
        'aria-current': cur ? 'step' : null, 'aria-disabled': locked ? 'true' : null,
        title: locked ? 'צריך להשלים את השלב הקודם' : s.long,
        onClick: function () { if (locked) { toast('כדי להמשיך צריך להשלים קודם את השלב "' + STAGES[max].label + '".'); return; } if (!cur) ctx.go(s.key); } },
        h('span', { class: 'stp-node' }, done && !cur ? ico('check') : (locked ? ico('lock') : ico(s.icon))),
        h('span', { class: 'stp-label' }, s.label),
        h('span', { class: 'stp-n' }, 'שלב ' + (i + 1)));
      ol.appendChild(h('li', { class: 'stp-li' + (i > 0 && T.done[STAGES[i - 1].key] ? ' after-done' : '') }, b));
    });
    return h('nav', { class: 'stepper-wrap' }, ol);
  }

  var storyOpen = null;
  function buildStory(task) {
    if (storyOpen === null) storyOpen = window.innerWidth >= 900;
    var ex = task.example || {};
    var body = h('div', { class: 'story-body' },
      h('p', { class: 'story-text' }, task.story || ''),
      h('div', { class: 'io-grid' },
        h('div', { class: 'io-col' }, h('h4', null, 'קלט'), h('ul', null, (task.inputSpec || []).map(function (x) { return h('li', null, x); }))),
        h('div', { class: 'io-col' }, h('h4', null, 'פלט'), h('ul', null, (task.outputSpec || []).map(function (x) { return h('li', null, x); }))),
        h('div', { class: 'io-col ex' }, h('h4', null, 'דוגמה'),
          h('div', { class: 'ex-pair' },
            h('div', null, h('small', null, 'קלט'), h('pre', { class: 'codeblock', dir: 'ltr' }, (ex.input || []).join('\n'))),
            h('div', null, h('small', null, 'פלט'), h('pre', { class: 'codeblock', dir: 'ltr' }, (ex.output || []).join('\n')))))));
    var box = h('aside', { class: 'story' + (storyOpen ? ' open' : ''), 'aria-label': 'תיאור המשימה' });
    var tg = h('button', { type: 'button', class: 'story-toggle', 'aria-expanded': storyOpen ? 'true' : 'false', onClick: function () {
      storyOpen = !storyOpen; box.classList.toggle('open', storyOpen); tg.setAttribute('aria-expanded', storyOpen ? 'true' : 'false');
    } }, ico('book'), h('span', null, 'מה צריך לעשות? '), h('span', { class: 'story-short' }, firstSentence(task.story)), ico('chevron', 'chev'));
    box.appendChild(tg); box.appendChild(body);
    return box;
  }
  function firstSentence(s) { s = String(s || ''); var m = /^[^.!?\n]+[.!?]?/.exec(s); return m ? m[0].slice(0, 90) : ''; }

  /* ------------------------------------------------------------------ stage 1: understand */
  function stageUnderstand(host, ctx) {
    var T = ctx.T, A = T.a.understand, qsd = (ctx.task.stages.understand || {}).questions || [];
    var list = h('div', { class: 'qlist' });
    var next = h('div', { class: 'stage-foot' });
    host.appendChild(h('p', { class: 'lead' }, 'לפני שמתחילים לתכנן - נוודא שהבנו בדיוק מה מבקשים מאיתנו.'));
    host.appendChild(list); host.appendChild(next);

    function isComplete() {
      return qsd.every(function (q) {
        var r = A[q.id] || {};
        return q.type === 'mc' ? r.ok === true : (r.text || '').trim().length >= (q.minChars || 10);
      });
    }
    function updateFoot() {
      clear(next);
      var ok = isComplete() || !!T.done.understand;
      var b = btn(T.done.understand ? 'לשלב הבא' : 'המשך לתכנון', { cls: 'primary lg', icon: 'arrowL', disabled: !ok, onClick: function () { T.done.understand ? ctx.go('plan') : ctx.complete('understand'); } });
      next.appendChild(b);
      if (!ok) next.appendChild(h('span', { class: 'muted small' }, 'כדי להמשיך: לענות נכון על כל שאלות הבחירה ולכתוב תשובה במילים שלכם.'));
    }
    qsd.forEach(function (q, qi) {
      var r = A[q.id] || (A[q.id] = {});
      var card = h('div', { class: 'qcard' });
      function draw() {
        clear(card);
        card.appendChild(h('h3', { class: 'qprompt' }, h('span', { class: 'qn' }, String(qi + 1)), q.prompt));
        if (q.type === 'mc') {
          var opts = h('div', { class: 'opts', role: 'radiogroup', 'aria-label': q.prompt });
          q.options.forEach(function (o, oi) {
            var chosen = r.sel === oi, right = chosen && oi === q.correct, wrong = chosen && oi !== q.correct;
            opts.appendChild(h('button', { type: 'button', class: 'opt' + (right ? ' right' : '') + (wrong ? ' wrong' : ''), role: 'radio', 'aria-checked': chosen ? 'true' : 'false',
              disabled: r.ok === true, onClick: function () {
                if (r.first == null) r.first = (oi === q.correct);
                r.sel = oi; r.ok = (oi === q.correct); r.tries = (r.tries || 0) + 1;
                ctx.save(); draw(); updateFoot();
              } }, h('span', { class: 'opt-mark' }, right ? ico('check') : (wrong ? ico('x') : null)), h('span', null, o)));
          });
          card.appendChild(opts);
          if (r.sel != null) {
            card.appendChild(h('div', { class: 'feedback ' + (r.ok ? 'good' : 'bad'), role: 'status' },
              h('strong', null, r.ok ? (r.first ? 'נכון, בניסיון הראשון!' : 'נכון!') : 'לא בדיוק - נסו תשובה אחרת.'),
              q.explain ? h('span', null, ' ' + q.explain) : null));
          }
        } else {
          var min = q.minChars || 10;
          var ta = h('textarea', { rows: 3, class: 'txt', 'aria-label': q.prompt, placeholder: 'כתבו כאן במילים שלכם...' });
          ta.value = r.text || '';
          var cnt = h('span', { class: 'counter' });
          var upd = function () { var n = ta.value.trim().length; cnt.textContent = n + ' / ' + min + ' תווים'; cnt.classList.toggle('ok', n >= min); };
          ta.addEventListener('input', function () { r.text = ta.value; upd(); ctx.save(); updateFoot(); });
          upd();
          card.appendChild(ta); card.appendChild(cnt);
        }
      }
      draw(); list.appendChild(card);
    });
    updateFoot();
  }

  /* ------------------------------------------------------------------ stage 2: plan */
  function stagePlan(host, ctx) {
    var T = ctx.T, A = T.a.plan, P = ctx.task.stages.plan || { fields: [] };
    host.appendChild(h('p', { class: 'lead' }, 'לפני שכותבים קוד - מתכננים. כתבו במילים שלכם, בלי קוד. אחרי "המשך" תראו תוכנית לדוגמה להשוואה.'));
    var grid = h('div', { class: 'plan-grid' });
    var foot = h('div', { class: 'stage-foot' });
    var model = h('div', { class: 'plan-compare' });
    var tas = {}, mine = {};
    function ready() { return P.fields.every(function (f) { return (A[f.id] || '').trim().length >= 5; }); }
    function updateFoot() {
      clear(foot);
      if (A._shown || T.done.plan) {
        foot.appendChild(btn('לשלב הבא - בדיקות', { cls: 'primary lg', icon: 'arrowL', onClick: function () { ctx.go('tests'); } }));
      } else {
        foot.appendChild(btn('המשך', { cls: 'primary lg', icon: 'arrowL', disabled: !ready(), onClick: function () {
          A._shown = true; ctx.complete('plan', null, { stay: true }); drawModel(); updateFoot();
          model.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
        } }));
        if (!ready()) foot.appendChild(h('span', { class: 'muted small' }, 'כתבו לפחות כמה מילים בכל אחד משלושת השדות.'));
      }
    }
    function drawModel() {
      clear(model);
      if (!(A._shown || T.done.plan)) return;
      model.appendChild(h('h3', null, 'השוואה: התוכנית שלי מול תוכנית לדוגמה'));
      model.appendChild(h('p', { class: 'muted' }, 'אין צורך שהניסוח יהיה זהה. בדקו: האם חשבתם על אותם משתנים, אותם חישובים ואותו פלט? אפשר לתקן עכשיו את התוכנית שלכם בשדות שלמעלה - התיקון נשמר ומופיע כאן.'));
      P.fields.forEach(function (f) {
        model.appendChild(h('div', { class: 'cmp-row' },
          h('div', { class: 'cmp mine' }, h('h4', null, 'שלי - ' + shortLabel(f.label)), (mine[f.id] = h('p', null, A[f.id] || ''))),
          h('div', { class: 'cmp ref' }, h('h4', null, 'לדוגמה'), h('p', null, (P.model || {})[f.id] || ''))));
      });
    }
    P.fields.forEach(function (f) {
      var ta = h('textarea', { rows: 3, class: 'txt', id: 'pf-' + f.id, placeholder: f.placeholder || '' });
      ta.value = A[f.id] || '';
      ta.addEventListener('input', function () { A[f.id] = ta.value; ctx.save(); if (!(A._shown || T.done.plan)) updateFoot(); else if (mine[f.id]) mine[f.id].textContent = ta.value; });
      tas[f.id] = ta;
      grid.appendChild(h('div', { class: 'field' }, h('label', { for: 'pf-' + f.id }, f.label), ta));
    });
    host.appendChild(grid); host.appendChild(foot); host.appendChild(model);
    drawModel(); updateFoot();
  }
  function shortLabel(l) { return String(l || '').split(/[-:]/)[0].trim(); }

  /* ------------------------------------------------------------------ stage 3: predict + own tests */
  function stageTests(host, ctx) {
    var T = ctx.T, A = T.a.tests, TS = ctx.task.stages.tests || { predict: [] };
    var rows = TS.predict || [];
    A.preds = A.preds || rows.map(function () { return ''; });
    A.own = A.own || [];
    var needOwn = Math.max(1, TS.ownTests || 1);
    while (A.own.length < needOwn) A.own.push({ input: '', expected: '' });

    host.appendChild(h('p', { class: 'lead' }, 'לפני שכותבים קוד - חוזים. לכל קלט כתבו מה לדעתכם התוכנית צריכה להדפיס. אחר כך נריץ פתרון מוכן ונשווה.'));
    var tbl = h('div', { class: 'pred-list' });
    var ownBox = h('div', { class: 'own-box' });
    var foot = h('div', { class: 'stage-foot' });
    var checkMsg = h('div', { class: 'feedback', role: 'status', hidden: true });

    // Rows checked before retries existed (the real output is already on screen) stay closed.
    if (A.checked && !A.revealed) { A.revealed = rows.map(function () { return true; }); A.rowOk = (A.predCorrect || []).slice(); }
    A.revealed = A.revealed || rows.map(function () { return false; });
    A.rowOk = A.rowOk || [];
    function rowClosed(i) { return !!A.checked && (A.rowOk[i] === true || A.revealed[i] === true); }
    function openRows() { return rows.filter(function (r, i) { return !rowClosed(i); }).length; }

    function drawPred() {
      clear(tbl);
      rows.forEach(function (r, i) {
        var checked = !!A.checked, closed = rowClosed(i), okRow = checked && A.rowOk[i] === true;
        var ta = h('textarea', { rows: Math.max(2, (closed && A.truth && A.truth[i] ? nonEmptyLines(A.truth[i]).length : 3)), class: 'txt mono-in', dir: 'ltr', disabled: closed, 'aria-label': 'חיזוי פלט לבדיקה ' + (i + 1),
          placeholder: 'מה יודפס?' });
        ta.value = A.preds[i] || '';
        ta.addEventListener('input', function () { A.preds[i] = ta.value; ctx.save(); updateFoot(); });
        var side = null;
        if (closed) {
          side = h('div', { class: 'pred-real' },
            h('h4', null, okRow ? 'נכון!' : 'הפלט האמיתי', okRow ? ico('check') : ico('x')),
            h('pre', { class: 'codeblock', dir: 'ltr' }, (A.truth && A.truth[i]) || ''));
        } else if (checked) {
          side = h('div', { class: 'pred-real retry' },
            h('h4', null, 'עוד לא מדויק', ico('x')),
            h('p', { class: 'muted small' }, 'תקנו את החיזוי ולחצו על "בדיקה חוזרת". בדקו: מספר השורות, הניסוח המדויק והמספרים.'),
            btn('הצגת הפלט האמיתי', { cls: 'ghost sm', icon: 'info', onClick: function () { A.revealed[i] = true; ctx.save(true); drawPred(); updateFoot(); } }));
        }
        var card = h('div', { class: 'pred-row' + (checked ? (okRow ? ' ok' : ' no') : '') },
          h('div', { class: 'pred-in' }, h('h4', null, 'בדיקה ' + (i + 1) + ' - קלט'), h('pre', { class: 'codeblock', dir: 'ltr' }, (r.input || []).join('\n') || '(אין קלט)')),
          h('div', { class: 'pred-out' }, h('h4', null, 'החיזוי שלי'), ta),
          side);
        tbl.appendChild(card);
      });
    }
    function allPredFilled() { return rows.every(function (r, i) { return (A.preds[i] || '').trim().length > 0; }); }

    function drawOwn() {
      clear(ownBox);
      if (!A.checked) return;
      var okc = ownCount() >= needOwn;
      ownBox.appendChild(h('h3', null, 'הבדיקות שלי'));
      ownBox.appendChild(h('p', { class: 'muted' }, 'המציאו ' + (needOwn === 1 ? 'בדיקה אחת' : needOwn + ' בדיקות') + ' משלכם: קלט, ומה לדעתכם צריך להיות הפלט. הבדיקות ירוצו מול הקוד שלכם בשלב הקוד (ללא ציון - רק לעזרה).'));
      if (TS.edgeHint) ownBox.appendChild(h('div', { class: 'edge-hint' }, ico('bulb'), h('span', null, TS.edgeHint)));
      A.own.forEach(function (o, i) {
        var tin = h('textarea', { rows: 2, class: 'txt mono-in', dir: 'ltr', 'aria-label': 'קלט לבדיקה שלי ' + (i + 1), placeholder: 'ערך אחד בכל שורה' });
        var tex = h('textarea', { rows: 2, class: 'txt mono-in', 'aria-label': 'פלט צפוי לבדיקה שלי ' + (i + 1), placeholder: 'מה צריך להיות מודפס?' });
        tin.value = o.input || ''; tex.value = o.expected || '';
        tin.addEventListener('input', function () { o.input = tin.value; ctx.save(); updateFoot(); });
        tex.addEventListener('input', function () { o.expected = tex.value; ctx.save(); updateFoot(); });
        ownBox.appendChild(h('div', { class: 'own-row' }, h('div', null, h('h4', null, 'קלט'), tin), h('div', null, h('h4', null, 'פלט צפוי'), tex)));
      });
      ownBox.appendChild(btn('הוספת בדיקה', { icon: 'plus', cls: 'ghost', onClick: function () { A.own.push({ input: '', expected: '' }); ctx.save(); drawOwn(); updateFoot(); } }));
    }
    function ownCount() { return A.own.filter(function (o) { return (o.input || '').trim() && (o.expected || '').trim(); }).length; }

    function updateFoot() {
      clear(foot);
      if (!A.checked) {
        var b = btn('בדיקת החיזויים', { cls: 'primary lg', icon: 'test', disabled: !allPredFilled() || running, onClick: checkAll });
        foot.appendChild(b);
        if (!allPredFilled()) foot.appendChild(h('span', { class: 'muted small' }, 'כתבו חיזוי לכל הבדיקות כדי להמשיך.'));
      } else {
        var ok = ownCount() >= needOwn || T.done.tests;
        if (openRows() > 0) foot.appendChild(btn('בדיקה חוזרת', { cls: 'lg', icon: 'test', disabled: running, onClick: checkAll }));
        foot.appendChild(btn(T.done.tests ? 'לשלב הבא - שלד' : 'המשך לשלד האלגוריתם', { cls: 'primary lg', icon: 'arrowL', disabled: !ok,
          onClick: function () { T.done.tests ? ctx.go('skeleton') : ctx.complete('tests', { predCorrect: A.predCorrect, predChecks: A.predChecks || 1, own: A.own }); } }));
        if (!ok) foot.appendChild(h('span', { class: 'muted small' }, 'השלימו את הבדיקות שלכם (קלט ופלט צפוי) כדי להמשיך.'));
      }
    }

    var running = false;
    function checkAll() {
      running = true; updateFoot();
      var truth = (A.truth || []).slice(), rowOk = (A.rowOk || []).slice(), failed = false;
      var first = !A.checked;
      return rows.reduce(function (p, r, i) {
        if (!first && rowClosed(i)) return p;                     // already right, or its output was revealed
        return p.then(function () { return CSRun.run(ctx.task.solution, { input: (r.input || []).slice(), maxSteps: 500000 }); })
          .then(function (res) {
            var out = res.stdout || '';
            if (res.status !== 'ok') failed = true;
            truth[i] = out;
            // if the reference run failed we cannot judge the student - count as correct
            rowOk[i] = res.status === 'ok' ? predictionMatches(A.preds[i] || '', out) : true;
          });
      }, Promise.resolve()).then(function () {
        A.truth = truth; A.rowOk = rowOk; A.checked = true; A.predChecks = (A.predChecks || 0) + 1;
        // credit: right at a check made before the real output of that row was shown (a corrected prediction counts)
        A.predCorrect = rows.map(function (r, i) { return rowOk[i] === true && !(A.revealed[i] && !(A.predCorrect || [])[i]); });
        ctx.save(true);
        running = false; drawPred(); drawOwn(); updateFoot();
        var good = rowOk.filter(function (x) { return x === true; }).length, open = openRows();
        checkMsg.hidden = false; checkMsg.className = 'feedback ' + (good === rows.length ? 'good' : 'bad');
        checkMsg.textContent = good === rows.length ? 'מצוין! כל החיזויים נכונים.'
          : 'חזיתם נכון ' + good + ' מתוך ' + rows.length + '.' + (open ? ' אפשר לתקן את החיזויים המסומנים ולבדוק שוב, או להציג את הפלט האמיתי. חיזוי שתוקן נחשב נכון.' : ' התבוננו בהבדלים - זה בדיוק מה שיעזור לכם לכתוב את הקוד.');
        if (failed) checkMsg.textContent += ' (בדיקה אחת לא רצה בצד שלנו - לא נספרה נגדכם.)';
        checkMsg.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
      }).catch(function (e) { running = false; updateFoot(); reportError(e); });
    }

    host.appendChild(tbl); host.appendChild(checkMsg); host.appendChild(ownBox); host.appendChild(foot);
    if (A.checked) { checkMsg.hidden = true; }
    drawPred(); drawOwn(); updateFoot();
  }

  /* ------------------------------------------------------------------ stage 4: skeleton (ordering) */
  function stageSkeleton(host, ctx) {
    var T = ctx.T, A = T.a.skeleton, SK = ctx.task.stages.skeleton || { steps: [], distractors: [] };
    var items = {}, ids = [];
    SK.steps.forEach(function (t, i) { items['S' + i] = { text: t, ok: true, pos: i }; ids.push('S' + i); });
    (SK.distractors || []).forEach(function (t, i) { items['X' + i] = { text: t, ok: false }; ids.push('X' + i); });
    var hasBin = (SK.distractors || []).length > 0;
    if (!A.ord) {
      var sh = shuffle(ids), tries = 0;
      while (tries++ < 10 && sameArr(sh.filter(function (x) { return x[0] === 'S'; }), ids.filter(function (x) { return x[0] === 'S'; }))) sh = shuffle(ids);
      A.ord = sh; A.bin = []; A.attempts = 0;
    }
    host.appendChild(h('p', { class: 'lead' }, (SK.prompt || 'סדרו את שלבי האלגוריתם') + (hasBin ? '. שימו לב: חלק מהשלבים לא שייכים לפתרון - גררו אותם ל"לא שייך".' : '.')
      + ((SK.deps || SK.together) ? ' שני שלבים שלא תלויים זה בזה יכולים לבוא בכל סדר.' : '')));
    host.appendChild(h('p', { class: 'muted small how' }, ico('info'), 'גוררים בעכבר, או משתמשים בחצים. במקלדת: Tab ואז Alt+חץ למעלה/למטה.'));
    var lists = [{ key: 'ord', title: 'סדר האלגוריתם (מהראשון לאחרון)', cls: 'ord', empty: 'גררו לכאן את השלבים', reorder: true, numbered: true,
      action: hasBin ? { to: 'bin', label: 'לא שייך', short: 'לא שייך', icon: 'x' } : null }];
    if (hasBin) lists.push({ key: 'bin', title: 'לא שייך לפתרון', cls: 'bin', empty: 'שלבים מיותרים יגיעו לכאן', reorder: false,
      action: { to: 'ord', label: 'החזרה לרשימה', short: 'החזרה', icon: 'plus' } });
    var fb = h('div', { class: 'feedback', role: 'status', hidden: true });
    var foot = h('div', { class: 'stage-foot' });
    var board = SortBoard({ lists: lists, items: items, state: { ord: A.ord, bin: A.bin }, onChange: function (st) { A.ord = st.ord; A.bin = st.bin; ctx.save(); board.markers = {}; clearFb(); } });
    function clearFb() { fb.hidden = true; }
    function updateFoot() {
      clear(foot);
      if (A.correct) {
        foot.appendChild(btn(T.done.skeleton ? 'לשלב הבא - קוד' : 'המשך לכתיבת הקוד', { cls: 'primary lg', icon: 'arrowL', onClick: function () { T.done.skeleton ? ctx.go('code') : ctx.complete('skeleton', { attempts: A.attempts, firstTry: A.firstTry }); } }));
      } else {
        foot.appendChild(btn('בדיקה', { cls: 'primary lg', icon: 'check', onClick: check }));
      }
    }
    function check() {
      A.attempts = (A.attempts || 0) + 1;
      var mk = {}, right = 0;
      // Any order that respects the task's constraints is correct (two independent calculations may be swapped,
      // a method may be written before or after Main...). See js/order.js.
      var realOrder = A.ord.filter(function (id) { return items[id].ok; }).map(function (id) { return items[id].pos; });
      var res = window.CWOrder ? window.CWOrder.check(realOrder, SK.steps.length, SK.deps, SK.together)
        : { ok: sameArr(realOrder, SK.steps.map(function (_, i) { return i; })), bad: realOrder.filter(function (s, p) { return s !== p; }) };
      var badSet = {}; res.bad.forEach(function (s) { badSet[s] = true; });
      A.ord.forEach(function (id) { var it = items[id]; var ok = it.ok && !badSet[it.pos]; mk[id] = ok ? 'ok' : 'no'; if (ok) right++; });
      A.bin.forEach(function (id) { var ok = !items[id].ok; mk[id] = ok ? 'ok' : 'no'; if (ok) right++; });
      var all = right === ids.length && res.ok;
      if (A.firstTry == null) A.firstTry = all;
      board.setMarkers(mk);
      fb.hidden = false;
      if (all) {
        A.correct = true; board.setReadOnly(true);
        fb.className = 'feedback good'; fb.textContent = (A.firstTry ? 'מושלם! סידרתם נכון בניסיון הראשון.' : 'נכון! זה האלגוריתם שלכם.') + ((SK.deps || SK.together) ? ' (יש כאן יותר מסדר נכון אחד - כל סדר שבו כל שלב בא אחרי השלבים שהוא צריך מתקבל.)' : '');
      } else {
        fb.className = 'feedback bad';
        fb.textContent = right + ' מתוך ' + ids.length + ' פריטים במקום מתאים. הפריטים האדומים צריכים תיקון: שלב שמופיע לפני שלב שהוא תלוי בו, או שלב שלא שייך לפתרון.';
      }
      ctx.save(true); updateFoot();
    }
    host.appendChild(board.el); host.appendChild(fb); host.appendChild(foot);
    if (A.correct) board.setReadOnly(true);
    updateFoot();
  }

  /* ------------------------------------------------------------------ stage 5: code */
  function codeText(T) { return (T.a.code && (T.a.code.src || T.a.code.text)) || ''; }

  function fmtErr(e) {
    var msg = String(e.message || '');
    var hasLine = /^\s*שורה\s*\d+/.test(msg);
    var out = (!hasLine && e.line ? 'שורה ' + e.line + ': ' : '') + msg;
    if (e.code && out.indexOf(e.code) < 0) out += ' (' + e.code + ')';
    return out;
  }

  /* ---- editor adapters: {el, getSource, markErrors(lines[]), clearErrors, reset, onChange(cb), afterShow} ---- */
  function blankEditor(ctx) {
    var A = ctx.T.a.code, starter = (ctx.task.stages.code || {}).starter || '';
    var box = h('div', { class: 'cm-host', dir: 'ltr' });
    var cm = null, cb = function () {}, errLines = [];
    var api = {
      el: box,
      getSource: function () { return cm ? cm.getValue() : (A.text != null ? A.text : starter); },
      clearErrors: function () { if (!cm) return; errLines.forEach(function (l) { cm.removeLineClass(l, 'background', 'cm-errline'); }); errLines = []; },
      markErrors: function (ls) {
        if (!cm) return; api.clearErrors();
        ls.forEach(function (n) { var l = n - 1; if (l >= 0 && l < cm.lineCount()) { cm.addLineClass(l, 'background', 'cm-errline'); errLines.push(l); } });
        if (ls.length) cm.scrollIntoView({ line: Math.max(0, ls[0] - 1), ch: 0 }, 60);
      },
      reset: function () { cm.setValue(starter); cm.clearHistory(); },
      onChange: function (f) { cb = f; },
      afterShow: function () { if (cm) cm.refresh(); }
    };
    if (typeof CodeMirror === 'undefined') {
      // Fallback: plain textarea if the vendored library failed to load
      var ta = h('textarea', { class: 'txt mono-in plain-code', dir: 'ltr', rows: 18, spellcheck: 'false', 'aria-label': 'עורך קוד' });
      ta.value = A.text != null ? A.text : starter;
      ta.addEventListener('input', function () { cb(); });
      box.appendChild(ta);
      api.getSource = function () { return ta.value; };
      api.reset = function () { ta.value = starter; cb(); };
      return api;
    }
    cm = CodeMirror(box, {
      value: A.text != null ? A.text : starter, mode: 'text/x-csharp', theme: 'cw-night', lineNumbers: true,
      matchBrackets: true, autoCloseBrackets: true, indentUnit: 4, tabSize: 4, indentWithTabs: false, lineWrapping: false,
      inputStyle: 'contenteditable', spellcheck: false,
      extraKeys: {
        Tab: function (c) { if (c._esc) { c._esc = false; return CodeMirror.Pass; } if (c.somethingSelected()) c.indentSelection('add'); else c.replaceSelection('    ', 'end'); },
        'Shift-Tab': function (c) { c.indentSelection('subtract'); },
        Esc: function (c) { c._esc = true; }
      }
    });
    cm.getInputField().setAttribute('aria-label', 'עורך קוד C#. לחיצה על Esc ואז Tab יוצאת מהעורך');
    cm.on('change', function () { api.clearErrors(); cb(); });
    return api;
  }

  function fillEditor(ctx) {
    var A = ctx.T.a.code, F = (ctx.task.stages.code || {}).fill || { template: '', blanks: [] };
    A.vals = A.vals || {};
    var byId = {}; F.blanks.forEach(function (b) { byId[b.id] = b; });
    var box = h('div', { class: 'fillbox' });
    var code = h('div', { class: 'fillcode', dir: 'ltr' });
    var hintStrip = h('div', { class: 'blank-hint', role: 'status', 'aria-live': 'polite', hidden: true });
    var cb = function () {}, inputs = {}, dotsEl = {};
    var tpl = lines(F.template);

    function size(inp) { inp.style.width = Math.max(4, inp.value.length + 2) + 'ch'; }
    tpl.forEach(function (ln, li) {
      var row = h('div', { class: 'cl', 'data-ln': li + 1 }, h('span', { class: 'ln' }, String(li + 1)));
      var txt = h('span', { class: 'ct' });
      var re = /⟦(\d+)⟧/g, last = 0, m;
      while ((m = re.exec(ln))) {
        if (m.index > last) txt.appendChild(document.createTextNode(ln.slice(last, m.index)));
        var id = +m[1], bl = byId[id] || { accept: [], hint: '' };
        var inp = h('input', { type: 'text', class: 'blank', 'data-id': id, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
          'aria-label': 'חור מספר ' + id, placeholder: String(id) });
        inp.value = A.vals[id] || '';
        size(inp);
        (function (inp, id) {
          inp.addEventListener('input', function () {
            inp.value = inp.value.replace(/[\r\n]/g, ''); A.vals[id] = inp.value; size(inp);
            if (dotsEl[id]) dotsEl[id].className = 'qdot';
            api.clearErrors(); cb();
          });
        })(inp, id);
        inputs[id] = inp;
        var dot = h('span', { class: 'qdot', 'aria-hidden': 'true' }); dotsEl[id] = dot;
        var q = h('button', { type: 'button', class: 'qbtn', title: 'רמז לחור ' + id, 'aria-label': 'רמז לחור ' + id, onClick: function () {
          hintStrip.hidden = false; hintStrip.textContent = '';
          hintStrip.appendChild(h('strong', null, 'חור ' + id + ': ')); hintStrip.appendChild(document.createTextNode(bl.hint || 'אין רמז לחור הזה.'));
        } }, '?');
        txt.appendChild(h('span', { class: 'blank-wrap' }, inp, dot, q));
        last = m.index + m[0].length;
      }
      if (last < ln.length) txt.appendChild(document.createTextNode(ln.slice(last)));
      if (!ln.length) txt.appendChild(document.createTextNode(' '));
      row.appendChild(txt); code.appendChild(row);
    });
    function assemble() {
      return tpl.map(function (ln) { return ln.replace(/⟦(\d+)⟧/g, function (m0, id) { return (A.vals[id] || '').trim(); }); }).join('\n');
    }
    function quick() {
      var good = 0;
      F.blanks.forEach(function (b) {
        var v = String(A.vals[b.id] || '').replace(/\s+/g, '');
        var ok = v.length && (b.accept || []).some(function (a) { return String(a).replace(/\s+/g, '') === v; });
        if (dotsEl[b.id]) dotsEl[b.id].className = 'qdot ' + (v.length ? (ok ? 'ok' : 'maybe') : 'no');
        if (ok) good++;
      });
      return good;
    }
    var qmsg = h('span', { class: 'muted small' });
    box.appendChild(h('div', { class: 'fill-tools' },
      btn('בדיקה מהירה של החורים', { icon: 'check', cls: 'ghost sm', onClick: function () {
        var g = quick(); qmsg.textContent = g + ' מתוך ' + F.blanks.length + ' חורים זוהו כנכונים. צהוב = כתבתם משהו אחר ממה שציפיתי, וייתכן שהוא נכון (למשל אותו חישוב בסדר אחר). רק הרצת הבדיקות קובעת.';
      } }), qmsg));
    box.appendChild(code); box.appendChild(hintStrip);
    var api = {
      el: box,
      getSource: assemble,
      clearErrors: function () { code.querySelectorAll('.errline').forEach(function (n) { n.classList.remove('errline'); }); },
      markErrors: function (ls) { api.clearErrors(); ls.forEach(function (n) { var r = code.querySelector('.cl[data-ln="' + n + '"]'); if (r) r.classList.add('errline'); }); },
      reset: function () { A.vals = {}; Object.keys(inputs).forEach(function (id) { inputs[id].value = ''; size(inputs[id]); dotsEl[id].className = 'qdot'; }); qmsg.textContent = ''; cb(); },
      onChange: function (f) { cb = f; },
      afterShow: function () {}
    };
    return api;
  }

  function parsonsEditor(ctx) {
    var A = ctx.T.a.code, P = (ctx.task.stages.code || {}).parsons || { lines: [], fixed: [], distractors: [] };
    var items = {}, fixedSet = {};
    (P.fixed || []).forEach(function (i) { fixedSet[i] = true; });
    P.lines.forEach(function (t, i) { items['L' + i] = { text: t, locked: !!fixedSet[i], idx: i }; });
    (P.distractors || []).forEach(function (t, i) { items['D' + i] = { text: t }; });
    function initial() {
      var prog = (P.fixed || []).slice().sort(function (a, b) { return a - b; }).map(function (i) { return 'L' + i; });
      var bank = shuffle(Object.keys(items).filter(function (id) { return !items[id].locked; }));
      return { prog: prog, bank: bank };
    }
    var st = (A.pars && A.pars.prog && A.pars.bank) ? A.pars : initial();
    // Drop ids that no longer exist (content changed) and add missing ones
    ['prog', 'bank'].forEach(function (k) { st[k] = st[k].filter(function (id) { return items[id]; }); });
    Object.keys(items).forEach(function (id) { if (st.prog.indexOf(id) < 0 && st.bank.indexOf(id) < 0) st.bank.push(id); });
    A.pars = st;
    var cb = function () {};
    // First position where a missing line belongs: right after the fixed run that precedes it
    var gapAfter = -1;
    for (var gi = 0; gi < P.lines.length; gi++) { if (!fixedSet[gi]) { gapAfter = gi - 1; break; } }

    var board;
    function insertIndexFor() {
      var prog = board.state.prog;
      var sel = board.selected;
      if (sel && prog.indexOf(sel) >= 0) return prog.indexOf(sel) + 1;
      if (gapAfter < 0) return 0;
      var ix = prog.indexOf('L' + gapAfter);
      return ix >= 0 ? ix + 1 : prog.length;
    }
    board = SortBoard({
      items: items, state: st,
      lists: [
        { key: 'bank', title: 'בנק השורות', cls: 'bank', mono: true, reorder: false, empty: 'כל השורות הועברו לתוכנית',
          action: { to: 'prog', label: 'הוספה לתוכנית', short: 'הוספה', icon: 'plus', select: true, insertIndex: function () { return insertIndexFor(); } } },
        { key: 'prog', title: 'התוכנית שלי', cls: 'prog', mono: true, numbered: true, reorder: true, selectable: true, empty: 'גררו לכאן שורות מהבנק',
          action: { to: 'bank', label: 'הסרה מהתוכנית', short: 'הסרה', icon: 'x' } }
      ],
      onSelect: function () {},
      onChange: function (s) { A.pars = s; cb(); }
    });
    var api = {
      el: board.el,
      getSource: function () { return board.state.prog.map(function (id) { return items[id].text; }).join('\n') + '\n'; },
      clearErrors: function () { board.el.querySelectorAll('.errline').forEach(function (n) { n.classList.remove('errline'); }); },
      markErrors: function (ls) {
        api.clearErrors();
        var rows = board.el.querySelectorAll('.slist.prog .sitem');
        ls.forEach(function (n) { if (rows[n - 1]) rows[n - 1].classList.add('errline'); });
      },
      reset: function () { var s = initial(); board.state.prog = s.prog; board.state.bank = s.bank; board.selected = null; board.render(); A.pars = board.state; cb(); },
      onChange: function (f) { cb = f; },
      afterShow: function () {}
    };
    return api;
  }

  /* ---- interactive console ---- */
  function makeConsole() {
    var out = h('pre', { class: 'con-out', dir: 'ltr', 'aria-live': 'polite' });
    var inp = h('input', { type: 'text', class: 'con-in', dir: 'auto', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'קלט לתוכנית' });
    var sendBtn = h('button', { type: 'button', class: 'btn primary sm', 'aria-label': 'שליחת הקלט' }, ico('arrowL'));
    var line = h('div', { class: 'con-line', dir: 'ltr', hidden: true }, h('span', { class: 'prompt' }, '>'), inp, sendBtn);
    var status = h('div', { class: 'con-status' });
    var el = h('div', { class: 'console' }, out, line, status);
    var pending = null;
    function submit() {
      if (!pending) return;
      var v = inp.value; inp.value = ''; line.hidden = true;
      out.appendChild(h('span', { class: 'echo' }, v + '\n'));
      var r = pending; pending = null; r(v);
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    sendBtn.addEventListener('click', submit);
    return {
      el: el,
      reset: function () { clear(out); clear(status); line.hidden = true; pending = null; inp.value = ''; },
      write: function (t) { out.appendChild(document.createTextNode(t)); out.scrollTop = out.scrollHeight; },
      ask: function () {
        return new Promise(function (res) {
          pending = res; line.hidden = false; status.textContent = '';
          status.appendChild(h('span', { class: 'waiting' }, 'התוכנית ממתינה לקלט - הקלידו ולחצו Enter'));
          setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }, 0);
          out.scrollTop = out.scrollHeight;
        }).then(function (v) { clear(status); return v; });
      },
      setStatus: function (node) { clear(status); if (node) status.appendChild(node); },
      isWaiting: function () { return !!pending; }
    };
  }

  function errorList(title, errs) {
    return h('div', { class: 'errlist', role: 'alert' }, h('strong', null, title),
      h('ul', null, errs.map(function (e) { return h('li', null, fmtErr(e)); })));
  }

  /* ---- the stage ---- */
  function stageCode(host, ctx) {
    var task = ctx.task, T = ctx.T, A = T.a.code, mode = task.mode;
    var CS = task.stages.code || {};
    var ed = mode === 'parsons' ? parsonsEditor(ctx) : (mode === 'fill' ? fillEditor(ctx) : blankEditor(ctx));
    var runTok = 0, simCleanup = null;
    var con = makeConsole();
    var notes = h('div', { class: 'notes', 'aria-live': 'polite' });
    var testsPane = h('div', { class: 'tests-pane' }, h('p', { class: 'muted pad' }, 'כאן יופיעו תוצאות הבדיקות. לחצו "הרץ בדיקות".'));
    var hintBox = h('div', { class: 'hints' });
    var confirmBar = h('div', { class: 'confirm-slot' });
    var finish = h('div', { class: 'finish-bar' });
    var testBadge = h('span', { class: 'best-chip' });

    var leads = {
      parsons: 'בנו את התוכנית: הוסיפו שורות מהבנק לתוכנית, וסדרו אותן. שימו לב - בבנק יש גם שורות שלא שייכות לפתרון! טיפ: לחצו על שורה בתוכנית (למשל שורה נעולה) כדי לבחור אחריה את מקום ההוספה, וגררו או השתמשו בחצים לסידור.',
      fill: 'השלימו את החורים בקוד. אחרי שמילאתם - הריצו, ובדקו שהתוכנית עוברת את כל הבדיקות.',
      blank: 'כתבו את התוכנית בעצמכם בעורך. התחילו משלד התוכנית שכבר מופיע, והריצו תוך כדי כתיבה.'
    };
    host.appendChild(h('p', { class: 'lead' }, leads[mode] || leads.blank));

    function persist() { A.src = ed.getSource(); if (mode === 'blank') A.text = A.src; ctx.save(); }
    ed.onChange(function () { persist(); });
    persist();

    /* toolbar */
    var runBtn = btn('הרץ', { icon: 'run', cls: 'primary', onClick: doRun });
    var testBtn = btn('הרץ בדיקות', { icon: 'test', cls: 'accent', onClick: doTests });
    var simBtn = btn('צעד אחר צעד', { icon: 'step', cls: 'night', onClick: openSim });
    var hintBtn = btn('', { icon: 'bulb', cls: 'ghost', onClick: showHint });
    var resetBtn = btn('איפוס', { icon: 'reset', cls: 'ghost', onClick: askReset });
    var toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'פעולות' }, runBtn, testBtn, simBtn, hintBtn, resetBtn, testBadge);
    host.appendChild(toolbar);
    host.appendChild(confirmBar);

    /* hints */
    var HINTS = task.hints || [];
    function drawHints() {
      clear(hintBox);
      var n = Math.min(T.hints, HINTS.length);
      for (var i = 0; i < n; i++) {
        hintBox.appendChild(h('div', { class: 'hint-card' }, ico('bulb'), h('div', null, h('strong', null, 'רמז ' + (i + 1) + ' מתוך ' + HINTS.length), h('p', null, HINTS[i]))));
      }
      clear(hintBtn);
      hintBtn.appendChild(ico('bulb'));
      hintBtn.appendChild(h('span', null, n >= HINTS.length && HINTS.length ? 'אין עוד רמזים' : (n ? 'רמז נוסף' : 'רמז')));
      if (HINTS.length) hintBtn.appendChild(h('span', { class: 'cnt' }, n + '/' + HINTS.length));
      hintBtn.disabled = !HINTS.length || n >= HINTS.length;
      hintBtn.title = 'הרמז הראשון חינם; כל רמז נוסף מוריד 3 נקודות';
    }
    function showHint() {
      if (T.hints >= HINTS.length) return;
      T.hints++; ctx.save(true); drawHints();
      CWSync.event('hint', { workshop: ctx.ws.id, task: task.id, stage: 'code', hintsUsed: T.hints, code: ed.getSource(), payload: { n: T.hints } });
      var last = hintBox.lastChild; if (last && last.scrollIntoView) last.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
    }
    host.appendChild(hintBox); drawHints();
    host.appendChild(notes);

    /* workspace: editor + output tabs */
    var tabCon = h('button', { type: 'button', class: 'tab on', role: 'tab', 'aria-selected': 'true', onClick: function () { showTab('con'); } }, 'קונסולה');
    var tabTests = h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': 'false', onClick: function () { showTab('tests'); } }, 'בדיקות');
    var panes = h('div', { class: 'panes' }, con.el, testsPane);
    testsPane.hidden = true;
    function showTab(w) {
      var c = w === 'con';
      tabCon.classList.toggle('on', c); tabTests.classList.toggle('on', !c);
      tabCon.setAttribute('aria-selected', c ? 'true' : 'false'); tabTests.setAttribute('aria-selected', c ? 'false' : 'true');
      con.el.hidden = !c; testsPane.hidden = c;
    }
    var outPane = h('div', { class: 'outpane' }, h('div', { class: 'tabs', role: 'tablist' }, tabCon, tabTests), panes);
    var edPane = h('div', { class: 'edpane' },
      h('div', { class: 'pane-head' }, mode === 'blank' ? 'עורך הקוד' : (mode === 'fill' ? 'התוכנית (השלימו את החורים)' : 'בניית התוכנית'), h('span', { class: 'lang', dir: 'ltr' }, 'C#')), ed.el);
    var work = h('div', { class: 'work mode-' + mode }, edPane, outPane);
    host.appendChild(work);
    var simHost = h('div', { class: 'sim-host', hidden: true });
    host.appendChild(simHost);
    host.appendChild(finish);
    setTimeout(function () { ed.afterShow(); }, 30);
    S.dispose.push(function () { if (simCleanup) simCleanup(); runTok++; });

    function drawBest() {
      clear(testBadge);
      if (T.total) testBadge.appendChild(document.createTextNode('הכי טוב עד עכשיו: ' + T.best + '/' + T.total + ' בדיקות'));
    }
    drawBest();

    /* subset + warnings as gentle notes */
    function drawNotes(src, extra) {
      clear(notes);
      var list = [];
      try { list = (CSRun.checkSubset ? CSRun.checkSubset(src) : []) || []; } catch (e) { list = []; }
      (extra || []).forEach(function (w) { list.push(w); });
      var seen = {};
      list = list.filter(function (w) { var k = w.line + '|' + w.message; if (seen[k]) return false; seen[k] = 1; return true; });
      if (!list.length) return;
      notes.appendChild(h('div', { class: 'note' }, ico('info'), h('div', null,
        h('strong', null, 'הערה (לא שגיאה): '), 'התוכנית עובדת, אבל בקורס הזה לא משתמשים בזה:',
        h('ul', null, list.slice(0, 4).map(function (w) { return h('li', null, fmtErr(w)); })))));
    }

    function errLines(errs) { return (errs || []).map(function (e) { return e.line; }).filter(function (x) { return x > 0; }); }

    /* ---- run (interactive) ---- */
    function doRun() {
      var src = ed.getSource(), tok = ++runTok;
      ed.clearErrors(); con.reset(); showTab('con');
      con.el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
      T.runs++; persist();
      drawNotes(src);
      if (!src.trim()) { con.write('אין עדיין קוד להרצה.\n'); return Promise.resolve(); }
      var streamed = false;
      return CSRun.run(src, {
        onInput: function () { return tok === runTok ? con.ask() : new Promise(function () {}); },
        onOutput: function (t) { if (tok === runTok) { streamed = true; con.write(t); } }
      }).then(function (res) {
        if (tok !== runTok) return;
        if (!streamed && res.stdout) con.write(res.stdout);
        var errs = res.errors || [];
        drawNotes(src, res.warnings);
        if (res.status === 'ok') con.setStatus(h('span', { class: 'done-ok' }, 'התוכנית הסתיימה'));
        else if (res.status === 'compile_error') { con.setStatus(errorList('שגיאות בקוד - התוכנית לא רצה:', errs)); ed.markErrors(errLines(errs)); }
        else if (res.status === 'runtime_error') { con.setStatus(errorList('התוכנית נעצרה בגלל שגיאה:', errs)); ed.markErrors(errLines(errs)); }
        else if (res.status === 'timeout') con.setStatus(errorList('התוכנית רצה יותר מדי זמן:', [{ message: 'אולי יש לולאה אינסופית, או שהתוכנית ארוכה מדי.' }]));
        else if (res.status === 'input_exhausted') con.setStatus(errorList('התוכנית ביקשה עוד קלט:', [{ message: 'נגמרו ערכי הקלט.' }]));
        CWSync.run({ workshop: ctx.ws.id, task: task.id, stage: 'code', hintsUsed: T.hints, code: src,
          payload: { status: res.status, errCode: errs[0] && errs[0].code || '', errLine: errs[0] && errs[0].line || 0 } });
      });
    }

    /* ---- tests ---- */
    function mapOwn() {
      var own = (T.a.tests && T.a.tests.own) || [];
      var res = [];
      own.forEach(function (o, i) {
        if ((o.input || '').trim() && (o.expected || '').trim()) res.push({ name: 'בדיקה שלי ' + (i + 1), input: lines(o.input).map(function (x) { return x.trim(); }).filter(function (x) { return x.length; }), expected: nonEmptyLines(o.expected) });
      });
      return res;
    }
    function testItem(r, t, open) {
      var d = h('details', { class: 'tcase ' + (r.pass ? 'pass' : 'fail'), open: open });
      d.appendChild(h('summary', null, h('span', { class: 'tmark' }, ico(r.pass ? 'check' : 'x')), h('span', { class: 'tname' }, r.name || t.name), h('span', { class: 'tstat' }, r.pass ? 'עבר' : 'נכשל')));
      var body = h('div', { class: 'tbody' },
        h('div', null, h('small', null, 'קלט'), h('pre', { class: 'codeblock', dir: 'ltr' }, (t.input || []).join('\n') || '(אין)')),
        h('div', null, h('small', null, 'צפוי'), h('pre', { class: 'codeblock', dir: 'ltr' }, (r.expected || t.expected || []).join('\n'))),
        h('div', null, h('small', null, 'בפועל'), h('pre', { class: 'codeblock' + (r.pass ? '' : ' bad'), dir: 'ltr' }, r.stdout || '(לא הודפס כלום)')));
      d.appendChild(body);
      if (!r.pass && r.status && r.status !== 'ok' && r.errors && r.errors.length) d.appendChild(errorList('מה קרה בהרצה:', r.errors));
      else if (!r.pass && r.missing) d.appendChild(h('p', { class: 'missing' }, 'לא נמצאה בפלט השורה: ', h('code', { dir: 'auto' }, r.missing)));
      return d;
    }
    function doTests() {
      var src = ed.getSource(); runTok++;
      ed.clearErrors(); showTab('tests'); drawNotes(src);
      testsPane.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
      clear(testsPane).appendChild(h('p', { class: 'muted pad' }, 'מריצים בדיקות...'));
      testBtn.disabled = true;
      var tests = task.tests || [];
      var own = mapOwn();
      return CSRun.runTests(src, tests).then(function (res) {
        return (own.length ? CSRun.runTests(src, own) : Promise.resolve([])).then(function (ores) { return [res, ores]; });
      }).then(function (pair) {
        testBtn.disabled = false;
        var res = pair[0], ores = pair[1];
        var passed = res.filter(function (r) { return r.pass; }).length;
        T.testRuns++; T.total = tests.length; if (passed > T.best) T.best = passed;
        persist(); ctx.save(true); drawBest();
        clear(testsPane);
        var bar = h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': tests.length, 'aria-valuenow': passed },
          h('div', { class: 'meter-fill', style: { width: (tests.length ? 100 * passed / tests.length : 0) + '%' } }));
        testsPane.appendChild(h('div', { class: 'tsum ' + (passed === tests.length ? 'all' : '') },
          h('strong', null, 'עברו ' + passed + ' מתוך ' + tests.length + ' בדיקות'), bar));
        var allCompile = res.length && res.every(function (r) { return r.status === 'compile_error'; });
        if (allCompile) {
          testsPane.appendChild(errorList('שגיאות בקוד - אי אפשר להריץ בדיקות:', res[0].errors || []));
          ed.markErrors(errLines(res[0].errors));
        }
        var firstFail = -1;
        res.forEach(function (r, i) { if (!r.pass && firstFail < 0) firstFail = i; });
        if (!allCompile) res.forEach(function (r, i) { testsPane.appendChild(testItem(r, tests[i] || {}, i === firstFail)); });
        if (firstFail >= 0 && !allCompile) {
          var tips = [];
          (task.commonMistakes || []).forEach(function (m) {
            try { if (new RegExp(m.pattern, 'm').test(src)) tips.push(m.message); } catch (e) { /* bad regex in content: ignore */ }
          });
          if (tips.length) testsPane.appendChild(h('div', { class: 'tips' }, ico('bulb'), h('div', null, h('strong', null, 'אולי זה העניין: '), h('ul', null, tips.slice(0, 3).map(function (x) { return h('li', null, x); })))));
        }
        if (ores.length) {
          var op = ores.filter(function (r) { return r.pass; }).length;
          testsPane.appendChild(h('h4', { class: 'own-title' }, 'הבדיקות שלי (' + op + '/' + ores.length + ') - ללא ציון'));
          ores.forEach(function (r, i) { testsPane.appendChild(testItem(r, own[i], false)); });
        }
        CWSync.event('test_run', { workshop: ctx.ws.id, task: task.id, stage: 'code', testsPassed: passed, testsTotal: tests.length, hintsUsed: T.hints, code: src,
          payload: { runNo: T.testRuns, failed: res.filter(function (r) { return !r.pass; }).map(function (r) { return r.name; }), status: res.map(function (r) { return r.status; }).filter(function (v, i, a) { return a.indexOf(v) === i; }),
            ownPassed: ores.filter(function (r) { return r.pass; }).length, ownTotal: ores.length } });
        if (passed === tests.length && tests.length && !T.done.code) {
          ctx.complete('code', { passedAll: true, testRuns: T.testRuns }, { stay: true });
        }
        drawFinish();
      }).catch(function (e) { testBtn.disabled = false; clear(testsPane).appendChild(h('p', { class: 'pad' }, 'הבדיקות לא הצליחו לרוץ.')); reportError(e); });
    }

    function drawFinish() {
      clear(finish);
      var all = T.total && T.best === T.total;
      if (T.done.code) {
        finish.appendChild(h('div', { class: 'finish ok' }, h('div', { class: 'ftxt' }, ico('check'), h('div', null, h('strong', null, all ? 'כל הבדיקות עברו!' : 'השלב הושלם'), h('span', null, all ? ' הקוד שלכם עובד. עכשיו מסכמים ומגישים.' : ' (ממשיכים עם ' + T.best + '/' + T.total + ' בדיקות)'))),
          btn('לרפלקציה והגשה', { cls: 'primary lg', icon: 'arrowL', onClick: function () { ctx.go('reflect'); } })));
      } else if (T.testRuns >= 3) {
        finish.appendChild(h('div', { class: 'finish warn' }, h('div', { class: 'ftxt' }, ico('info'), h('div', null, h('strong', null, 'עדיין לא עובר את כל הבדיקות.'), h('span', null, ' אפשר להמשיך לנסות, לבקש רמז, או להמשיך בכל זאת (הציון יחושב לפי הבדיקות שעוברות).'))),
          btn('להמשיך בכל זאת', { cls: 'ghost', icon: 'arrowL', onClick: function () { T.forced = true; ctx.complete('code', { forced: true, testRuns: T.testRuns }); } })));
      }
    }
    drawFinish();

    /* ---- reset with in-page confirmation ---- */
    function askReset() {
      if (confirmBar.firstChild) return;
      var no = btn('ביטול', { cls: 'ghost sm', onClick: function () { clear(confirmBar); resetBtn.focus(); } });
      var yes = btn('כן, לאפס', { cls: 'danger sm', onClick: function () { ed.reset(); ed.clearErrors(); con.reset(); clear(notes); clear(confirmBar); persist(); toast('הקוד אופס.'); } });
      confirmBar.appendChild(h('div', { class: 'confirm', role: 'alertdialog', 'aria-label': 'אישור איפוס' }, h('span', null, 'לאפס את הקוד למצב ההתחלתי? מה שעשיתם עד עכשיו יימחק.'), yes, no));
      no.focus();
    }

    /* ---- simulation ---- */
    function openSim() {
      var src = ed.getSource(); runTok++;
      var tests = task.tests || [];
      if (!src.trim()) { toast('אין עדיין קוד להרצה צעד אחר צעד.'); return; }
      simBtn.disabled = true;
      var pick = 0;
      var go = function (idx) {
        pick = idx;
        var t = tests[idx] || { input: [] };
        return CSRun.run(src, { input: (t.input || []).slice(), trace: true, maxSteps: 400000 });
      };
      go(0).then(function (res) {
        simBtn.disabled = false;
        if (res.status === 'compile_error') {
          showTab('con'); con.reset(); con.setStatus(errorList('אי אפשר להריץ צעד אחר צעד - יש שגיאות בקוד:', res.errors || []));
          ed.markErrors(errLines(res.errors)); toast('קודם צריך לתקן את השגיאות בקוד.', 'err'); return;
        }
        showSim(src, res, tests, pick, go);
      }).catch(function (e) { simBtn.disabled = false; reportError(e); });
    }

    function showSim(src, res0, tests, pick0, runFn) {
      if (simCleanup) simCleanup();
      work.hidden = true; simHost.hidden = false; toolbar.classList.add('dim');
      var sim = buildSim(src, res0, tests, pick0, runFn, function close() {
        if (simCleanup) simCleanup(); simCleanup = null; clear(simHost); simHost.hidden = true; work.hidden = false; toolbar.classList.remove('dim');
        ed.afterShow(); simBtn.focus();
      });
      clear(simHost).appendChild(sim.el);
      simCleanup = sim.stop;
      simHost.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      sim.el.focus({ preventScroll: true });
    }
  }

  /* Step-by-step simulation view. Returns {el, stop} */
  function buildSim(src, res0, tests, pick0, runFn, onClose) {
    var srcLines = lines(src);
    if (srcLines.length && srcLines[srcLines.length - 1] === '') srcLines.pop();
    var res = res0, trace = res.trace || [], i = 0, playing = false, timer = null, speed = 800, cum = [];
    var el = h('div', { class: 'sim', tabindex: '-1', role: 'region', 'aria-label': 'סימולציה צעד אחר צעד' });
    var sel = h('select', { class: 'sel', 'aria-label': 'בחירת בדיקה לסימולציה' });
    tests.forEach(function (t, k) { sel.appendChild(h('option', { value: String(k), selected: k === pick0 }, t.name || ('בדיקה ' + (k + 1)))); });
    var inputChips = h('div', { class: 'in-chips', dir: 'ltr' });
    var codeBox = h('div', { class: 'sim-code', dir: 'ltr', role: 'group', 'aria-label': 'הקוד' });
    var rowEls = srcLines.map(function (ln, k) {
      var r = h('div', { class: 'sl' }, h('span', { class: 'arrow' }, ico('prev')), h('span', { class: 'ln' }, String(k + 1)), h('span', { class: 'ct' }, ln === '' ? ' ' : ln));
      codeBox.appendChild(r); return r;
    });
    var methodEl = h('div', { class: 'sim-method' });
    var varsEl = h('div', { class: 'sim-vars' });
    var outEl = h('pre', { class: 'sim-out', dir: 'ltr' });
    var capEl = h('div', { class: 'sim-cap', 'aria-live': 'polite' });
    var noteEl = h('div', { class: 'sim-note' });
    var slider = h('input', { type: 'range', min: 0, max: 0, value: 0, class: 'slider', 'aria-label': 'מיקום בהרצה' });
    var counter = h('span', { class: 'sim-count' });
    var playBtn = h('button', { type: 'button', class: 'btn primary round', 'aria-label': 'ניגון', title: 'ניגון / השהיה (רווח)' });
    var prevBtn = h('button', { type: 'button', class: 'btn ghost round', 'aria-label': 'צעד אחורה', title: 'צעד אחורה' }, ico('prev'), h('span', null, 'הקודם'));
    var nextBtn = h('button', { type: 'button', class: 'btn accent round', 'aria-label': 'צעד קדימה', title: 'צעד קדימה' }, h('span', null, 'הבא'), ico('next'));
    var firstBtn = h('button', { type: 'button', class: 'btn ghost round', 'aria-label': 'חזרה להתחלה', title: 'חזרה להתחלה' }, ico('first'));
    var speedSel = h('select', { class: 'sel', 'aria-label': 'מהירות' },
      h('option', { value: '1600' }, 'איטי'), h('option', { value: '800', selected: true }, 'רגיל'), h('option', { value: '350' }, 'מהיר'), h('option', { value: '120' }, 'מהיר מאוד'));

    function buildCum() {
      cum = []; var acc = '';
      trace.forEach(function (t) { acc += (t.output || ''); cum.push(acc); });
    }
    function setPlayIcon() { clear(playBtn); playBtn.appendChild(ico(playing ? 'pause' : 'play')); playBtn.appendChild(h('span', null, playing ? 'השהיה' : 'ניגון')); playBtn.setAttribute('aria-label', playing ? 'השהיה' : 'ניגון'); }
    function renderInputs() {
      clear(inputChips);
      var t = tests[pick0] || { input: [] };
      inputChips.appendChild(h('span', { class: 'lbl' }, 'קלט:'));
      (t.input || []).forEach(function (v) { inputChips.appendChild(h('span', { class: 'chip' }, v)); });
      if (!(t.input || []).length) inputChips.appendChild(h('span', { class: 'chip dim' }, 'אין'));
    }
    function show(n) {
      if (!trace.length) return;
      i = Math.max(0, Math.min(trace.length - 1, n));
      var t = trace[i], prev = i > 0 ? trace[i - 1] : null;
      rowEls.forEach(function (r) { r.classList.remove('cur'); });
      var row = rowEls[(t.line || 1) - 1];
      if (row) {
        row.classList.add('cur');
        var top = row.offsetTop - codeBox.clientHeight / 2 + row.offsetHeight / 2;
        codeBox.scrollTop = Math.max(0, top);
      }
      clear(methodEl);
      methodEl.appendChild(h('span', { class: 'lbl' }, 'פעולה נוכחית:'));
      methodEl.appendChild(h('code', { dir: 'ltr' }, (t.method || 'Main') + '()'));
      if (t.depth > 1) methodEl.appendChild(h('span', { class: 'depth' }, 'עומק קריאות: ' + t.depth));
      clear(varsEl);
      var names = Object.keys(t.vars || {});
      if (!names.length) varsEl.appendChild(h('p', { class: 'muted small pad' }, 'עדיין אין משתנים.'));
      else {
        var tbl = h('table', { class: 'vtable' }, h('thead', null, h('tr', null, h('th', null, 'משתנה'), h('th', null, 'ערך'))));
        var tb = h('tbody');
        var sameFrame = prev && prev.method === t.method && prev.depth === t.depth;
        names.forEach(function (nm) {
          var v = t.vars[nm];
          var isNew = sameFrame && !(nm in (prev.vars || {}));
          var chg = sameFrame && (nm in (prev.vars || {})) && prev.vars[nm] !== v;
          tb.appendChild(h('tr', { class: (chg || isNew) ? 'chg' : '' }, h('td', { class: 'vn', dir: 'ltr' }, nm), h('td', { class: 'vv', dir: 'ltr' }, String(v)), ));
        });
        tbl.appendChild(tb); varsEl.appendChild(tbl);
      }
      clear(outEl);
      var all = cum[i] || '', own = t.output || '';
      var before = own && all.slice(-own.length) === own ? all.slice(0, all.length - own.length) : all;
      outEl.appendChild(document.createTextNode(before));
      if (own && before !== all) outEl.appendChild(h('span', { class: 'fresh' }, own));
      if (!all) outEl.appendChild(h('span', { class: 'muted' }, '(עדיין לא הודפס כלום)'));
      outEl.scrollTop = outEl.scrollHeight;
      clear(capEl);
      capEl.appendChild(h('span', { class: 'cap-ln' }, 'שורה ' + t.line));
      capEl.appendChild(h('code', { dir: 'ltr' }, (srcLines[(t.line || 1) - 1] || '').trim()));
      slider.value = String(i); counter.textContent = 'צעד ' + (i + 1) + ' מתוך ' + trace.length;
      prevBtn.disabled = i === 0; firstBtn.disabled = i === 0; nextBtn.disabled = i >= trace.length - 1;
      if (i >= trace.length - 1) {
        if (playing) { playing = false; stopTimer(); setPlayIcon(); }
        clear(noteEl);
        if (res.status === 'ok') noteEl.appendChild(h('span', { class: 'done-ok' }, 'התוכנית הסתיימה'));
        else if (res.status === 'runtime_error') noteEl.appendChild(errorList('התוכנית נעצרה בשגיאה:', res.errors || []));
        else if (res.status === 'input_exhausted') noteEl.appendChild(h('span', { class: 'muted' }, 'התוכנית ביקשה עוד קלט ממה שיש בבדיקה הזו.'));
        else if (res.status === 'timeout') noteEl.appendChild(h('span', { class: 'muted' }, 'ההרצה נעצרה - ארוכה מדי.'));
        if (trace.length >= 3000) noteEl.appendChild(h('span', { class: 'muted' }, ' (הסימולציה מוגבלת ל-3000 צעדים)'));
      } else clear(noteEl);
    }
    function stopTimer() { if (timer) { clearTimeout(timer); timer = null; } }
    function schedule() {
      stopTimer();
      timer = setTimeout(function () {
        if (!playing) return;
        if (i >= trace.length - 1) { playing = false; setPlayIcon(); return; }
        show(i + 1); schedule();
      }, speed);
    }
    function togglePlay() {
      if (!trace.length) return;
      if (playing) { playing = false; stopTimer(); }
      else { if (i >= trace.length - 1) show(0); playing = true; schedule(); }
      setPlayIcon();
    }
    playBtn.addEventListener('click', safe(togglePlay));
    nextBtn.addEventListener('click', safe(function () { playing = false; stopTimer(); setPlayIcon(); show(i + 1); }));
    prevBtn.addEventListener('click', safe(function () { playing = false; stopTimer(); setPlayIcon(); show(i - 1); }));
    firstBtn.addEventListener('click', safe(function () { playing = false; stopTimer(); setPlayIcon(); show(0); }));
    slider.addEventListener('input', safe(function () { playing = false; stopTimer(); setPlayIcon(); show(+slider.value); }));
    speedSel.addEventListener('change', function () { speed = +speedSel.value; if (playing) schedule(); });
    sel.addEventListener('change', safe(function () {
      playing = false; stopTimer(); setPlayIcon();
      var idx = +sel.value;
      runFn(idx).then(function (r) { res = r; trace = r.trace || []; pick0 = idx; buildCum(); slider.max = String(Math.max(0, trace.length - 1)); renderInputs(); i = 0; show(0); }).catch(reportError);
    }));
    el.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'select' || tag === 'input' || tag === 'textarea') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); nextBtn.click(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); prevBtn.click(); }
      else if (e.key === ' ' && tag !== 'button') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'Escape') { onClose(); }
    });

    var empty = !trace.length;
    buildCum(); slider.max = String(Math.max(0, trace.length - 1)); setPlayIcon(); renderInputs();
    el.appendChild(h('div', { class: 'sim-top' },
      h('h3', null, ico('step'), 'צעד אחר צעד'),
      h('label', { class: 'sim-pick' }, h('span', null, 'בדיקה:'), sel), inputChips,
      btn('סגירה', { icon: 'x', cls: 'ghost sm', onClick: onClose })));
    if (empty) {
      el.appendChild(h('p', { class: 'pad muted' }, 'לא נאספו צעדים להרצה הזו.'));
    } else {
      el.appendChild(h('div', { class: 'sim-body' },
        h('div', { class: 'sim-left' }, h('h4', null, 'הקוד'), codeBox),
        h('div', { class: 'sim-right' },
          methodEl,
          h('h4', null, 'המשתנים'), varsEl,
          h('h4', null, 'הפלט עד עכשיו'), outEl)));
      el.appendChild(capEl); el.appendChild(noteEl);
      el.appendChild(h('div', { class: 'sim-controls' }, firstBtn, prevBtn, playBtn, nextBtn,
        h('label', { class: 'sim-speed' }, h('span', null, 'מהירות'), speedSel), slider, counter));
      el.appendChild(h('p', { class: 'muted small keys' }, 'מקלדת: חיצים לצעד קדימה ואחורה, רווח לניגון, Esc לסגירה.'));
      setTimeout(function () { show(0); }, 0);
    }
    return { el: el, stop: function () { playing = false; stopTimer(); } };
  }

  /* ------------------------------------------------------------------ stage 6: reflect + submit */
  function stageReflect(host, ctx) {
    var T = ctx.T, task = ctx.task, A = T.a.reflect, R = (task.stages.reflect || {}).questions || [];
    var total = T.total || (task.tests || []).length;
    host.appendChild(h('div', { class: 'sumcard' },
      h('div', { class: 'sum' }, h('b', null, T.best + '/' + total), h('span', null, 'בדיקות עברו (הטוב ביותר)')),
      h('div', { class: 'sum' }, h('b', null, String(T.hints)), h('span', null, 'רמזים')),
      h('div', { class: 'sum' }, h('b', null, fmtTime(T.activeSec)), h('span', null, 'זמן עבודה')),
      h('div', { class: 'sum' }, h('b', null, String(T.testRuns)), h('span', null, 'הרצות בדיקות'))));
    host.appendChild(h('p', { class: 'lead' }, 'עוצרים רגע לחשוב על התהליך. תשובות כנות ומפורטות מקבלות ניקוד.'));
    var qwrap = h('div', { class: 'qlist' });
    var foot = h('div', { class: 'stage-foot' });
    var result = h('div', { class: 'result' });
    R.forEach(function (q, qi) {
      var min = q.minChars || 15;
      var ta = h('textarea', { rows: 3, class: 'txt', id: 'rq-' + q.id, placeholder: 'כתבו כאן...' });
      ta.value = A[q.id] || '';
      var cnt = h('span', { class: 'counter' });
      var upd = function () { var n = ta.value.trim().length; cnt.textContent = n + ' / ' + min + ' תווים'; cnt.classList.toggle('ok', n >= min); };
      ta.addEventListener('input', function () { A[q.id] = ta.value; upd(); ctx.save(); });
      upd();
      qwrap.appendChild(h('div', { class: 'qcard' }, h('label', { class: 'qprompt', for: 'rq-' + q.id }, h('span', { class: 'qn' }, String(qi + 1)), q.prompt), ta, cnt));
    });
    host.appendChild(qwrap); host.appendChild(foot); host.appendChild(result);

    function drawFoot() {
      clear(foot);
      foot.appendChild(btn(T.submitted ? 'הגשה מחדש' : 'הגשה', { cls: 'primary lg', icon: 'flag', onClick: submit }));
      foot.appendChild(h('span', { class: 'muted small' }, 'תשובות קצרות מדי לא יקבלו ניקוד.'));
    }
    function submit() {
      var sc = computeScore(task, T);
      T.submitted = true; T.score = sc; T.done.reflect = true; ctx.save(true);
      CWSync.event('submit', { workshop: ctx.ws.id, task: task.id, stage: 'reflect', testsPassed: T.best, testsTotal: total, hintsUsed: T.hints, score: sc, code: codeText(T),
        payload: { answers: { understand: T.a.understand, plan: T.a.plan, tests: { predCorrect: (T.a.tests || {}).predCorrect, own: (T.a.tests || {}).own }, skeleton: { firstTry: T.a.skeleton.firstTry, attempts: T.a.skeleton.attempts }, reflect: A },
          activeSec: T.activeSec, testRuns: T.testRuns, forced: !!T.forced } });
      drawResult(sc, true); drawFoot();
    }
    function drawResult(sc, fresh) {
      clear(result);
      var card = h('div', { class: 'scorecard' + (fresh && !reducedMotion() ? ' pop' : '') },
        h('div', { class: 'confetti', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (k) { return h('i', { style: { '--k': k } }); })),
        h('div', { class: 'ring', style: { '--p': sc.total } }, h('div', { class: 'ring-in' }, h('b', null, String(sc.total)), h('span', null, 'מתוך 100'))),
        h('div', { class: 'score-txt' },
          h('h3', null, scoreMsg(sc.total)),
          h('p', { class: 'muted' }, 'ציון אוטומטי - המורה יאשר'),
          h('table', { class: 'brk' }, h('tbody', null,
            brow('בדיקות הקוד', sc.tests, 60), brow('הבנה, תכנון וחיזוי', sc.planning, 25), brow('רפלקציה', sc.reflection, 15),
            sc.hintPenalty ? h('tr', { class: 'neg' }, h('td', null, 'הפחתה בגלל רמזים'), h('td', { class: 'num' }, '-' + sc.hintPenalty), h('td', null)) : null))),
        h('div', { class: 'score-act' }, h('a', { class: 'btn primary', href: '#' + ctx.ws.id }, ico('arrowL'), h('span', null, 'חזרה לסדנה')), h('a', { class: 'btn ghost', href: '#home' }, ico('home'), h('span', null, 'לדף הבית'))));
      result.appendChild(card);
      card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }
    function brow(label, v, max) { return h('tr', null, h('td', null, label), h('td', { class: 'num', dir: 'ltr' }, v + ' / ' + max), h('td', null, h('div', { class: 'mini-meter' }, h('i', { style: { width: (100 * v / max) + '%' } })))); }
    function scoreMsg(t) { return t >= 90 ? 'עבודה מצוינת!' : t >= 75 ? 'כל הכבוד!' : t >= 55 ? 'יפה מאוד, אפשר לשפר' : 'התחלה טובה - כדאי לחזור ולהשלים'; }
    drawFoot();
    if (T.submitted && T.score && T.score.detail) drawResult(computeScore(task, T), false);
    else if (T.submitted && T.score) drawResult(T.score.hintPenalty != null ? T.score : computeScore(task, T), false);
  }

  /* ------------------------------------------------------------------ reset page (?reset=1) */
  function renderReset(main) {
    setTitle('איפוס נתונים');
    main.appendChild(h('div', { class: 'login-wrap' }, h('div', { class: 'card login-card' },
      h('h1', null, 'איפוס נתונים מקומיים'),
      h('p', null, 'פעולה זו תמחק מהמחשב הזה את כל ההתקדמות, התשובות והקוד שנשמרו (גם אירועים שעוד לא נשלחו). אי אפשר לבטל.'),
      h('div', { class: 'row' },
        btn('כן, למחוק הכול', { cls: 'danger', icon: 'trash', onClick: function () {
          try { Object.keys(localStorage).filter(function (k) { return k.indexOf('cw:') === 0; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { /* noop */ }
          location.href = location.pathname;
        } }),
        h('a', { class: 'btn ghost', href: location.pathname }, 'ביטול')))));
  }

  /* ------------------------------------------------------------------ boot */
  function loadWorkshops() {
    return Promise.all(WORKSHOP_IDS.map(function (id) {
      return fetch('data/' + id + '.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (j) { S.workshops[id] = j; })
        .catch(function () { S.workshops[id] = { error: true, id: id }; });
    }));
  }

  function boot() {
    var main = qs('#main');
    try {
      CWSync.init(CFG, { disabled: DEMO });
      CWSync.onStatus = updateChip;
      if (PARAMS.get('reset') === '1') { renderHeader(); renderReset(main); return; }
      if (DEMO) {
        S.student = DEMO_STUDENT;
        // The demo always starts fresh so the projector run is repeatable
        try { Object.keys(localStorage).filter(function (k) { return k.indexOf('cw:t:' + DEMO_STUDENT.phone) === 0; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { /* noop */ }
      } else {
        var st = Store.get('cw:student', null);
        if (st && st.name && st.phone) S.student = st;
      }
      CWSync.setStudent(S.student);
      renderHeader();
      main.appendChild(h('div', { class: 'wrap' }, h('p', { class: 'muted pad' }, 'טוענים את הסדנאות...')));
      loadWorkshops().then(function () {
        if (S.student && !DEMO) CWSync.event('login', { payload: { resumed: true, version: CFG.VERSION, w: window.innerWidth } });
        route();
      });
      window.addEventListener('hashchange', route);
    } catch (e) { showFatal(main, e); }
  }
  window.addEventListener('error', function (ev) { try { console.error(ev.error || ev.message); } catch (e) { /* noop */ } });
  window.addEventListener('unhandledrejection', function (ev) { try { console.error(ev.reason); } catch (e) { /* noop */ } });
  window.CWApp = { STAGES: STAGES, predictionMatches: predictionMatches, computeScore: computeScore, validateStudent: validateStudent };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
