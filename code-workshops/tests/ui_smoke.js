/* UI smoke test: serves the folder, walks one task through all 6 stages (parsons), then exercises fill + blank modes.
 * Run: node tests/ui_smoke.js   (needs puppeteer-core; looked up locally, then in /tmp/pt/node_modules)
 * Falls back to tests/ui_fixtures/* when data/wN.json or js/csrun.js are missing. Screenshots go to tests/screens/. */
const fs = require('fs'), path = require('path'), http = require('http');
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/tmp/pt/node_modules/puppeteer-core'); }

const ROOT = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, 'ui_fixtures');
const SHOTS = path.join(__dirname, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };

const results = [];
function check(name, ok, extra) { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra && !ok ? '  -> ' + extra : '')); }

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      // Never post to the live sheet from the smoke test: serve config.js with an empty ENDPOINT unless LIVE=1.
      if (/js\/config\.js$/.test(p) && !process.env.LIVE) {
        const cfg = fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/ENDPOINT:\s*"[^"]*"/, 'ENDPOINT: ""');
        res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end(cfg);
      }
      let f = path.join(ROOT, p);
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      if (!fs.existsSync(f) || (process.env.FIXTURES && /data\/|csrun/.test(p))) {
        const alt = path.join(FIX, path.basename(p));
        if (fs.existsSync(alt)) f = alt;
      }
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function shot(page, name, suffix, full) {
  await sleep(250);
  await page.screenshot({ path: path.join(SHOTS, `${name}-${suffix}.png`), fullPage: !!full });
}
// click first element matching selector whose text includes `text`
async function clickText(page, sel, text) {
  const ok = await page.evaluate((sel, text) => {
    const el = [...document.querySelectorAll(sel)].find(e => e.textContent.includes(text) && !e.disabled);
    if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, sel, text);
  if (!ok) throw new Error('clickText failed: ' + sel + ' / ' + text);
}
async function clickSel(page, sel) {
  const ok = await page.evaluate(sel => { const el = document.querySelector(sel); if (!el || el.disabled) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; }, sel);
  if (!ok) throw new Error('clickSel failed: ' + sel);
}
async function setValue(page, sel, idx, value) {
  await page.evaluate((sel, idx, value) => {
    const el = document.querySelectorAll(sel)[idx]; el.focus(); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true }));
  }, sel, idx, value);
}
async function waitFor(page, sel, ms = 8000) { await page.waitForSelector(sel, { timeout: ms }); }
async function hashIs(page, h) { await page.waitForFunction(h => location.hash.indexOf(h) === 0, { timeout: 8000 }, h); }

async function walk(browser, base, vp, suffix) {
  console.log(`\n=== viewport ${suffix} ===`);
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(vp);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.|ERR_FAILED|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); (u.startsWith(base) || u.startsWith('data:')) ? r.continue() : r.abort(); });

  const ws = await (async () => { const p2 = await ctx.newPage(); await p2.goto(base + '/index.html'); const j = await p2.evaluate(() => fetch('data/w1.json').then(r => r.json())); await p2.close(); return j; })();
  const task = ws.tasks[0];

  await page.goto(base + '/index.html');
  await waitFor(page, '#f-name');
  await shot(page, '01-login', suffix);
  // invalid input -> Hebrew messages
  await setValue(page, '#f-name', 0, 'דנה'); await setValue(page, '#f-phone', 0, '123');
  await clickSel(page, 'form button[type=submit]');
  const errTxt = await page.evaluate(() => [...document.querySelectorAll('.ferr')].map(e => e.textContent).join('|'));
  check('login validation shows Hebrew errors', /שם פרטי/.test(errTxt) && /05/.test(errTxt), errTxt);
  await shot(page, '02-login-error', suffix);
  await setValue(page, '#f-name', 0, 'דנה כהן'); await setValue(page, '#f-phone', 0, '050 123-4567');
  await clickSel(page, 'form button[type=submit]');
  await waitFor(page, '.ws-card .ws-tasks');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cw:student')));
  check('phone normalised to 10 digits', stored && stored.phone === '0501234567', JSON.stringify(stored));
  await shot(page, '03-home', suffix, true);

  await clickSel(page, '.ws-card h3 a[href="#w1"]');
  await waitFor(page, '.task-card');
  await shot(page, '04-workshop', suffix, true);
  await clickSel(page, 'a.btn[href="#w1t1"]');
  await waitFor(page, '.stepper');

  // ---- stage 1 understand
  const uq = task.stages.understand.questions;
  const mcs = uq.filter(q => q.type === 'mc');
  for (let i = 0; i < mcs.length; i++) {
    const q = mcs[i];
    const wrong = (q.correct + 1) % q.options.length;
    await page.evaluate((i, k) => document.querySelectorAll('.qcard')[i].querySelectorAll('.opt')[k].click(), uq.indexOf(q), wrong);
    if (i === 0) { await shot(page, '05-understand-wrong', suffix); }
    await page.evaluate((i, k) => document.querySelectorAll('.qcard')[i].querySelectorAll('.opt')[k].click(), uq.indexOf(q), q.correct);
  }
  const txts = uq.filter(q => q.type === 'text');
  for (const q of txts) await setValue(page, '.qcard textarea', 0, 'התוכנית צריכה לקרוא שני מספרים ולהדפיס כמה קבוצות מלאות יש וכמה נשארים');
  await shot(page, '06-understand-done', suffix);
  check('understand: continue enabled after answers', await page.evaluate(() => !document.querySelector('.stage-foot .btn.primary').disabled));
  await clickSel(page, '.stage-foot .btn.primary');
  await hashIs(page, '#w1t1/plan');

  // ---- stage 2 plan
  await waitFor(page, '.plan-grid');
  const n = await page.evaluate(() => document.querySelectorAll('.plan-grid textarea').length);
  for (let i = 0; i < n; i++) await setValue(page, '.plan-grid textarea', i, 'כותבים תוכנית קצרה במילים ' + i);
  await clickText(page, '.stage-foot .btn', 'המשך');
  await waitFor(page, '.cmp-row');
  await shot(page, '07-plan-compare', suffix, true);
  check('plan: model shown side by side', await page.evaluate(() => document.querySelectorAll('.cmp.ref').length >= 1));
  await clickText(page, '.stage-foot .btn', 'לשלב הבא');
  await hashIs(page, '#w1t1/tests');

  // ---- stage 3 tests
  await waitFor(page, '.pred-row');
  const rows = await page.evaluate(() => document.querySelectorAll('.pred-row').length);
  for (let i = 0; i < rows; i++) await setValue(page, '.pred-row textarea', i, i === 0 ? 'לא יודע' : '1');
  await clickText(page, '.stage-foot .btn', 'בדיקת החיזויים');
  await waitFor(page, '.pred-real');
  const marks = await page.evaluate(() => [...document.querySelectorAll('.pred-row')].map(r => r.className));
  check('tests: predictions marked', marks.every(c => /\b(ok|no)\b/.test(c)), marks.join(','));
  check('tests: wrong prediction flagged', /\bno\b/.test(marks[0]), marks[0]);
  await shot(page, '08-tests-checked', suffix, true);
  await waitFor(page, '.own-row');
  await setValue(page, '.own-row textarea', 0, '10\n3'); await setValue(page, '.own-row textarea', 1, 'קבוצות מלאות: 3');
  await clickText(page, '.stage-foot .btn', 'המשך');
  await hashIs(page, '#w1t1/skeleton');

  // ---- stage 4 skeleton: order via up buttons, distractors via the bin button
  await waitFor(page, '.sortboard');
  const steps = task.stages.skeleton.steps, dis = task.stages.skeleton.distractors || [];
  for (const d of dis) {
    await page.evaluate(d => { const li = [...document.querySelectorAll('.slist.ord .sitem')].find(l => l.querySelector('.stext').textContent === d); li.querySelector('[data-act=move]').click(); }, d);
  }
  await shot(page, '09-skeleton-shuffled', suffix, true);
  for (let k = 0; k < steps.length; k++) {
    for (let guard = 0; guard < 30; guard++) {
      const pos = await page.evaluate(t => [...document.querySelectorAll('.slist.ord .sitem')].findIndex(l => l.querySelector('.stext').textContent === t), steps[k]);
      if (pos <= k) break;
      await page.evaluate(t => { const li = [...document.querySelectorAll('.slist.ord .sitem')].find(l => l.querySelector('.stext').textContent === t); li.querySelector('[data-act=up]').click(); }, steps[k]);
    }
  }
  await clickText(page, '.stage-foot .btn', 'בדיקה');
  await waitFor(page, '.feedback.good');
  await shot(page, '10-skeleton-correct', suffix, true);
  await clickText(page, '.stage-foot .btn', 'המשך');
  await hashIs(page, '#w1t1/code');

  // ---- stage 5 code (parsons)
  await waitFor(page, '.work');
  await shot(page, '11-code-parsons-start', suffix, true);
  const P = task.stages.code.parsons;
  for (let i = 0; i < P.lines.length; i++) {
    if (P.fixed.includes(i)) continue;
    await page.evaluate(t => { const li = [...document.querySelectorAll('.slist.bank .sitem')].find(l => l.querySelector('.stext').textContent === t); li.querySelector('[data-act=move]').click(); }, P.lines[i]);
  }
  const prog = await page.evaluate(() => [...document.querySelectorAll('.slist.prog .sitem .stext')].map(e => e.textContent).join('\n'));
  check('parsons: assembled program equals the solution lines', prog === P.lines.join('\n'));
  await shot(page, '12-code-parsons-built', suffix, true);
  // interactive run
  await clickText(page, '.toolbar .btn', 'הרץ');
  await waitFor(page, '.con-line:not([hidden]) input');
  const ex = task.example.input;
  for (let i = 0; i < ex.length; i++) {
    await waitFor(page, '.con-line:not([hidden]) input');
    await page.focus('.con-line input'); await page.keyboard.type(ex[i]); await page.keyboard.press('Enter');
    await sleep(150);
  }
  await page.waitForFunction(() => /הסתיימה|שגיא/.test(document.querySelector('.con-status').textContent), { timeout: 8000 });
  const conOut = await page.evaluate(() => document.querySelector('.con-out').textContent);
  check('console shows program output', task.example.output.every(l => conOut.includes(l)), conOut);
  await shot(page, '13-console-run', suffix, true);
  // tests
  await clickText(page, '.toolbar .btn', 'הרץ בדיקות');
  await waitFor(page, '.tsum');
  const tsum = await page.evaluate(() => document.querySelector('.tsum strong').textContent);
  check('tests: all official tests pass', new RegExp('עברו ' + task.tests.length + ' מתוך ' + task.tests.length).test(tsum), tsum);
  await shot(page, '14-tests-pass', suffix, true);
  // simulation
  await clickText(page, '.toolbar .btn', 'צעד אחר צעד');
  await waitFor(page, '.sim .sim-body');
  for (let i = 0; i < 4; i++) { await clickText(page, '.sim-controls .btn', 'הבא'); await sleep(80); }
  const simInfo = await page.evaluate(() => ({ cur: !!document.querySelector('.sl.cur'), vars: document.querySelectorAll('.vtable tbody tr').length, count: document.querySelector('.sim-count').textContent }));
  check('simulation highlights a line and lists variables', simInfo.cur && simInfo.vars >= 1, JSON.stringify(simInfo));
  await shot(page, '15-simulation', suffix, true);
  await clickText(page, '.sim-controls .btn', 'ניגון'); await sleep(900);
  await clickText(page, '.sim-top .btn', 'סגירה');
  // hints
  await clickText(page, '.toolbar .btn', 'רמז');
  await waitFor(page, '.hint-card');
  check('hint card shows "רמז 1 מתוך"', await page.evaluate(() => /רמז 1 מתוך/.test(document.querySelector('.hint-card').textContent)));
  await clickText(page, '.finish .btn', 'לרפלקציה');
  await hashIs(page, '#w1t1/reflect');

  // ---- stage 6 reflect + submit
  await waitFor(page, '.sumcard');
  const rqn = await page.evaluate(() => document.querySelectorAll('.qcard textarea').length);
  for (let i = 0; i < rqn; i++) await setValue(page, '.qcard textarea', i, 'למדתי שצריך לבדוק מקרי קצה ולהריץ את הקוד כמה פעמים');
  await shot(page, '16-reflect', suffix, true);
  await clickText(page, '.stage-foot .btn', 'הגשה');
  await waitFor(page, '.scorecard');
  await sleep(900);
  await shot(page, '17-score', suffix, true);
  const score = await page.evaluate(() => +document.querySelector('.ring-in b').textContent);
  check('submit shows a score 0..100', score >= 0 && score <= 100, String(score));
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('cw:queue') || '[]').map(e => e.type + (e.stage ? ':' + e.stage : '')));
  check('events queued (login, stage_complete, test_run, hint, submit)', ['login', 'stage_complete:understand', 'stage_complete:code', 'test_run:code', 'hint:code', 'submit:reflect'].every(t => events.includes(t)), events.join(','));
  const chip = await page.evaluate(() => document.querySelector('#syncChip').textContent);
  check('practice-mode chip shown when ENDPOINT empty', /מצב תרגול/.test(chip), chip);

  // ---- other modes: seed finished early stages, then work the code stage
  async function seed(taskId) {
    await page.evaluate(taskId => {
      const ph = JSON.parse(localStorage.getItem('cw:student')).phone;
      const done = {}; ['understand', 'plan', 'tests', 'skeleton'].forEach(k => done[k] = true);
      localStorage.setItem('cw:t:' + ph + ':' + taskId, JSON.stringify({ v: 1, done, a: { understand: {}, plan: {}, tests: {}, skeleton: { correct: true, firstTry: true }, code: {}, reflect: {} }, hints: 0, runs: 0, testRuns: 0, best: 0, total: 0, activeSec: 0, submitted: false, score: null, forced: false, started: Date.now() }));
    }, taskId);
  }
  const t2 = ws.tasks[1];
  await page.goto(base + '/index.html?x=2'); await waitFor(page, '.ws-card');
  await seed(t2.id);
  await page.goto(base + '/index.html?x=3#' + t2.id + '/code'); await page.reload();
  await waitFor(page, '.fillcode input.blank');
  await shot(page, '18-fill-empty', suffix, true);
  for (const b of t2.stages.code.fill.blanks) {
    await page.evaluate((id, v) => { const i = document.querySelector('input.blank[data-id="' + id + '"]'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, b.id, b.accept[0]);
  }
  await clickText(page, '.fill-tools .btn', 'בדיקה מהירה');
  const dotsOk = await page.evaluate(() => document.querySelectorAll('.qdot.ok').length);
  check('fill: quick check marks all blanks green', dotsOk === t2.stages.code.fill.blanks.length, String(dotsOk));
  await clickText(page, '.toolbar .btn', 'הרץ בדיקות'); await waitFor(page, '.tsum');
  const t2sum = await page.evaluate(() => document.querySelector('.tsum strong').textContent);
  check('fill: tests pass with accepted answers', new RegExp('עברו ' + t2.tests.length + ' מתוך').test(t2sum), t2sum);
  await shot(page, '19-fill-pass', suffix, true);

  const t3 = ws.tasks[2];
  await page.goto(base + '/index.html?x=4'); await waitFor(page, '.ws-card');
  await seed(t3.id);
  await page.goto(base + '/index.html?x=5#' + t3.id + '/code'); await page.reload();
  await waitFor(page, '.CodeMirror');
  await shot(page, '20-blank-starter', suffix, true);
  await page.evaluate(sol => document.querySelector('.CodeMirror').CodeMirror.setValue(sol), t3.solution);
  await clickText(page, '.toolbar .btn', 'הרץ בדיקות'); await waitFor(page, '.tsum');
  const t3sum = await page.evaluate(() => document.querySelector('.tsum strong').textContent);
  check('blank: CodeMirror solution passes tests', new RegExp('עברו ' + t3.tests.length + ' מתוך').test(t3sum), t3sum);
  // introduce a compile error to see line highlighting
  await page.evaluate(sol => document.querySelector('.CodeMirror').CodeMirror.setValue(sol.replace(/;/, '')), t3.solution);
  await clickText(page, '.toolbar .btn', 'הרץ'); await sleep(900);
  const errShown = await page.evaluate(() => ({ list: !!document.querySelector('.errlist'), hl: document.querySelectorAll('.cm-errline').length }));
  check('blank: compile error listed and line highlighted', errShown.list && errShown.hl >= 1, JSON.stringify(errShown));
  await shot(page, '21-blank-error', suffix, true);
  // reset confirmation inside the page
  await clickText(page, '.toolbar .btn', 'איפוס'); await waitFor(page, '.confirm');
  await clickText(page, '.confirm .btn', 'כן, לאפס');
  const reset = await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue().indexOf('static void Main') >= 0);
  check('blank: reset restores starter', reset);

  check('no page errors (' + suffix + ')', errors.length === 0, errors.join(' || '));
  await ctx.close();
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--lang=he'] });
  try {
    await walk(browser, base, { width: 1366, height: 768 }, '1366x768');
    await walk(browser, base, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, '390x844');
  } catch (e) {
    check('smoke run completed', false, e.stack || e.message);
  }
  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
