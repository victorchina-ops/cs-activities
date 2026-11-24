/* Event queue + batched sync to the Apps Script endpoint.
 * Events are persisted in localStorage so a closed tab or a dead network never loses data. */
(function () {
  'use strict';
  var QKEY = 'cw:queue';
  var MAX_QUEUE = 400;
  var RUN_INTERVAL_MS = 20000;
  var FLUSH_EVERY_MS = 8000 + Math.floor(Math.random() * 4000); // jittered so a whole class does not post at the same instant

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  var Sync = {
    cfg: {}, student: null, disabled: false, sessionId: uuid(),
    queue: [], failures: 0, nextTry: 0, sending: false, onStatus: null,
    runAgg: {}, lastState: '', offline: false, _timer: null
  };

  function loadQueue() {
    try { var q = JSON.parse(localStorage.getItem(QKEY) || '[]'); return Array.isArray(q) ? q : []; }
    catch (e) { return []; }
  }
  function saveQueue() {
    try { localStorage.setItem(QKEY, JSON.stringify(Sync.queue)); }
    catch (e) {
      // Storage full: drop the oldest half so we keep working
      Sync.queue = Sync.queue.slice(Math.floor(Sync.queue.length / 2));
      try { localStorage.setItem(QKEY, JSON.stringify(Sync.queue)); } catch (e2) { /* give up silently */ }
    }
  }

  Sync.hasEndpoint = function () { return !!(Sync.cfg && Sync.cfg.ENDPOINT); };

  Sync.status = function () {
    if (Sync.disabled) return { state: 'demo', n: 0 };
    if (!Sync.hasEndpoint()) return { state: 'practice', n: Sync.queue.length };
    if (Sync.offline && Sync.queue.length) return { state: 'offline', n: Sync.queue.length };
    if (Sync.queue.length) return { state: 'pending', n: Sync.queue.length };
    return { state: 'saved', n: 0 };
  };
  function notify() {
    var s = Sync.status();
    var sig = s.state + ':' + s.n;
    if (sig === Sync.lastState) return;
    Sync.lastState = sig;
    if (typeof Sync.onStatus === 'function') { try { Sync.onStatus(s); } catch (e) { /* ignore */ } }
  }

  Sync.init = function (cfg, opts) {
    Sync.cfg = cfg || {};
    Sync.disabled = !!(opts && opts.disabled);
    Sync.queue = Sync.disabled ? [] : loadQueue();
    clearInterval(Sync._timer);
    Sync._timer = setInterval(function () { Sync.flush(false); }, FLUSH_EVERY_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { Sync.flushAgg(); Sync.flush(true, true); }
    });
    window.addEventListener('pagehide', function () { Sync.flushAgg(); Sync.flush(true, true); });
    window.addEventListener('online', function () { Sync.failures = 0; Sync.nextTry = 0; Sync.flush(true); });
    notify();
  };

  Sync.setStudent = function (s) { Sync.student = s ? { name: s.name, phone: s.phone } : null; };

  /* Build and enqueue an event. fields: workshop, task, stage, testsPassed, testsTotal, hintsUsed, score, code, payload */
  Sync.event = function (type, fields) {
    if (Sync.disabled || !Sync.student) return null;
    fields = fields || {};
    var ev = {
      v: 1, eventId: uuid(), ts: new Date().toISOString(), sessionId: Sync.sessionId,
      student: Sync.student, workshop: fields.workshop || '', task: fields.task || '',
      type: type, stage: fields.stage || ''
    };
    ['testsPassed', 'testsTotal', 'hintsUsed', 'score', 'code'].forEach(function (k) {
      if (fields[k] !== undefined && fields[k] !== null) ev[k] = fields[k];
    });
    ev.payload = fields.payload || {};
    Sync.queue.push(ev);
    if (Sync.queue.length > MAX_QUEUE) {
      // Prefer dropping old 'run' events, then the oldest ones
      var idx = Sync.queue.findIndex(function (e) { return e.type === 'run'; });
      Sync.queue.splice(idx >= 0 ? idx : 0, 1);
    }
    saveQueue();
    notify();
    if (type === 'stage_complete' || type === 'submit' || type === 'login') {
      Sync.flushAgg(fields.task);
      setTimeout(function () { Sync.flush(true); }, 250);
    }
    return ev;
  };

  /* 'run' events are throttled: at most one per task per 20 s, carrying an aggregate count. */
  Sync.run = function (fields) {
    if (Sync.disabled) return;
    var t = fields.task || '';
    var a = Sync.runAgg[t] || (Sync.runAgg[t] = { count: 0, last: 0, fields: null });
    a.count++; a.fields = fields;
    if (Date.now() - a.last >= RUN_INTERVAL_MS) emitRun(t);
  };
  function emitRun(t) {
    var a = Sync.runAgg[t];
    if (!a || !a.count || !a.fields) return;
    var f = Object.assign({}, a.fields);
    f.payload = Object.assign({}, f.payload || {}, { count: a.count });
    a.count = 0; a.last = Date.now();
    Sync.event('run', f);
  }
  Sync.flushAgg = function (task) {
    if (task) emitRun(task);
    else Object.keys(Sync.runAgg).forEach(emitRun);
  };

  function takeBatch(maxBytes) {
    var batch = [], size = 0;
    for (var i = 0; i < Sync.queue.length && batch.length < 30; i++) {
      var s = JSON.stringify(Sync.queue[i]).length;
      if (batch.length && size + s > maxBytes) break;
      batch.push(Sync.queue[i]); size += s;
    }
    return { batch: batch, size: size };
  }

  Sync.flush = function (force, keepalive) {
    if (Sync.disabled || !Sync.hasEndpoint()) { notify(); return Promise.resolve(false); }
    if (Sync.sending || !Sync.queue.length) return Promise.resolve(false);
    if (!force && Date.now() < Sync.nextTry) return Promise.resolve(false);
    if (force && Date.now() < Sync.nextTry && Sync.failures > 0 && !keepalive) return Promise.resolve(false);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { Sync.offline = true; notify(); return Promise.resolve(false); }
    var tb = takeBatch(keepalive ? 55000 : 180000);
    var batch = tb.batch;
    var useKeep = !!keepalive && tb.size < 58000;
    Sync.sending = true;
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var to = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
    return fetch(Sync.cfg.ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key: Sync.cfg.APP_KEY, events: batch }),
      keepalive: useKeep,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.ok !== true) throw new Error('bad response');
      var ids = {}; batch.forEach(function (e) { ids[e.eventId] = 1; });
      Sync.queue = Sync.queue.filter(function (e) { return !ids[e.eventId]; });
      saveQueue();
      Sync.failures = 0; Sync.nextTry = 0; Sync.offline = false;
      Sync.sending = false; if (to) clearTimeout(to); notify();
      if (Sync.queue.length) setTimeout(function () { Sync.flush(true); }, 100);
      return true;
    }).catch(function () {
      Sync.sending = false; if (to) clearTimeout(to);
      Sync.failures++; Sync.offline = true;
      // Exponential backoff: 5s, 10s, 20s ... capped at 2 min
      Sync.nextTry = Date.now() + Math.min(120000, 5000 * Math.pow(2, Math.min(Sync.failures - 1, 5))) + Math.floor(Math.random() * 3000);
      notify();
      return false;
    });
  };

  /* GET progress for a student (used to restore work on a new computer). Resolves null on failure. */
  Sync.fetchProgress = function (name, phone) {
    if (!Sync.hasEndpoint()) return Promise.resolve(null);
    var url = Sync.cfg.ENDPOINT + (Sync.cfg.ENDPOINT.indexOf('?') >= 0 ? '&' : '?') +
      'action=progress&name=' + encodeURIComponent(name) + '&phone=' + encodeURIComponent(phone);
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var to = ctrl ? setTimeout(function () { ctrl.abort(); }, 7000) : null;
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined }).then(function (r) { return r.json(); })
      .then(function (j) { if (to) clearTimeout(to); return (j && j.ok) ? j : null; })
      .catch(function () { if (to) clearTimeout(to); return null; });
  };

  Sync.uuid = uuid;
  window.CWSync = Sync;
})();
