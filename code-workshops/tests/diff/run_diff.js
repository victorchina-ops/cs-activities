#!/usr/bin/env node
// Differential test: runs every NNN_name.cs (+ optional NNN_name.in) through csrun.js and through the real
// .NET compiler (/home/claude/tools/real_cs.sh). Real results are cached in expected/NAME.json (keyed by a hash of
// the source + input), so reruns are fast. Usage: node run_diff.js [--refresh] [--only=substring] [-v]
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const CSRun = require('../../js/csrun.js');
const DIR = __dirname, EXP = path.join(DIR, 'expected');
const REAL = '/home/claude/tools/real_cs.sh';
const args = process.argv.slice(2);
const refresh = args.includes('--refresh'), verbose = args.includes('-v');
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7);
fs.mkdirSync(EXP, { recursive: true });

function hashOf(cs, inp) { return crypto.createHash('sha1').update(cs).update('\0').update(inp || '').digest('hex'); }
function runReal(csPath, inPath) {
  return new Promise(resolve => {
    const a = [csPath]; if (inPath) a.push(inPath);
    const p = cp.spawn(REAL, a, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('close', code => resolve({ code, out, err }));
  });
}
function parseReal(r) {
  if (r.code === 2 && /error CS\d+/.test(r.out)) {
    const errors = [];
    for (const ln of r.out.split('\n')) {
      let m = /^line (\d+) col (\d+): error (CS\d+)/.exec(ln);
      if (m) errors.push({ line: +m[1], col: +m[2], code: m[3] });
      else if ((m = /error (CS\d+)/.exec(ln))) errors.push({ line: 0, col: 0, code: m[1] });
    }
    return { kind: 'compile_error', errors };
  }
  return { kind: r.code === 0 ? 'ok' : 'runtime_error', stdout: r.out, exit: r.code };
}
async function getReal(name, cs, csPath, inPath, inp) {
  const f = path.join(EXP, name + '.json'), h = hashOf(cs, inp);
  if (!refresh && fs.existsSync(f)) { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (j.hash === h) return j; } catch (_) {} }
  const r = parseReal(await runReal(csPath, inPath));
  r.hash = h; fs.writeFileSync(f, JSON.stringify(r, null, 1));
  return r;
}
async function pool(items, n, fn) {
  const res = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); } }));
  return res;
}
(async () => {
  const files = fs.readdirSync(DIR).filter(f => /^\d+_.*\.cs$/.test(f) && f.includes(only)).sort();
  const rows = await pool(files, 2, async file => {
    const name = file.slice(0, -3), csPath = path.join(DIR, file), inFile = path.join(DIR, name + '.in');
    const cs = fs.readFileSync(csPath, 'utf8'), hasIn = fs.existsSync(inFile), inp = hasIn ? fs.readFileSync(inFile, 'utf8') : '';
    const real = await getReal(name, cs, csPath, hasIn ? inFile : null, inp);
    const lines = inp === '' ? [] : inp.replace(/\r/g, '').replace(/\n$/, '').split('\n');
    const mine = await CSRun.run(cs, { input: lines, maxSteps: 5000000 });
    let ok = true, detail = '';
    if (real.kind === 'compile_error') {
      if (mine.status !== 'compile_error') { ok = false; detail = 'real: compile error ' + real.errors.map(e => e.code + '@' + e.line).join(',') + ' / csrun: ' + mine.status; }
      else {
        const withLine = real.errors.filter(e => e.line > 0);
        let cands;
        if (withLine.length) { const first = withLine.reduce((a, b) => (b.line < a.line || (b.line === a.line && b.col < a.col)) ? b : a); cands = withLine.filter(e => e.line === first.line && e.col === first.col); }
        else cands = real.errors;
        const got = mine.errors.map(e => e.code + '@' + e.line);
        ok = cands.some(c => mine.errors.some(m => m.code === c.code && (c.line === 0 || m.line === c.line)));
        if (!ok) detail = 'real first: ' + cands.map(c => c.code + '@' + c.line).join('|') + ' / csrun: ' + got.join(',');
      }
    } else {
      if (mine.status === 'compile_error') { ok = false; detail = 'csrun compile error: ' + mine.errors.map(e => e.code + '@' + e.line).join(','); }
      else if (mine.stdout !== real.stdout) { ok = false; detail = 'stdout differs\n--- real\n' + real.stdout.slice(0, 400) + '\n--- csrun (' + mine.status + ')\n' + mine.stdout.slice(0, 400); }
      else if ((real.kind === 'runtime_error') !== (mine.status === 'runtime_error')) { ok = false; detail = 'real ' + real.kind + ' (exit ' + real.exit + ') / csrun ' + mine.status + ' ' + JSON.stringify(mine.errors.map(e => e.message)); }
    }
    return { name, kind: real.kind, mine: mine.status, ok, detail };
  });
  let pass = 0;
  console.log('name'.padEnd(34) + 'real'.padEnd(16) + 'csrun'.padEnd(16) + 'result');
  for (const r of rows) {
    if (r.ok) pass++;
    if (!r.ok || verbose) console.log(r.name.padEnd(34) + r.kind.padEnd(16) + r.mine.padEnd(16) + (r.ok ? 'OK' : 'FAIL'));
    if (!r.ok) console.log('    ' + r.detail.replace(/\n/g, '\n    '));
  }
  const ce = rows.filter(r => r.kind === 'compile_error').length;
  console.log(`\nAgreement: ${pass}/${rows.length} (${(100 * pass / Math.max(1, rows.length)).toFixed(1)}%)  [compile-error programs: ${ce}, runnable: ${rows.length - ce}]`);
  process.exit(pass === rows.length ? 0 : 1);
})();
