/* Checks every task of every workshop in the real UI: each stage renders without page errors, and in the code stage
 * the reference solution (entered the way a student would for that mode) passes all official tests.
 * Run: node tests/ui_all_tasks.js   (never posts to the live sheet: config.js is served with an empty ENDPOINT) */
const fs = require('fs'), path = require('path'), http = require('http');
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/tmp/pt/node_modules/puppeteer-core'); }
const ROOT = path.resolve(__dirname, '..'), SHOTS = path.join(__dirname, 'screens');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (n, ok, x) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  -> ' + (x || ''))); };
(async () => {
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
  await page.evaluate(() => localStorage.setItem('cw:student', JSON.stringify({ name: 'בודק', phone: '0500000001' })));
  let n = 0;
  for (const w of ['w1', 'w2', 'w3']) {
    const ws = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', w + '.json'), 'utf8'));
    for (const t of ws.tasks) {
      const seed = async stages => page.evaluate((taskId, stages) => {
        const done = {}; stages.forEach(k => done[k] = true);
        localStorage.setItem('cw:t:0500000001:' + taskId, JSON.stringify({ v: 1, done, a: { understand: {}, plan: {}, tests: {}, skeleton: { correct: true, firstTry: true }, code: {}, reflect: {} }, hints: 0, runs: 0, testRuns: 0, best: 0, total: 0, activeSec: 0, submitted: false, score: null, forced: false, started: Date.now() }));
      }, t.id, stages);
      const order = ['understand', 'plan', 'tests', 'skeleton', 'code'];
      for (let i = 0; i < order.length; i++) {
        await seed(order.slice(0, i));
        await page.goto(base + '/index.html?n=' + (n++) + '#' + t.id + '/' + order[i]); await page.reload(); await sleep(500);
        const info = await page.evaluate(() => ({ hash: location.hash, len: document.body.innerText.length, err: !!document.querySelector('.errbox') }));
        check(`${t.id} ${order[i]} renders`, info.hash === '#' + t.id + '/' + order[i] && info.len > 300 && !info.err, JSON.stringify(info));
        if (order[i] === 'skeleton' && t.id === 'w3t3') await page.screenshot({ path: path.join(SHOTS, 'all-w3t3-skeleton.png'), fullPage: true });
      }
      // code stage: enter the solution as a student would
      const code = t.stages.code;
      if (t.mode === 'parsons') {
        for (let i = 0; i < code.parsons.lines.length; i++) {
          if (code.parsons.fixed.includes(i)) continue;
          // a student picks the insertion point by clicking the locked line that precedes the gap
          if (code.parsons.fixed.includes(i - 1)) await page.evaluate(id => document.querySelector('.slist.prog .sitem[data-id="' + id + '"]').click(), 'L' + (i - 1));
          const ok = await page.evaluate(txt => { const li = [...document.querySelectorAll('.slist.bank .sitem')].find(l => l.querySelector('.stext').textContent === txt); if (!li) return false; li.querySelector('[data-act=move]').click(); return true; }, code.parsons.lines[i]);
          if (!ok) { check(`${t.id} parsons line found in bank`, false, code.parsons.lines[i]); break; }
        }
        const prog = await page.evaluate(() => [...document.querySelectorAll('.slist.prog .sitem .stext')].map(e => e.textContent).join('\n'));
        check(`${t.id} parsons assembles to the solution`, prog === code.parsons.lines.join('\n'), '\n' + prog);
      } else if (t.mode === 'fill') {
        for (const b of code.fill.blanks) await page.evaluate((id, v) => { const i = document.querySelector('input.blank[data-id="' + id + '"]'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, b.id, b.accept[0]);
      } else {
        await page.waitForSelector('.CodeMirror');
        await page.evaluate(sol => document.querySelector('.CodeMirror').CodeMirror.setValue(sol), t.solution);
      }
      await page.evaluate(() => { const b = [...document.querySelectorAll('.toolbar .btn')].find(e => e.textContent.includes('הרץ בדיקות')); b.click(); });
      await page.waitForSelector('.tsum', { timeout: 15000 });
      const sum = await page.evaluate(() => document.querySelector('.tsum strong').textContent);
      check(`${t.id} (${t.mode}) solution passes ${t.tests.length} tests in the UI`, new RegExp('עברו ' + t.tests.length + ' מתוך ' + t.tests.length).test(sum), sum);
      if (t.id === 'w2t1' || t.id === 'w3t3') await page.screenshot({ path: path.join(SHOTS, 'all-' + t.id + '-code.png'), fullPage: true });
    }
  }
  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
  await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
