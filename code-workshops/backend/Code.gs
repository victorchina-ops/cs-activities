/**
 * Backend for the code-workshops activity (Google Apps Script web app).
 *
 * Bound to a Google Sheet. The teacher runs setup() once by hand; after that the
 * web app (doPost / doGet) stores student events and per-task summaries in the sheet.
 * Deployment steps are in README.md next to this file.
 */

var VERSION = '1.0.0';

var PROP_SHEET_ID = 'SHEET_ID';
var SHEET_LOG = 'אירועים';
var SHEET_SUMMARY = 'סיכום';
var SHEET_STUDENTS = 'תלמידים';
var SHEET_SETTINGS = 'הגדרות';

var DEFAULT_APP_KEY = 'maaleh-cs-2026';
var STATUS_OPEN = 'כן';
var STATUS_CLOSED = 'לא';

var EVENT_TYPES = ['login', 'stage_complete', 'run', 'test_run', 'hint', 'submit'];
var STAGE_ORDER = ['understand', 'plan', 'tests', 'skeleton', 'code', 'reflect', 'submitted'];
var STAGE_HE = ['הבנה', 'תכנון', 'בדיקות', 'שלד', 'קוד', 'רפלקציה', 'הוגש'];

var PHONE_RE = /^05\d{8}$/;
var MAX_CODE_CHARS = 40000;
var MAX_DETAILS_CHARS = 40000;
var MAX_EVENT_ID_CHARS = 100;
var MAX_BATCH = 100;
var DEDUPE_TTL_SEC = 6 * 60 * 60;
var LOCK_WAIT_MS = 20000;
var TZ = 'Asia/Jerusalem';
var TIME_PATTERN = 'yyyy-MM-dd HH:mm:ss';

var LOG_HEADERS = ['זמן', 'שם', 'טלפון', 'סדנה', 'משימה', 'סוג', 'שלב', 'בדיקות עברו', 'מתוך',
  'רמזים', 'ציון', 'קוד', 'פרטים (JSON)', 'eventId', 'sessionId'];
var LOG_WIDTHS = [140, 120, 110, 60, 70, 90, 90, 90, 70, 70, 60, 420, 320, 230, 160];
var LOG_TEXT_COLS = [1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15];
var LOG_NOWRAP_COLS = [12, 13];

var SUMMARY_HEADERS = ['שם', 'טלפון', 'סדנה', 'משימה', 'שלב אחרון', 'אינדקס שלב', 'הרצות',
  'הרצות בדיקה', 'בדיקות עברו (מיטב)', 'מתוך', 'רמזים', 'הוגש', 'ציון אוטומטי', 'ציון מאושר',
  'הערות מורה', 'זמן כולל (דק\')', 'התחלה', 'עדכון אחרון', 'קוד אחרון', 'שניות (עזר)'];
var SUMMARY_WIDTHS = [120, 110, 60, 70, 90, 80, 70, 90, 100, 70, 70, 70, 90, 90, 260, 90, 140, 140, 420, 90];
var SUMMARY_TEXT_COLS = [1, 2, 3, 4, 5, 12, 15, 17, 18, 19];
var SUMMARY_NOWRAP_COLS = [19];
var SUMMARY_HELPER_COL = 20;

var STUDENT_HEADERS = ['שם', 'טלפון', 'כניסה ראשונה', 'כניסה אחרונה', 'מספר כניסות', 'שמות קודמים'];
var STUDENT_WIDTHS = [120, 110, 140, 140, 100, 200];
var STUDENT_TEXT_COLS = [1, 2, 3, 4, 6];

// 0-based indexes of the columns of the summary sheet
var S = {
  NAME: 0, PHONE: 1, WORKSHOP: 2, TASK: 3, STAGE_HE: 4, STAGE_IDX: 5, RUNS: 6, TEST_RUNS: 7,
  BEST: 8, TOTAL: 9, HINTS: 10, SUBMITTED: 11, AUTO: 12, APPROVED: 13, NOTES: 14,
  MINUTES: 15, FIRST: 16, LAST: 17, CODE: 18, SECONDS: 19, COUNT: 20
};

// 0-based indexes of the columns of the students sheet
var ST = { NAME: 0, PHONE: 1, FIRST: 2, LAST: 3, LOGINS: 4, PREV: 5, COUNT: 6 };

/* ------------------------------------------------------------------ */
/* Setup (run by hand once from the Apps Script editor)               */
/* ------------------------------------------------------------------ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('פתחו את הסקריפט מתוך הגיליון (תוספים > Apps Script)');
  }
  PropertiesService.getScriptProperties().setProperty(PROP_SHEET_ID, ss.getId());

  var log = getOrCreateSheet_(ss, SHEET_LOG);
  styleSheet_(log, LOG_HEADERS, LOG_WIDTHS);
  formatColumns_(log, LOG_TEXT_COLS, LOG_NOWRAP_COLS);

  var summary = getOrCreateSheet_(ss, SHEET_SUMMARY);
  styleSheet_(summary, SUMMARY_HEADERS, SUMMARY_WIDTHS);
  formatColumns_(summary, SUMMARY_TEXT_COLS, SUMMARY_NOWRAP_COLS);
  summary.hideColumns(SUMMARY_HELPER_COL);

  var students = getOrCreateSheet_(ss, SHEET_STUDENTS);
  styleSheet_(students, STUDENT_HEADERS, STUDENT_WIDTHS);
  formatColumns_(students, STUDENT_TEXT_COLS, []);

  var settings = getOrCreateSheet_(ss, SHEET_SETTINGS);
  styleSheet_(settings, ['מפתח', 'ערך'], [180, 240]);
  formatColumns_(settings, [1, 2], []);
  ensureSetting_(settings, 'APP_KEY', DEFAULT_APP_KEY);
  ensureSetting_(settings, 'ACCEPTING', STATUS_OPEN);

  return 'הגיליון מוכן';
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function styleSheet_(sheet, headers, widths) {
  sheet.setRightToLeft(true);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  for (var i = 0; i < widths.length; i++) {
    sheet.setColumnWidth(i + 1, widths[i]);
  }
}

// Phone and other text columns get the "@" (plain text) format so that
// "0501234567" keeps its leading zero. Code columns do not wrap.
function formatColumns_(sheet, textCols, noWrapCols) {
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  textCols.forEach(function (c) {
    sheet.getRange(2, c, rows, 1).setNumberFormat('@');
  });
  noWrapCols.forEach(function (c) {
    sheet.getRange(2, c, rows, 1).setWrap(false);
  });
}

function ensureSetting_(sheet, key, value) {
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === key) {
      return;
    }
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues([[key, value]]);
}

/* ------------------------------------------------------------------ */
/* Web app entry points                                               */
/* ------------------------------------------------------------------ */

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
    var body = null;
    try {
      body = JSON.parse(raw);
    } catch (parseErr) {
      body = null;
    }
    if (!body || typeof body !== 'object') {
      return reply_({ ok: false, error: 'bad json' });
    }
    if (!Array.isArray(body.events)) {
      return reply_({ ok: false, error: 'no events' });
    }

    var ss = openSheet_();
    var settings = readSettings_(ss);
    if (!settings.APP_KEY || String(body.key || '').trim() !== settings.APP_KEY) {
      return reply_({ ok: false, error: 'bad key' });
    }
    if (settings.ACCEPTING !== STATUS_OPEN) {
      return reply_({ ok: false, error: 'closed' });
    }

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(LOCK_WAIT_MS);
    } catch (lockErr) {
      return reply_({ ok: false, error: 'busy' });
    }
    try {
      return reply_(processBatch_(ss, body.events));
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return reply_({ ok: false, error: errorText_(err) });
  }
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = cleanText_(p.action, 30);
    if (action === 'ping') {
      return reply_({ ok: true, version: VERSION });
    }
    if (action === 'progress') {
      return reply_(getProgress_(p.name, p.phone));
    }
    return reply_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return reply_({ ok: false, error: errorText_(err) });
  }
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/* Batch processing                                                   */
/* ------------------------------------------------------------------ */

function processBatch_(ss, rawEvents) {
  var list = rawEvents;
  var rejected = 0;
  if (list.length > MAX_BATCH) {
    rejected += list.length - MAX_BATCH;
    list = list.slice(0, MAX_BATCH);
  }

  var valid = [];
  for (var i = 0; i < list.length; i++) {
    var ev = normalizeEvent_(list[i]);
    if (ev) {
      valid.push(ev);
    } else {
      rejected++;
    }
  }

  // Dedupe: CacheService (6 h) for earlier batches, a local map for this batch.
  var cache = CacheService.getScriptCache();
  var keys = [];
  valid.forEach(function (ev) {
    var k = cacheKey_(ev.eventId);
    if (keys.indexOf(k) < 0) keys.push(k);
  });
  var cached = keys.length ? (cache.getAll(keys) || {}) : {};

  var seen = {};
  var fresh = [];
  var duplicates = 0;
  valid.forEach(function (ev) {
    var k = cacheKey_(ev.eventId);
    if (cached[k] || seen[k]) {
      duplicates++;
    } else {
      seen[k] = true;
      fresh.push(ev);
    }
  });

  if (!fresh.length) {
    return { ok: true, stored: 0, duplicates: duplicates, rejected: rejected };
  }

  appendLog_(requireSheet_(ss, SHEET_LOG), fresh);
  upsertStudents_(requireSheet_(ss, SHEET_STUDENTS), fresh.filter(function (ev) {
    return ev.type === 'login';
  }));
  upsertSummary_(requireSheet_(ss, SHEET_SUMMARY), fresh);

  var toCache = {};
  fresh.forEach(function (ev) {
    toCache[cacheKey_(ev.eventId)] = '1';
  });
  cache.putAll(toCache, DEDUPE_TTL_SEC);

  return { ok: true, stored: fresh.length, duplicates: duplicates, rejected: rejected };
}

function cacheKey_(eventId) {
  return 'ev:' + eventId;
}

// Returns a normalised event, or null when the event is invalid.
function normalizeEvent_(raw) {
  if (!raw || typeof raw !== 'object') return null;

  var eventId = cleanText_(raw.eventId, MAX_EVENT_ID_CHARS);
  if (!eventId) return null;

  var student = raw.student && typeof raw.student === 'object' ? raw.student : {};
  var name = cleanText_(student.name, 60);
  var phone = normPhone_(student.phone);
  if (!name || !PHONE_RE.test(phone)) return null;

  var type = cleanText_(raw.type, 30);
  if (EVENT_TYPES.indexOf(type) < 0) return null;

  var when = new Date(raw.ts);
  if (isNaN(when.getTime())) when = new Date();

  var stage = cleanText_(raw.stage, 20);
  if (STAGE_ORDER.indexOf(stage) < 0) stage = '';

  var score = raw.score && typeof raw.score === 'object' ? raw.score : null;
  var payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : {};

  return {
    eventId: eventId,
    when: when,
    sessionId: cleanText_(raw.sessionId, 100),
    name: name,
    phone: phone,
    workshop: cleanText_(raw.workshop, 20),
    task: cleanText_(raw.task, 40),
    type: type,
    stage: stage,
    testsPassed: toCount_(raw.testsPassed),
    testsTotal: toCount_(raw.testsTotal),
    hintsUsed: toCount_(raw.hintsUsed),
    scoreTotal: score && typeof score.total === 'number' && isFinite(score.total) ? score.total : null,
    score: score,
    payload: payload,
    durationSec: typeof payload.durationSec === 'number' && isFinite(payload.durationSec)
      ? payload.durationSec : null,
    // The code is capped, not trimmed: leading and trailing whitespace is part of the code.
    code: typeof raw.code === 'string' ? raw.code.slice(0, MAX_CODE_CHARS) : ''
  };
}

/* ------------------------------------------------------------------ */
/* Log sheet (append-only)                                            */
/* ------------------------------------------------------------------ */

function appendLog_(sheet, events) {
  var rows = events.map(function (ev) {
    return [
      fmtTime_(ev.when),
      safeText_(ev.name),
      ev.phone,
      safeText_(ev.workshop),
      safeText_(ev.task),
      ev.type,
      ev.stage,
      blankIfNull_(ev.testsPassed),
      blankIfNull_(ev.testsTotal),
      blankIfNull_(ev.hintsUsed),
      blankIfNull_(ev.scoreTotal),
      safeText_(ev.code),
      detailsJson_(ev),
      safeText_(ev.eventId),
      safeText_(ev.sessionId)
    ];
  });
  var start = sheet.getLastRow() + 1;
  sheet.getRange(start, 3, rows.length, 1).setNumberFormat('@');
  sheet.getRange(start, 1, rows.length, LOG_HEADERS.length).setValues(rows);
}

function detailsJson_(ev) {
  var s = JSON.stringify({ score: ev.score, payload: ev.payload }) || '';
  return safeText_(s.slice(0, MAX_DETAILS_CHARS));
}

/* ------------------------------------------------------------------ */
/* Students sheet (upsert on login events, keyed by phone)            */
/* ------------------------------------------------------------------ */

function upsertStudents_(sheet, logins) {
  if (!logins.length) return;

  var data = sheet.getDataRange().getValues();
  var byPhone = {};
  for (var r = 1; r < data.length; r++) {
    var phone = sheetPhone_(data[r][ST.PHONE]);
    if (phone && !byPhone[phone]) {
      byPhone[phone] = { row: r + 1, arr: padRow_(data[r], ST.COUNT), changed: false };
    }
  }

  var fresh = [];
  logins.forEach(function (ev) {
    var when = fmtTime_(ev.when);
    var rec = byPhone[ev.phone];
    if (!rec) {
      rec = {
        row: 0,
        arr: [safeText_(ev.name), ev.phone, when, when, 1, ''],
        changed: true
      };
      byPhone[ev.phone] = rec;
      fresh.push(rec);
      return;
    }
    var arr = rec.arr;
    if (ev.name !== arr[ST.NAME]) {
      arr[ST.PREV] = addPreviousName_(arr[ST.PREV], arr[ST.NAME], ev.name);
      arr[ST.NAME] = safeText_(ev.name);
    }
    if (!arr[ST.FIRST] || when < arr[ST.FIRST]) arr[ST.FIRST] = when;
    if (!arr[ST.LAST] || when > arr[ST.LAST]) arr[ST.LAST] = when;
    arr[ST.LOGINS] = num_(arr[ST.LOGINS]) + 1;
    rec.changed = true;
  });

  Object.keys(byPhone).forEach(function (k) {
    var rec = byPhone[k];
    if (rec.row && rec.changed) {
      sheet.getRange(rec.row, 1, 1, ST.COUNT).setValues([rec.arr]);
    }
  });
  if (fresh.length) {
    var start = sheet.getLastRow() + 1;
    sheet.getRange(start, 2, fresh.length, 1).setNumberFormat('@');
    sheet.getRange(start, 1, fresh.length, ST.COUNT).setValues(fresh.map(function (rec) {
      return rec.arr;
    }));
  }
}

// Keeps a list of earlier names, without duplicates and without the current name.
function addPreviousName_(list, oldName, newName) {
  var names = String(list || '').split(', ').filter(function (n) {
    return n && n !== newName;
  });
  if (oldName && names.indexOf(oldName) < 0 && oldName !== newName) {
    names.push(oldName);
  }
  return names.join(', ');
}

/* ------------------------------------------------------------------ */
/* Summary sheet (one row per phone + task, upserted)                 */
/* Teacher columns (ציון מאושר, הערות מורה) are never written.       */
/* ------------------------------------------------------------------ */

function upsertSummary_(sheet, events) {
  var relevant = events.filter(function (ev) {
    return ev.task && ev.type !== 'login';
  });
  if (!relevant.length) return;

  var data = sheet.getDataRange().getValues();
  var byKey = {};
  for (var r = 1; r < data.length; r++) {
    var phone = sheetPhone_(data[r][S.PHONE]);
    var task = cleanText_(data[r][S.TASK], 40);
    if (phone && task && !byKey[phone + '|' + task]) {
      byKey[phone + '|' + task] = { row: r + 1, arr: padRow_(data[r], S.COUNT), changed: false };
    }
  }

  var fresh = [];
  relevant.forEach(function (ev) {
    var key = ev.phone + '|' + ev.task;
    var rec = byKey[key];
    if (!rec) {
      rec = { row: 0, arr: blankSummaryRow_(ev), changed: true };
      byKey[key] = rec;
      fresh.push(rec);
    }
    applySummaryEvent_(rec.arr, ev);
    rec.changed = true;
  });

  Object.keys(byKey).forEach(function (k) {
    var rec = byKey[k];
    if (rec.row && rec.changed) {
      // Two writes so that the teacher columns (14, 15) are skipped.
      sheet.getRange(rec.row, 1, 1, 13).setValues([rec.arr.slice(0, 13)]);
      sheet.getRange(rec.row, 16, 1, 5).setValues([rec.arr.slice(15, 20)]);
    }
  });
  if (fresh.length) {
    var start = sheet.getLastRow() + 1;
    sheet.getRange(start, 2, fresh.length, 1).setNumberFormat('@');
    sheet.getRange(start, 1, fresh.length, S.COUNT).setValues(fresh.map(function (rec) {
      return rec.arr;
    }));
  }
}

function blankSummaryRow_(ev) {
  var arr = [];
  for (var i = 0; i < S.COUNT; i++) arr.push('');
  arr[S.PHONE] = ev.phone;
  arr[S.TASK] = ev.task;
  arr[S.STAGE_IDX] = 0;
  arr[S.RUNS] = 0;
  arr[S.TEST_RUNS] = 0;
  arr[S.HINTS] = 0;
  arr[S.SUBMITTED] = 'לא';
  arr[S.MINUTES] = 0;
  arr[S.SECONDS] = 0;
  return arr;
}

// Applies one event to a summary row (arr holds the 20 columns, 0-based).
function applySummaryEvent_(arr, ev) {
  var when = fmtTime_(ev.when);
  arr[S.NAME] = safeText_(ev.name);
  if (ev.workshop) arr[S.WORKSHOP] = safeText_(ev.workshop);

  if (!arr[S.FIRST] || when < arr[S.FIRST]) arr[S.FIRST] = when;
  if (!arr[S.LAST] || when >= arr[S.LAST]) {
    arr[S.LAST] = when;
    if (ev.code) arr[S.CODE] = safeText_(ev.code);
  }

  if (ev.type === 'run') arr[S.RUNS] = num_(arr[S.RUNS]) + 1;
  if (ev.type === 'test_run') arr[S.TEST_RUNS] = num_(arr[S.TEST_RUNS]) + 1;

  // Best result so far: the highest number of passed tests and its total.
  if ((ev.type === 'test_run' || ev.type === 'submit') && ev.testsPassed !== null) {
    if (arr[S.BEST] === '' || ev.testsPassed > num_(arr[S.BEST])) {
      arr[S.BEST] = ev.testsPassed;
      if (ev.testsTotal !== null) arr[S.TOTAL] = ev.testsTotal;
    }
  }

  if (ev.hintsUsed !== null) {
    arr[S.HINTS] = Math.max(num_(arr[S.HINTS]), ev.hintsUsed);
  }

  var idx = stageIndexOf_(ev.stage);
  if (ev.type === 'submit') {
    idx = Math.max(idx, STAGE_ORDER.length);
    arr[S.SUBMITTED] = 'כן';
    if (ev.scoreTotal !== null) {
      arr[S.AUTO] = arr[S.AUTO] === '' ? ev.scoreTotal : Math.max(num_(arr[S.AUTO]), ev.scoreTotal);
    }
  }
  // The furthest stage only moves forward.
  if (idx > num_(arr[S.STAGE_IDX])) {
    arr[S.STAGE_IDX] = idx;
    arr[S.STAGE_HE] = STAGE_HE[idx - 1];
  }

  if (ev.type === 'stage_complete' && ev.durationSec !== null) {
    arr[S.SECONDS] = num_(arr[S.SECONDS]) + ev.durationSec;
  }
  arr[S.MINUTES] = Math.round(num_(arr[S.SECONDS]) / 60 * 10) / 10;
}

function stageIndexOf_(stage) {
  return STAGE_ORDER.indexOf(stage) + 1;
}

/* ------------------------------------------------------------------ */
/* Progress (GET)                                                     */
/* ------------------------------------------------------------------ */

function getProgress_(name, phone) {
  var tasks = {};
  var wantName = cleanText_(name, 60).toLowerCase();
  var wantPhone = normPhone_(phone);
  if (!wantName || !PHONE_RE.test(wantPhone)) {
    return { ok: true, tasks: tasks };
  }

  var sheet = requireSheet_(openSheet_(), SHEET_SUMMARY);
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (sheetPhone_(data[r][S.PHONE]) !== wantPhone) continue;
    if (cleanText_(data[r][S.NAME], 60).toLowerCase() !== wantName) continue;
    var task = cleanText_(data[r][S.TASK], 40);
    if (!task) continue;

    var arr = padRow_(data[r], S.COUNT);
    var idx = num_(arr[S.STAGE_IDX]);
    tasks[task] = {
      lastStage: idx > 0 ? STAGE_ORDER[idx - 1] : '',
      stageIndex: idx,
      bestPassed: num_(arr[S.BEST]),
      testsTotal: num_(arr[S.TOTAL]),
      submitted: arr[S.SUBMITTED] === 'כן',
      score: arr[S.AUTO] === '' ? null : num_(arr[S.AUTO]),
      code: String(arr[S.CODE] || '')
    };
  }
  return { ok: true, tasks: tasks };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function openSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID);
  if (!id) {
    throw new Error('לא הוגדר גיליון - הריצו את הפונקציה setup() פעם אחת');
  }
  return SpreadsheetApp.openById(id);
}

function requireSheet_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('חסר טאב "' + name + '" - הריצו את setup()');
  }
  return sheet;
}

function readSettings_(ss) {
  var sheet = requireSheet_(ss, SHEET_SETTINGS);
  var values = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 0; i < values.length; i++) {
    var k = String(values[i][0]).trim();
    if (k) map[k] = String(values[i][1]).trim();
  }
  return { APP_KEY: map.APP_KEY || '', ACCEPTING: map.ACCEPTING || '' };
}

function cleanText_(value, maxLen) {
  var s = typeof value === 'string' ? value : (typeof value === 'number' ? String(value) : '');
  return s.trim().slice(0, maxLen);
}

// Strict: the value must be an Israeli mobile number once non-digits are removed.
function normPhone_(value) {
  return String(value === null || value === undefined ? '' : value).replace(/\D/g, '');
}

// Lenient: the sheet may have turned 0501234567 into the number 501234567.
function sheetPhone_(value) {
  var digits = normPhone_(value);
  if (/^5\d{8}$/.test(digits)) digits = '0' + digits;
  return digits;
}

// Prevents formulas: a leading = + - @ would be read by Sheets as a formula.
function safeText_(s) {
  var text = s === null || s === undefined ? '' : String(s);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function toCount_(value) {
  var n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function num_(value) {
  var n = Number(value);
  return isFinite(n) ? n : 0;
}

function blankIfNull_(value) {
  return value === null || value === undefined ? '' : value;
}

function fmtTime_(date) {
  return Utilities.formatDate(date, TZ, TIME_PATTERN);
}

// Reads a cell: dates come back as text in the Jerusalem time format.
function cellValue_(v) {
  if (v instanceof Date) return fmtTime_(v);
  return v === null || v === undefined ? '' : v;
}

function padRow_(row, n) {
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push(i < row.length ? cellValue_(row[i]) : '');
  }
  return out;
}

function errorText_(err) {
  return err && err.message ? String(err.message) : String(err);
}

/* ------------------------------------------------------------------ */
/* Sample data for the teacher (run by hand from the editor)          */
/* ------------------------------------------------------------------ */

function testInsertSample() {
  var ss = openSheet_();
  var id = Utilities.getUuid();
  var now = new Date().toISOString();
  var student = { name: 'בדיקה', phone: '0500000000' };
  var events = [
    { v: 1, eventId: 'sample-login-' + id, ts: now, sessionId: 'sample', student: student,
      workshop: '', task: '', type: 'login', stage: '' },
    { v: 1, eventId: 'sample-stage-' + id, ts: now, sessionId: 'sample', student: student,
      workshop: 'w1', task: 'w1t1', type: 'stage_complete', stage: 'understand',
      payload: { durationSec: 40 } },
    { v: 1, eventId: 'sample-test-' + id, ts: now, sessionId: 'sample', student: student,
      workshop: 'w1', task: 'w1t1', type: 'test_run', stage: 'tests', testsPassed: 2,
      testsTotal: 6, hintsUsed: 0, code: 'static void Main() { Console.WriteLine("בדיקה"); }' }
  ];

  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);
  try {
    var result = processBatch_(ss, events);
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}
