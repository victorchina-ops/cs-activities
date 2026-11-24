// Node test for backend/Code.gs - no npm dependencies.
// Run: node test_mock.js
// Loads Code.gs into a vm context with an in-memory fake of the Apps Script services.

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');

const CODE_PATH = path.join(__dirname, 'Code.gs');
const CODE_SRC = fs.readFileSync(CODE_PATH, 'utf8');

/* ------------------------------------------------------------------ */
/* In-memory fake of the Apps Script services                         */
/* ------------------------------------------------------------------ */

class FakeRange {
  constructor(sheet, row, col, nRows, nCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.nRows = nRows;
    this.nCols = nCols;
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nRows; i++) {
      const line = [];
      for (let j = 0; j < this.nCols; j++) {
        line.push(this.sheet._get(this.row + i, this.col + j));
      }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (!Array.isArray(values) || values.length !== this.nRows) {
      throw new Error(`setValues: expected ${this.nRows} rows, got ${values && values.length}`);
    }
    values.forEach((line, i) => {
      if (!Array.isArray(line) || line.length !== this.nCols) {
        throw new Error(`setValues: row ${i} has ${line && line.length} cols, expected ${this.nCols}`);
      }
      line.forEach((v, j) => this.sheet._set(this.row + i, this.col + j, v));
    });
    this.sheet.writes += 1;
    return this;
  }
  setNumberFormat(fmt) {
    for (let i = 0; i < this.nRows; i++) {
      for (let j = 0; j < this.nCols; j++) {
        this.sheet.formats[`${this.row + i},${this.col + j}`] = fmt;
      }
    }
    return this;
  }
  setWrap(on) {
    for (let i = 0; i < this.nRows; i++) {
      for (let j = 0; j < this.nCols; j++) {
        this.sheet.wraps[`${this.row + i},${this.col + j}`] = on;
      }
    }
    return this;
  }
  // Formatting calls that need no state in the test.
  setFontWeight() { return this; }
  setBackground() { return this; }
  setHorizontalAlignment() { return this; }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.cells = [];        // cells[row-1][col-1]
    this.formats = {};
    this.wraps = {};
    this.rtl = false;
    this.frozenRows = 0;
    this.widths = {};
    this.hidden = [];
    this.writes = 0;
  }
  _get(r, c) {
    const line = this.cells[r - 1];
    const v = line ? line[c - 1] : undefined;
    return v === undefined ? '' : v;
  }
  _set(r, c, v) {
    while (this.cells.length < r) this.cells.push([]);
    const line = this.cells[r - 1];
    while (line.length < c - 1) line.push('');
    line[c - 1] = v === undefined ? '' : (v instanceof Date ? new Date(v.getTime()) : v);
  }
  getName() { return this.name; }
  getMaxRows() { return 1000; }
  getMaxColumns() { return 26; }
  getLastRow() {
    let last = 0;
    this.cells.forEach((line, i) => {
      if (line.some(v => v !== '' && v !== undefined && v !== null)) last = i + 1;
    });
    return last;
  }
  getLastColumn() {
    let last = 0;
    this.cells.forEach(line => {
      line.forEach((v, j) => {
        if (v !== '' && v !== undefined && v !== null) last = Math.max(last, j + 1);
      });
    });
    return last;
  }
  getDataRange() {
    return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }
  getRange(row, col, nRows = 1, nCols = 1) {
    return new FakeRange(this, row, col, nRows, nCols);
  }
  setRightToLeft(on) { this.rtl = on; return this; }
  setFrozenRows(n) { this.frozenRows = n; return this; }
  setColumnWidth(c, w) { this.widths[c] = w; return this; }
  hideColumns(c) { this.hidden.push(c); return this; }
}

class FakeSpreadsheet {
  constructor(id, store) {
    this.id = id;
    this.store = store;
    this.sheets = new Map();
  }
  getId() { return this.id; }
  getUrl() { return `https://example.test/${this.id}`; }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) {
    const s = new FakeSheet(name);
    this.sheets.set(name, s);
    return s;
  }
  getSheets() { return [...this.sheets.values()]; }
}

function makeEnv() {
  const store = {
    spreadsheets: new Map(),
    active: null,
    props: {},
    cache: new Map(),
    cacheTtls: [],
    lockHeld: false,
    lockCount: 0,
    logs: []
  };

  const fakeSpreadsheetApp = {
    getActiveSpreadsheet() { return store.active; },
    openById(id) {
      const ss = store.spreadsheets.get(id);
      if (!ss) throw new Error(`openById: no spreadsheet ${id}`);
      return ss;
    }
  };

  const fakeProperties = {
    getScriptProperties() {
      return {
        getProperty(k) { return Object.prototype.hasOwnProperty.call(store.props, k) ? store.props[k] : null; },
        setProperty(k, v) { store.props[k] = String(v); return this; }
      };
    }
  };

  const fakeLock = {
    getScriptLock() {
      return {
        waitLock() {
          if (store.lockHeld) throw new Error('lock busy');
          store.lockHeld = true;
          store.lockCount += 1;
        },
        releaseLock() { store.lockHeld = false; }
      };
    }
  };

  const fakeCache = {
    getScriptCache() {
      return {
        getAll(keys) {
          const out = {};
          keys.forEach(k => {
            if (k.length > 250) throw new Error('cache key too long');
            if (store.cache.has(k)) out[k] = store.cache.get(k);
          });
          return out;
        },
        putAll(map, ttl) {
          store.cacheTtls.push(ttl);
          Object.keys(map).forEach(k => store.cache.set(k, map[k]));
        },
        get(k) { return store.cache.has(k) ? store.cache.get(k) : null; },
        put(k, v, ttl) { store.cacheTtls.push(ttl); store.cache.set(k, v); }
      };
    }
  };

  const fakeContent = {
    MimeType: { JSON: 'application/json' },
    createTextOutput(text) {
      const out = {
        text,
        mime: null,
        setMimeType(m) { this.mime = m; return this; },
        getContent() { return this.text; }
      };
      return out;
    }
  };

  const fakeUtilities = {
    formatDate(date, tz, pattern) {
      if (pattern !== 'yyyy-MM-dd HH:mm:ss' || tz !== 'Asia/Jerusalem') {
        throw new Error(`formatDate: unsupported ${pattern} ${tz}`);
      }
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).formatToParts(date);
      const p = {};
      parts.forEach(x => { p[x.type] = x.value; });
      return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
    },
    getUuid() { return crypto.randomUUID(); }
  };

  const fakeLogger = { log(msg) { store.logs.push(String(msg)); } };

  const sandbox = {
    SpreadsheetApp: fakeSpreadsheetApp,
    PropertiesService: fakeProperties,
    LockService: fakeLock,
    CacheService: fakeCache,
    ContentService: fakeContent,
    Utilities: fakeUtilities,
    Logger: fakeLogger,
    console
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(CODE_SRC, ctx, { filename: 'Code.gs' });

  // Creates a bound spreadsheet with the given id and makes it the active one.
  function bindSpreadsheet(id) {
    const ss = new FakeSpreadsheet(id, store);
    store.spreadsheets.set(id, ss);
    store.active = ss;
    return ss;
  }

  return { ctx, store, bindSpreadsheet };
}

/* ------------------------------------------------------------------ */
/* Helpers for the tests                                              */
/* ------------------------------------------------------------------ */

const KEY = 'maaleh-cs-2026';
let uid = 0;
function eid(prefix = 'e') { uid += 1; return `${prefix}-${uid}-${crypto.randomUUID()}`; }

// Plain JS copy of a value created in the vm realm (so deepStrictEqual works).
function plain(v) { return JSON.parse(JSON.stringify(v)); }

function post(ctx, body) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const out = ctx.doPost({ postData: { contents: raw, type: 'text/plain' } });
  return plain(JSON.parse(out.getContent()));
}

function get(ctx, params) {
  const out = ctx.doGet({ parameter: params });
  return plain(JSON.parse(out.getContent()));
}

function sheetOf(store, name) {
  const ss = store.active;
  const sh = ss.getSheetByName(name);
  assert.ok(sh, `missing sheet ${name}`);
  return sh;
}

function rowsOf(store, name) {
  const sh = sheetOf(store, name);
  const out = [];
  for (let r = 1; r <= sh.getLastRow(); r++) {
    const line = [];
    for (let c = 1; c <= sh.getLastColumn(); c++) line.push(sh._get(r, c));
    out.push(line);
  }
  return plain(out);
}

function findSummary(store, phone, task) {
  const rows = rowsOf(store, 'סיכום');
  const hit = rows.find((r, i) => i > 0 && r[1] === phone && r[3] === task);
  assert.ok(hit, `no summary row for ${phone} ${task}`);
  return hit;
}

function ev(overrides) {
  return Object.assign({
    v: 1,
    eventId: eid(),
    ts: '2026-11-25T08:15:00.000Z',
    sessionId: 'sess-1',
    student: { name: 'דנה כהן', phone: '050-123-4567' },
    workshop: 'w1',
    task: 'w1t1',
    type: 'run',
    stage: 'code',
    code: 'class Program { }'
  }, overrides);
}

function freshEnvWithSetup() {
  const env = makeEnv();
  env.bindSpreadsheet('SHEET-TEST-1');
  const msg = env.ctx.setup();
  assert.strictEqual(msg, 'הגיליון מוכן');
  return env;
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('setup creates the four tabs with Hebrew names, RTL, headers and settings', () => {
  const { ctx, store } = freshEnvWithSetup();
  assert.strictEqual(store.props.SHEET_ID, 'SHEET-TEST-1');
  const names = store.active.getSheets().map(s => s.getName()).sort();
  assert.deepStrictEqual(names, ['אירועים', 'הגדרות', 'סיכום', 'תלמידים'].sort());

  const headers = {
    'אירועים': ['זמן', 'שם', 'טלפון', 'סדנה', 'משימה', 'סוג', 'שלב', 'בדיקות עברו', 'מתוך', 'רמזים', 'ציון', 'קוד', 'פרטים (JSON)', 'eventId', 'sessionId'],
    'סיכום': ['שם', 'טלפון', 'סדנה', 'משימה', 'שלב אחרון', 'אינדקס שלב', 'הרצות', 'הרצות בדיקה', 'בדיקות עברו (מיטב)', 'מתוך', 'רמזים', 'הוגש', 'ציון אוטומטי', 'ציון מאושר', 'הערות מורה', 'זמן כולל (דק\')', 'התחלה', 'עדכון אחרון', 'קוד אחרון', 'שניות (עזר)'],
    'תלמידים': ['שם', 'טלפון', 'כניסה ראשונה', 'כניסה אחרונה', 'מספר כניסות', 'שמות קודמים']
  };
  for (const [name, h] of Object.entries(headers)) {
    const sh = sheetOf(store, name);
    assert.deepStrictEqual(plain(sh.getRange(1, 1, 1, h.length).getValues()[0]), h, `headers of ${name}`);
    assert.strictEqual(sh.rtl, true, `RTL on ${name}`);
    assert.strictEqual(sh.frozenRows, 1, `frozen header on ${name}`);
  }
  assert.deepStrictEqual(rowsOf(store, 'הגדרות').slice(0, 3), [
    ['מפתח', 'ערך'], ['APP_KEY', KEY], ['ACCEPTING', 'כן']
  ]);
  // Phone columns are plain text, so the leading 0 survives.
  assert.strictEqual(sheetOf(store, 'סיכום').formats['2,2'], '@');
  assert.strictEqual(sheetOf(store, 'אירועים').formats['2,3'], '@');
  // The helper column of the summary is hidden.
  assert.ok(sheetOf(store, 'סיכום').hidden.includes(20));
  // Code column does not wrap.
  assert.strictEqual(sheetOf(store, 'אירועים').wraps['2,12'], false);

  // Running setup again keeps the teacher's changes to the settings.
  const settings = sheetOf(store, 'הגדרות');
  settings.getRange(2, 2, 1, 1).setValues([['my-new-key']]);
  ctx.setup();
  assert.strictEqual(readSetting(store, 'APP_KEY'), 'my-new-key');
  assert.strictEqual(rowsOf(store, 'הגדרות').length, 3);
});

function readSetting(store, key) {
  const row = rowsOf(store, 'הגדרות').find(r => r[0] === key);
  return row ? row[1] : undefined;
}

test('doPost batch of mixed events: valid stored, invalid rejected, rows formatted', () => {
  const { ctx, store } = freshEnvWithSetup();
  const dana = { name: 'דנה כהן', phone: '050-123-4567' };
  const yoni = { name: 'יונה לוי', phone: '0529876543' };
  const events = [
    ev({ eventId: 'e1', type: 'login', task: '', stage: '', code: undefined, student: dana }),
    ev({ eventId: 'e2', type: 'stage_complete', stage: 'understand', code: undefined, payload: { durationSec: 30 }, student: dana }),
    ev({ eventId: 'e3', type: 'stage_complete', stage: 'plan', code: undefined, payload: { durationSec: 45 }, student: dana }),
    ev({ eventId: 'e4', type: 'run', stage: 'code', code: 'Console.WriteLine(1);', student: dana }),
    ev({ eventId: 'e5', type: 'test_run', stage: 'tests', testsPassed: 3, testsTotal: 6, student: dana }),
    ev({ eventId: 'e6', type: 'hint', stage: 'code', hintsUsed: 1, code: undefined, student: dana }),
    ev({ eventId: 'e7', type: 'submit', stage: 'reflect', testsPassed: 6, testsTotal: 6, score: { total: 87, tests: 60, planning: 15, reflection: 12, hintPenalty: 0 }, code: 'final code', student: dana }),
    ev({ eventId: 'e8', type: 'login', task: '', stage: '', code: undefined, student: yoni }),
    ev({ eventId: 'e9', type: 'run', task: 'w1t2', stage: 'code', student: yoni }),
    // invalid ones
    ev({ eventId: 'b1', student: { name: 'x', phone: '0601234567' } }),        // bad phone
    ev({ eventId: 'b2', type: 'cheat' }),                                      // bad type
    ev({ eventId: '', student: dana })                                          // empty eventId
  ];
  const res = post(ctx, { key: KEY, events });
  assert.deepStrictEqual(res, { ok: true, stored: 9, duplicates: 0, rejected: 3 });

  const log = rowsOf(store, 'אירועים');
  assert.strictEqual(log.length, 10, 'header + 9 log rows');
  assert.strictEqual(log[1][2], '0501234567', 'phone normalised and kept as text');
  assert.match(log[1][0], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'time in Jerusalem format');
  assert.strictEqual(log[1][13], 'e1');
  // details JSON is stored in column 13
  assert.ok(log[2][12].startsWith('{'), 'details is JSON');

  // Students: one row per phone
  const students = rowsOf(store, 'תלמידים');
  assert.strictEqual(students.length, 3, 'header + 2 students');
  assert.deepStrictEqual(students[1].slice(0, 2), ['דנה כהן', '0501234567']);
  assert.strictEqual(students[1][4], 1);

  // Summary for Dana / w1t1
  const row = findSummary(store, '0501234567', 'w1t1');
  const h = rowsOf(store, 'סיכום')[0];
  const val = name => row[h.indexOf(name)];
  assert.strictEqual(val('שם'), 'דנה כהן');
  assert.strictEqual(val('שלב אחרון'), 'הוגש');
  assert.strictEqual(val('אינדקס שלב'), 7);
  assert.strictEqual(val('הרצות'), 1);
  assert.strictEqual(val('הרצות בדיקה'), 1);
  assert.strictEqual(val('בדיקות עברו (מיטב)'), 6);
  assert.strictEqual(val('מתוך'), 6);
  assert.strictEqual(val('רמזים'), 1);
  assert.strictEqual(val('הוגש'), 'כן');
  assert.strictEqual(val('ציון אוטומטי'), 87);
  assert.strictEqual(val('זמן כולל (דק\')'), 1.3, '75 s is 1.3 min');
  assert.strictEqual(val('קוד אחרון'), 'final code');
  assert.strictEqual(row[1], '0501234567');

  // Yoni's run for w1t2
  const yoniRow = findSummary(store, '0529876543', 'w1t2');
  assert.strictEqual(yoniRow[h.indexOf('שלב אחרון')], 'קוד');
  assert.strictEqual(sheetOf(store, 'סיכום').getLastRow(), 3, 'header + 2 summary rows');
});

test('duplicate eventIds (across batches and inside one batch) are ignored', () => {
  const { ctx, store } = freshEnvWithSetup();
  const a = ev({ eventId: 'dup-a', type: 'run', stage: 'code' });
  const b = ev({ eventId: 'dup-b', type: 'run', stage: 'code' });
  let res = post(ctx, { key: KEY, events: [a, b] });
  assert.deepStrictEqual(res, { ok: true, stored: 2, duplicates: 0, rejected: 0 });

  res = post(ctx, { key: KEY, events: [a, b] });
  assert.deepStrictEqual(res, { ok: true, stored: 0, duplicates: 2, rejected: 0 });

  const c = ev({ eventId: 'dup-c', type: 'run', stage: 'code' });
  res = post(ctx, { key: KEY, events: [c, c] });
  assert.deepStrictEqual(res, { ok: true, stored: 1, duplicates: 1, rejected: 0 });

  assert.strictEqual(sheetOf(store, 'אירועים').getLastRow(), 1 + 2 + 1, 'log not duplicated');
  const sum = rowsOf(store, 'סיכום');
  assert.strictEqual(sum[1][6], 3, 'run counter counts stored events only (a, b, c)');
});

test('teacher columns (ציון מאושר, הערות מורה) are never overwritten', () => {
  const { ctx, store } = freshEnvWithSetup();
  const dana = { name: 'דנה כהן', phone: '0501234567' };
  post(ctx, { key: KEY, events: [ev({ eventId: 't1', type: 'run', stage: 'code', student: dana })] });

  // The teacher types a mark and a note in row 2.
  sheetOf(store, 'סיכום').getRange(2, 14, 1, 2).setValues([[95, 'מצוין']]);

  const res = post(ctx, { key: KEY, events: [
    ev({ eventId: 't2', type: 'run', stage: 'skeleton', student: dana }),
    ev({ eventId: 't3', type: 'stage_complete', stage: 'understand', payload: { durationSec: 10 }, student: dana })
  ] });
  assert.strictEqual(res.stored, 2);
  const row = rowsOf(store, 'סיכום')[1];
  assert.strictEqual(row[13], 95, 'approved score kept');
  assert.strictEqual(row[14], 'מצוין', 'teacher note kept');
  assert.strictEqual(row[6], 2, 'run counter updated');
  assert.strictEqual(row[4], 'קוד', 'code stays the furthest stage, skeleton does not move it back');
  assert.strictEqual(row[5], 5);
});

test('stage never goes backwards, auto score keeps the best submitted total, time sums stage_complete only', () => {
  const { ctx, store } = freshEnvWithSetup();
  const s = { name: 'אבי', phone: '0551112233' };
  const base = { student: s, workshop: 'w2', task: 'w2t3' };
  post(ctx, { key: KEY, events: [
    ev(Object.assign({ eventId: 'm1', type: 'submit', stage: 'reflect', testsPassed: 4, testsTotal: 6, score: { total: 60 } }, base)),
    ev(Object.assign({ eventId: 'm2', type: 'submit', stage: 'reflect', testsPassed: 6, testsTotal: 6, score: { total: 80 } }, base)),
    ev(Object.assign({ eventId: 'm3', type: 'submit', stage: 'reflect', testsPassed: 5, testsTotal: 6, score: { total: 70 } }, base)),
    ev(Object.assign({ eventId: 'm4', type: 'stage_complete', stage: 'understand', payload: { durationSec: 20 } }, base)),
    ev(Object.assign({ eventId: 'm5', type: 'hint', stage: 'code', hintsUsed: 2 }, base)),
    ev(Object.assign({ eventId: 'm6', type: 'stage_complete', stage: 'plan', payload: { durationSec: 'x' } }, base))
  ] });
  const h = rowsOf(store, 'סיכום')[0];
  const row = findSummary(store, '0551112233', 'w2t3');
  assert.strictEqual(row[h.indexOf('ציון אוטומטי')], 80);
  assert.strictEqual(row[h.indexOf('שלב אחרון')], 'הוגש');
  assert.strictEqual(row[h.indexOf('זמן כולל (דק\')')], 0.3, '20 s is 0.3 min, bad durationSec ignored');
  assert.strictEqual(row[h.indexOf('רמזים')], 2);
  assert.strictEqual(row[h.indexOf('בדיקות עברו (מיטב)')], 6);
});

test('login with a different name keeps latest name and records the old one', () => {
  const { ctx, store } = freshEnvWithSetup();
  post(ctx, { key: KEY, events: [ev({ eventId: 'n1', type: 'login', task: '', stage: '', student: { name: 'דנה כהן', phone: '0501234567' } })] });
  post(ctx, { key: KEY, events: [ev({ eventId: 'n2', type: 'login', task: '', stage: '', student: { name: 'דנה לוי', phone: '0501234567' } })] });
  post(ctx, { key: KEY, events: [ev({ eventId: 'n3', type: 'login', task: '', stage: '', student: { name: 'דנה לוי', phone: '0501234567' } })] });
  const students = rowsOf(store, 'תלמידים');
  assert.strictEqual(students.length, 2, 'still one row for the phone');
  assert.strictEqual(students[1][0], 'דנה לוי');
  assert.strictEqual(students[1][4], 3, 'three logins');
  assert.strictEqual(students[1][5], 'דנה כהן', 'old name recorded');
});

test('settings: bad key, malformed JSON, missing events, closed', () => {
  const { ctx, store } = freshEnvWithSetup();
  const e = [ev({ eventId: 'k1' })];
  assert.deepStrictEqual(post(ctx, { key: 'wrong', events: e }), { ok: false, error: 'bad key' });
  assert.deepStrictEqual(post(ctx, '{"key": "maaleh-cs-2026", "events": [', {}).ok, false);
  assert.deepStrictEqual(post(ctx, '{"key": "maaleh-cs-2026", "events": [', {}).error, 'bad json');
  assert.deepStrictEqual(post(ctx, { key: KEY }), { ok: false, error: 'no events' });

  sheetOf(store, 'הגדרות').getRange(3, 2, 1, 1).setValues([['לא']]);
  assert.deepStrictEqual(post(ctx, { key: KEY, events: e }), { ok: false, error: 'closed' });
  // Nothing was stored while closed.
  assert.strictEqual(sheetOf(store, 'אירועים').getLastRow(), 1);
  sheetOf(store, 'הגדרות').getRange(3, 2, 1, 1).setValues([['כן']]);
  assert.deepStrictEqual(post(ctx, { key: KEY, events: e }), { ok: true, stored: 1, duplicates: 0, rejected: 0 });
  assert.strictEqual(store.lockHeld, false, 'lock released');
});

test('batch of 50 events is stored in one pass', () => {
  const { ctx, store } = freshEnvWithSetup();
  const students = [
    { name: 'תלמיד 1', phone: '0501000001' }, { name: 'תלמידה 2', phone: '0501000002' },
    { name: 'תלמיד 3', phone: '0501000003' }, { name: 'תלמידה 4', phone: '0501000004' },
    { name: 'תלמיד 5', phone: '0501000005' }
  ];
  const tasks = ['w1t1', 'w1t2', 'w2t1', 'w2t2', 'w3t1'];
  const events = [];
  for (let i = 0; i < 50; i++) {
    const st = students[i % 5];
    const type = i < 5 ? 'login' : (i % 3 === 0 ? 'test_run' : 'run');
    events.push(ev({
      eventId: `bulk-${i}`,
      student: st,
      task: type === 'login' ? '' : tasks[(i >> 1) % 5],
      type,
      stage: type === 'login' ? '' : 'code',
      testsPassed: type === 'test_run' ? (i % 7) : undefined,
      testsTotal: type === 'test_run' ? 6 : undefined,
      code: `// attempt ${i}`
    }));
  }
  const before = sheetOf(store, 'אירועים').getLastRow();
  const writesBefore = sheetOf(store, 'אירועים').writes;
  const res = post(ctx, { key: KEY, events });
  assert.deepStrictEqual(res, { ok: true, stored: 50, duplicates: 0, rejected: 0 });
  assert.strictEqual(sheetOf(store, 'אירועים').getLastRow(), before + 50);
  // One setValues call for the whole log block.
  assert.strictEqual(sheetOf(store, 'אירועים').writes - writesBefore, 1);
  assert.strictEqual(sheetOf(store, 'תלמידים').getLastRow(), 6, 'five students plus header');
  assert.ok(sheetOf(store, 'סיכום').getLastRow() > 1);
  // Code was kept as sent.
  const log = rowsOf(store, 'אירועים');
  assert.strictEqual(log[log.length - 1][11], '// attempt 49');
});

test('code and JSON details are capped at 40000 characters; batches above 100 are rejected', () => {
  const { ctx, store } = freshEnvWithSetup();
  const big = 'x'.repeat(50000);
  post(ctx, { key: KEY, events: [ev({ eventId: 'big-1', type: 'run', code: big, payload: { blob: big } })] });
  const log = rowsOf(store, 'אירועים');
  assert.strictEqual(log[1][11].length, 40000);
  assert.ok(log[1][12].length <= 40000);

  const many = [];
  for (let i = 0; i < 105; i++) many.push(ev({ eventId: `many-${i}`, type: 'run' }));
  const res = post(ctx, { key: KEY, events: many });
  assert.deepStrictEqual(res, { ok: true, stored: 100, duplicates: 0, rejected: 5 });
});

test('doGet ping and progress (name case-insensitive, phone must match)', () => {
  const { ctx, store } = freshEnvWithSetup();
  post(ctx, { key: KEY, events: [
    ev({ eventId: 'g1', type: 'stage_complete', stage: 'understand', payload: { durationSec: 10 }, student: { name: 'Dana Cohen', phone: '0541111111' } }),
    ev({ eventId: 'g2', type: 'test_run', stage: 'tests', testsPassed: 4, testsTotal: 6, code: 'tested', student: { name: 'Dana Cohen', phone: '0541111111' } }),
    ev({ eventId: 'g3', type: 'submit', stage: 'reflect', testsPassed: 5, testsTotal: 6, score: { total: 73 }, code: 'final code', student: { name: 'Dana Cohen', phone: '0541111111' }, task: 'w1t2' }),
    ev({ eventId: 'g4', type: 'run', stage: 'code', code: 'last code', task: 'w1t1', student: { name: 'Dana Cohen', phone: '0541111111' } })
  ] });

  assert.deepStrictEqual(get(ctx, { action: 'ping' }), { ok: true, version: '1.0.0' });

  const p = get(ctx, { action: 'progress', name: '  dana COHEN ', phone: '054-111-1111' });
  assert.strictEqual(p.ok, true);
  assert.deepStrictEqual(Object.keys(p.tasks).sort(), ['w1t1', 'w1t2']);
  assert.deepStrictEqual(p.tasks.w1t2, {
    lastStage: 'submitted', stageIndex: 7, bestPassed: 5, testsTotal: 6,
    submitted: true, score: 73, code: 'final code'
  });
  assert.strictEqual(p.tasks.w1t1.submitted, false);
  assert.strictEqual(p.tasks.w1t1.score, null);
  assert.strictEqual(p.tasks.w1t1.lastStage, 'code');
  assert.strictEqual(p.tasks.w1t1.code, 'last code');

  assert.deepStrictEqual(get(ctx, { action: 'progress', name: 'Dana Cohen', phone: '0541111112' }), { ok: true, tasks: {} });
  assert.deepStrictEqual(get(ctx, { action: 'progress', name: 'Someone Else', phone: '0541111111' }), { ok: true, tasks: {} });
  assert.deepStrictEqual(get(ctx, { action: 'progress', name: '', phone: '' }), { ok: true, tasks: {} });
  assert.strictEqual(get(ctx, { action: 'nope' }).ok, false);
});

test('bad input never throws: missing body and no sheet give ok:false', () => {
  const env = makeEnv();
  const res = plain(JSON.parse(env.ctx.doPost({}).getContent()));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(typeof res.error, 'string');
  const res2 = plain(JSON.parse(env.ctx.doGet({ parameter: { action: 'progress', name: 'a', phone: '0501234567' } }).getContent()));
  assert.strictEqual(res2.ok, false);
});

test('testInsertSample writes three sample events and the sample student', () => {
  const { ctx, store } = freshEnvWithSetup();
  const result = plain(ctx.testInsertSample());
  assert.deepStrictEqual(result, { ok: true, stored: 3, duplicates: 0, rejected: 0 });
  assert.strictEqual(sheetOf(store, 'אירועים').getLastRow(), 4);
  const students = rowsOf(store, 'תלמידים');
  assert.deepStrictEqual(students[1].slice(0, 2), ['בדיקה', '0500000000']);
  const row = findSummary(store, '0500000000', 'w1t1');
  assert.strictEqual(row[0], 'בדיקה');
  assert.strictEqual(store.lockHeld, false);
});

/* ------------------------------------------------------------------ */

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log(`PASS  ${t.name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${t.name}`);
    console.log(`      ${err && err.message ? err.message.split('\n').join('\n      ') : err}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
