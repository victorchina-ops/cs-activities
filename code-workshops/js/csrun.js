/*!
 * csrun.js - a C# subset interpreter for the grade-10 coding workshops (Maaleh Shacharut).
 * UMD: window.CSRun in the browser, module.exports in Node. Plain ES2020, no dependencies.
 *
 * API (see SPEC.md section 1):
 *   CSRun.compile(source)            -> { ok, errors[], warnings[] }
 *   CSRun.run(source, options)       -> Promise<RunResult>
 *   CSRun.runTests(source, tests)    -> Promise<TestResult[]>
 *   CSRun.checkSubset(source)        -> CSError[]   (kind "subset", codes SUB01..)
 *
 * Design: lexer -> recursive-descent parser (AST with line/col) -> one semantic pass that type-checks
 * (int/double/bool/string/char/void/Random, definite assignment, all-paths-return, static-call check,
 * constant folding for CS0020/CS0220/CS0221) and at the same time emits JS closures -> closure evaluator.
 * Interactive Console.ReadLine(): the program is re-executed from the start ("replay") with the lines typed so
 * far whenever it needs a new line (programs are deterministic: Random values are recorded and replayed,
 * output already streamed is not emitted twice). This keeps the evaluator synchronous and fast.
 *
 * DELIBERATE DEVIATIONS from the real compiler / runtime (all documented, none affects chapters 2-3 material):
 *  - Only `class Program` with static methods/fields is supported. Arrays, generics, other classes, long/float/
 *    decimal/byte, try/catch, foreach, lambdas, ref/out give an error with code SUB90 ("not supported by the course
 *    interpreter") instead of running.
 *  - Default maxDepth is 256 (SPEC); real .NET allows ~10000+ frames, so very deep (legal) recursion reports
 *    StackOverflow here.
 *  - Roslyn's exact error *set* is not reproduced; the first real error is (code and line). We stop reporting
 *    semantic errors when there are syntax errors (like Roslyn) and report at most one syntax error per line.
 *  - Messages are Hebrew, not the English Roslyn text.
 *  - Unseeded `new Random()` uses Math.random; seeded `new Random(n)` reproduces .NET's sequence exactly.
 *  - Non-course constructs (+= ?: switch do break continue $"" var Convert Equals goto) DO run (so the student sees
 *    the real result) and additionally produce "subset" warnings from checkSubset.
 *  - The program output is limited to 2,000,000 characters (then status "timeout").
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CSRun = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const MAXINT = 2147483647, MININT = -2147483648;
const INTERNAL_MSG = 'שגיאה פנימית במריץ - נסו להריץ ב-Visual Studio';
const OUTPUT_LIMIT = 2000000;

// ===================================================================================================
// Runtime error objects
// ===================================================================================================
class RTErr { constructor(name, msg, line) { this.name = name; this.msg = msg; this.line = line || 0; } }
class TimeoutSignal { constructor(why) { this.why = why || 'steps'; } }
class NeedInput {}
class InputExhausted {}

// ===================================================================================================
// Number formatting (.NET compatible)
// ===================================================================================================
function fmtDouble(x) {
  if (x !== x) return 'NaN';
  if (x === Infinity) return 'Infinity';
  if (x === -Infinity) return '-Infinity';
  if (x === 0) return (1 / x < 0) ? '-0' : '0';
  const neg = x < 0; if (neg) x = -x;
  const m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(x.toExponential());
  const digits = m[1] + (m[2] || '');
  const e = parseInt(m[3], 10);
  let out;
  if (e >= 17 || e <= -5) {
    const ae = Math.abs(e);
    out = digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '') + 'E' + (e < 0 ? '-' : '+') + (ae < 10 ? '0' : '') + ae;
  } else if (e >= 0) {
    out = digits.length <= e + 1 ? digits + '0'.repeat(e + 1 - digits.length) : digits.slice(0, e + 1) + '.' + digits.slice(e + 1);
  } else out = '0.' + '0'.repeat(-e - 1) + digits;
  return neg ? '-' + out : out;
}
function incrDigits(s) {
  const a = s.split(''); let i = a.length - 1;
  while (i >= 0) {
    if (a[i] === '9') { a[i] = '0'; i--; } else { a[i] = String.fromCharCode(a[i].charCodeAt(0) + 1); return a.join(''); }
  }
  return '1' + a.join('');
}
// round a decimal expansion (intStr, fracStr) to p places. mode 'even': exact ties go to even (Dragon4); 'up': ties away from zero
function roundDecimal(ip, fp, p, mode) {
  const keep = fp.slice(0, p).padEnd(p, '0'), rest = fp.slice(p);
  let up = false;
  if (rest.length) {
    const c = rest.charCodeAt(0) - 48;
    if (c > 5) up = true;
    else if (c === 5) {
      if (/[1-9]/.test(rest.slice(1))) up = true;
      else if (mode === 'up') up = true;
      else { const last = p > 0 ? keep.charCodeAt(p - 1) - 48 : ip.charCodeAt(ip.length - 1) - 48; up = (last & 1) === 1; }
    }
  }
  let digits = ip + keep;
  if (up) digits = incrDigits(digits);
  const il = digits.length - p;
  return p > 0 ? digits.slice(0, il) + '.' + digits.slice(il) : digits;
}
function expand(ax, extra) { // non-negative finite -> [intStr, fracStr]
  if (ax >= 1e21) return [BigInt(ax).toString(), ''];
  const s = ax.toFixed(Math.min(100, extra));
  const d = s.indexOf('.');
  return d < 0 ? [s, ''] : [s.slice(0, d), s.slice(d + 1)];
}
function fixedStr(x, p) { // .NET "F" style
  if (x !== x || x === Infinity || x === -Infinity) return fmtDouble(x);
  const neg = x < 0 || (x === 0 && 1 / x < 0);
  const [ip, fp] = expand(Math.abs(x), p + 25);
  return (neg ? '-' : '') + roundDecimal(ip, fp, p, 'even');
}
function groupInt(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function numberStr(x, p) { // "N"
  const f = fixedStr(x, p);
  const neg = f[0] === '-';
  const body = neg ? f.slice(1) : f;
  const d = body.indexOf('.');
  const ip = d < 0 ? body : body.slice(0, d);
  return (neg ? '-' : '') + groupInt(ip) + (d < 0 ? '' : body.slice(d));
}
function sig15(ax) { // 15 significant digits decimal expansion [int, frac] (used by custom formats)
  if (ax === 0) return ['0', ''];
  const m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(ax.toExponential(14));
  const digits = m[1] + (m[2] || ''), e = parseInt(m[3], 10);
  if (e >= 0) { if (digits.length <= e + 1) return [digits + '0'.repeat(e + 1 - digits.length), '']; return [digits.slice(0, e + 1), digits.slice(e + 1)]; }
  return ['0', '0'.repeat(-e - 1) + digits];
}
function customFormat(x, pat) {
  if (x !== x || !isFinite(x)) return fmtDouble(x);
  const neg = x < 0 || (x === 0 && 1 / x < 0);
  let ax = Math.abs(x);
  let pct = 0;
  // sections: only the first one is supported
  const sec = pat.indexOf(';'); if (sec >= 0) pat = pat.slice(0, sec);
  let pre = '', post = '', core = pat;
  const m = /^([^0#.,]*)([0#.,]+)(.*)$/.exec(pat);
  if (!m) return pat;
  pre = m[1].replace(/'/g, ''); core = m[2]; post = m[3].replace(/'/g, '');
  if (pre.includes('%') || post.includes('%')) { ax *= 100; pct = 1; }
  const dot = core.indexOf('.');
  const ipat = dot < 0 ? core : core.slice(0, dot), fpat = dot < 0 ? '' : core.slice(dot + 1);
  const grouping = ipat.includes(',');
  const minInt = (ipat.match(/0/g) || []).length;
  const maxFrac = (fpat.match(/[0#]/g) || []).length, minFrac = (fpat.match(/0/g) || []).length;
  const [ip, fp] = sig15(ax);
  let r = roundDecimal(ip, fp, maxFrac, 'up');
  let [ri, rf = ''] = r.split('.');
  while (rf.length > minFrac && rf.endsWith('0')) rf = rf.slice(0, -1);
  ri = ri.replace(/^0+/, '');
  if (ri.length < minInt) ri = '0'.repeat(minInt - ri.length) + ri;
  if (grouping) ri = groupInt(ri);
  let out = ri + (rf.length ? '.' + rf : '');
  return (neg ? '-' : '') + pre + out + post;
}
function expStr(x, p, upper) {
  if (x !== x || !isFinite(x)) return fmtDouble(x);
  const s = Math.abs(x).toExponential(p);
  const m = /^(.*)e([+-])(\d+)$/.exec(s);
  const exp = m[3].padStart(3, '0');
  return (x < 0 || (x === 0 && 1 / x < 0) ? '-' : '') + m[1] + (upper ? 'E' : 'e') + m[2] + exp;
}
function generalStr(x, p, upper) {
  if (x !== x || !isFinite(x)) return fmtDouble(x);
  if (x === 0) return (1 / x < 0) ? '-0' : '0';
  const neg = x < 0; const ax = Math.abs(x);
  if (p === 0) p = 15;
  const m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(ax.toExponential(p - 1));
  let digits = (m[1] + (m[2] || '')).replace(/0+$/, ''); if (!digits) digits = '0';
  const e = parseInt(m[3], 10);
  let out;
  if (e >= p || e <= -5) {
    const ae = Math.abs(e);
    out = digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '') + (upper ? 'E' : 'e') + (e < 0 ? '-' : '+') + (ae < 10 ? '0' : '') + ae;
  } else if (e >= 0) out = digits.length <= e + 1 ? digits + '0'.repeat(e + 1 - digits.length) : digits.slice(0, e + 1) + '.' + digits.slice(e + 1);
  else out = '0.' + '0'.repeat(-e - 1) + digits;
  return (neg ? '-' : '') + out;
}
// format a number (isInt: value is an int) with a .NET format specifier
function formatNumber(v, isInt, spec) {
  if (spec === '' || spec == null) return isInt ? String(v) : fmtDouble(v);
  const m = /^([A-Za-z])(\d{0,2})$/.exec(spec);
  if (!m) return customFormat(v, spec);
  const c = m[1], hasP = m[2] !== '', p = hasP ? parseInt(m[2], 10) : -1;
  switch (c) {
    case 'F': case 'f': return fixedStr(v, hasP ? p : 2);
    case 'N': case 'n': return numberStr(v, hasP ? p : 2);
    case 'D': case 'd': {
      if (!isInt) throw new RTErr('FormatException', 'פורמט D מתאים רק למספר שלם');
      const neg = v < 0; let s = String(Math.abs(v)); if (hasP && s.length < p) s = '0'.repeat(p - s.length) + s; return (neg ? '-' : '') + s;
    }
    case 'E': case 'e': return expStr(v, hasP ? p : 6, c === 'E');
    case 'G': case 'g': return isInt && !hasP ? String(v) : generalStr(v, hasP ? p : 0, c === 'G');
    case 'P': case 'p': { const r = numberStr(v * 100, hasP ? p : 2); return r[0] === '-' ? '-' + r.slice(1) + ' %' : r + ' %'; }
    case 'X': case 'x': {
      if (!isInt) throw new RTErr('FormatException', 'פורמט X מתאים רק למספר שלם');
      let s = (v >>> 0).toString(16); if (c === 'X') s = s.toUpperCase(); if (hasP && s.length < p) s = '0'.repeat(p - s.length) + s; return s;
    }
    case 'C': case 'c': return '¤' + numberStr(v, hasP ? p : 2);
    default: return customFormat(v, spec);
  }
}
function fmtByType(v, t) {
  switch (t) {
    case 'int': case 'long': return String(v);
    case 'double': return fmtDouble(v);
    case 'bool': return v ? 'True' : 'False';
    case 'char': return String.fromCharCode(v);
    case 'string': return v == null ? '' : v;
    default: return String(v);
  }
}
function fmtItem(v, t, spec) {
  if (spec !== '' && spec != null && (t === 'int' || t === 'double' || t === 'long')) return formatNumber(v, t !== 'double', spec);
  return fmtByType(v, t);
}
function composite(fmt, vals, types) {
  let out = '';
  const n = fmt.length;
  for (let i = 0; i < n; i++) {
    const c = fmt[i];
    if (c === '{') {
      if (fmt[i + 1] === '{') { out += '{'; i++; continue; }
      const end = fmt.indexOf('}', i);
      if (end < 0) throw new RTErr('FormatException', 'פורמט הטקסט לא תקין - חסר } (מחרוזת עם {})');
      const body = fmt.slice(i + 1, end);
      const m = /^\s*(\d+)\s*(?:,\s*(-?\d+)\s*)?(?::(.*))?$/s.exec(body);
      if (!m) throw new RTErr('FormatException', 'פורמט הטקסט לא תקין בתוך {' + body + '}');
      const idx = parseInt(m[1], 10);
      if (idx >= vals.length) throw new RTErr('FormatException', 'במחרוזת יש {' + idx + '} אבל נשלחו רק ' + vals.length + ' ערכים אחריה');
      let s = fmtItem(vals[idx], types[idx], m[3] === undefined ? '' : m[3]);
      if (m[2] !== undefined) {
        const w = parseInt(m[2], 10);
        if (w > 0) s = s.padStart(w); else if (w < 0) s = s.padEnd(-w);
      }
      out += s; i = end;
    } else if (c === '}') {
      if (fmt[i + 1] === '}') { out += '}'; i++; continue; }
      throw new RTErr('FormatException', 'פורמט הטקסט לא תקין - } בלי { מתאים');
    } else out += c;
  }
  return out;
}

// ---- parse helpers
const WS = '\t\n\v\f\r ';
function parseIntStr(s) {
  const m = /^[\t\n\v\f\r ]*([+-]?)(\d+)[\t\n\v\f\r ]*$/.exec(s);
  if (!m) throw new RTErr('FormatException', /^[\t\n\v\f\r ]*[+-]?\d*\.\d+[\t\n\v\f\r ]*$/.test(s) ? 'הקלט "' + s + '" הוא מספר עשרוני ולא שלם - אפשר להשתמש ב-double.Parse' : (s.trim() === '' ? 'הקלט ריק ("") - אי אפשר להפוך אותו למספר שלם' : 'הקלט "' + s + '" אינו מספר שלם'));
  const v = Number(m[1] + m[2]);
  if (v > MAXINT || v < MININT) throw new RTErr('OverflowException', 'המספר "' + s.trim() + '" גדול או קטן מדי עבור int');
  return v === 0 ? 0 : v;
}
function parseDoubleStr(s) {
  const bad = () => new RTErr('FormatException', s.trim() === '' ? 'הקלט ריק ("") - אי אפשר להפוך אותו למספר' : 'הקלט "' + s + '" אינו מספר');
  const t = s.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, '');
  if (/^[+-]?Infinity$/i.test(t)) return t[0] === '-' ? -Infinity : Infinity;
  if (/^NaN$/i.test(t)) return NaN;
  const m = /^([+-]?)(\d[\d,]*)?(\.\d*)?(?:[eE]([+-]?\d+))?$/.exec(t);
  if (!m || (m[2] === undefined && (m[3] === undefined || m[3] === '.'))) throw bad();
  const num = m[1] + (m[2] || '').replace(/,/g, '') + (m[3] || '') + (m[4] !== undefined ? 'e' + m[4] : '');
  const v = Number(num.replace(/^([+-]?)\./, '$10.'));
  if (v !== v) throw bad();
  return v;
}
function roundHalfEven(x) {
  if (!isFinite(x)) return x;
  const f = Math.floor(x), d = x - f;
  if (d < 0.5) return f; if (d > 0.5) return f + 1;
  return (f % 2 === 0) ? f : f + 1;
}
function mathRound(x, digits) {
  if (digits === undefined) { const r = roundHalfEven(x); return (r === 0 && (x < 0 || (x === 0 && 1 / x < 0))) ? -0 : r; }
  if (digits < 0 || digits > 15) throw new RTErr('ArgumentOutOfRangeException', 'מספר הספרות ל-Math.Round חייב להיות בין 0 ל-15');
  if (!isFinite(x)) return x;
  if (Math.abs(x) < 1e16) {
    const p = Math.pow(10, digits);
    const r = roundHalfEven(x * p) / p;
    return (r === 0 && x < 0) ? -0 : r;
  }
  return x;
}
function d2i(x) { // saturating double -> int (.NET 9+)
  if (x !== x) return 0;
  if (x >= 2147483647) return MAXINT;
  if (x <= -2147483648) return MININT;
  return Math.trunc(x) | 0;
}

// ---- .NET seeded Random (legacy Knuth subtractive generator)
class NetRandom {
  constructor(seed) {
    const MBIG = MAXINT, MSEED = 161803398;
    const sa = new Array(56).fill(0);
    const sub = seed === MININT ? MAXINT : Math.abs(seed);
    let mj = MSEED - sub; sa[55] = mj; let mk = 1;
    for (let i = 1; i < 55; i++) {
      const ii = (21 * i) % 55; sa[ii] = mk; mk = mj - mk; if (mk < 0) mk += MBIG; mj = sa[ii];
    }
    for (let k = 1; k < 5; k++) for (let i = 1; i < 56; i++) { sa[i] -= sa[1 + (i + 30) % 55]; if (sa[i] < 0) sa[i] += MBIG; }
    this.sa = sa; this.inext = 0; this.inextp = 21;
  }
  internal() {
    let a = this.inext, b = this.inextp;
    if (++a >= 56) a = 1; if (++b >= 56) b = 1;
    let r = this.sa[a] - this.sa[b];
    if (r === MAXINT) r--; if (r < 0) r += MAXINT;
    this.sa[a] = r; this.inext = a; this.inextp = b; return r;
  }
  sample() { return this.internal() * (1.0 / MAXINT); }
}

// ===================================================================================================
// Hebrew messages
// ===================================================================================================
const TYPE_HE = { int: "'int'", double: "'double'", bool: "'bool'", string: "'string'", char: "'char'", void: "'void'", Random: "'Random'", long: "'long'", null: 'null', mg: 'פונקציה', 'string[]': "'string[]'" };
const ht = t => TYPE_HE[t] || ("'" + t + "'");
const MSG = {
  CS1002: () => 'חסר ; בסוף ההוראה',
  CS1003: w => `שגיאת תחביר - חסר ${w}`,
  CS1001: () => 'חסר שם (מזהה) - שם משתנה לא יכול להתחיל בספרה או להיות מילה שמורה כמו class',
  CS1010: () => 'המחרוזת לא נסגרה - חסר " (גרשיים) בסוף הטקסט, באותה שורה',
  CS1011: () => 'תו ריק בין גרשיים בודדים',
  CS1012: () => "יותר מדי תווים בין גרשיים בודדים - טקסט ארוך כותבים בין גרשיים כפולים \" \"",
  CS1009: c => `רצף תווים לא מוכר במחרוזת: \\${c} - מותר \\n \\t \\" \\\\`,
  CS1022: () => 'סוגר } מיותר, או קוד מחוץ ל-class',
  CS1026: () => 'חסר ) - סוגריים שנפתחו צריכים להיסגר',
  CS1513: () => 'חסר } - סוגריים מסולסלים שנפתחו צריכים להיסגר',
  CS1514: () => 'חסר { אחרי ההצהרה',
  CS1515: () => "חסר ( אחרי המילה if/while",
  CS1035: () => 'ההערה /* לא נסגרה - חסר */',
  CS1056: c => `תו לא חוקי בקוד: '${c}'` + (/[“”‘’״׳]/.test(c) ? ' - נראה כמו מרכאות "חכמות" (מוורד/הדבקה). כתבו מרכאות רגילות מהמקלדת' : ''),
  CS1021: () => 'המספר גדול מדי',
  CS1525: t => `ביטוי לא תקין ליד '${t}' - כנראה חסר ערך או משתנה`,
  CS8641: () => "'else' בלי if מתאים - אולי יש ; מיותר אחרי התנאי של ה-if, או סוגר חסר?",
  CS1597: () => 'הוראה לא תקינה',
  CS0103: (n, hint) => `השם '${n}' לא קיים בהקשר הזה - האם הוגדר? האם האותיות (גדולות/קטנות) נכונות?${hint ? ' ' + hint : ''}`,
  CS0841: n => `המשתנה '${n}' משמש לפני שהוגדר - צריך להגדיר אותו (למשל int ${n} = ...;) לפני השימוש`,
  CS0117: (cls, m, hint) => `ל-${cls} אין פעולה בשם '${m}'${hint ? ' - ' + hint : ''}`,
  CS1061: (t, m, hint) => `לערך מסוג ${ht(t)} אין פעולה או מאפיין בשם '${m}'${hint ? ' - ' + hint : ''}`,
  CS0246: n => `הטיפוס '${n}' לא קיים - הטיפוסים בקורס: int, double, bool, string, char (באותיות קטנות)`,
  CS0128: n => `המשתנה '${n}' כבר הוגדר באותו בלוק - שם אחר, או בלי הטיפוס אם רוצים רק לשנות את הערך`,
  CS0136: n => `השם '${n}' כבר בשימוש בבלוק החיצוני (משתנה או פרמטר) - בחרו שם אחר`,
  CS0165: n => `המשתנה '${n}' משמש לפני שקיבל ערך - צריך לתת לו ערך בכל מסלול אפשרי לפני השימוש`,
  CS0161: n => `בפונקציה ${n} לא כל המסלולים מחזירים ערך - חסר return בסוף או בענף else`,
  CS0126: t => `בפונקציה שמחזירה ${ht(t)} חייבים לכתוב return עם ערך`,
  CS0127: () => 'הפונקציה היא void ולכן אי אפשר להחזיר ממנה ערך - או שנשנה את הטיפוס שלה, או נכתוב return; בלי ערך',
  CS0120: n => `קוראים מ-Main לפונקציה '${n}' שאינה static - צריך לכתוב static לפני טיפוס הפונקציה`,
  CS7036: (n, p) => `לפונקציה ${n} חסר ארגומנט עבור הפרמטר '${p}'`,
  CS1501: (n, c) => `אין לפונקציה ${n} גרסה שמקבלת ${c} ארגומנטים`,
  CS1503: (i, a, b) => `ארגומנט ${i}: אי אפשר להמיר ${ht(a)} ל-${ht(b)}` + (a === 'string' && (b === 'int' || b === 'double') ? ' - אולי צריך int.Parse / double.Parse' : ''),
  CS0201: () => 'ביטוי כזה לא יכול לעמוד לבד כהוראה - אפשר רק השמה (=), קריאה לפונקציה, ++ או --. אולי התכוונתם להשמה (=) או להדפסה?',
  CS0131: () => 'באגף שמאל של = חייב להיות משתנה (לא מספר, ביטוי או קבוע)',
  CS0133: n => `הקבוע '${n}' חייב לקבל ערך קבוע (מספר או טקסט מפורש, לא משתנה)`,
  CS0200: () => 'אי אפשר לשנות תו בתוך מחרוזת (string) - מחרוזת היא לקריאה בלבד',
  CS0020: () => 'חלוקה באפס קבוע - הקומפיילר מזהה שהמחלק הוא 0',
  CS0220: () => 'הפעולה גולשת מגבולות int כבר בזמן קומפילציה (מספר גדול מדי)',
  CS0221: v => `הערך הקבוע ${v} לא נכנס בטיפוס הזה (מחוץ לטווח)`,
  CS0428: n => `'${n}' הוא שם של פונקציה - חסרים סוגריים () לקריאה אליה`,
  CS1955: n => `'${n}' אינו פונקציה ולכן אי אפשר לקרוא לו עם סוגריים ()`,
  CS5001: () => "בתוכנית חסרה הפונקציה static void Main() בתוך class Program",
  CS0111: n => `הפונקציה '${n}' כבר הוגדרה עם אותם פרמטרים`,
  CS0139: () => 'break/continue מותר רק בתוך לולאה (או switch)',
  CS1059: () => 'אפשר להגדיל/להקטין (++ / --) רק משתנה',
  CS0023: (op, t) => `אי אפשר להשתמש באופרטור '${op}' על ערך מסוג ${ht(t)}`,
  CS0030: (a, b) => `אי אפשר להמיר ${ht(a)} ל-${ht(b)} בהמרה (cast)`,
  CS0818: () => "משתנה מסוג var חייב לקבל ערך התחלתי",
  CS0815: () => "אי אפשר לקבוע טיפוס של var מ-null",
  CS8070: () => 'סוף של case חייב להסתיים ב-break או return',
  CS0163: () => 'case לא יכול "ליפול" לcase הבא - סיימו אותו ב-break או return',
  CS0119: n => `'${n}' הוא שם של סוג/פעולה ולא משתנה - אי אפשר להשתמש בו ככה`,
  CS0106: () => 'המילה הזו לא מתאימה במקום הזה',
  CS1620: () => 'לא נתמך',
  CS0176: () => 'לא נתמך',
  CS0171: () => 'לא נתמך',
  CS0236: () => 'לא נתמך',
  CS0029: (a, b, hint) => `אי אפשר להמיר אוטומטית ${ht(a)} ל-${ht(b)}` + (hint ? ' - ' + hint : ''),
  CS0266: (a, b) => `אי אפשר לשים ערך ${ht(a)} ב-${ht(b)} בלי המרה מפורשת - כתבו (${b}) לפני הערך, או הגדירו את המשתנה כ-${a === 'double' ? 'double' : a}`,
  CS0019: (op, a, b) => `אי אפשר להשתמש באופרטור '${op}' בין ${ht(a)} ל-${ht(b)}` + (((a === 'string' && b === 'int') || (a === 'int' && b === 'string')) && /^(==|!=|<|>|<=|>=)$/.test(op) ? ' - השוואה בין טקסט למספר לא אפשרית; צריך להמיר עם int.Parse' : ''),
  SUB90: w => `${w} לא נתמך במריץ של הקורס (לא חלק מהשפה שנלמדת)`,
};
function mkMsg(code, line, args) {
  const f = MSG[code];
  return `שורה ${line}: ${f ? f.apply(null, args || []) : code}` + ` (${code})`;
}

// ===================================================================================================
// Lexer
// ===================================================================================================
const KEYWORDS = new Set(('abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while').split(' '));
const TYPE_KW = new Set(['int', 'double', 'bool', 'string', 'char', 'void', 'long', 'float', 'decimal', 'byte', 'short', 'object', 'uint', 'ulong', 'sbyte', 'ushort']);
const OPS3 = ['>>=', '<<=', '...'];
const OPS2 = ['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '=>', '??', '->', '<<', '>>'];
const ID_START = /[\p{L}_]/u, ID_PART = /[\p{L}\p{N}_‌‍]/u;

function lex(src) {
  const toks = [], errs = [];
  const n = src.length;
  let i = 0, line = 1, col = 1;
  const err = (code, l, c, args) => errs.push({ code, line: l, col: c, args });
  function adv(k) { for (let j = 0; j < k; j++) { if (src.charCodeAt(i) === 10) { line++; col = 1; } else col++; i++; } }
  function push(t, v, sl, sc, extra) {
    const tok = { t, v, line: sl, col: sc, el: line, ec: col };
    if (extra) Object.assign(tok, extra);
    toks.push(tok); return tok;
  }
  function readEscape(quote, sl, sc) { // at backslash; returns char string or null (error reported)
    const c = src[i + 1];
    const map = { n: '\n', t: '\t', r: '\r', '"': '"', "'": "'", '\\': '\\', '0': '\0', a: '\x07', b: '\b', f: '\f', v: '\v' };
    if (c !== undefined && Object.prototype.hasOwnProperty.call(map, c)) { adv(2); return map[c]; }
    if (c === 'u' && /^[0-9a-fA-F]{4}/.test(src.substr(i + 2, 4))) { const ch = String.fromCharCode(parseInt(src.substr(i + 2, 4), 16)); adv(6); return ch; }
    if (c === 'x' && /^[0-9a-fA-F]{1,4}/.test(src.substr(i + 2, 4))) { const h = /^[0-9a-fA-F]{1,4}/.exec(src.substr(i + 2, 4))[0]; adv(2 + h.length); return String.fromCharCode(parseInt(h, 16)); }
    err('CS1009', line, col, [c === undefined ? '' : c]); adv(2); return '';
  }
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === ' ' || c === '﻿' || c === '‏' || c === '‎') { adv(1); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') adv(1); continue; }
    if (c === '/' && src[i + 1] === '*') {
      const sl = line, sc = col; adv(2);
      let closed = false;
      while (i < n) { if (src[i] === '*' && src[i + 1] === '/') { adv(2); closed = true; break; } adv(1); }
      if (!closed) err('CS1035', sl, sc);
      continue;
    }
    if (c === '#' && /^\s*$/.test(src.slice(src.lastIndexOf('\n', i - 1) + 1, i))) { while (i < n && src[i] !== '\n') adv(1); continue; }
    const sl = line, sc = col;
    // strings
    if (c === '"' || (c === '@' && src[i + 1] === '"') || (c === '$' && src[i + 1] === '"') || ((c === '$' && src[i + 1] === '@' && src[i + 2] === '"') || (c === '@' && src[i + 1] === '$' && src[i + 2] === '"'))) {
      let interp = false, verbatim = false;
      while (src[i] !== '"') { if (src[i] === '$') interp = true; else verbatim = true; adv(1); }
      adv(1); // opening quote
      if (interp) { lexInterp(sl, sc, verbatim); continue; }
      let s = '', closed = false;
      while (i < n) {
        const d = src[i];
        if (verbatim) {
          if (d === '"') { if (src[i + 1] === '"') { s += '"'; adv(2); continue; } adv(1); closed = true; break; }
          s += d; adv(1); continue;
        }
        if (d === '"') { adv(1); closed = true; break; }
        if (d === '\n') break;
        if (d === '\\') { s += readEscape('"', sl, sc); continue; }
        s += d; adv(1);
      }
      if (!closed) err('CS1010', sl, sc);
      push('str', s, sl, sc);
      continue;
    }
    if (c === "'") {
      adv(1);
      let s = '', closed = false, count = 0;
      while (i < n) {
        const d = src[i];
        if (d === "'") { adv(1); closed = true; break; }
        if (d === '\n') break;
        if (d === '\\') { s += readEscape("'", sl, sc); count++; continue; }
        s += d; count++; adv(1);
      }
      if (!closed) err('CS1010', sl, sc);
      else if (count === 0) err('CS1011', sl, sc);
      else if (s.length > 1) err('CS1012', sl, sc);
      push('chr', s.length ? s.charCodeAt(0) : 0, sl, sc);
      continue;
    }
    // numbers
    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      let j = i;
      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X') && /[0-9a-fA-F]/.test(src[i + 2] || '')) {
        j = i + 2; while (j < n && /[0-9a-fA-F]/.test(src[j])) j++;
        const text = src.slice(i, j); adv(j - i);
        const v = parseInt(text.slice(2), 16);
        push('int', v, sl, sc, { big: v > MAXINT });
        continue;
      }
      while (j < n && src[j] >= '0' && src[j] <= '9') j++;
      let isD = false;
      if (src[j] === '.' && src[j + 1] >= '0' && src[j + 1] <= '9') { isD = true; j++; while (j < n && src[j] >= '0' && src[j] <= '9') j++; }
      else if (c === '.') { isD = true; j = i + 1; while (j < n && src[j] >= '0' && src[j] <= '9') j++; }
      if ((src[j] === 'e' || src[j] === 'E') && (/[0-9]/.test(src[j + 1] || '') || (/[+-]/.test(src[j + 1] || '') && /[0-9]/.test(src[j + 2] || '')))) {
        isD = true; j += 2; while (j < n && src[j] >= '0' && src[j] <= '9') j++;
      }
      const text = src.slice(i, j);
      let suffix = '';
      if (/[fFdDmMlLuU]/.test(src[j] || '') && !ID_PART.test(src[j + 1] || '')) { suffix = src[j]; j++; }
      adv(j - i);
      const v = Number(text);
      if (suffix === 'd' || suffix === 'D') push('dbl', v, sl, sc);
      else if (suffix && /[fFmMlLuU]/.test(suffix)) push(isD ? 'dbl' : 'int', v, sl, sc, { suffix: suffix.toLowerCase() });
      else if (isD) push('dbl', v, sl, sc);
      else {
        if (v > 18446744073709551615) err('CS1021', sl, sc);
        push('int', v, sl, sc, { big: v > MAXINT });
      }
      continue;
    }
    if (ID_START.test(c) || (c === '@' && ID_START.test(src[i + 1] || ''))) {
      let j = i + (c === '@' ? 1 : 0);
      while (j < n && ID_PART.test(src[j])) j++;
      const text = src.slice(i + (c === '@' ? 1 : 0), j);
      adv(j - i);
      push(c !== '@' && KEYWORDS.has(text) ? 'kw' : 'id', text, sl, sc);
      continue;
    }
    // operators
    let op = null;
    const s3 = src.substr(i, 3), s2 = src.substr(i, 2);
    if (OPS3.includes(s3)) op = s3; else if (OPS2.includes(s2)) op = s2;
    else if ('+-*/%=<>!&|^~?:;,.(){}[]'.includes(c)) op = c;
    if (op) { adv(op.length); push('op', op, sl, sc); continue; }
    err('CS1056', sl, sc, [c]); adv(1);
  }
  push('eof', '', line, col);

  // interpolated string: parts = [{s:text} | {src, line, col, align, fmt}]
  function lexInterp(sl, sc, verbatim) {
    const parts = []; let cur = '', closed = false;
    while (i < n) {
      const d = src[i];
      if (d === '"') { if (verbatim && src[i + 1] === '"') { cur += '"'; adv(2); continue; } adv(1); closed = true; break; }
      if (d === '\n' && !verbatim) break;
      if (d === '\\' && !verbatim) { cur += readEscape('"', sl, sc); continue; }
      if (d === '{') {
        if (src[i + 1] === '{') { cur += '{'; adv(2); continue; }
        if (cur) { parts.push({ s: cur }); cur = ''; }
        adv(1);
        const el = line, ec = col; let depth = 0, e = '';
        let paren = 0;
        while (i < n) {
          const ch = src[i];
          if (ch === '"') { // nested string
            e += ch; adv(1);
            while (i < n && src[i] !== '"' && src[i] !== '\n') { if (src[i] === '\\') { e += src[i]; adv(1); } e += src[i]; adv(1); }
            if (src[i] === '"') { e += '"'; adv(1); }
            continue;
          }
          if (ch === '(') paren++; if (ch === ')') paren--;
          if (ch === '{') depth++;
          if (ch === '}') { if (depth === 0) break; depth--; }
          if (ch === '\n') break;
          e += ch; adv(1);
        }
        if (src[i] !== '}') { err('CS1010', sl, sc); break; }
        adv(1);
        // split off ,align and :format at top level
        let exprSrc = e, align, fmt;
        let depthP = 0, inS = false, cut = -1, colon = -1;
        for (let k = 0; k < e.length; k++) {
          const ch = e[k];
          if (ch === '"') inS = !inS;
          if (inS) continue;
          if (ch === '(' || ch === '[') depthP++; if (ch === ')' || ch === ']') depthP--;
          if (depthP === 0 && ch === '?' ) { /* ternary: skip a following ':' */ const nx = e.indexOf(':', k); if (nx > 0) { k = nx; continue; } }
          if (depthP === 0 && ch === ':' && colon < 0) { colon = k; break; }
        }
        if (colon >= 0) { fmt = e.slice(colon + 1); exprSrc = e.slice(0, colon); }
        const am = /,\s*(-?\d+)\s*$/.exec(exprSrc);
        if (am) { align = parseInt(am[1], 10); exprSrc = exprSrc.slice(0, am.index); }
        parts.push({ src: exprSrc, line: el, col: ec, align, fmt: fmt || '' });
        continue;
      }
      if (d === '}') { if (src[i + 1] === '}') { cur += '}'; adv(2); continue; } cur += '}'; adv(1); continue; }
      cur += d; adv(1);
    }
    if (!closed) err('CS1010', sl, sc);
    if (cur) parts.push({ s: cur });
    push('istr', parts, sl, sc);
  }
  return { toks, errs };
}

// ===================================================================================================
// Parser
// ===================================================================================================
const ABORT = { abort: true };
const MODS = new Set(['public', 'private', 'protected', 'internal', 'static', 'readonly', 'sealed', 'abstract', 'virtual', 'override', 'extern', 'partial', 'unsafe', 'new']);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);
const BIN_PREC = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };

class Parser {
  constructor(toks, shared) {
    this.toks = toks; this.p = 0;
    this.errs = shared ? shared.errs : [];
    this.errLines = shared ? shared.errLines : new Set();
  }
  get cur() { return this.toks[this.p]; }
  peek(k) { return this.toks[Math.min(this.p + k, this.toks.length - 1)]; }
  prev() { return this.toks[Math.max(this.p - 1, 0)]; }
  isOp(v, k) { const t = this.peek(k || 0); return t.t === 'op' && t.v === v; }
  isKw(v, k) { const t = this.peek(k || 0); return t.t === 'kw' && t.v === v; }
  isId(v, k) { const t = this.peek(k || 0); return t.t === 'id' && (v === undefined || t.v === v); }
  accept(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
  err(code, line, col, args) {
    if (this.errLines.has(line)) return false;
    this.errLines.add(line);
    this.errs.push({ code, line, col, args: args || [] });
    return true;
  }
  errPrevEnd(code, args) { const t = this.prev(); if (this.p === 0) return this.err(code, this.cur.line, this.cur.col, args); return this.err(code, t.el, t.ec, args); }
  errAt(tok, code, args) { return this.err(code, tok.line, tok.col, args); }
  tokText(t) { return t.t === 'eof' ? 'סוף הקובץ' : t.t === 'str' ? '"' + t.v + '"' : t.t === 'istr' ? '$"..."' : t.t === 'chr' ? "'" + String.fromCharCode(t.v) + "'" : String(t.v); }
  invalid(tok) { tok = tok || this.cur; if (tok.t === 'eof') this.errPrevEnd('CS1513'); else this.errAt(tok, 'CS1525', [this.tokText(tok)]); throw ABORT; }
  unsupported(tok, what, abort) { this.errAt(tok, 'SUB90', [what]); if (abort !== false) throw ABORT; }
  expectSemi() { if (this.accept(';')) return true; this.errPrevEnd('CS1002'); return false; }
  expectOp(v, code) { if (this.accept(v)) return true; this.errPrevEnd(code || 'CS1002'); return false; }
  sync() {
    for (;;) {
      const t = this.cur;
      if (t.t === 'eof') return;
      if (t.t === 'op') { if (t.v === ';') { this.p++; return; } if (t.v === '}' || t.v === '{') return; }
      this.p++;
    }
  }
  // ---- compilation unit
  parseUnit() {
    const unit = { usings: [], classes: [] };
    while (this.isKw('using') && !this.isOp('(', 1)) {
      const u = this.cur; this.p++;
      let name = '';
      while (this.cur.t === 'id' || this.isOp('.') || this.isKw('static')) { name += this.cur.v; this.p++; }
      this.expectSemi();
      unit.usings.push({ name, line: u.line, col: u.col });
    }
    this.parseMembersOfNamespace(unit, true);
    return unit;
  }
  parseMembersOfNamespace(unit, top) {
    for (;;) {
      const t = this.cur;
      if (t.t === 'eof') return;
      if (this.isOp('}')) { if (top) { this.errAt(t, 'CS1022'); this.p++; continue; } return; }
      const start = this.p;
      try {
        if (this.isKw('namespace')) {
          this.p++;
          while (this.cur.t === 'id' || this.isOp('.')) this.p++;
          if (this.accept('{')) {
            this.parseMembersOfNamespace(unit, false);
            if (!this.accept('}')) this.errPrevEnd('CS1513');
          } else this.expectSemi();
          continue;
        }
        if (this.isKw('using')) { // using inside namespace
          this.p++; while (!this.isOp(';') && this.cur.t !== 'eof') this.p++; this.expectSemi();
          continue;
        }
        const mods = [];
        while (this.cur.t === 'kw' && MODS.has(this.cur.v) || (this.cur.t === 'id' && this.cur.v === 'partial')) { mods.push(this.cur.v); this.p++; }
        if (this.isKw('class')) { unit.classes.push(this.parseClass(mods)); continue; }
        if (this.isKw('struct') || this.isKw('interface') || this.isKw('enum')) { this.unsupported(this.cur, this.cur.v); }
        // top-level statements or stray code
        this.errAt(this.cur, 'SUB90', ['קוד מחוץ ל-class - חייבים לכתוב class Program ובתוכו static void Main()']);
        throw ABORT;
      } catch (e) {
        if (e !== ABORT) throw e;
        // skip to a plausible restart: past a balanced block or ';'
        let depth = 0;
        if (this.p === start) this.p++;
        while (this.cur.t !== 'eof') {
          if (this.isOp('{')) depth++;
          else if (this.isOp('}')) { if (depth === 0) break; depth--; if (depth === 0) { this.p++; break; } }
          else if (this.isOp(';') && depth === 0) { this.p++; break; }
          this.p++;
        }
      }
    }
  }
  parseClass(mods) {
    const kw = this.cur; this.p++;
    const nameTok = this.cur;
    if (nameTok.t !== 'id') { this.errAt(nameTok, 'CS1001'); throw ABORT; }
    this.p++;
    if (this.accept(':')) { while (this.cur.t === 'id' || this.isOp('.') || this.isOp(',')) this.p++; }
    const cls = { name: nameTok.v, line: nameTok.line, col: nameTok.col, methods: [], fields: [], mods };
    if (!this.accept('{')) { this.errPrevEnd('CS1514'); throw ABORT; }
    for (;;) {
      if (this.isOp('}')) { this.p++; break; }
      if (this.cur.t === 'eof') { this.errPrevEnd('CS1513'); break; }
      const start = this.p;
      try { this.parseMember(cls); }
      catch (e) {
        if (e !== ABORT) throw e;
        let depth = 0;
        if (this.p === start) this.p++;
        while (this.cur.t !== 'eof') {
          if (this.isOp('{')) depth++;
          else if (this.isOp('}')) { if (depth === 0) break; depth--; if (depth === 0) { this.p++; break; } }
          else if (this.isOp(';') && depth === 0) { this.p++; break; }
          this.p++;
        }
      }
    }
    return cls;
  }
  parseMember(cls) {
    const mods = [];
    while (this.cur.t === 'kw' && MODS.has(this.cur.v)) { mods.push(this.cur.v); this.p++; }
    if (this.isKw('class') || this.isKw('struct') || this.isKw('interface') || this.isKw('enum')) this.unsupported(this.cur, this.cur.v === 'class' ? 'מחלקה נוספת' : this.cur.v);
    const isConst = this.isKw('const'); if (isConst) { this.p++; mods.push('const'); }
    const start = this.cur;
    if (start.t === 'id' && this.isOp('(', 1)) this.unsupported(start, 'בנאי (constructor)');
    if (this.isOp('~')) this.unsupported(start, 'destructor');
    const type = this.parseType();
    const nameTok = this.cur;
    if (nameTok.t !== 'id') { this.errAt(nameTok.t === 'eof' ? this.prev() : nameTok, 'CS1001'); throw ABORT; }
    this.p++;
    if (this.isOp('(')) { // method
      this.p++;
      const params = [];
      if (!this.isOp(')')) {
        for (;;) {
          let pk = this.cur;
          if (this.isKw('ref') || this.isKw('out') || this.isKw('params') || this.isKw('this') || this.isKw('in')) this.unsupported(pk, pk.v + ' (פרמטר מיוחד)');
          const pt = this.parseType();
          const pn = this.cur;
          if (pn.t !== 'id') { this.errAt(pn, 'CS1001'); throw ABORT; }
          this.p++;
          if (this.isOp('=')) this.unsupported(this.cur, 'ערך ברירת מחדל לפרמטר');
          params.push({ type: pt, name: pn.v, line: pn.line, col: pn.col });
          if (this.accept(',')) continue;
          break;
        }
      }
      if (!this.accept(')')) { this.errPrevEnd('CS1026'); }
      if (!this.isOp('{')) { if (this.isOp(';')) { this.unsupported(this.cur, 'פונקציה בלי גוף'); } this.errPrevEnd('CS1514'); throw ABORT; }
      const body = this.parseBlock();
      cls.methods.push({ name: nameTok.v, line: nameTok.line, col: nameTok.col, ret: type, params, body, mods, isStatic: mods.includes('static') });
      return;
    }
    if (this.isOp('{') || this.isOp('=>')) this.unsupported(this.cur, 'מאפיין (property)');
    // field(s)
    let nt = nameTok;
    for (;;) {
      let init = null;
      if (this.accept('=')) init = this.parseExpr();
      cls.fields.push({ name: nt.v, line: nt.line, col: nt.col, type, init, isStatic: mods.includes('static'), isConst });
      if (this.accept(',')) { nt = this.cur; if (nt.t !== 'id') { this.errAt(nt, 'CS1001'); throw ABORT; } this.p++; continue; }
      break;
    }
    this.expectSemi();
  }
  parseType() {
    const t = this.cur;
    let name;
    if (t.t === 'kw' && TYPE_KW.has(t.v)) { name = t.v; this.p++; }
    else if (t.t === 'id') {
      name = t.v; this.p++;
      while (this.isOp('.') && this.peek(1).t === 'id') { name += '.' + this.peek(1).v; this.p += 2; }
    } else { if (t.t === 'eof') this.errPrevEnd('CS1513'); else this.errAt(t, 'CS1001'); throw ABORT; }
    const ty = { name, line: t.line, col: t.col, arr: false, generic: false };
    if (this.isOp('<') && this.looksGeneric()) {
      let depth = 0;
      do { if (this.isOp('<')) depth++; else if (this.isOp('>')) depth--; else if (this.isOp('>>')) depth -= 2; this.p++; } while (depth > 0 && this.cur.t !== 'eof');
      ty.generic = true;
    }
    while (this.isOp('[') && (this.isOp(']', 1) || this.isOp(',', 1))) { this.p++; while (!this.isOp(']') && this.cur.t !== 'eof') this.p++; this.p++; ty.arr = true; }
    if (this.isOp('?') && this.peek(1).t === 'id' && (this.isOp('=', 2) || this.isOp(';', 2))) { this.p++; ty.nullable = true; }
    return ty;
  }
  looksGeneric() { // at '<' after an identifier: scan for matching '>' followed by id
    let depth = 0, k = 0;
    for (;;) {
      const t = this.peek(k);
      if (t.t === 'eof') return false;
      if (t.t === 'op') {
        if (t.v === '<') depth++;
        else if (t.v === '>') { depth--; if (depth === 0) { const nx = this.peek(k + 1); return nx.t === 'id' || (nx.t === 'op' && (nx.v === '(' || nx.v === '[' || nx.v === ')')); } }
        else if (t.v === '>>') { depth -= 2; if (depth <= 0) { const nx = this.peek(k + 1); return nx.t === 'id'; } }
        else if (t.v !== ',' && t.v !== '.' && t.v !== '[' && t.v !== ']' && t.v !== '?') return false;
      } else if (t.t !== 'id' && !(t.t === 'kw' && TYPE_KW.has(t.v))) return false;
      k++;
    }
  }
  // ---- statements
  parseBlock() {
    const open = this.cur;
    if (!this.accept('{')) { this.errPrevEnd('CS1514'); throw ABORT; }
    const stmts = [];
    for (;;) {
      if (this.isOp('}')) { const c = this.cur; this.p++; return { k: 'block', line: open.line, col: open.col, stmts, endLine: c.line }; }
      if (this.cur.t === 'eof') { this.errPrevEnd('CS1513'); return { k: 'block', line: open.line, col: open.col, stmts, endLine: this.prev().line }; }
      if (this.looksLikeMemberStart()) { this.errPrevEnd('CS1513'); this.eofBrace = true; return { k: 'block', line: open.line, col: open.col, stmts, endLine: this.prev().line }; }
      stmts.push(this.parseStatement());
    }
  }
  looksLikeMemberStart() {
    // a method header like `static void Foo(` or `public static int X(` inside a block => a closing brace was forgotten
    let k = 0;
    if (!(this.peek(0).t === 'kw' && MODS.has(this.peek(0).v) && this.peek(0).v !== 'new')) return false;
    while (this.peek(k).t === 'kw' && MODS.has(this.peek(k).v)) k++;
    const t = this.peek(k);
    return (t.t === 'kw' && TYPE_KW.has(t.v)) || t.t === 'id';
  }
  isDeclStart() {
    const t = this.cur;
    if (t.t === 'kw' && TYPE_KW.has(t.v)) return !(this.isOp('.', 1) || this.isOp('(', 1));
    if (t.t === 'id') {
      const n1 = this.peek(1);
      if (n1.t === 'id') return true;
      if (n1.t === 'kw' && TYPE_KW.has(n1.v) === false && false) return true;
      if (n1.t === 'op' && n1.v === '<') { const save = this.p; this.p++; const g = this.looksGeneric(); this.p = save; if (g) return true; }
      if (n1.t === 'op' && n1.v === '[' && (this.isOp(']', 2) || this.isOp(',', 2))) return true;
      if (n1.t === 'op' && n1.v === '?' && this.peek(2).t === 'id' && (this.isOp('=', 3) || this.isOp(';', 3))) return true;
    }
    return false;
  }
  parseStatement() {
    const startP = this.p;
    try { return this.parseStatementInner(); }
    catch (e) {
      if (e !== ABORT) throw e;
      this.sync();
      if (this.p === startP && this.cur.t !== 'eof' && !this.isOp('}')) this.p++;
      return { k: 'empty', line: 0, col: 0 };
    }
  }
  parseEmbedded() { // body of if/while/for
    if (this.isOp('}') || this.cur.t === 'eof') { this.invalid(); }
    return this.parseStatement();
  }
  parseStatementInner() {
    const t = this.cur;
    const mk = (k, extra) => Object.assign({ k, line: t.line, col: t.col }, extra);
    if (t.t === 'op') {
      if (t.v === '{') return this.parseBlock();
      if (t.v === ';') { this.p++; return mk('empty'); }
    }
    if (t.t === 'kw') {
      switch (t.v) {
        case 'if': {
          this.p++;
          if (!this.accept('(')) { this.errPrevEnd('CS1003', ["'('"]); }
          const c = this.parseExpr();
          if (!this.accept(')')) this.errPrevEnd('CS1026');
          const a = this.parseEmbedded();
          let b = null;
          if (this.isKw('else')) { this.p++; b = this.parseEmbedded(); }
          return mk('if', { c, a, b });
        }
        case 'else': {
          this.errPrevEnd('CS8641'); this.p++;
          return mk('empty');
        }
        case 'while': {
          this.p++;
          if (!this.accept('(')) this.errPrevEnd('CS1003', ["'('"]);
          const c = this.parseExpr();
          if (!this.accept(')')) this.errPrevEnd('CS1026');
          const body = this.parseEmbedded();
          return mk('while', { c, body });
        }
        case 'do': {
          this.p++;
          const body = this.parseEmbedded();
          if (!this.isKw('while')) { this.errPrevEnd('CS1003', ["'while'"]); throw ABORT; }
          this.p++;
          if (!this.accept('(')) this.errPrevEnd('CS1003', ["'('"]);
          const c = this.parseExpr();
          if (!this.accept(')')) this.errPrevEnd('CS1026');
          this.expectSemi();
          return mk('dowhile', { c, body });
        }
        case 'for': {
          this.p++;
          if (!this.accept('(')) this.errPrevEnd('CS1003', ["'('"]);
          let init = null;
          if (!this.isOp(';')) {
            if (this.isDeclStart()) init = this.parseDecl(false, true);
            else { init = { k: 'exprs', list: [] }; for (;;) { init.list.push(this.parseExpr()); if (!this.accept(',')) break; } }
          }
          this.expectOp(';', 'CS1002');
          let c = null;
          if (!this.isOp(';')) c = this.parseExpr();
          this.expectOp(';', 'CS1002');
          const upd = [];
          if (!this.isOp(')')) { for (;;) { upd.push(this.parseExpr()); if (!this.accept(',')) break; } }
          if (!this.accept(')')) this.errPrevEnd('CS1026');
          const body = this.parseEmbedded();
          return mk('for', { init, c, upd, body });
        }
        case 'return': {
          this.p++;
          let e = null;
          if (!this.isOp(';')) { if (this.isOp('}') || this.cur.t === 'eof') { this.errPrevEnd('CS1002'); return mk('return', { e: null }); } e = this.parseExpr(); }
          this.expectSemi();
          return mk('return', { e });
        }
        case 'break': case 'continue': { this.p++; this.expectSemi(); return mk(t.v); }
        case 'switch': return this.parseSwitch();
        case 'const': { this.p++; return this.parseDecl(true, false); }
        case 'foreach': case 'try': case 'throw': case 'lock': case 'goto': case 'checked': case 'unchecked': case 'unsafe': case 'fixed':
          this.unsupported(t, t.v === 'foreach' ? 'foreach' : t.v === 'try' ? 'try/catch' : t.v);
          break;
        case 'using': this.unsupported(t, 'using כהוראה'); break;
        case 'new': break;
        case 'static': case 'public': case 'private': case 'protected': case 'internal': case 'readonly':
          this.unsupported(t, 'המילה ' + t.v + ' בתוך פונקציה'); break;
        case 'class': case 'struct': case 'enum': case 'interface': this.errAt(t, 'CS1513'); throw ABORT;
        default: break;
      }
    }
    if (this.isDeclStart()) return this.parseDecl(false, false);
    // expression statement
    const e = this.parseExpr();
    this.expectSemi();
    return mk('expr', { e });
  }
  parseDecl(isConst, inFor) {
    const t = this.cur;
    const type = this.parseType();
    if (type.arr || type.generic) { this.errAt(t, 'SUB90', [type.arr ? 'מערכים (arrays)' : 'סוגים כמו List<...>']); throw ABORT; }
    const decls = [];
    for (;;) {
      const nt = this.cur;
      if (nt.t !== 'id') { if (nt.t === 'eof') this.errPrevEnd('CS1002'); else this.errAt(nt, 'CS1001'); throw ABORT; }
      this.p++;
      if (this.isOp('(')) this.unsupported(nt, 'פונקציה בתוך פונקציה');
      let init = null;
      if (this.accept('=')) { init = this.parseExpr(); }
      decls.push({ name: nt.v, line: nt.line, col: nt.col, init });
      if (this.accept(',')) continue;
      break;
    }
    if (!inFor) this.expectSemi();
    return { k: 'decl', line: t.line, col: t.col, type, decls, isConst };
  }
  parseSwitch() {
    const t = this.cur; this.p++;
    if (!this.accept('(')) this.errPrevEnd('CS1003', ["'('"]);
    const e = this.parseExpr();
    if (!this.accept(')')) this.errPrevEnd('CS1026');
    if (!this.accept('{')) { this.errPrevEnd('CS1514'); throw ABORT; }
    const sections = [];
    for (;;) {
      if (this.isOp('}')) { this.p++; break; }
      if (this.cur.t === 'eof') { this.errPrevEnd('CS1513'); break; }
      const sec = { labels: [], stmts: [], line: this.cur.line, col: this.cur.col };
      let any = false;
      while (this.isKw('case') || this.isKw('default')) {
        any = true;
        if (this.isKw('default')) { this.p++; sec.labels.push(null); }
        else { this.p++; sec.labels.push(this.parseTernary()); }
        if (!this.accept(':')) { this.errPrevEnd('CS1003', ["':'"]); }
      }
      if (!any) { this.errAt(this.cur, 'CS1525', [this.tokText(this.cur)]); throw ABORT; }
      while (!this.isKw('case') && !this.isKw('default') && !this.isOp('}') && this.cur.t !== 'eof') sec.stmts.push(this.parseStatement());
      sec.endLine = this.prev().line;
      sections.push(sec);
    }
    return { k: 'switch', line: t.line, col: t.col, e, sections };
  }
  // ---- expressions
  parseExpr() { return this.parseAssign(); }
  parseAssign() {
    const left = this.parseTernary();
    const t = this.cur;
    if (t.t === 'op' && ASSIGN_OPS.has(t.v)) {
      this.p++;
      const value = this.parseAssign();
      return { k: 'assign', op: t.v, target: left, value, line: left.line, col: left.col, opLine: t.line, opCol: t.col };
    }
    return left;
  }
  parseTernary() {
    const c = this.parseBinary(1);
    if (this.isOp('?')) {
      this.p++;
      const a = this.parseTernaryBranch();
      if (!this.accept(':')) { this.errPrevEnd('CS1003', ["':'"]); throw ABORT; }
      const b = this.parseTernaryBranch();
      return { k: 'cond', c, a, b, line: c.line, col: c.col };
    }
    return c;
  }
  parseTernaryBranch() { return this.parseAssign(); }
  parseBinary(minPrec) {
    let left = this.parseUnary();
    for (;;) {
      const t = this.cur;
      if (t.t !== 'op') break;
      const prec = BIN_PREC[t.v];
      if (!prec || prec < minPrec) break;
      this.p++;
      const right = this.parseBinary(prec + 1);
      left = { k: 'bin', op: t.v, l: left, r: right, line: left.line, col: left.col, opLine: t.line, opCol: t.col };
    }
    return left;
  }
  parseUnary() {
    const t = this.cur;
    if (t.t === 'op') {
      if (t.v === '-' || t.v === '+' || t.v === '!' || t.v === '~') {
        this.p++;
        const x = this.parseUnary();
        return { k: 'un', op: t.v, x, line: t.line, col: t.col };
      }
      if (t.v === '++' || t.v === '--') {
        this.p++;
        const x = this.parseUnary();
        return { k: 'incdec', op: t.v, prefix: true, x, line: t.line, col: t.col };
      }
      if (t.v === '(') {
        const n1 = this.peek(1);
        if (n1.t === 'kw' && TYPE_KW.has(n1.v)) {
          // cast: ( type ) or ( type [] )
          let k = 2;
          while (this.isOp('[', k) && this.isOp(']', k + 1)) k += 2;
          if (this.isOp(')', k)) {
            this.p++;
            const type = this.parseType();
            this.p++; // ')'
            const x = this.parseUnary();
            return { k: 'cast', type, x, line: t.line, col: t.col };
          }
        }
      }
    }
    return this.parsePostfix();
  }
  parsePostfix() {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.cur;
      if (t.t !== 'op') break;
      if (t.v === '.') {
        this.p++;
        const nt = this.cur;
        if (nt.t !== 'id') { if (nt.t === 'eof') this.errPrevEnd('CS1001'); else this.errAt(nt, 'CS1001'); throw ABORT; }
        this.p++;
        e = { k: 'member', obj: e, name: nt.v, nline: nt.line, ncol: nt.col, line: e.line, col: e.col };
      } else if (t.v === '(') {
        this.p++;
        const args = this.parseArgs();
        e = { k: 'call', callee: e, args, line: e.line, col: e.col, pline: t.line, pcol: t.col };
      } else if (t.v === '[') {
        this.p++;
        const idx = this.parseExpr();
        if (this.isOp(',')) this.unsupported(this.cur, 'אינדקס מרובה');
        if (!this.accept(']')) this.errPrevEnd('CS1003', ["']'"]);
        e = { k: 'index', obj: e, idx, line: e.line, col: e.col, bline: t.line, bcol: t.col };
      } else if (t.v === '++' || t.v === '--') {
        this.p++;
        e = { k: 'incdec', op: t.v, prefix: false, x: e, line: e.line, col: e.col };
      } else break;
    }
    return e;
  }
  parseArgs() { // after '('
    const args = [];
    if (this.accept(')')) return args;
    for (;;) {
      if (this.isKw('ref') || this.isKw('out') || this.isKw('in')) this.unsupported(this.cur, this.cur.v + ' (העברת פרמטר בהפניה)');
      args.push(this.parseExpr());
      if (this.accept(',')) continue;
      if (this.accept(')')) return args;
      const t = this.cur;
      if (t.t === 'eof' || (t.t === 'op' && (t.v === ';' || t.v === '{' || t.v === '}')) || t.line > this.prev().el) { this.errPrevEnd('CS1026'); return args; }
      this.errAt(t, 'CS1003', ["','"]); throw ABORT;
    }
  }
  parsePrimary() {
    const t = this.cur;
    const at = (k, extra) => Object.assign({ k, line: t.line, col: t.col }, extra);
    switch (t.t) {
      case 'int': this.p++; return at('lit', { t: t.suffix ? 'unsupported' : (t.big ? 'long' : 'int'), v: t.v, big: t.big, suffix: t.suffix });
      case 'dbl': this.p++; return at('lit', { t: t.suffix ? 'unsupported' : 'double', v: t.v, suffix: t.suffix });
      case 'str': this.p++; return at('lit', { t: 'string', v: t.v });
      case 'chr': this.p++; return at('lit', { t: 'char', v: t.v });
      case 'istr': {
        this.p++;
        const parts = t.v.map(pt => {
          if (pt.s !== undefined) return { s: pt.s };
          const sub = lex(pt.src);
          const toks = sub.toks.map(k => { const q = Object.assign({}, k); q.line = pt.line + k.line - 1; q.col = k.line === 1 ? pt.col + k.col - 1 : k.col; q.el = pt.line + k.el - 1; q.ec = k.el === 1 ? pt.col + k.ec - 1 : k.ec; return q; });
          const sp = new Parser(toks, this);
          if (toks.length <= 1) { this.errAt(t, 'CS1525', ['}']); throw ABORT; }
          const e = sp.parseExpr();
          if (sp.cur.t !== 'eof') { this.errAt(t, 'CS1003', ["'}'"]); throw ABORT; }
          return { e, align: pt.align, fmt: pt.fmt };
        });
        return at('interp', { parts });
      }
      case 'id': this.p++; return at('name', { id: t.v });
      case 'kw':
        switch (t.v) {
          case 'true': this.p++; return at('lit', { t: 'bool', v: true });
          case 'false': this.p++; return at('lit', { t: 'bool', v: false });
          case 'null': this.p++; return at('lit', { t: 'null', v: null });
          case 'new': {
            this.p++;
            const type = this.parseType();
            if (this.isOp('[') || this.isOp('{')) this.unsupported(t, 'מערכים (arrays)');
            if (type.arr || type.generic) this.unsupported(t, 'מערכים או סוגים כמו List<...>');
            if (!this.accept('(')) { this.errPrevEnd('CS1003', ["'('"]); throw ABORT; }
            const args = this.parseArgs();
            return at('new', { type, args });
          }
          default:
            if (TYPE_KW.has(t.v) && this.isOp('.', 1)) { this.p++; return at('name', { id: t.v, kw: true }); }
            if (t.v === 'this' || t.v === 'base') this.unsupported(t, t.v);
            if (t.v === 'typeof' || t.v === 'default' || t.v === 'sizeof' || t.v === 'checked' || t.v === 'unchecked') this.unsupported(t, t.v);
            this.invalid(t);
        }
        break;
      case 'op':
        if (t.v === '(') {
          this.p++;
          const e = this.parseExpr();
          if (!this.accept(')')) {
            const c = this.cur;
            if (c.t === 'eof' || (c.t === 'op' && (c.v === ';' || c.v === '{' || c.v === '}')) || c.line > this.prev().el) this.errPrevEnd('CS1026');
            else { this.errPrevEnd('CS1026'); throw ABORT; }
          }
          return Object.assign({}, e, { paren: true });
        }
        this.invalid(t);
        break;
      default: this.invalid(t);
    }
    this.invalid(t);
  }
}

function parseProgram(src) {
  const { toks, errs: lexErrs } = lex(src);
  const sh = { errs: [], errLines: new Set() };
  for (const e of lexErrs) { if (!sh.errLines.has(e.line)) { sh.errLines.add(e.line); sh.errs.push(e); } }
  const ps = new Parser(toks, sh);
  let unit = { usings: [], classes: [] };
  try { unit = ps.parseUnit(); } catch (e) { if (e !== ABORT) throw e; }
  if (ps.eofBrace) { const lt = toks[Math.max(0, toks.length - 2)]; sh.errs.push({ code: 'CS1513', line: lt.el, col: lt.ec, args: [] }); }
  return { unit, errs: sh.errs, toks };
}

// ===================================================================================================
// Runtime state and builtin library
// ===================================================================================================
let R = null; // current execution state
let G = null; // static fields

function emit(s) { R.out += s; if (R.out.length > OUTPUT_LIMIT) throw new TimeoutSignal('output'); }
function tmo() { throw new TimeoutSignal('steps'); }
function readLine() {
  if (R.inPos < R.inputs.length) return R.inputs[R.inPos++];
  if (R.sync) throw new InputExhausted();
  throw new NeedInput();
}
function ovf(msg) { return new RTErr('OverflowException', msg || 'הפעולה גלשה מגבולות המספר (OverflowException)'); }
function nextRandom(rnd, kind, a, b) {
  // kind: 'next0' | 'next1' | 'next2' | 'dbl'
  let v;
  if (R.rndPos < R.rndLog.length) { v = R.rndLog[R.rndPos++]; return v; }
  if (kind === 'next1' && a <= 0) { if (a < 0) throw new RTErr('ArgumentOutOfRangeException', 'ל-Next(n) חייב להתקבל n חיובי (קיבל ' + a + ')'); }
  if (kind === 'next2' && a > b) throw new RTErr('ArgumentOutOfRangeException', 'ב-Next(min, max) המינימום (' + a + ') גדול מהמקסימום (' + b + ')');
  if (R.randomValues.length && R.rvPos < R.randomValues.length && kind !== 'dbl') v = R.randomValues[R.rvPos++];
  else if (rnd.gen) {
    const g = rnd.gen;
    if (kind === 'next0') v = g.internal();
    else if (kind === 'next1') v = a === 0 ? 0 : Math.floor(g.sample() * a);
    else if (kind === 'next2') { const range = b - a; v = range <= MAXINT ? Math.floor(g.sample() * range) + a : a; }
    else v = g.sample();
  } else {
    if (kind === 'next0') v = Math.floor(Math.random() * MAXINT);
    else if (kind === 'next1') v = Math.floor(Math.random() * a);
    else if (kind === 'next2') v = Math.floor(Math.random() * (b - a)) + a;
    else v = Math.random();
  }
  R.rndLog.push(v); R.rndPos++;
  return v;
}
function powExact(x, y) {
  if (y === 0 || x === 1) return 1;
  if (Number.isInteger(x) && Number.isInteger(y) && Math.abs(x) <= 1e15 && Math.abs(y) <= 1100 && x !== 0) {
    const ay = Math.abs(y);
    if (Math.abs(x) === 1 || (ay * Math.log2(Math.abs(x)) < 1060)) {
      const big = BigInt(x) ** BigInt(ay);
      const nb = Number(big);
      if (nb <= 9007199254740992) return y > 0 ? nb : 1 / nb;
    }
  }
  return Math.pow(x, y);
}
const isWS = c => c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0x2028 || c === 0x2029 || c === 0x85 || (c >= 0x2000 && c <= 0x200a) || c === 0x3000 || c === 0x1680 || c === 0x202f || c === 0x205f;
const chr = c => String.fromCharCode(c);
function sIdx(line) { return line; }
function strChk(s) { if (s == null) throw new RTErr('NullReferenceException', 'המשתנה מסוג string הוא null ולכן אי אפשר להפעיל עליו פעולה'); return s; }

// overload tables: [paramTypes[], returnType, impl]
const SM = {
  Math: {
    Abs: [[['int'], 'int', a => { if (a === MININT) throw ovf('הערך המוחלט של int.MinValue לא נכנס ב-int'); return Math.abs(a); }], [['double'], 'double', Math.abs]],
    Max: [[['int', 'int'], 'int', Math.max], [['double', 'double'], 'double', (a, b) => (a !== a || b !== b) ? NaN : Math.max(a, b)]],
    Min: [[['int', 'int'], 'int', Math.min], [['double', 'double'], 'double', (a, b) => (a !== a || b !== b) ? NaN : Math.min(a, b)]],
    Pow: [[['double', 'double'], 'double', powExact]],
    Sqrt: [[['double'], 'double', Math.sqrt]],
    Round: [[['double'], 'double', x => mathRound(x)], [['double', 'int'], 'double', (x, d) => mathRound(x, d)]],
    Floor: [[['double'], 'double', Math.floor]],
    Ceiling: [[['double'], 'double', Math.ceil]],
    Truncate: [[['double'], 'double', Math.trunc]],
    Sign: [[['int'], 'int', Math.sign], [['double'], 'int', x => { if (x !== x) throw new RTErr('ArithmeticException', 'Math.Sign של NaN'); return Math.sign(x); }]],
    Log: [[['double'], 'double', Math.log]],
    Log10: [[['double'], 'double', Math.log10]],
    Log2: [[['double'], 'double', Math.log2]],
    Exp: [[['double'], 'double', Math.exp]],
    Sin: [[['double'], 'double', Math.sin]], Cos: [[['double'], 'double', Math.cos]], Tan: [[['double'], 'double', Math.tan]],
    Asin: [[['double'], 'double', Math.asin]], Acos: [[['double'], 'double', Math.acos]], Atan: [[['double'], 'double', Math.atan]],
    Atan2: [[['double', 'double'], 'double', Math.atan2]],
    Cbrt: [[['double'], 'double', Math.cbrt]],
  },
  int: {
    Parse: [[['string'], 'int', s => parseIntStr(strChk(s))]],
  },
  double: {
    Parse: [[['string'], 'double', s => parseDoubleStr(strChk(s))]],
    IsNaN: [[['double'], 'bool', x => x !== x]],
    IsInfinity: [[['double'], 'bool', x => x === Infinity || x === -Infinity]],
  },
  string: {
    IsNullOrEmpty: [[['string'], 'bool', s => s == null || s.length === 0]],
    IsNullOrWhiteSpace: [[['string'], 'bool', s => s == null || /^\s*$/.test(s)]],
  },
  char: {
    IsDigit: [[['char'], 'bool', c => c >= 48 && c <= 57 || /\p{Nd}/u.test(chr(c))]],
    IsLetter: [[['char'], 'bool', c => /\p{L}/u.test(chr(c))]],
    IsLetterOrDigit: [[['char'], 'bool', c => /[\p{L}\p{Nd}]/u.test(chr(c))]],
    IsUpper: [[['char'], 'bool', c => /\p{Lu}/u.test(chr(c))]],
    IsLower: [[['char'], 'bool', c => /\p{Ll}/u.test(chr(c))]],
    IsWhiteSpace: [[['char'], 'bool', isWS]],
    IsPunctuation: [[['char'], 'bool', c => /\p{P}/u.test(chr(c))]],
    ToUpper: [[['char'], 'char', c => chr(c).toUpperCase().length === 1 ? chr(c).toUpperCase().charCodeAt(0) : c]],
    ToLower: [[['char'], 'char', c => chr(c).toLowerCase().length === 1 ? chr(c).toLowerCase().charCodeAt(0) : c]],
  },
  Convert: {
    ToInt32: [[['string'], 'int', s => s == null ? 0 : parseIntStr(s)], [['int'], 'int', x => x], [['double'], 'int', x => { const r = roundHalfEven(x); if (!(r >= MININT && r <= MAXINT)) throw ovf('הערך גדול מדי עבור int'); return r | 0; }], [['char'], 'int', x => x], [['bool'], 'int', x => x ? 1 : 0]],
    ToDouble: [[['string'], 'double', s => s == null ? 0 : parseDoubleStr(s)], [['int'], 'double', x => x], [['double'], 'double', x => x], [['bool'], 'double', x => x ? 1 : 0]],
    ToBoolean: [[['bool'], 'bool', x => x], [['string'], 'bool', s => { const t = (s || '').trim().toLowerCase(); if (t === 'true') return true; if (t === 'false') return false; throw new RTErr('FormatException', 'הערך "' + s + '" אינו true/false'); }]],
  },
};
function strOf(t) { return v => fmtByType(v, t); }
SM.Convert.ToString = [['int', 'double', 'bool', 'char', 'string'].map(t => [[t], 'string', strOf(t)])][0];
SM.Convert.ToChar = [[['int'], 'char', x => { if (x < 0 || x > 65535) throw ovf('הערך לא נכנס ב-char'); return x; }], [['char'], 'char', x => x], [['string'], 'char', s => { if (s == null || s.length !== 1) throw new RTErr('FormatException', 'המחרוזת חייבת להכיל תו אחד'); return s.charCodeAt(0); }]];
SM.Int32 = SM.int; SM.Double = SM.double; SM.String = SM.string; SM.Char = SM.char;
const SP = { // static properties/consts: [type, value]
  Math: { PI: ['double', Math.PI], E: ['double', Math.E], Tau: ['double', 2 * Math.PI] },
  int: { MaxValue: ['int', MAXINT], MinValue: ['int', MININT] },
  double: { MaxValue: ['double', Number.MAX_VALUE], MinValue: ['double', -Number.MAX_VALUE], Epsilon: ['double', 5e-324], NaN: ['double', NaN], PositiveInfinity: ['double', Infinity], NegativeInfinity: ['double', -Infinity] },
  string: { Empty: ['string', ''] },
  char: { MaxValue: ['char', 65535], MinValue: ['char', 0] },
};
SP.Int32 = SP.int; SP.Double = SP.double; SP.String = SP.string; SP.Char = SP.char;
const STATIC_TYPES = new Set(['Console', 'Math', 'Random', 'Convert', 'string', 'String', 'int', 'Int32', 'double', 'Double', 'char', 'Char', 'bool', 'Boolean']);
const NEEDS_SYSTEM = new Set(['Console', 'Math', 'Random', 'Convert', 'String', 'Int32', 'Double', 'Char', 'Boolean']);
const CONSOLE_METHODS = ['WriteLine', 'Write', 'ReadLine', 'Clear', 'ReadKey'];

// instance members
const toStrIM = (t) => [[[], 'string', v => fmtByType(v, t)], [['string'], 'string', (v, fmt) => t === 'double' || t === 'int' ? formatNumber(v, t === 'int', fmt) : fmtByType(v, t)]];
const IM = {
  string: {
    ToUpper: [[[], 'string', s => strChk(s).toUpperCase()]],
    ToLower: [[[], 'string', s => strChk(s).toLowerCase()]],
    Trim: [[[], 'string', s => strChk(s).replace(/^[\s ﻿]+|[\s ﻿]+$/g, '')]],
    TrimStart: [[[], 'string', s => strChk(s).replace(/^[\s ﻿]+/, '')]],
    TrimEnd: [[[], 'string', s => strChk(s).replace(/[\s ﻿]+$/, '')]],
    Substring: [[['int'], 'string', (s, a) => { strChk(s); if (a < 0 || a > s.length) throw new RTErr('ArgumentOutOfRangeException', 'Substring: ההתחלה ' + a + ' מחוץ לגבולות המחרוזת (אורך ' + s.length + ')'); return s.slice(a); }],
      [['int', 'int'], 'string', (s, a, l) => { strChk(s); if (a < 0 || l < 0 || a + l > s.length) throw new RTErr('ArgumentOutOfRangeException', 'Substring: ההתחלה ' + a + ' והאורך ' + l + ' חורגים מהמחרוזת (אורך ' + s.length + ')'); return s.substr(a, l); }]],
    Contains: [[['string'], 'bool', (s, x) => strChk(s).includes(strChk(x))], [['char'], 'bool', (s, c) => strChk(s).includes(chr(c))]],
    IndexOf: [[['string'], 'int', (s, x) => strChk(s).indexOf(strChk(x))], [['char'], 'int', (s, c) => strChk(s).indexOf(chr(c))]],
    LastIndexOf: [[['string'], 'int', (s, x) => strChk(s).lastIndexOf(strChk(x))], [['char'], 'int', (s, c) => strChk(s).lastIndexOf(chr(c))]],
    StartsWith: [[['string'], 'bool', (s, x) => strChk(s).startsWith(strChk(x))], [['char'], 'bool', (s, c) => strChk(s).startsWith(chr(c))]],
    EndsWith: [[['string'], 'bool', (s, x) => strChk(s).endsWith(strChk(x))], [['char'], 'bool', (s, c) => strChk(s).endsWith(chr(c))]],
    Replace: [[['string', 'string'], 'string', (s, a, b) => { strChk(s); if (a === '' || a == null) throw new RTErr('ArgumentException', 'Replace: המחרוזת לחיפוש ריקה'); return s.split(a).join(b == null ? '' : b); }], [['char', 'char'], 'string', (s, a, b) => strChk(s).split(chr(a)).join(chr(b))]],
    PadLeft: [[['int'], 'string', (s, n) => strChk(s).padStart(n)], [['int', 'char'], 'string', (s, n, c) => strChk(s).padStart(n, chr(c))]],
    PadRight: [[['int'], 'string', (s, n) => strChk(s).padEnd(n)], [['int', 'char'], 'string', (s, n, c) => strChk(s).padEnd(n, chr(c))]],
    Insert: [[['int', 'string'], 'string', (s, i, x) => { strChk(s); if (i < 0 || i > s.length) throw new RTErr('ArgumentOutOfRangeException', 'Insert: אינדקס מחוץ לגבולות'); return s.slice(0, i) + x + s.slice(i); }]],
    Remove: [[['int'], 'string', (s, i) => { strChk(s); if (i < 0 || i > s.length) throw new RTErr('ArgumentOutOfRangeException', 'Remove: אינדקס מחוץ לגבולות'); return s.slice(0, i); }]],
    ToString: [[[], 'string', s => s]],
    Equals: [[['string'], 'bool', (s, x) => s === x]],
    CompareTo: [[['string'], 'int', (s, x) => s === x ? 0 : (s < x ? -1 : 1)]],
  },
  int: { ToString: toStrIM('int'), Equals: [[['int'], 'bool', (a, b) => a === b]], CompareTo: [[['int'], 'int', (a, b) => a < b ? -1 : a > b ? 1 : 0]] },
  double: { ToString: toStrIM('double'), Equals: [[['double'], 'bool', (a, b) => a === b || (a !== a && b !== b)]], CompareTo: [[['double'], 'int', (a, b) => a < b ? -1 : a > b ? 1 : 0]] },
  char: { ToString: toStrIM('char'), Equals: [[['char'], 'bool', (a, b) => a === b]] },
  bool: { ToString: toStrIM('bool'), Equals: [[['bool'], 'bool', (a, b) => a === b]] },
  Random: {
    Next: [[[], 'int', 'next0'], [['int'], 'int', 'next1'], [['int', 'int'], 'int', 'next2']],
    NextDouble: [[[], 'double', 'dbl']],
  },
};
function suggest(name, cands) {
  const lower = name.toLowerCase();
  for (const c of cands) if (c.toLowerCase() === lower && c !== name) return c;
  let best = null, bd = 3;
  for (const c of cands) {
    if (Math.abs(c.length - name.length) > 2 || name.length < 3) continue;
    const d = lev(name.toLowerCase(), c.toLowerCase());
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function lev(a, b) {
  const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// ===================================================================================================
// Semantic analysis + closure generation
// ===================================================================================================
class Scope {
  constructor(parent, names) { this.parent = parent; this.vars = new Map(); this.names = names || new Set(); }
}
function prescan(stmts) {
  const s = new Set();
  for (const st of stmts) if (st && st.k === 'decl') for (const d of st.decls) s.add(d.name);
  return s;
}
const ERRT = { t: 'err', f: () => 0 };
const numT = t => t === 'int' || t === 'double' || t === 'char' || t === 'long';
function implicitOk(from, to) {
  if (from === to || from === 'err' || to === 'err') return true;
  if (from === 'null') return to === 'string' || to === 'Random';
  if (to === 'double') return from === 'int' || from === 'char' || from === 'long';
  if (to === 'int') return from === 'char';
  return false;
}
function cloneS(s) { return { r: s.r, d: s.d ? new Set(s.d) : null }; }
function meetS(a, b) {
  const r = a.r || b.r;
  let d;
  if (a.d === null) d = b.d ? new Set(b.d) : null;
  else if (b.d === null) d = new Set(a.d);
  else { d = new Set(); for (const x of a.d) if (b.d.has(x)) d.add(x); }
  return { r, d };
}
const DEAD = () => ({ r: false, d: null });

class Compiler {
  constructor(unit, traceOn) {
    this.unit = unit; this.traceOn = !!traceOn;
    this.errs = []; this.errKeys = new Set();
    this.methods = new Map(); this.fields = new Map(); this.nfields = 0;
    this.cur = null; this.hasSystem = unit.usings.some(u => u.name === 'System');
    this.className = 'Program';
  }
  err(code, line, col, args) {
    const key = code + ':' + line + ':' + col;
    if (this.errKeys.has(key)) return; this.errKeys.add(key);
    this.errs.push({ code, line, col, args: args || [] });
  }
  // ---------- types
  resolveType(tn, allowVoid) {
    let name = tn.name;
    if (name.startsWith('System.')) name = name.slice(7);
    if (tn.arr || tn.generic) { this.err('SUB90', tn.line, tn.col, [tn.arr ? 'מערכים (arrays)' : 'סוגים כמו List<...>']); return 'err'; }
    switch (name) {
      case 'int': case 'Int32': return 'int';
      case 'double': case 'Double': return 'double';
      case 'bool': case 'Boolean': return 'bool';
      case 'string': case 'String': return 'string';
      case 'char': case 'Char': return 'char';
      case 'void': return 'void';
      case 'Random': if (this.hasSystem || tn.name.startsWith('System.')) return 'Random'; break;
      case 'long': case 'float': case 'decimal': case 'byte': case 'short': case 'object': case 'uint': case 'ulong': case 'sbyte': case 'ushort':
        this.err('SUB90', tn.line, tn.col, ['הטיפוס ' + name + ' (בקורס רק int, double, bool, string, char)']); return 'err';
    }
    this.err('CS0246', tn.line, tn.col, [tn.name]); return 'err';
  }
  // ---------- scopes / DA
  pushScope(names) { this.cur.scope = new Scope(this.cur.scope, names); }
  popScope() { this.cur.scope = this.cur.scope.parent; }
  lookupVar(name) { for (let s = this.cur.scope; s; s = s.parent) { const v = s.vars.get(name); if (v) return v; } return null; }
  declaredLater(name) { for (let s = this.cur.scope; s; s = s.parent) if (s.names.has(name)) return true; return false; }
  declare(name, t, line, col, extra) {
    const sc = this.cur.scope;
    if (sc.vars.has(name)) { this.err('CS0128', line, col, [name]); }
    else for (let s = sc.parent; s; s = s.parent) if (s.vars.has(name) || s.names.has(name)) { this.err('CS0136', line, col, [name]); break; }
    const vi = Object.assign({ name, t, slot: this.cur.nslots++, line, col }, extra);
    sc.vars.set(name, vi);
    return vi;
  }
  visibleVars() {
    const chain = []; for (let s = this.cur.scope; s; s = s.parent) chain.unshift(s);
    const out = [];
    for (const s of chain) for (const v of s.vars.values()) if (v.t !== 'err') out.push({ name: v.name, slot: v.slot, t: v.t });
    return out;
  }
  isAssigned(slot) { const d = this.cur.S.d; return d === null || d.has(slot); }
  markAssigned(slot) { const d = this.cur.S.d; if (d !== null) d.add(slot); }
  // ---------- program
  compileAll() {
    const unit = this.unit;
    for (const u of unit.usings) {
      const known = ['System', 'System.Collections.Generic', 'System.Linq', 'System.Text', 'System.IO', 'System.Collections', 'System.Threading', 'System.Threading.Tasks', 'System.Globalization', 'System.Diagnostics'];
      if (!known.includes(u.name)) this.err('CS0246', u.line, u.col, [u.name]);
    }
    if (unit.classes.length === 0) { this.err('CS5001', 1, 1); return null; }
    if (unit.classes.length > 1) { const c = unit.classes[1]; this.err('SUB90', c.line, c.col, ['מחלקה נוספת (class)']); }
    const cls = unit.classes[0]; this.className = cls.name;
    // fields
    for (const fd of cls.fields) {
      if (this.fields.has(fd.name)) { this.err('CS0102', fd.line, fd.col, [fd.name]); continue; }
      const t = this.resolveType(fd.type);
      this.fields.set(fd.name, { name: fd.name, t, slot: this.nfields++, isStatic: fd.isStatic || fd.isConst, isConst: fd.isConst, node: fd });
    }
    // method signatures
    for (const m of cls.methods) {
      const mi = { name: m.name, node: m, isStatic: m.isStatic, params: [], ret: this.resolveType(m.ret), body: null, nslots: 0 };
      const seen = new Set();
      for (const p of m.params) {
        let pt;
        if (p.type.arr && p.type.name === 'string' && m.name === 'Main') pt = 'string[]'; else pt = this.resolveType(p.type);
        if (seen.has(p.name)) this.err('CS0100', p.line, p.col, [p.name]);
        seen.add(p.name);
        mi.params.push({ name: p.name, t: pt });
      }
      const list = this.methods.get(m.name) || [];
      if (list.some(o => o.params.length === mi.params.length && o.params.every((q, i) => q.t === mi.params[i].t))) this.err('CS0111', m.line, m.col, [m.name]);
      else list.push(mi);
      this.methods.set(m.name, list);
      mi.sig = m.name;
    }
    // field initialisers
    this.fieldInits = [];
    this.cur = { mi: { name: '<static>', ret: 'void', params: [] }, nslots: 0, scope: new Scope(null), S: { r: true, d: new Set() }, loops: [], isStaticCtx: true };
    for (const f of this.fields.values()) {
      const fd = f.node;
      if (fd.init) {
        const ex = this.cx(fd.init);
        const fn = this.coerce(ex, f.t, fd.init, 'init');
        if (f.isConst) { if (!ex.c) this.err('CS0133', fd.line, fd.col, [f.name]); else { f.c = true; f.v = ex.v; } }
        this.fieldInits.push({ slot: f.slot, f: fn });
      } else this.fieldInits.push({ slot: f.slot, f: () => defaultOf(f.t) });
    }
    this.fieldNslots = this.cur.nslots;
    // bodies
    for (const list of this.methods.values()) for (const mi of list) this.compileMethod(mi);
    // entry
    let main = null;
    for (const mi of (this.methods.get('Main') || [])) {
      if (mi.isStatic && (mi.params.length === 0 || (mi.params.length === 1 && mi.params[0].t === 'string[]')) && (mi.ret === 'void' || mi.ret === 'int')) { main = mi; break; }
    }
    if (!main) { this.err('CS5001', 1, 1); return null; }
    return main;
  }
  compileMethod(mi) {
    const m = mi.node;
    this.cur = { mi, nslots: 0, scope: new Scope(null), S: { r: true, d: new Set() }, loops: [], isStaticCtx: mi.isStatic, mname: mi.name };
    mi.params.forEach((p, i) => { const vi = this.declare(p.name, p.t, m.params[i].line, m.params[i].col, { isParam: true }); this.markAssigned(vi.slot); });
    const body = this.cBlock(m.body, true);
    if (mi.ret !== 'void' && mi.ret !== 'err' && this.cur.S.r) this.err('CS0161', m.line, m.col, [m.name]);
    mi.body = body; mi.nslots = this.cur.nslots;
  }
  // ---------- statements
  wrapSimple(n, fn) {
    const line = n.line;
    if (!this.traceOn) return f => { R.line = line; if (++R.steps > R.max) tmo(); return fn(f); };
    const vl = this.visibleVars(), mname = this.cur.mname;
    return f => { R.line = line; if (++R.steps > R.max) tmo(); const o0 = R.out.length; const s = fn(f); recTrace(f, line, vl, o0, mname); return s; };
  }
  tracer(n) { // returns a function (f, o0) recording a trace entry, or null
    if (!this.traceOn) return null;
    const vl = this.visibleVars(), mname = this.cur.mname, line = n.line;
    return (f, o0) => recTrace(f, line, vl, o0, mname);
  }
  cBlock(n, isMethodBody) {
    this.pushScope(prescan(n.stmts));
    const fs = [];
    for (const s of n.stmts) { const f = this.cStmt(s); if (f) fs.push(f); }
    this.popScope();
    const cnt = fs.length;
    if (cnt === 0) return () => 0;
    if (cnt === 1) return fs[0];
    if (cnt === 2) { const a = fs[0], b = fs[1]; return f => { const s = a(f); if (s !== 0) return s; return b(f); }; }
    return f => { for (let i = 0; i < cnt; i++) { const s = fs[i](f); if (s !== 0) return s; } return 0; };
  }
  cCond(n, what) {
    const ex = this.cx(n);
    if (ex.t === 'err') return { f: () => false, c: false };
    if (ex.t !== 'bool') { this.coerceErr(ex, 'bool', n, what || 'cond'); return { f: () => false, c: false }; }
    return ex;
  }
  cStmt(n) {
    const cur = this.cur;
    switch (n.k) {
      case 'empty': return null;
      case 'block': return this.cBlock(n);
      case 'decl': return this.cDecl(n);
      case 'expr': return this.cExprStmt(n);
      case 'if': {
        const line = n.line;
        const c = this.cCond(n.c);
        const sc = cloneS(cur.S);
        const trc = this.tracer(n);
        cur.S = cloneS(sc); if (c.c && c.v === false) cur.S.d = null;
        const a = this.cStmt(n.a) || (() => 0);
        const sa = cur.S;
        cur.S = cloneS(sc); if (c.c && c.v === true) cur.S.d = null;
        const b = n.b ? (this.cStmt(n.b) || (() => 0)) : null;
        cur.S = meetS(sa, cur.S);
        const cf = c.f;
        if (!b) return f => { R.line = line; if (++R.steps > R.max) tmo(); const o0 = trc ? R.out.length : 0; const v = cf(f); if (trc) trc(f, o0); return v ? a(f) : 0; };
        return f => { R.line = line; if (++R.steps > R.max) tmo(); const o0 = trc ? R.out.length : 0; const v = cf(f); if (trc) trc(f, o0); return v ? a(f) : b(f); };
      }
      case 'while': return this.cLoop(n, null, n.c, [], n.body, false);
      case 'dowhile': return this.cLoop(n, null, n.c, [], n.body, true);
      case 'for': {
        this.pushScope(n.init && n.init.k === 'decl' ? prescan([n.init]) : new Set());
        let init = null;
        if (n.init) {
          if (n.init.k === 'decl') init = this.cDecl(n.init, true);
          else { const fs = n.init.list.map(e => this.cExprOnly(e)); init = f => { for (const g of fs) g(f); }; }
        }
        const r = this.cLoop(n, init, n.c, n.upd, n.body, false);
        this.popScope();
        return r;
      }
      case 'return': {
        const mi = cur.mi; const line = n.line;
        let fn;
        if (mi.ret === 'void') {
          if (n.e) { const ex = this.cx(n.e); this.err('CS0127', n.line, n.col, [mi.name]); }
          fn = () => 3;
        } else if (!n.e) { this.err('CS0126', n.line, n.col, [mi.ret]); fn = () => 3; }
        else {
          const ex = this.cx(n.e);
          const cf = this.coerce(ex, mi.ret, n.e, 'return');
          fn = f => { R.rv = cf(f); return 3; };
        }
        const w = this.wrapSimple(n, fn);
        cur.S = DEAD();
        return w;
      }
      case 'break': case 'continue': {
        const loops = cur.loops;
        if (!loops.length || (n.k === 'continue' && !loops.some(l => !l.isSwitch))) { this.err('CS0139', n.line, n.col); return null; }
        if (n.k === 'break') loops[loops.length - 1].breaks.push(cloneS(cur.S));
        else { for (let i = loops.length - 1; i >= 0; i--) if (!loops[i].isSwitch) { loops[i].conts.push(cloneS(cur.S)); break; } }
        cur.S = DEAD();
        const sig = n.k === 'break' ? 1 : 2;
        return this.wrapSimple(n, () => sig);
      }
      case 'switch': return this.cSwitch(n);
      default: this.err('SUB90', n.line, n.col, ['הוראה']); return null;
    }
  }
  cLoop(n, init, condNode, upd, body, isDo) {
    const cur = this.cur, line = n.line;
    const loop = { breaks: [], conts: [], isSwitch: false };
    let c, sc, bodyFn, updFns = [];
    const trcInit = init ? this.tracer(n) : null;
    if (isDo) {
      cur.loops.push(loop);
      bodyFn = this.cStmt(body) || (() => 0);
      cur.loops.pop();
      let st = cur.S; for (const k of loop.conts) st = meetS(st, k);
      cur.S = st;
      c = condNode ? this.cCond(condNode) : { f: () => true, c: true, v: true };
      let after = (c.c && c.v === true) ? DEAD() : cloneS(cur.S);
      for (const b of loop.breaks) after = meetS(after, b);
      cur.S = after;
      const cf = c.f, trc = this.tracer(n);
      return f => {
        for (;;) {
          R.line = line; if (++R.steps > R.max) tmo();
          const s = bodyFn(f);
          if (s === 1) break; if (s === 3) return 3;
          const o0 = trc ? R.out.length : 0;
          const v = cf(f); if (trc) trc(f, o0);
          if (!v) break;
        }
        return 0;
      };
    }
    c = condNode ? this.cCond(condNode) : { f: () => true, c: true, v: true };
    sc = cloneS(cur.S);
    const trc = this.tracer(n);
    cur.S = cloneS(sc); if (c.c && c.v === false) cur.S.d = null;
    cur.loops.push(loop);
    bodyFn = this.cStmt(body) || (() => 0);
    cur.loops.pop();
    if (upd.length) {
      let st = cur.S; for (const k of loop.conts) st = meetS(st, k);
      if (!st.r) st = cloneS(sc);
      cur.S = st;
      updFns = upd.map(e => this.cExprOnly(e));
    }
    let after = (c.c && c.v === true) ? DEAD() : cloneS(sc);
    for (const b of loop.breaks) after = meetS(after, b);
    cur.S = after;
    const cf = c.f, nu = updFns.length;
    const alwaysTrue = c.c && c.v === true;
    return f => {
      if (init) { init(f); if (trcInit) trcInit(f, R.out.length); }
      for (;;) {
        R.line = line; if (++R.steps > R.max) tmo();
        const o0 = trc ? R.out.length : 0;
        const v = alwaysTrue || cf(f);
        if (trc) trc(f, o0);
        if (!v) break;
        const s = bodyFn(f);
        if (s === 1) break; if (s === 3) return 3;
        for (let i = 0; i < nu; i++) updFns[i](f);
      }
      return 0;
    };
  }
  cSwitch(n) {
    const cur = this.cur, line = n.line;
    const ex = this.cx(n.e);
    let st = ex.t;
    if (st !== 'err' && st !== 'int' && st !== 'char' && st !== 'string') { this.err('CS0151', n.e.line, n.e.col, []); st = 'err'; }
    const sc = cloneS(cur.S);
    const loop = { breaks: [], conts: [], isSwitch: true };
    cur.loops.push(loop);
    this.pushScope(prescan([].concat(...n.sections.map(s => s.stmts))));
    const secs = []; let hasDefault = false;
    for (const sec of n.sections) {
      cur.S = cloneS(sc);
      const labels = [];
      for (const l of sec.labels) {
        if (l === null) { hasDefault = true; labels.push({ def: true }); continue; }
        const lx = this.cx(l);
        if (lx.t !== 'err' && st !== 'err') {
          if (!lx.c) this.err('CS0150', l.line, l.col, []);
          else { this.coerce(lx, st, l, 'init'); labels.push({ v: lx.v }); }
        }
      }
      const fs = sec.stmts.map(s => this.cStmt(s)).filter(Boolean);
      if (cur.S.r) this.err(sec === n.sections[n.sections.length - 1] ? 'CS8070' : 'CS0163', sec.endLine || sec.line, sec.col, []);
      secs.push({ labels, fs });
    }
    this.popScope();
    cur.loops.pop();
    let after = hasDefault ? DEAD() : sc;
    for (const b of loop.breaks) after = meetS(after, b);
    cur.S = after;
    const ef = ex.f;
    return f => {
      R.line = line; if (++R.steps > R.max) tmo();
      const v = ef(f);
      let target = -1, def = -1;
      for (let i = 0; i < secs.length && target < 0; i++) for (const l of secs[i].labels) { if (l.def) def = i; else if (l.v === v) { target = i; break; } }
      if (target < 0) target = def;
      if (target < 0) return 0;
      for (const g of secs[target].fs) { const s = g(f); if (s === 1) return 0; if (s !== 0) return s; }
      return 0;
    };
  }
  cDecl(n, noWrap) {
    const cur = this.cur;
    const isVar = n.type.name === 'var' && !n.type.arr;
    let t = isVar ? null : this.resolveType(n.type);
    if (t === 'void') { this.err('CS1547', n.type.line, n.type.col, []); t = 'err'; }
    const parts = [];
    for (const d of n.decls) {
      const vi = this.declare(d.name, t === null ? 'err' : t, d.line, d.col, { isConst: n.isConst });
      if (!d.init) {
        if (isVar) { this.err('CS0818', d.line, d.col); continue; }
        if (n.isConst) { this.err('CS0145', d.line, d.col, []); }
        continue;
      }
      const ex = this.cx(d.init);
      let fn;
      if (isVar) {
        if (ex.t === 'null') { this.err('CS0815', d.line, d.col); vi.t = 'err'; fn = () => 0; }
        else if (ex.t === 'void' || ex.t === 'mg') { this.err('CS0029', d.init.line, d.init.col, [ex.t, 'var']); vi.t = 'err'; fn = () => 0; }
        else { vi.t = ex.t === 'long' ? 'err' : ex.t; fn = ex.f; }
      } else fn = this.coerce(ex, vi.t, d.init, 'init');
      if (n.isConst) { if (ex.c && ex.t !== 'err') { vi.c = true; vi.v = ex.v; if (vi.t === 'double' && ex.t !== 'double') vi.v = ex.v; } else if (ex.t !== 'err') this.err('CS0133', d.line, d.col, [d.name]); }
      this.markAssigned(vi.slot);
      const slot = vi.slot;
      parts.push({ slot, fn });
    }
    const np = parts.length;
    let fn;
    if (np === 0) fn = () => 0;
    else if (np === 1) { const { slot, fn: g } = parts[0]; fn = f => { f[slot] = g(f); return 0; }; }
    else fn = f => { for (let i = 0; i < np; i++) f[parts[i].slot] = parts[i].fn(f); return 0; };
    if (noWrap) return fn;
    return this.wrapSimple(n, fn);
  }
  cExprOnly(e) { // expression used as statement-expression (for update etc.)
    const ex = this.cx(e, true);
    if (!['assign', 'incdec', 'call', 'new'].includes(e.k)) { if (ex.t !== 'err') this.err('CS0201', e.line, e.col); }
    return ex.f;
  }
  cExprStmt(n) {
    const e = n.e;
    const ex = this.cx(e, true);
    if (!['assign', 'incdec', 'call', 'new'].includes(e.k) || (e.paren && e.k !== 'call' && e.k !== 'assign' && false)) {
      if (ex.t !== 'err' || ['name', 'member', 'lit', 'bin', 'un', 'cond', 'cast', 'index', 'interp'].includes(e.k)) this.err('CS0201', e.line, e.col);
      return null;
    }
    const f0 = ex.f;
    return this.wrapSimple(n, f => { f0(f); return 0; });
  }
}
function defaultOf(t) { return t === 'int' || t === 'double' || t === 'char' ? 0 : t === 'bool' ? false : null; }
function recTrace(f, line, vl, o0, mname) {
  if (R.trace.length >= 3000) return;
  const vars = {};
  for (let i = 0; i < vl.length; i++) { const v = vl[i]; const val = f[v.slot]; vars[v.name] = val === undefined ? '?' : fmtByType(val, v.t); }
  const e = { line, method: mname, depth: Math.max(0, R.depth - 1), vars };
  const out = R.out.slice(o0); if (out) e.output = out;
  R.trace.push(e);
}

// ---------------------------------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------------------------------
function invoke(m, fr, line) {
  if (++R.depth > R.maxDepth) throw new RTErr('StackOverflowException', 'הרקורסיה עמוקה מדי - פונקציה קוראת לעצמה בלי סוף (או יותר מדי פעמים)', line);
  if (++R.steps > R.max) tmo();
  m.body(fr);
  R.depth--; R.line = line;
  return R.rv;
}
const constEx = (t, v, extra) => Object.assign({ t, c: true, v, f: () => v }, extra);
function mkCallN(impl, fs) {
  switch (fs.length) {
    case 0: return () => impl();
    case 1: { const a = fs[0]; return f => impl(a(f)); }
    case 2: { const a = fs[0], b = fs[1]; return f => impl(a(f), b(f)); }
    case 3: { const a = fs[0], b = fs[1], c = fs[2]; return f => impl(a(f), b(f), c(f)); }
    default: return f => impl(...fs.map(g => g(f)));
  }
}
const promote = (a, b) => (a === 'double' || b === 'double') ? 'double' : (a === 'long' || b === 'long') ? 'long' : 'int';

Object.assign(Compiler.prototype, {
  strFn(ex) {
    const g = ex.f;
    switch (ex.t) {
      case 'string': return f => { const v = g(f); return v == null ? '' : v; };
      case 'int': case 'long': return f => '' + g(f);
      case 'double': return f => fmtDouble(g(f));
      case 'bool': return f => g(f) ? 'True' : 'False';
      case 'char': return f => String.fromCharCode(g(f));
      default: return f => '' + g(f);
    }
  },
  coerceErr(ex, to, node, ctx) {
    const from = ex.t, dfrom = ex.dt || from;
    if (from === 'mg') { if (ctx === 'arg') this.err('CS1503', node.line, node.col, [1, 'mg', to]); else this.err('CS0428', node.line, node.col, [ex.mgName || (node.k === 'member' ? node.name : node.id) || '?']); return; }
    if (numT(from) && numT(to) && to !== 'long') { this.err('CS0266', node.line, node.col, [dfrom, to]); return; }
    let hint = '';
    if (from === 'string' && (to === 'int' || to === 'double')) hint = 'אם זה טקסט שהמשתמש הקליד, המירו אותו עם int.Parse(...) או double.Parse(...)';
    else if (to === 'bool' && numT(from)) hint = 'בתנאי צריך ביטוי שתוצאתו true/false. אם התכוונתם להשוואה - כתבו == (שני סימני שווה), ולא = (השמה)';
    else if (to === 'string' && (numT(from) || from === 'bool')) hint = 'כדי להציג מספר כטקסט אפשר לכתוב "" + x';
    else if (from === 'void') hint = 'הפונקציה היא void ולא מחזירה ערך';
    this.err('CS0029', node.line, node.col, [dfrom, to, hint]);
  },
  coerce(ex, to, node, ctx) {
    if (ex.t === 'err' || to === 'err') return ex.f;
    if (to === 'void') return ex.f;
    if (implicitOk(ex.t, to)) return ex.f;
    this.coerceErr(ex, to, node, ctx);
    return () => 0;
  },
  cx(n, stmtCtx) {
    const ex = this.cx0(n, stmtCtx);
    if (ex.t === 'typeref' || ex.t === 'ns') { this.err('CS0119', n.line, n.col, [n.id || n.name || '?']); return ERRT; }
    return ex;
  },
  cx0(n, stmtCtx) {
    switch (n.k) {
      case 'lit': {
        if (n.t === 'unsupported') { this.err('SUB90', n.line, n.col, ['מספר עם סיומת ' + n.suffix + ' (float/long/decimal)']); return ERRT; }
        if (n.t === 'long') return constEx('long', n.v, { dt: n.v <= 4294967295 ? 'uint' : 'long' });
        if (n.t === 'null') return { t: 'null', f: () => null };
        return constEx(n.t, n.v);
      }
      case 'name': return this.cName(n);
      case 'member': return this.cMember(n);
      case 'call': return this.cCall(n);
      case 'new': return this.cNew(n);
      case 'un': return this.cUn(n);
      case 'incdec': return this.cIncDec(n);
      case 'bin': return this.cBin(n);
      case 'assign': return this.cAssign(n);
      case 'cond': return this.cCondExpr(n);
      case 'cast': return this.cCast(n);
      case 'index': return this.cIndex(n);
      case 'interp': return this.cInterp(n);
      default: this.err('SUB90', n.line, n.col, ['ביטוי']); return ERRT;
    }
  },
  // ---- names
  cName(n) {
    const id = n.id;
    if (!n.kw) {
      const vi = this.lookupVar(id);
      if (vi) {
        if (vi.t === 'err') return ERRT;
        if (!this.isAssigned(vi.slot)) { this.err('CS0165', n.line, n.col, [id]); this.markAssigned(vi.slot); }
        const slot = vi.slot;
        if (vi.c) return constEx(vi.t, vi.v);
        return { t: vi.t, f: f => f[slot] };
      }
      const fi = this.fields.get(id);
      if (fi) {
        if (!fi.isStatic) { this.err('CS0120', n.line, n.col, [id]); return ERRT; }
        if (fi.c) return constEx(fi.t, fi.v);
        if (fi.t === 'err') return ERRT;
        const slot = fi.slot;
        return { t: fi.t, f: () => G[slot] };
      }
      if (this.methods.has(id)) return { t: 'mg', mgName: id, f: () => 0 };
      if (this.declaredLater(id)) { this.err('CS0841', n.line, n.col, [id]); return ERRT; }
    }
    if (STATIC_TYPES.has(id) && (this.hasSystem || !NEEDS_SYSTEM.has(id)) || id === this.className) return { t: 'typeref', tn: id, f: () => 0 };
    if (id === 'System') return { t: 'ns', f: () => 0 };
    const cands = [];
    for (let s = this.cur.scope; s; s = s.parent) for (const k of s.vars.keys()) cands.push(k);
    for (const k of this.methods.keys()) cands.push(k); for (const k of this.fields.keys()) cands.push(k);
    cands.push('Console', 'Math', 'Random');
    const sg = suggest(id, cands);
    this.err('CS0103', n.line, n.col, [id, sg ? `האם התכוונתם ל-${sg}?` : (NEEDS_SYSTEM.has(id) ? 'חסרה השורה using System; בראש הקובץ' : '')]);
    return ERRT;
  },
  lv(n) { // resolve an assignable variable; returns {t, vi|fi} or null
    if (n.k === 'name' && !n.kw) {
      const vi = this.lookupVar(n.id);
      if (vi) return vi.t === 'err' ? { t: 'err' } : { t: vi.t, vi, isConst: vi.isConst };
      const fi = this.fields.get(n.id);
      if (fi) { if (!fi.isStatic) { this.err('CS0120', n.line, n.col, [n.id]); return { t: 'err' }; } return { t: fi.t, fi, isConst: fi.isConst }; }
      if (this.declaredLater(n.id)) { this.err('CS0841', n.line, n.col, [n.id]); return { t: 'err' }; }
      this.cName(n); // reports CS0103 / CS0119
      return { t: 'err' };
    }
    return null;
  },
  cMember(n) {
    const o = this.cx0(n.obj);
    if (o.t === 'err') return ERRT;
    if (o.t === 'ns') {
      if (STATIC_TYPES.has(n.name)) return { t: 'typeref', tn: n.name, f: () => 0 };
      this.err('CS0234', n.nline, n.ncol, [n.name]); return ERRT;
    }
    if (o.t === 'typeref') return this.cStaticMember(o.tn, n);
    // instance
    if (o.t === 'string' && n.name === 'Length') {
      const g = o.f;
      return { t: 'int', f: f => { const s = g(f); if (s == null) throw new RTErr('NullReferenceException', 'המשתנה מסוג string הוא null ולכן אין לו אורך'); return s.length; } };
    }
    if (o.t === 'string[]' && n.name === 'Length') return constEx('int', 0);
    if (IM[o.t] && IM[o.t][n.name]) return { t: 'mg', mgName: n.name, f: () => 0 };
    const sg = IM[o.t] ? suggest(n.name, Object.keys(IM[o.t]).concat(o.t === 'string' ? ['Length'] : [])) : null;
    this.err('CS1061', n.nline, n.ncol, [o.dt || o.t, n.name, sg ? 'האם התכוונתם ל-' + sg + '?' : '']);
    return ERRT;
  },
  cStaticMember(tn, n) {
    if (tn === this.className) {
      const fi = this.fields.get(n.name);
      if (fi) { if (!fi.isStatic) { this.err('CS0120', n.nline, n.ncol, [n.name]); return ERRT; } if (fi.c) return constEx(fi.t, fi.v); const slot = fi.slot; return { t: fi.t, f: () => G[slot] }; }
      if (this.methods.has(n.name)) return { t: 'mg', mgName: n.name, f: () => 0 };
      this.err('CS0117', n.nline, n.ncol, [tn, n.name, '']); return ERRT;
    }
    const sp = SP[tn] && SP[tn][n.name];
    if (sp) return constEx(sp[0], sp[1]);
    if ((SM[tn] && SM[tn][n.name]) || (tn === 'Console' && CONSOLE_METHODS.includes(n.name)) || (tn === 'string' || tn === 'String') && n.name === 'Format') return { t: 'mg', mgName: n.name, f: () => 0 };
    const cands = Object.keys(SM[tn] || {}).concat(Object.keys(SP[tn] || {}), tn === 'Console' ? CONSOLE_METHODS : []);
    const sg = suggest(n.name, cands);
    this.err('CS0117', n.nline, n.ncol, [tn, n.name, sg ? 'האם התכוונתם ל-' + sg + '?' : '']);
    return ERRT;
  },
  // ---- calls
  compileArgs(nodes) { return nodes.map(a => this.cx(a)); },
  cCall(n) {
    const callee = n.callee;
    if (callee.k === 'name' && !callee.kw) {
      const id = callee.id;
      if (this.lookupVar(id) || this.fields.has(id)) { this.compileArgs(n.args); this.err('CS1955', callee.line, callee.col, [id]); return ERRT; }
      if (this.methods.has(id)) return this.cUserCall(id, n, callee);
      const args = this.compileArgs(n.args);
      const ce = this.cName(callee);
      if (ce.t === 'typeref') this.err('CS1955', callee.line, callee.col, [id]);
      return ERRT;
    }
    if (callee.k === 'member') {
      const o = this.cx0(callee.obj);
      if (o.t === 'err') { this.compileArgs(n.args); return ERRT; }
      if (o.t === 'ns') { this.compileArgs(n.args); this.err('CS0119', callee.obj.line, callee.obj.col, ['System']); return ERRT; }
      if (o.t === 'typeref') {
        const tn = o.tn;
        if (tn === this.className) {
          if (this.methods.has(callee.name)) return this.cUserCall(callee.name, n, { line: callee.nline, col: callee.ncol });
          this.compileArgs(n.args); this.err('CS0117', callee.nline, callee.ncol, [tn, callee.name, '']); return ERRT;
        }
        if (tn === 'Console') return this.cConsole(n, callee);
        if ((tn === 'string' || tn === 'String') && callee.name === 'Format') return this.cStringFormat(n);
        if (SM[tn] && SM[tn][callee.name]) return this.cStaticBuiltin(tn, callee.name, n, callee);
        this.compileArgs(n.args);
        if (SP[tn] && SP[tn][callee.name]) { this.err('CS1955', callee.nline, callee.ncol, [callee.name]); return ERRT; }
        const cands = Object.keys(SM[tn] || {}).concat(tn === 'Console' ? CONSOLE_METHODS : []);
        const sg = suggest(callee.name, cands);
        this.err('CS0117', callee.nline, callee.ncol, [tn, callee.name, sg ? 'האם התכוונתם ל-' + sg + '?' : '']);
        return ERRT;
      }
      return this.cInstCall(o, n, callee);
    }
    // calling something else
    const e = this.cx(callee);
    this.compileArgs(n.args);
    if (e.t !== 'err') this.err('CS1955', callee.line, callee.col, [callee.id || '?']);
    return ERRT;
  },
  pickOverload(cands, args, name, n, posNode, display) {
    // cands: array of {params:[types]}; returns the chosen candidate or null (error reported)
    const argc = args.length;
    if (args.some(a => a.t === 'err')) return null;
    const byArity = cands.filter(c => c.params.length === argc);
    if (!byArity.length) {
      if (cands.length === 1 && argc < cands[0].params.length) this.err('CS7036', posNode.line, posNode.col, [name, cands[0].pnames ? cands[0].pnames[argc] : 'x']);
      else this.err('CS1501', posNode.line, posNode.col, [name, argc]);
      return null;
    }
    const ok = byArity.filter(c => c.params.every((p, i) => implicitOk(args[i].t, p)));
    if (ok.length) {
      // prefer exact matches
      let best = ok[0], bs = -1;
      for (const c of ok) { const s = c.params.reduce((a, p, i) => a + (p === args[i].t ? 1 : 0), 0); if (s > bs) { bs = s; best = c; } }
      return best;
    }
    const c0 = byArity[0];
    for (let i = 0; i < argc; i++) if (!implicitOk(args[i].t, c0.params[i])) { this.err('CS1503', n.args[i].line, n.args[i].col, [i + 1, args[i].dt || args[i].t, c0.params[i]]); break; }
    return null;
  },
  cUserCall(name, n, posNode) {
    const args = this.compileArgs(n.args);
    const typed = this.methods.get(name).map(m => ({ m, params: m.params.map(p => p.t), pnames: m.params.map(p => p.name) }));
    const pick = this.pickOverload(typed, args, name, n, posNode);
    if (!pick) return ERRT;
    const m = pick.m;
    if (!m.isStatic) { this.err('CS0120', posNode.line, posNode.col, [name]); return ERRT; }
    const fns = args.map((a, i) => this.coerce(a, pick.params[i], n.args[i], 'arg'));
    const line = n.line, nf = fns.length;
    let f;
    if (nf === 0) f = () => { const fr = new Array(m.nslots); return invoke(m, fr, line); };
    else if (nf === 1) { const a = fns[0]; f = fr0 => { const fr = new Array(m.nslots); fr[0] = a(fr0); return invoke(m, fr, line); }; }
    else f = fr0 => { const fr = new Array(m.nslots); for (let i = 0; i < nf; i++) fr[i] = fns[i](fr0); return invoke(m, fr, line); };
    return { t: m.ret, f };
  },
  cStaticBuiltin(tn, name, n, callee) {
    const args = this.compileArgs(n.args);
    const cands = SM[tn][name].map(o => ({ params: o[0], ret: o[1], impl: o[2], pnames: o[0].map((_, i) => ['d', 'd2', 'd3'][i]) }));
    const pick = this.pickOverload(cands, args, name, n, { line: callee.nline, col: callee.ncol });
    if (!pick) return ERRT;
    const fns = args.map((a, i) => this.coerce(a, pick.params[i], n.args[i], 'arg'));
    return { t: pick.ret, f: mkCallN(pick.impl, fns) };
  },
  cInstCall(o, n, callee) {
    const args = this.compileArgs(n.args);
    if (o.t === 'string' && callee.name === 'Length') { this.err('CS1955', callee.nline, callee.ncol, ['Length']); return ERRT; }
    const table = IM[o.t] && IM[o.t][callee.name];
    if (!table) {
      const sg = IM[o.t] ? suggest(callee.name, Object.keys(IM[o.t])) : null;
      this.err('CS1061', callee.nline, callee.ncol, [o.dt || o.t, callee.name, sg ? 'האם התכוונתם ל-' + sg + '?' : '']);
      return ERRT;
    }
    const cands = table.map(x => ({ params: x[0], ret: x[1], impl: x[2], pnames: x[0].map(() => 'value') }));
    const pick = this.pickOverload(cands, args, callee.name, n, { line: callee.nline, col: callee.ncol });
    if (!pick) return ERRT;
    const fns = args.map((a, i) => this.coerce(a, pick.params[i], n.args[i], 'arg'));
    const of = o.f;
    if (o.t === 'Random') {
      const kind = pick.impl;
      if (fns.length === 0) return { t: pick.ret, f: f => nextRandom(of(f), kind) };
      if (fns.length === 1) { const a = fns[0]; return { t: pick.ret, f: f => nextRandom(of(f), kind, a(f)) }; }
      const a = fns[0], b = fns[1]; return { t: pick.ret, f: f => nextRandom(of(f), kind, a(f), b(f)) };
    }
    const impl = pick.impl;
    switch (fns.length) {
      case 0: return { t: pick.ret, f: f => impl(of(f)) };
      case 1: { const a = fns[0]; return { t: pick.ret, f: f => impl(of(f), a(f)) }; }
      case 2: { const a = fns[0], b = fns[1]; return { t: pick.ret, f: f => impl(of(f), a(f), b(f)) }; }
      default: return { t: pick.ret, f: f => impl(of(f), ...fns.map(g => g(f))) };
    }
  },
  cConsole(n, callee) {
    const name = callee.name;
    const args = this.compileArgs(n.args);
    const pos = { line: callee.nline, col: callee.ncol };
    if (args.some(a => a.t === 'err')) return { t: 'void', f: () => 0 };
    if (name === 'ReadLine') {
      if (args.length) { this.err('CS1501', pos.line, pos.col, [name, args.length]); return ERRT; }
      return { t: 'string', f: () => readLine() };
    }
    if (name === 'Clear' || name === 'ReadKey') {
      if (args.length > (name === 'ReadKey' ? 1 : 0)) { this.err('CS1501', pos.line, pos.col, [name, args.length]); return ERRT; }
      return { t: 'void', f: () => 0 };
    }
    if (name === 'WriteLine' || name === 'Write') {
      const nl = name === 'WriteLine' ? '\n' : '';
      if (args.length === 0) {
        if (name === 'Write') { this.err('CS1501', pos.line, pos.col, [name, 0]); return ERRT; }
        return { t: 'void', f: () => { emit('\n'); return 0; } };
      }
      for (let i = 0; i < args.length; i++) if (args[i].t === 'void' || args[i].t === 'mg') {
        this.err('CS1503', n.args[i].line, n.args[i].col, [i + 1, args[i].t, i === 0 ? 'bool' : 'object']); return ERRT;
      }
      if (args.length === 1) {
        const s = this.strFn(args[0]);
        return { t: 'void', f: f => { emit(s(f) + nl); return 0; } };
      }
      if (args[0].t !== 'string') { this.err('CS1503', n.args[0].line, n.args[0].col, [1, args[0].dt || args[0].t, 'string']); return ERRT; }
      const ff = args[0].f, vf = args.slice(1).map(a => a.f), types = args.slice(1).map(a => a.t);
      return { t: 'void', f: f => { emit(composite(strChk(ff(f)), vf.map(g => g(f)), types) + nl); return 0; } };
    }
    const sg = suggest(name, CONSOLE_METHODS);
    this.err('CS0117', pos.line, pos.col, ['Console', name, sg ? 'האם התכוונתם ל-' + sg + '?' : '']);
    return ERRT;
  },
  cStringFormat(n) {
    const args = this.compileArgs(n.args);
    if (args.some(a => a.t === 'err')) return ERRT;
    if (!args.length) { this.err('CS7036', n.line, n.col, ['Format', 'format']); return ERRT; }
    if (args[0].t !== 'string') { this.err('CS1503', n.args[0].line, n.args[0].col, [1, args[0].dt || args[0].t, 'string']); return ERRT; }
    for (let i = 0; i < args.length; i++) if (args[i].t === 'void' || args[i].t === 'mg') { this.err('CS1503', n.args[i].line, n.args[i].col, [i + 1, args[i].t, 'object']); return ERRT; }
    const ff = args[0].f, vf = args.slice(1).map(a => a.f), types = args.slice(1).map(a => a.t);
    return { t: 'string', f: f => composite(strChk(ff(f)), vf.map(g => g(f)), types) };
  },
  cNew(n) {
    const name = n.type.name.replace(/^System\./, '');
    const args = this.compileArgs(n.args);
    if (name === 'Random' && (this.hasSystem || n.type.name.startsWith('System.'))) {
      if (args.length > 1) { this.err('CS1729', n.line, n.col, ['Random', args.length]); return ERRT; }
      if (args.length === 1) {
        if (args[0].t !== 'err' && !implicitOk(args[0].t, 'int')) { this.err('CS1503', n.args[0].line, n.args[0].col, [1, args[0].t, 'int']); return ERRT; }
        const a = args[0].f; return { t: 'Random', f: f => ({ gen: new NetRandom(a(f)) }) };
      }
      return { t: 'Random', f: () => ({ gen: null }) };
    }
    if (TYPE_KW.has(name) || name === 'String' || name === 'Int32' || name === 'Double') { this.err('SUB90', n.line, n.col, ['new ' + name]); return ERRT; }
    this.err('CS0246', n.type.line, n.type.col, [n.type.name]); return ERRT;
  },
  // ---- operators
  cUn(n) {
    if (n.op === '-' && n.x.k === 'lit' && n.x.t === 'long' && n.x.v === 2147483648) return constEx('int', MININT);
    const x = this.cx(n.x);
    if (x.t === 'err') return ERRT;
    const bad = () => { this.err('CS0023', n.line, n.col, [n.op, x.dt || x.t]); return ERRT; };
    const g = x.f;
    switch (n.op) {
      case '!': if (x.t !== 'bool') return bad(); return x.c ? constEx('bool', !x.v) : { t: 'bool', f: f => !g(f) };
      case '-': {
        if (!numT(x.t)) return bad();
        const t = x.t === 'char' ? 'int' : x.t;
        if (x.c) return constEx(t, t === 'int' ? (x.v === 0 ? 0 : -x.v) : -x.v, { dt: x.dt });
        if (t === 'int') return { t, f: f => (-g(f)) | 0 };
        return { t, f: f => -g(f) };
      }
      case '+': if (!numT(x.t)) return bad(); return x.t === 'char' ? Object.assign({}, x, { t: 'int' }) : x;
      case '~': if (x.t !== 'int' && x.t !== 'char') return bad(); return x.c ? constEx('int', ~x.v) : { t: 'int', f: f => ~g(f) };
    }
    return ERRT;
  },
  cBin(n) {
    const op = n.op;
    const l = this.cx(n.l);
    if (op === '&&' || op === '||') {
      const s1 = cloneS(this.cur.S);
      const r = this.cx(n.r);
      this.cur.S = s1;
      return this.binOp(op, l, r, n);
    }
    const r = this.cx(n.r);
    return this.binOp(op, l, r, n);
  },
  binOp(op, l, r, n) {
    if (l.t === 'err' || r.t === 'err') return ERRT;
    const lt = l.t, rt = r.t;
    const bad = () => { this.err('CS0019', n.line, n.col, [op, l.dt || lt, r.dt || rt]); return ERRT; };
    if (lt === 'void' || rt === 'void' || lt === 'mg' || rt === 'mg') return bad();
    const lf = l.f, rf = r.f;
    const both = l.c && r.c;
    const mk = (t, fn, spec) => {
      if (both) { const v = fn(l.v, r.v); return constEx(t, v); }
      return { t, f: spec || (f => fn(lf(f), rf(f))) };
    };
    const line = n.line;
    switch (op) {
      case '+': {
        if (lt === 'string' || rt === 'string') {
          if (lt === 'null' && rt === 'null') return bad();
          const a = this.strFn(l.t === 'null' ? { t: 'string', f: lf } : l), b = this.strFn(r.t === 'null' ? { t: 'string', f: rf } : r);
          if (both) return constEx('string', a(null) + b(null));
          return { t: 'string', f: f => a(f) + b(f) };
        }
        if (!numT(lt) || !numT(rt)) return bad();
        const t = promote(lt, rt);
        if (t === 'int') {
          if (both) { const v = l.v + r.v; if (v > MAXINT || v < MININT) { this.err('CS0220', n.line, n.col); return ERRT; } return constEx('int', v); }
          return { t, f: f => (lf(f) + rf(f)) | 0 };
        }
        return mk(t, (a, b) => a + b);
      }
      case '-': {
        if (!numT(lt) || !numT(rt)) return bad();
        const t = promote(lt, rt);
        if (t === 'int') {
          if (both) { const v = l.v - r.v; if (v > MAXINT || v < MININT) { this.err('CS0220', n.line, n.col); return ERRT; } return constEx('int', v); }
          return { t, f: f => (lf(f) - rf(f)) | 0 };
        }
        return mk(t, (a, b) => a - b);
      }
      case '*': {
        if (!numT(lt) || !numT(rt)) return bad();
        const t = promote(lt, rt);
        if (t === 'int') {
          if (both) { const v = l.v * r.v; if (v > MAXINT || v < MININT) { this.err('CS0220', n.line, n.col); return ERRT; } return constEx('int', v === 0 ? 0 : v); }
          return { t, f: f => Math.imul(lf(f), rf(f)) };
        }
        return mk(t, (a, b) => a * b);
      }
      case '/': case '%': {
        if (!numT(lt) || !numT(rt)) return bad();
        const t = promote(lt, rt);
        const isDiv = op === '/';
        if (t === 'int' || t === 'long') {
          if (r.c && r.v === 0) { this.err('CS0020', n.line, n.col); return ERRT; }
          const dz = () => new RTErr('DivideByZeroException', 'חלוקה באפס - אי אפשר לחלק (או לקחת שארית) במספר 0', line);
          const fn = isDiv
            ? (t === 'int' ? (a, b) => { if (b === 0) throw dz(); if (b === -1) { if (a === MININT) throw ovf(); return -a | 0; } return (a / b) | 0; } : (a, b) => { if (b === 0) throw dz(); return Math.trunc(a / b); })
            : (a, b) => { if (b === 0) throw dz(); if (b === -1) { if (a === MININT) throw ovf(); return 0; } const m = a % b; return m === 0 ? 0 : m; };
          if (both) { if (isDiv && l.v === MININT && r.v === -1) { this.err('CS0220', n.line, n.col); return ERRT; } return constEx(t, fn(l.v, r.v)); }
          if (isDiv && t === 'int') return { t, f: f => { const a = lf(f), b = rf(f); if (b > 0) return (a / b) | 0; return fn(a, b); } };
          return { t, f: f => fn(lf(f), rf(f)) };
        }
        return mk(t, isDiv ? (a, b) => a / b : (a, b) => a % b);
      }
      case '<': case '>': case '<=': case '>=': {
        if (!numT(lt) || !numT(rt)) return bad();
        const fn = op === '<' ? (a, b) => a < b : op === '>' ? (a, b) => a > b : op === '<=' ? (a, b) => a <= b : (a, b) => a >= b;
        if (both) return constEx('bool', fn(l.v, r.v));
        if (op === '<') return { t: 'bool', f: f => lf(f) < rf(f) };
        if (op === '>') return { t: 'bool', f: f => lf(f) > rf(f) };
        return { t: 'bool', f: f => fn(lf(f), rf(f)) };
      }
      case '==': case '!=': {
        const ne = op === '!=';
        let ok = false;
        if (numT(lt) && numT(rt)) ok = true;
        else if (lt === rt && (lt === 'bool' || lt === 'string' || lt === 'Random' || lt === 'null')) ok = true;
        else if ((lt === 'null' && (rt === 'string' || rt === 'Random')) || (rt === 'null' && (lt === 'string' || lt === 'Random'))) ok = true;
        if (!ok) return bad();
        if (both && lt !== 'null') return constEx('bool', ne ? l.v !== r.v : l.v === r.v);
        return ne ? { t: 'bool', f: f => lf(f) !== rf(f) } : { t: 'bool', f: f => lf(f) === rf(f) };
      }
      case '&&': case '||': {
        if (lt !== 'bool' || rt !== 'bool') return bad();
        if (both) return constEx('bool', op === '&&' ? l.v && r.v : l.v || r.v);
        return op === '&&' ? { t: 'bool', f: f => lf(f) && rf(f) } : { t: 'bool', f: f => lf(f) || rf(f) };
      }
      case '&': case '|': case '^': {
        const fn = op === '&' ? (a, b) => a & b : op === '|' ? (a, b) => a | b : (a, b) => a ^ b;
        if (lt === 'bool' && rt === 'bool') return mk('bool', (a, b) => !!fn(a, b));
        if ((lt === 'int' || lt === 'char') && (rt === 'int' || rt === 'char')) return mk('int', fn);
        return bad();
      }
      case '<<': case '>>': {
        if ((lt !== 'int' && lt !== 'char') || (rt !== 'int' && rt !== 'char')) return bad();
        return mk('int', op === '<<' ? (a, b) => a << (b & 31) : (a, b) => a >> (b & 31));
      }
    }
    return bad();
  },
  cIncDec(n) {
    const lv = this.lv(n.x);
    if (!lv) { const x = this.cx(n.x); if (x.t !== 'err') this.err('CS1059', n.line, n.col); return ERRT; }
    if (lv.t === 'err') return ERRT;
    if (lv.isConst) { this.err('CS0131', n.x.line, n.x.col); return ERRT; }
    if (lv.t !== 'int' && lv.t !== 'double' && lv.t !== 'char') { this.err('CS0023', n.line, n.col, [n.op, lv.t]); return ERRT; }
    if (lv.vi && !this.isAssigned(lv.vi.slot)) { this.err('CS0165', n.x.line, n.x.col, [lv.vi.name]); this.markAssigned(lv.vi.slot); }
    const d = n.op === '++' ? 1 : -1, t = lv.t, pre = n.prefix;
    const wrap = t === 'int' ? v => v | 0 : t === 'char' ? v => v & 0xffff : v => v;
    if (lv.vi) {
      const s = lv.vi.slot;
      if (t === 'int') return pre ? { t, f: f => (f[s] = (f[s] + d) | 0) } : { t, f: f => { const o = f[s]; f[s] = (o + d) | 0; return o; } };
      return pre ? { t, f: f => (f[s] = wrap(f[s] + d)) } : { t, f: f => { const o = f[s]; f[s] = wrap(o + d); return o; } };
    }
    const s = lv.fi.slot;
    return pre ? { t, f: () => (G[s] = wrap(G[s] + d)) } : { t, f: () => { const o = G[s]; G[s] = wrap(o + d); return o; } };
  },
  cAssign(n) {
    const lv = this.lv(n.target);
    if (!lv) {
      this.cx(n.value);
      if (n.target.k === 'index') { const o = this.cx0(n.target.obj); if (o.t === 'string') this.err('CS0200', n.line, n.col); else if (o.t !== 'err') this.err('CS0131', n.line, n.col); }
      else { const x = this.cx0(n.target); if (x.t !== 'err') this.err('CS0131', n.line, n.col); }
      return ERRT;
    }
    if (lv.t === 'err') { this.cx(n.value); return ERRT; }
    const tt = lv.t;
    const isLocal = !!lv.vi, slot = isLocal ? lv.vi.slot : lv.fi.slot;
    const setter = g => isLocal ? (f => (f[slot] = g(f))) : (f => (G[slot] = g(f)));
    if (lv.isConst) { this.cx(n.value); this.err('CS0131', n.target.line, n.target.col); return ERRT; }
    if (n.op === '=') {
      const ex = this.cx(n.value);
      const g = this.coerce(ex, tt, n.value, 'assign');
      if (isLocal) this.markAssigned(slot);
      return { t: tt, f: setter(g) };
    }
    // compound
    if (isLocal && !this.isAssigned(slot)) { this.err('CS0165', n.target.line, n.target.col, [lv.vi.name]); this.markAssigned(slot); }
    const rx = this.cx(n.value);
    if (rx.t === 'err') return ERRT;
    const cur = { t: tt, f: isLocal ? (f => f[slot]) : (() => G[slot]) };
    const bop = n.op.slice(0, -1);
    const res = this.binOp(bop, cur, rx, n);
    if (res.t === 'err') return ERRT;
    let g = res.f;
    if (tt === 'string') { /* ok */ }
    else if (res.t !== tt) {
      const shift = bop === '<<' || bop === '>>';
      const okY = implicitOk(rx.t, tt) || shift || (rx.c && rx.t === 'int' && tt === 'char');
      if (!okY || !numT(res.t) || !numT(tt)) { this.coerceErr(res, tt, n.value, 'assign'); return ERRT; }
      const h = res.f;
      if (tt === 'int') g = f => d2i(h(f));
      else if (tt === 'char') g = f => d2i(h(f)) & 0xffff;
    }
    return { t: tt, f: setter(g) };
  },
  cCondExpr(n) {
    const c = this.cCond(n.c);
    const sc = cloneS(this.cur.S);
    const a = this.cx(n.a); const sa = this.cur.S;
    this.cur.S = cloneS(sc);
    const b = this.cx(n.b);
    this.cur.S = meetS(sa, this.cur.S);
    if (a.t === 'err' || b.t === 'err') return ERRT;
    let t;
    if (a.t === b.t) t = a.t;
    else if (implicitOk(a.t, b.t)) t = b.t;
    else if (implicitOk(b.t, a.t)) t = a.t;
    else { this.err('CS0173', n.line, n.col, []); return ERRT; }
    if (t === 'void') { this.err('CS0173', n.line, n.col, []); return ERRT; }
    const cf = c.f, af = a.f, bf = b.f;
    return { t, f: f => cf(f) ? af(f) : bf(f) };
  },
  cCast(n) {
    const to = this.resolveType(n.type);
    const x = this.cx(n.x);
    if (to === 'err' || x.t === 'err') return ERRT;
    const from = x.t;
    if (from === to) return x;
    const ok = (to === 'int' || to === 'double' || to === 'char') && numT(from);
    if (!ok) { this.err('CS0030', n.line, n.col, [x.dt || from, to]); return ERRT; }
    const g = x.f;
    let fn;
    if (to === 'double') fn = v => v;
    else if (to === 'int') fn = from === 'double' ? d2i : from === 'long' ? (v => v | 0) : (v => v);
    else fn = from === 'double' ? (v => d2i(v) & 0xffff) : (v => v & 0xffff);
    if (x.c) {
      if (to === 'int' && (from === 'double' || from === 'long')) { const tv = Math.trunc(x.v); if (x.v !== x.v || tv > MAXINT || tv < MININT) { this.err('CS0221', n.line, n.col, [from === 'double' ? fmtDouble(tv) : String(x.v)]); return ERRT; } }
      if (to === 'char') { const tv = Math.trunc(x.v); if (x.v !== x.v || tv < 0 || tv > 65535) { this.err('CS0221', n.line, n.col, [String(tv)]); return ERRT; } }
      return constEx(to, fn(x.v));
    }
    return { t: to, f: f => fn(g(f)) };
  },
  cIndex(n) {
    const o = this.cx(n.obj), ix = this.cx(n.idx);
    if (o.t === 'err' || ix.t === 'err') return ERRT;
    if (o.t !== 'string') { this.err('CS0021', n.line, n.col, [o.t]); return ERRT; }
    if (ix.t !== 'int' && ix.t !== 'char') { this.err('CS1503', n.idx.line, n.idx.col, [1, ix.t, 'int']); return ERRT; }
    const of = o.f, xf = ix.f;
    return { t: 'char', f: f => {
      const s = of(f), i = xf(f);
      if (s == null) throw new RTErr('NullReferenceException', 'המשתנה מסוג string הוא null');
      if (i < 0 || i >= s.length) throw new RTErr('IndexOutOfRangeException', 'האינדקס ' + i + ' מחוץ לגבולות המחרוזת (האורך הוא ' + s.length + ', האינדקסים חוקיים מ-0 עד ' + (s.length - 1) + ')');
      return s.charCodeAt(i);
    } };
  },
  cInterp(n) {
    const parts = [];
    for (const p of n.parts) {
      if (p.s !== undefined) { const s = p.s; parts.push(() => s); continue; }
      const ex = this.cx(p.e);
      if (ex.t === 'err') continue;
      if (ex.t === 'void' || ex.t === 'mg') { this.err('CS0029', p.e.line, p.e.col, [ex.t, 'string']); continue; }
      const g = ex.f, t = ex.t, fmt = p.fmt, al = p.align;
      parts.push(f => { let s = fmtItem(g(f), t, fmt); if (al) s = al > 0 ? s.padStart(al) : s.padEnd(-al); return s; });
    }
    return { t: 'string', f: f => { let s = ''; for (let i = 0; i < parts.length; i++) s += parts[i](f); return s; } };
  },
});

// ===================================================================================================
// Driver: compile / run / tests / subset check
// ===================================================================================================
Object.assign(MSG, {
  CS0151: () => 'ב-switch אפשר להשתמש רק בביטוי מסוג int, char או string',
  CS0150: () => 'אחרי case חייב לבוא ערך קבוע (מספר/תו/טקסט)',
  CS0102: n => `השם '${n}' כבר הוגדר`, CS0100: n => `שם הפרמטר '${n}' כבר קיים`,
  CS0145: n => 'קבוע (const) חייב לקבל ערך', CS1547: () => "אי אפשר להגדיר משתנה מסוג void",
  CS0173: () => 'שני הצדדים של ?: חייבים להיות מאותו טיפוס', CS0021: t => `אי אפשר להשתמש ב-[ ] על ערך מסוג ${ht(t)} (רק על string)`,
  CS0234: n => `השם '${n}' לא קיים ב-System`, CS1729: (t, c) => `ל-${t} אין בנאי שמקבל ${c} ארגומנטים`,
});
function toCSError(e, kind) {
  const code = e.code;
  return { line: e.line, col: e.col, code, message: mkMsg(code, e.line, e.args), kind: kind || (code.startsWith('SUB') ? 'subset' : 'compile') };
}
function internalError(e) {
  try { if (typeof console !== 'undefined') console.error('csrun internal error:', e); } catch (_) {}
  return { line: 0, col: 0, code: 'INTERNAL', message: INTERNAL_MSG, kind: 'runtime' };
}
const SUBSET_DEFS = {
  SUB01: (op) => `האופרטור ${op} לא נלמד בקורס - כתבו במפורש, למשל x = x + 1`,
  SUB02: () => 'האופרטור ?: לא נלמד בקורס - השתמשו ב-if / else',
  SUB03: () => 'switch לא נלמד בקורס - השתמשו בשרשרת if / else if',
  SUB04: () => 'do-while לא נלמד בקורס - השתמשו ב-while',
  SUB05: () => 'break לא נלמד בקורס - תנו ללולאה תנאי שמפסיק אותה',
  SUB06: () => 'continue לא נלמד בקורס - השתמשו בתנאי if בתוך הלולאה',
  SUB07: () => 'מחרוזת עם $"..." לא נלמדה בקורס - חברו טקסט וערכים עם +',
  SUB08: () => 'var לא נלמד בקורס - כתבו את הטיפוס במפורש (int, double, string...)',
  SUB09: () => 'Convert לא נלמד בקורס - השתמשו ב-int.Parse או double.Parse',
  SUB10: () => 'Equals לא נלמד בקורס - השתמשו ב-==',
  SUB11: () => 'goto לא נלמד בקורס',
};
function checkSubsetImpl(src) {
  const { toks } = lex(src);
  const out = [];
  const add = (code, t, arg) => out.push({ line: t.line, col: t.col, code, kind: 'subset', message: `שורה ${t.line}: ${SUBSET_DEFS[code](arg)} (${code})` });
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'op') {
      if (['+=', '-=', '*=', '/=', '%='].includes(t.v)) add('SUB01', t, t.v);
      else if (t.v === '?') add('SUB02', t);
    } else if (t.t === 'kw') {
      if (t.v === 'switch') add('SUB03', t); else if (t.v === 'do') add('SUB04', t); else if (t.v === 'break') add('SUB05', t);
      else if (t.v === 'continue') add('SUB06', t); else if (t.v === 'goto') add('SUB11', t);
    } else if (t.t === 'istr') add('SUB07', t);
    else if (t.t === 'id') {
      if (t.v === 'var' && toks[i + 1] && toks[i + 1].t === 'id') add('SUB08', t);
      else if (t.v === 'Convert' && toks[i + 1] && toks[i + 1].v === '.') add('SUB09', t);
      else if (t.v === 'Equals' && toks[i - 1] && toks[i - 1].v === '.' && toks[i + 1] && toks[i + 1].v === '(') add('SUB10', t);
    }
  }
  return out;
}
function checkSubset(src) {
  try { return checkSubsetImpl(String(src)); } catch (e) { internalError(e); return []; }
}

function prepare(src, traceOn) {
  src = String(src == null ? '' : src);
  const parsed = parseProgram(src);
  if (parsed.errs.length) return { errors: parsed.errs.map(e => toCSError(e)) };
  const C = new Compiler(parsed.unit, traceOn);
  const main = C.compileAll();
  if (C.errs.length) return { errors: C.errs.map(e => toCSError(e)) };
  return { C, main };
}
function sortErrs(a) { return a.slice().sort((x, y) => x.line - y.line || x.col - y.col); }

function compile(src) {
  try {
    const warnings = checkSubset(src);
    const p = prepare(src, false);
    if (p.errors) return { ok: false, errors: sortErrs(p.errors), warnings };
    return { ok: true, errors: [], warnings };
  } catch (e) { return { ok: false, errors: [internalError(e)], warnings: [] }; }
}

function execute(prep, st) {
  R = st; G = new Array(prep.C.nfields);
  const out = { status: 'ok', error: null };
  try {
    const fr = new Array(prep.C.fieldNslots || 0);
    for (const fi of prep.C.fieldInits) G[fi.slot] = fi.f(fr);
    const m = prep.main;
    const mf = new Array(m.nslots);
    if (m.params.length) mf[0] = null;
    R.line = m.node.line;
    invoke(m, mf, m.node.line);
  } catch (e) {
    if (e instanceof RTErr) { out.status = 'runtime_error'; out.error = { line: e.line || R.line, name: e.name, msg: e.msg }; }
    else if (e instanceof TimeoutSignal) { out.status = 'timeout'; out.why = e.why; }
    else if (e instanceof NeedInput) out.status = 'need_input';
    else if (e instanceof InputExhausted) out.status = 'input_exhausted';
    else if (e instanceof RangeError && /call stack/i.test(String(e.message))) { out.status = 'runtime_error'; out.error = { line: R.line, name: 'StackOverflowException', msg: 'הרקורסיה עמוקה מדי - פונקציה קוראת לעצמה בלי סוף (או יותר מדי פעמים)' }; }
    else throw e;
  }
  return out;
}
function runtimeErrorObj(e) {
  return { line: e.line, col: 1, code: e.name, message: `שורה ${e.line}: ${e.msg} (${e.name})`, kind: 'runtime' };
}

async function runPrepared(prep, options, warnings) {
  options = options || {};
  const useInput = Array.isArray(options.input);
  const inputs = useInput ? options.input.slice() : [];
  const interactive = typeof options.onInput === 'function';
  const rndLog = [];
  let emitted = 0, result;
  const flush = (text) => { if (options.onOutput && text.length > emitted) { try { options.onOutput(text.slice(emitted)); } catch (_) {} } emitted = Math.max(emitted, text.length); };
  for (let guard = 0; guard < 100000; guard++) {
    const st = { out: '', steps: 0, max: options.maxSteps || 2000000, maxDepth: options.maxDepth || 256, depth: 0, line: 0, rv: undefined,
      inputs, inPos: 0, sync: !interactive || false, rndLog, rndPos: 0, randomValues: options.randomValues || [], rvPos: 0,
      trace: options.trace ? [] : null };
    // randomValues are consumed once, in order: rndLog already holds the consumed ones on replay
    st.rvPos = Math.min(rndLog.length, st.randomValues.length);
    st.sync = !interactive;
    const r = execute(prep, st);
    if (r.status === 'need_input') {
      flush(st.out);
      let line;
      try { line = await options.onInput(); } catch (e) { line = null; }
      if (line === null || line === undefined) { result = { status: 'input_exhausted', st }; break; }
      inputs.push(String(line));
      continue;
    }
    result = { status: r.status, st, r };
    break;
  }
  const st = result.st;
  flush(st.out);
  const res = { status: result.status, stdout: st.out, errors: [], warnings: warnings || [], steps: st.steps };
  if (result.status === 'runtime_error') res.errors.push(runtimeErrorObj(result.r.error));
  else if (result.status === 'timeout') res.errors.push({ line: st.line, col: 1, code: 'timeout', kind: 'runtime', message: `שורה ${st.line}: ` + (result.r && result.r.why === 'output' ? 'התוכנית הדפיסה יותר מדי טקסט - אולי יש לולאה אינסופית?' : 'התוכנית רצה יותר מדי זמן - אולי יש לולאה אינסופית?') + ' (timeout)' });
  else if (result.status === 'input_exhausted') res.errors.push({ line: st.line, col: 1, code: 'input_exhausted', kind: 'runtime', message: `שורה ${st.line}: התוכנית ביקשה קלט (ReadLine) אבל לא נשאר קלט (input_exhausted)` });
  if (options.trace) res.trace = st.trace;
  return res;
}

async function run(src, options) {
  try {
    options = options || {};
    const warnings = checkSubset(src);
    const prep = prepare(src, !!options.trace);
    if (prep.errors) return { status: 'compile_error', stdout: '', errors: sortErrs(prep.errors), warnings, steps: 0 };
    return await runPrepared(prep, options, warnings);
  } catch (e) {
    return { status: 'runtime_error', stdout: '', errors: [internalError(e)], warnings: [], steps: 0 };
  }
}

// ---- output matching
function normLine(s) { return String(s).trim().replace(/\s+/g, ' ').replace(/\.$/, '').trim(); }
function matchOutput(stdout, expected, mode) {
  const out = String(stdout).split(/\r?\n/).map(normLine);
  const exp = expected.map(normLine);
  if (mode === 'exact-lines') {
    const o = out.filter(l => l !== ''), e = exp.filter(l => l !== '');
    for (let i = 0; i < e.length; i++) if (o[i] !== e[i]) return { pass: false, missing: expected.filter(x => normLine(x) !== '')[i] };
    return { pass: o.length === e.length, missing: o.length > e.length && e.length ? undefined : undefined };
  }
  let j = 0;
  for (let i = 0; i < out.length && j < exp.length; i++) {
    while (j < exp.length && exp[j] === '') j++;
    if (j >= exp.length) break;
    const o = out[i], e = exp[j];
    if (o.endsWith(e) && (o.length === e.length || /\s/.test(o[o.length - e.length - 1]))) j++;
  }
  while (j < exp.length && exp[j] === '') j++;
  if (j >= exp.length) return { pass: true };
  return { pass: false, missing: expected[j] };
}
async function runTests(src, tests) {
  const results = [];
  try {
    const warnings = checkSubset(src);
    const prep = prepare(src, false);
    for (const t of tests || []) {
      let res;
      if (prep.errors) res = { status: 'compile_error', stdout: '', errors: sortErrs(prep.errors) };
      else {
        try { res = await runPrepared(prep, { input: t.input || [], randomValues: t.randomValues }, warnings); }
        catch (e) { res = { status: 'runtime_error', stdout: '', errors: [internalError(e)] }; }
      }
      const tr = { name: t.name, pass: false, stdout: res.stdout, expected: t.expected, status: res.status, errors: res.errors };
      if (res.status === 'ok') {
        const m = matchOutput(res.stdout, t.expected || [], t.match || 'ordered-contains');
        tr.pass = m.pass; if (!m.pass && m.missing !== undefined) tr.missing = m.missing;
        if (!m.pass && m.missing === undefined) tr.missing = '';
      }
      results.push(tr);
    }
  } catch (e) {
    for (const t of tests || []) results.push({ name: t.name, pass: false, stdout: '', expected: t.expected, status: 'runtime_error', errors: [internalError(e)] });
  }
  return results;
}

return { compile, run, runTests, checkSubset, matchOutput, _fmtDouble: fmtDouble };
});
