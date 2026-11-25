/* UI tests for the 25.11.2026 changes: (1) the skeleton stage accepts every order that respects the task's
 * constraints, (2) a wrong prediction can be corrected and checked again, (3) the plan can be edited after the
 * comparison.   node tests/ui_changes.js   (config.js is served with an empty ENDPOINT - nothing reaches the sheet) */
const fs = require('fs'), path = require('path'), http = require('http');
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/tmp/pt/node_modules/puppeteer-core'); }
const ROOT = path.resolve(__dirname, '..'), SHOTS = path.join(__dirname, 'screens');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (n, ok, x) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  -> ' + (x || ''))); };
const PH = '0500000002';
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (/js\/config\.js$/.test(p)) { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end(fs.readFileSync(f, 'utf8').replace(/ENDPOINT:\s*"[^"]*"/, 'ENDPOINT: ""')); }
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0, '127.0.0.1'); await new Promise(r => srv.on('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage(); await page.setViewport({ width: 1366, height: 768 });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + '/index.html'); await page.waitForSelector('#f-name');
  await page.evaluate(ph => localStorage.setItem('cw:student', JSON.stringify({ name: 'בודק שינויים', phone: ph })), PH);
  const seed = (taskId, done, a) => page.evaluate((ph, taskId, done, a) => {
    const d = {}; done.forEach(k => d[k] = true);
    localStorage.setItem('cw:t:' + ph + ':' + taskId, JSON.stringify({ v: 1, done: d, a: Object.assign({ understand: {}, plan: {}, tests: {}, skeleton: {}, code: {}, reflect: {} }, a), hints: 0, runs: 0, testRuns: 0, best: 0, total: 0, activeSec: 0, submitted: false, score: null, forced: false, started: Date.now() }));
  }, PH, taskId, done, a);
  let n = 0;
  const open = async hash => { await page.goto(base + '/index.html?c=' + (n++) + '#' + hash); await page.reload(); await sleep(600); };
  const state = taskId => page.evaluate((ph, t) => JSON.parse(localStorage.getItem('cw:t:' + ph + ':' + t)), PH, taskId);
  const clickBtn = txt => page.evaluate(t => { const b = [...document.querySelectorAll('button.btn')].find(e => e.textContent.trim().includes(t) && !e.disabled); if (!b) return false; b.click(); return true; }, txt);

  // ---------- 1. skeleton: alternative valid orders are accepted on the first try
  const skel = async (taskId, ord, bin) => {
    await seed(taskId, ['understand', 'plan', 'tests'], { skeleton: { ord: ord.map(i => 'S' + i), bin: bin.map(i => 'X' + i), attempts: 0 } });
    await open(taskId + '/skeleton');
    await clickBtn('בדיקה'); await sleep(300);
    const fb = await page.evaluate(() => { const f = document.querySelector('.feedback'); return f ? f.className + ' | ' + f.textContent : ''; });
    return { fb, st: (await state(taskId)).a.skeleton, red: await page.evaluate(() => [...document.querySelectorAll('.slist.ord .sitem.no .stext')].map(e => e.textContent)) };
  };
  let r = await skel('w1t1', [0, 1, 3, 2, 4, 5], [0, 1]);
  check('w1t1 skeleton: swapped calculations accepted on the first try', /good/.test(r.fb) && r.st.correct === true && r.st.firstTry === true, r.fb);
  await page.screenshot({ path: path.join(SHOTS, 'chg-skeleton-alt-order.png'), fullPage: true });
  r = await skel('w1t1', [0, 1, 2, 4, 3, 5], [0, 1]);
  check('w1t1 skeleton: calc-print-calc-print accepted', r.st.correct === true && r.st.firstTry === true, r.fb);
  r = await skel('w1t1', [0, 2, 1, 3, 4, 5], [0, 1]);
  check('w1t1 skeleton: calculation before its input rejected, only that step is red', !r.st.correct && r.st.firstTry === false && r.red.length === 1 && /קבוצות מלאות/.test(r.red[0]), JSON.stringify(r.red) + ' ' + r.fb);
  r = await skel('w2t2', [0, 2, 1, 3, 4], [0, 1]);
  check('w2t2 skeleton: swapped boolean calculations accepted', r.st.correct === true && r.st.firstTry === true, r.fb);
  r = await skel('w1t2', [3, 4, 2, 0, 1], [0, 1]);
  check('w1t2 skeleton: Main first, methods in any order accepted', r.st.correct === true && r.st.firstTry === true, r.fb);
  r = await skel('w2t1', [0, 3, 4, 5, 1, 2], [0, 1]);
  check('w2t1 skeleton: strict task still rejects a different output order', !r.st.correct, r.fb);
  await seed('w1t1', ['understand', 'plan', 'tests'], { skeleton: { ord: ['S0', 'S1', 'S2', 'X0', 'S3', 'S4', 'S5'], bin: ['X1'], attempts: 0 } });
  await open('w1t1/skeleton'); await clickBtn('בדיקה'); await sleep(300);
  const sk = (await state('w1t1')).a.skeleton;
  check('w1t1 skeleton: a distractor left among the steps is rejected', sk.correct !== true && sk.firstTry === false);

  // ---------- 2. predictions: wrong -> fix -> check again counts; "show real output" closes the row without credit
  const task = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'w1.json'), 'utf8')).tasks[0];
  await seed('w1t1', ['understand', 'plan'], {});
  await open('w1t1/tests');
  const truth = await page.evaluate(async (sol, ins) => { const out = []; for (const i of ins) out.push((await CSRun.run(sol, { input: i.slice() })).stdout); return out; }, task.solution, task.stages.tests.predict.map(p => p.input));
  const setTa = (i, v) => page.evaluate((i, v) => { const t = document.querySelectorAll('.pred-row textarea')[i]; t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); }, i, v);
  await setTa(0, 'לא יודע'); await setTa(1, 'גם לא');
  await clickBtn('בדיקת החיזויים'); await page.waitForSelector('.pred-real'); await sleep(200);
  let info = await page.evaluate(() => ({ dis: [...document.querySelectorAll('.pred-row textarea')].map(t => t.disabled), retry: document.querySelectorAll('.pred-real.retry').length, truthShown: document.querySelectorAll('.pred-real pre').length, again: [...document.querySelectorAll('button')].some(b => b.textContent.includes('בדיקה חוזרת')) }));
  check('predictions: wrong rows stay editable, real output hidden, re-check offered', info.dis.every(d => d === false) && info.retry === 2 && info.truthShown === 0 && info.again, JSON.stringify(info));
  await page.screenshot({ path: path.join(SHOTS, 'chg-pred-retry.png'), fullPage: true });
  await setTa(0, truth[0]);
  await clickBtn('בדיקה חוזרת'); await sleep(800);
  let st = (await state('w1t1')).a.tests;
  check('predictions: corrected row is accepted and counts', st.rowOk[0] === true && st.predCorrect[0] === true && st.predCorrect[1] === false && st.predChecks === 2, JSON.stringify([st.rowOk, st.predCorrect, st.predChecks]));
  await page.evaluate(() => { const b = [...document.querySelectorAll('.pred-real.retry button')][0]; b.click(); }); await sleep(300);
  st = (await state('w1t1')).a.tests;
  info = await page.evaluate(() => ({ dis: [...document.querySelectorAll('.pred-row textarea')].map(t => t.disabled), again: [...document.querySelectorAll('button')].some(b => b.textContent.includes('בדיקה חוזרת')), truthShown: document.querySelectorAll('.pred-real pre').length }));
  check('predictions: revealing the real output closes the row without credit', st.revealed[1] === true && st.predCorrect[1] === false && info.dis.every(Boolean) && !info.again && info.truthShown === 2, JSON.stringify([st, info]));
  await page.screenshot({ path: path.join(SHOTS, 'chg-pred-after.png'), fullPage: true });
  // legacy state (checked before this change): rows stay closed, credit unchanged
  await seed('w1t1', ['understand', 'plan'], { tests: { preds: ['x', truth[1]], truth: truth, predCorrect: [false, true], checked: true, own: [{ input: '', expected: '' }] } });
  await open('w1t1/tests');
  info = await page.evaluate(() => ({ dis: [...document.querySelectorAll('.pred-row textarea')].slice(0, 2).map(t => t.disabled), cls: [...document.querySelectorAll('.pred-row')].map(r => r.className) }));
  st = (await state('w1t1')).a.tests;
  check('predictions: state saved before the change still loads', info.dis.every(Boolean) && / no/.test(info.cls[0]) && / ok/.test(info.cls[1]) && st.predCorrect[1] === true, JSON.stringify(info));

  // ---------- 3. plan: editing after the comparison updates "mine"
  await seed('w1t1', ['understand'], {});
  await open('w1t1/plan');
  await page.evaluate(() => document.querySelectorAll('.plan-grid textarea').forEach((t, i) => { t.value = 'תשובה ראשונה ' + i; t.dispatchEvent(new Event('input', { bubbles: true })); }));
  await clickBtn('המשך'); await sleep(400);
  await page.evaluate(() => { const t = document.querySelector('.plan-grid textarea'); t.value = 'תיקון אחרי ההשוואה'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(1500);
  const mine = await page.evaluate(() => document.querySelector('.cmp.mine p').textContent);
  check('plan: a correction made after the comparison shows in "mine" and is saved', mine === 'תיקון אחרי ההשוואה' && Object.values((await state('w1t1')).a.plan).includes('תיקון אחרי ההשוואה'), mine);

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
  await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
