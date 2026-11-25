/* Tests for the vocabulary helper (js/glossary.js, data/glossary.json, css/glossary.css).
 * 1) JSON sanity  2) every example/result verified with the REAL C# compiler (/home/claude/tools/real_cs.sh)  3) UI checks in headless Chrome.
 * Run: node tests/glossary_test.js    (serves js/config.js with an empty ENDPOINT: nothing is posted to the live sheet) */
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/tmp/pt/node_modules/puppeteer-core'); }
const ROOT = path.resolve(__dirname, '..'), SHOTS = path.join(__dirname, 'screens');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (n, ok, x) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  -> ' + (x || ''))); };
const REAL_CS = '/home/claude/tools/real_cs.sh';

/* How each example is wrapped for the real compiler, and the exact stdout it must produce. kind: main = statements inside Main;
 * members = class members (+ a Main that runs `main`); class = complete members including Main. */
const VERIFY = {"variable": {"kind": "main", "out": "16"}, "type": {"kind": "main", "out": ""}, "int": {"kind": "main", "out": "3"}, "double": {"kind": "main", "out": "3.5"}, "string": {"kind": "main", "out": "6"}, "bool": {"kind": "main", "out": "True"}, "declaration": {"kind": "main", "out": "10"}, "assignment": {"kind": "main", "out": "6"}, "expression": {"kind": "main", "out": "9"}, "value": {"kind": "main", "out": "Size: 10"}, "input": {"kind": "main", "out": "shalom", "input": "shalom\n"}, "output": {"kind": "main", "out": "Hello"}, "readline": {"kind": "main", "out": "Hi Dana", "input": "Dana\n"}, "writeline": {"kind": "main", "out": "ab\nc"}, "parse": {"kind": "main", "out": "42", "input": "21\n"}, "concat": {"kind": "main", "out": "Left: 3"}, "intdiv": {"kind": "main", "out": "3\n3.5"}, "modulo": {"kind": "main", "out": "2\n-1"}, "precedence": {"kind": "main", "out": "14\n20"}, "cast": {"kind": "main", "out": "3\n3.5"}, "abs": {"kind": "main", "out": "5"}, "maxmin": {"kind": "main", "out": "8\n3"}, "pow": {"kind": "main", "out": "8"}, "sqrt": {"kind": "main", "out": "5"}, "round": {"kind": "main", "out": "4\n2"}, "random": {"kind": "main", "out": "True"}, "method": {"kind": "members", "main": "Console.WriteLine(Twice(4));", "out": "8"}, "header": {"kind": "members", "main": "Console.WriteLine(Add(2, 3));", "out": "5"}, "parameter": {"kind": "members", "main": "Hello(\"Dana\");", "out": "Hi Dana"}, "argument": {"kind": "main", "out": "8"}, "return": {"kind": "members", "main": "Console.WriteLine(Square(4));", "out": "16"}, "call": {"kind": "main", "out": "9"}, "void": {"kind": "members", "main": "Greet();", "out": "Hi"}, "static": {"kind": "members", "main": "Console.WriteLine(Three());", "out": "3"}, "main": {"kind": "class", "out": "Start"}, "boolmethod": {"kind": "members", "main": "Console.WriteLine(IsEven(6));", "out": "True"}, "condition": {"kind": "main", "out": "big"}, "boolexpr": {"kind": "main", "out": "True\nFalse"}, "compare": {"kind": "main", "out": "True\nFalse"}, "and": {"kind": "main", "out": "True\nFalse"}, "or": {"kind": "main", "out": "True\nFalse"}, "not": {"kind": "main", "out": "False"}, "if": {"kind": "main", "out": "OK"}, "else": {"kind": "main", "out": "small"}, "elseif": {"kind": "main", "out": "B"}, "nesting": {"kind": "main", "out": "even"}, "block": {"kind": "main", "out": "inside"}, "runtime": {"kind": "main", "out": "", "err": "DivideByZero"}, "logic": {"kind": "main", "out": "6"}, "semicolon": {"kind": "main", "out": "Hi"}, "comment": {"kind": "main", "out": "5"}};

function runCs(src, input) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gltest-')); const f = path.join(dir, 'p.cs'); fs.writeFileSync(f, src);
  let inp = '/dev/null'; if (input != null) { inp = path.join(dir, 'in.txt'); fs.writeFileSync(inp, input); }
  return new Promise(res => cp.execFile(REAL_CS, [f, inp], { timeout: 90000 }, (err, stdout, stderr) => res({ code: err ? (err.code || 1) : 0, out: stdout.replace(/\r/g, ''), err: stderr })));
}
function wrap(t, ex) {
  const head = 'using System;\nclass Program\n{\n';
  if (t.kind === 'main') return head + 'static void Main()\n{\n' + ex + '\n}\n}\n';
  if (t.kind === 'members') return head + ex + '\nstatic void Main()\n{\n' + t.main + '\n}\n}\n';
  return head + ex + '\n}\n';
}

(async () => {
  /* ---------- 1. JSON sanity ---------- */
  const raw = fs.readFileSync(path.join(ROOT, 'data', 'glossary.json'), 'utf8');
  const G = JSON.parse(raw); const terms = G.terms, guides = G.guides;
  const CATS = ['נתונים', 'קלט ופלט', 'חישוב', 'פעולות', 'תנאים', 'תהליך העבודה', 'שגיאות'];
  check('glossary has 45-65 terms (' + terms.length + ')', terms.length >= 45 && terms.length <= 65);
  check('unique ids', new Set(terms.map(t => t.id)).size === terms.length);
  check('all categories are the agreed ones, all used', terms.every(t => CATS.includes(t.cat)) && CATS.every(c => terms.some(t => t.cat === c)));
  check('every term has term/short/match array/aka array', terms.every(t => t.term && t.short && Array.isArray(t.match) && Array.isArray(t.aka)));
  const P = x => x.replace(/`/g, '');
  check('short <= 125 chars', terms.every(t => P(t.short).length <= 125), terms.filter(t => P(t.short).length > 125).map(t => t.id + ':' + P(t.short).length).join(','));
  check('backticks are balanced', terms.every(t => ['short', 'more', 'result'].every(k => !t[k] || (t[k].match(/`/g) || []).length % 2 === 0)));
  check('examples <= 3 short lines', terms.every(t => !t.example || (t.example.split('\n').length <= 3 && t.example.split('\n').every(l => l.length <= 90))), terms.filter(t => t.example && t.example.split('\n').length > 3).map(t => t.id).join(','));
  check('only forbidden-word-free text (no שיטה / מתודה)', !/שיטה|שיטות|מתודה|מתודות/.test(raw));
  check('no em/en dash, no emoji', !/[–—―]/.test(raw) && !/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(raw));
  const FORB = [/\+=|-=|\*=|\/=|%=/, /\?[^?]*:/, /\bswitch\b/, /\$"/, /\bvar\b/, /\bConvert\./, /\.Equals\(/, /\bwhile\b|\bfor\s*\(|\bforeach\b/];
  const codeTexts = terms.filter(t => t.example).map(t => [t.id, t.example]);
  guides.forEach(g => (g.sections || []).forEach(s => (s.items || []).forEach(i => codeTexts.push([g.id, i.code]))));
  check('examples free of forbidden C# constructs', codeTexts.every(([id, c]) => FORB.every(r => !r.test(c.replace(/\/\/.*$/gm, '')))), codeTexts.filter(([id, c]) => FORB.some(r => r.test(c.replace(/\/\/.*$/gm, '')))).map(x => x[0]).join(','));
  check('code comments are English only', codeTexts.every(([id, c]) => !/\/\/.*[֐-׿]/.test(c)));
  check('match forms are >= 3 chars where used', terms.every(t => t.match.every(m => m.length >= 3)), terms.filter(t => t.match.some(m => m.length < 3)).map(t => t.id).join(','));
  check('guide "functions" present with sections', guides.length === 1 && guides[0].id === 'functions' && guides[0].sections.length >= 6);
  check('every term with an example is covered by VERIFY', terms.filter(t => t.example).every(t => VERIFY[t.id]), terms.filter(t => t.example && !VERIFY[t.id]).map(t => t.id).join(','));
  check('function terms link to the guide', ['method', 'parameter', 'argument', 'return', 'call', 'void', 'static', 'boolmethod'].every(id => terms.find(t => t.id === id).guide === 'functions'));

  /* ---------- 2. real compiler verification ---------- */
  const jobs = terms.filter(t => t.example).map(t => ({ t, v: VERIFY[t.id] }));
  let idx = 0, bad = [];
  await Promise.all([1, 2, 3, 4].map(async () => {
    while (idx < jobs.length) {
      const { t, v } = jobs[idx++];
      const r = await runCs(wrap(v, t.example), v.input);
      const out = r.out.replace(/\n+$/, '');
      let ok;
      if (v.err) ok = r.code !== 0 && new RegExp(v.err).test(r.err + r.out);
      else ok = r.code === 0 && out === v.out;
      if (!ok) bad.push(t.id + ' got ' + JSON.stringify(out) + ' code ' + r.code + ' ' + r.err.slice(0, 80));
    }
  }));
  check('all ' + jobs.length + ' examples compile and print the claimed output (real .NET)', bad.length === 0, bad.join(' | '));
  // the written "result" text must mention every printed value (numbers / True / False / words)
  const resBad = jobs.filter(({ t, v }) => !v.err && t.result && v.out.split('\n').some(l => !P(t.result).includes(l.trim()))).map(j => j.t.id);
  check('result text contains each printed line', resBad.length === 0, resBad.join(','));
  const g = guides[0], it = g.sections[1].items, bl = g.sections[3].items;
  const gsrc = 'using System;\nclass Program\n{\n' + it[0].code + '\n{ return price * count; }\nstatic void PrintLine(string text)\n{ Console.WriteLine(text); }\n' + bl[0].code +
    '\nstatic void Main()\n{\n' + it[3].code + '\nConsole.WriteLine(sum);\nPrintLine("Hi");\nint hour = 9;\n' + bl[1].code + '\n{ Console.WriteLine("ok"); }\n}\n}\n';
  const gr = await runCs(gsrc);
  check('guide code (Total / PrintLine / IsValidHour) compiles; sum is 36', gr.code === 0 && gr.out.trim() === '36\nHi\nok', gr.out + gr.err);
  const gneg = await runCs('using System;\nclass Program\n{\nstatic int NoReturn(int a)\n{ if (a > 0) { return 1; } }\nstatic void Main() { Console.WriteLine(NoReturn(1)); }\n}\n');
  check('guide claim: a path without return is a compile error', gneg.code !== 0 && /CS0161|not all code paths/i.test(gneg.out + gneg.err), gneg.out + gneg.err);

  /* ---------- 3. UI ---------- */
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (/js\/config\.js$/.test(p)) { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end(fs.readFileSync(f, 'utf8').replace(/ENDPOINT:\s*"[^"]*"/, 'ENDPOINT: ""')); }
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0, '127.0.0.1'); await new Promise(r => srv.on('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const requests = [];
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage(); await page.setViewport({ width: 1366, height: 768 });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/404|fonts\.g/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !/fonts\.g/.test(r.url())) requests.push(r.url()); });
  const setQ = async q => { await page.focus('.gl-search'); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await page.keyboard.type(q); };
  const shot = n => page.screenshot({ path: path.join(SHOTS, 'gl-' + n + '.png') });
  const go = async (hash, w, h) => { await page.setViewport({ width: w || 1366, height: h || 768 }); await page.goto(base + '/index.html?n=' + Math.random() + '#' + hash); await page.reload(); await sleep(700); };
  const seed = stages => page.evaluate((stages) => {
    const done = {}; stages.forEach(k => done[k] = true);
    ['w1t1', 'w2t3', 'w3t3'].forEach(id => localStorage.setItem('cw:t:0500000001:' + id, JSON.stringify({ v: 1, done, a: { understand: {}, plan: {}, tests: {}, skeleton: { correct: true, firstTry: true }, code: {}, reflect: {} }, hints: 0, runs: 0, testRuns: 0, best: 0, total: 0, activeSec: 0, submitted: false, score: null, forced: false, started: Date.now() })));
  }, stages);

  // login screen: no button
  await page.goto(base + '/index.html'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#f-name'); await sleep(500);
  check('button hidden on the login screen', await page.evaluate(() => { const b = document.querySelector('.gl-fab'); return !b || getComputedStyle(b).display === 'none'; }));
  await shot('login');
  await page.evaluate(() => localStorage.setItem('cw:student', JSON.stringify({ name: 'בודק', phone: '0500000001' })));

  // home
  await go('');
  const fabInfo = await page.evaluate(() => { const b = document.querySelector('.gl-fab'); if (!b) return null; const r = b.getBoundingClientRect(), s = getComputedStyle(b); return { w: r.width, h: r.height, left: r.left, bottom: innerHeight - r.bottom, label: b.getAttribute('aria-label'), vis: s.display !== 'none', txt: b.textContent.trim() }; });
  check('button visible on home (52px, bottom-left, label)', fabInfo && fabInfo.vis && fabInfo.h === 52 && fabInfo.left < 30 && fabInfo.bottom < 30 && fabInfo.label === 'מילון מונחים' && fabInfo.txt === 'מילון', JSON.stringify(fabInfo));
  await shot('home');

  // panel + search
  await page.click('.gl-fab'); await page.waitForSelector('.gl-panel:not([hidden])');
  check('search input focused on open', await page.evaluate(() => document.activeElement.classList.contains('gl-search')));
  await shot('panel');
  await page.type('.gl-search', 'שארית'); await sleep(100);
  check('search "שארית" finds the modulo term first', await page.evaluate(() => { const b = document.querySelector('.gl-item'); return b && b.dataset.id === 'modulo'; }));
  await setQ('%'); await sleep(100);
  check('search "%" finds the modulo term', await page.evaluate(() => [...document.querySelectorAll('.gl-item')].some(b => b.dataset.id === 'modulo')));
  await setQ('בשארית'); await sleep(100);
  check('search ignores Hebrew prefix (בשארית)', await page.evaluate(() => [...document.querySelectorAll('.gl-item')].some(b => b.dataset.id === 'modulo')));
  await setQ('xyzxyz'); await sleep(100);
  check('empty search shows a friendly message', await page.evaluate(() => !!document.querySelector('.gl-empty')));
  await setQ('שארית'); await sleep(100);
  await page.keyboard.press('ArrowDown');
  check('ArrowDown moves from search into the list', await page.evaluate(() => document.activeElement.classList.contains('gl-item')));
  await page.keyboard.press('Enter'); await sleep(100);
  const card = await page.evaluate(() => { const c = document.querySelector('.gl-card'); if (!c) return null; const code = c.querySelector('.gl-code'); return { t: c.querySelector('.gl-card-t').textContent, code: code && code.textContent, dir: code && code.getAttribute('dir'), cs: code && getComputedStyle(code).direction, res: (c.querySelector('.gl-result') || {}).textContent, aka: c.querySelectorAll('.gl-aka-i').length, back: document.activeElement.classList.contains('gl-back') }; });
  check('Enter opens the card: example in an LTR code block + result', card && card.t === 'שארית' && /17 % 5/.test(card.code) && card.dir === 'ltr' && card.cs === 'ltr' && /התוצאה/.test(card.res) && card.aka >= 3 && card.back, JSON.stringify(card));
  await shot('card');
  await page.keyboard.press('Escape'); await sleep(100);
  check('Esc closes the panel and returns focus to the button', await page.evaluate(() => document.querySelector('.gl-panel').hidden && document.activeElement.classList.contains('gl-fab')));
  await page.click('.gl-fab'); await page.waitForSelector('.gl-panel:not([hidden])');
  await page.mouse.click(600, 300); await sleep(100);
  check('click outside closes the panel', await page.evaluate(() => document.querySelector('.gl-panel').hidden));

  // guide from the home view
  await page.click('.gl-fab'); await page.waitForSelector('.gl-panel:not([hidden])');
  check('guide card is pinned at the top of the home view', await page.evaluate(() => { const g = document.querySelector('.gl-guide'), l = document.querySelector('.gl-item'); return g && !g.hidden && g.textContent.includes('מדריך קצר: פעולות/פונקציות') && g.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING; }));
  await page.click('.gl-guide'); await sleep(100);
  const gi = await page.evaluate(() => { const c = document.querySelector('.gl-guide-card'); const codes = [...c.querySelectorAll('.gl-code')]; const sc = document.querySelector('.gl-scroll'); return { n: codes.length, ltr: codes.every(x => getComputedStyle(x).direction === 'ltr' && x.getAttribute('dir') === 'ltr'), title: c.querySelector('.gl-card-t').textContent, labels: c.querySelectorAll('.gl-label').length, overflow: sc.scrollWidth > sc.clientWidth }; });
  check('guide opens from home: title, >=6 code blocks LTR, labels, no horizontal scroll (desktop)', gi.title === 'איך בנויה פעולה/פונקציה' && gi.n >= 6 && gi.ltr && gi.labels >= 6 && !gi.overflow, JSON.stringify(gi));
  await shot('guide');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.CWGlossary.open('functions')); await sleep(100);
  check('CWGlossary.open("functions") opens the guide', await page.evaluate(() => !!document.querySelector('.gl-guide-card') && !document.querySelector('.gl-panel').hidden));
  await page.evaluate(() => window.CWGlossary.close());
  await page.evaluate(() => window.CWGlossary.open('parameter')); await sleep(100);
  check('guide link on a function term card opens the guide', await page.evaluate(() => { const l = document.querySelector('.gl-card .gl-link'); if (!l) return false; l.click(); return !!document.querySelector('.gl-guide-card'); }));
  await page.evaluate(() => window.CWGlossary.close());

  // guide at phone size
  await go('', 390, 844);
  check('icon-only button on phones (<600px)', await page.evaluate(() => { const b = document.querySelector('.gl-fab'); return getComputedStyle(b.querySelector('.gl-fab-l')).display === 'none' && b.getBoundingClientRect().width === 52; }));
  await page.click('.gl-fab'); await page.waitForSelector('.gl-panel:not([hidden])');
  await sleep(300);
  const sheet = await page.evaluate(() => { const r = document.querySelector('.gl-panel').getBoundingClientRect(); return { l: r.left, w: r.width, h: r.height, vh: innerHeight, bottom: innerHeight - r.bottom }; });
  check('bottom sheet on phones (full width, <= 80vh)', sheet.l === 0 && sheet.w === 390 && sheet.h <= sheet.vh * 0.8 + 1 && sheet.bottom === 0, JSON.stringify(sheet));
  await sleep(300); await shot('panel-mobile');
  await page.evaluate(() => window.CWGlossary.open('method')); await sleep(100);
  await page.click('.gl-card .gl-link'); await sleep(100);
  const gm = await page.evaluate(() => { const sc = document.querySelector('.gl-scroll'); const c = document.querySelector('.gl-guide-card'); return { ok: !!c, hs: sc.scrollWidth > sc.clientWidth, codeOver: [...c.querySelectorAll('.gl-code')].filter(x => x.scrollWidth > x.clientWidth).length, docHs: document.documentElement.scrollWidth > innerWidth }; });
  check('guide from a term card fits at 390x844 without horizontal scrolling', gm.ok && !gm.hs && gm.codeOver === 0 && !gm.docHs, JSON.stringify(gm));
  await shot('guide-mobile');
  await page.evaluate(() => window.CWGlossary.close());

  // auto-linking on a task screen
  for (const [w, h, tag] of [[1366, 768, 'desktop'], [390, 844, 'mobile']]) {
    await seed([]); await go('w1t1/understand', w, h);
    const links = await page.evaluate(() => {
      const L = [...document.querySelectorAll('button.gl-term')];
      const bad = L.filter(b => b.closest('pre, code, input, textarea, .stepper, [dir="ltr"], .sortboard, .console, .CodeMirror, header, h1, h2, nav'));
      const dup = {}; L.forEach(b => { const c = b.closest('.qcard, .story-text, .io-col, .lead, .stage') || document.body; dup[(c.className || c.tagName) + '|' + b.dataset.term + '|' + [...document.querySelectorAll('*')].indexOf(c)] = (dup[(c.className || c.tagName) + '|' + b.dataset.term + '|' + [...document.querySelectorAll('*')].indexOf(c)] || 0) + 1; });
      return { n: L.length, ids: L.map(b => b.dataset.term), bad: bad.length, dups: Object.values(dup).filter(x => x > 1).length, story: document.querySelectorAll('.story button.gl-term, .stage button.gl-term').length };
    });
    check(`${tag}: >= 3 terms auto-linked in story/instructions (${links.n}: ${links.ids.join(',')})`, links.n >= 3 && links.story >= 3, JSON.stringify(links));
    check(`${tag}: none inside code blocks / inputs / stepper, first occurrence per container only`, links.bad === 0 && links.dups === 0, JSON.stringify(links));
    const vis = () => page.evaluateHandle(() => [...document.querySelectorAll('button.gl-term')].find(b => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden'));
    const t = await vis(); await t.evaluate(e => e.scrollIntoView({ block: 'center' }));
    await t.hover(); await sleep(500);
    const pi = await page.evaluate(() => { const p = document.querySelector('.gl-pop'); if (!p) return null; const r = p.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, vw: document.documentElement.clientWidth, vh: innerHeight, n: document.querySelectorAll('.gl-pop').length }; });
    check(`${tag}: hover popover appears inside the viewport (max 300px, single)`, pi && pi.l >= 0 && pi.t >= 0 && pi.r <= pi.vw && pi.b <= pi.vh && pi.w <= 300.5 && pi.n === 1, JSON.stringify(pi));
    await shot('popover-' + tag);
    await t.click(); await sleep(150);
    const pin = await page.evaluate(() => ({ more: !!document.querySelector('.gl-pop .gl-pop-more'), n: document.querySelectorAll('.gl-pop').length }));
    check(`${tag}: click pins the popover and shows "עוד במילון"`, pin.more && pin.n === 1, JSON.stringify(pin));
    await shot('pinned-' + tag);
    await page.click('.gl-pop-more'); await sleep(150);
    check(`${tag}: "עוד במילון" opens the panel on that term`, await page.evaluate(() => !document.querySelector('.gl-panel').hidden && !!document.querySelector('.gl-card') && !document.querySelector('.gl-pop')));
    await page.keyboard.press('Escape');
    // Esc closes pinned popover
    const t2 = await vis(); await t2.evaluate(e => e.scrollIntoView({ block: 'center' })); await t2.click(); await sleep(100);
    await page.keyboard.press('Escape'); await sleep(100);
    check(`${tag}: Esc closes a pinned popover`, await page.evaluate(() => !document.querySelector('.gl-pop')));
    await t2.click(); await sleep(100); await page.mouse.click(5, 300); await sleep(100);
    check(`${tag}: click outside closes the popover`, await page.evaluate(() => !document.querySelector('.gl-pop')));
    // keyboard: focus shows the popover
    await t2.evaluate(e => e.focus()); await sleep(100);
    check(`${tag}: keyboard focus shows the popover`, await page.evaluate(() => !!document.querySelector('.gl-pop')));
    await page.keyboard.press('Escape');
  }

  // toggle off / on
  await seed([]); await go('w1t1/understand');
  await page.click('.gl-fab'); await page.waitForSelector('.gl-panel:not([hidden])');
  check('switch "סימון מונחים בטקסט" is on by default', await page.evaluate(() => document.querySelector('.gl-sw').checked && document.querySelector('.gl-swl').textContent.includes('סימון מונחים בטקסט')));
  await page.click('.gl-swl'); await sleep(200);
  check('toggling off removes the links and stores the preference', await page.evaluate(() => document.querySelectorAll('button.gl-term').length === 0 && localStorage.getItem('cw:glossary:link') === '0'));
  await page.reload(); await sleep(700);
  check('"off" survives a reload', await page.evaluate(() => document.querySelectorAll('button.gl-term').length === 0));
  await page.click('.gl-fab'); await page.click('.gl-swl'); await sleep(400);
  check('toggling on links again', await page.evaluate(() => document.querySelectorAll('button.gl-term').length >= 3 && localStorage.getItem('cw:glossary:link') === '1'));
  await page.keyboard.press('Escape');

  // parsons drag list stays untouched
  await seed(['understand', 'plan', 'tests', 'skeleton']); await go('w1t1/code');
  const ps = await page.evaluate(() => ({ board: !!document.querySelector('.sortboard'), inside: document.querySelectorAll('.sortboard .gl-term, .slist .gl-term, .console .gl-term').length, items: document.querySelectorAll('.sortboard .sitem').length }));
  check('parsons: .sortboard has items and no .gl-term inside', ps.board && ps.items > 0 && ps.inside === 0, JSON.stringify(ps));
  await shot('code-parsons');
  const fabBox = await page.evaluate(() => { const r = document.querySelector('.gl-fab').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  const overlap = await page.evaluate(b => [...document.querySelectorAll('main button, main input, main textarea, main .btn')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && !(r.right < b.l || r.left > b.r || r.bottom < b.t || r.top > b.b); }).length, fabBox);
  console.log('INFO buttons/inputs under the floating button at initial scroll (parsons): ' + overlap);
  // a student can still drag-free "move" an item: the app handler still works
  const moved = await page.evaluate(() => { const li = document.querySelector('.slist.bank .sitem [data-act=move]'); if (!li) return 'nobank'; const before = document.querySelectorAll('.slist.prog .sitem').length; li.click(); return document.querySelectorAll('.slist.prog .sitem').length - before; });
  check('parsons: the app\'s own "move" button still works', moved === 1 || moved === 'nobank', String(moved));

  // CodeMirror stage and tests stage
  await seed(['understand', 'plan', 'tests', 'skeleton']); await go('w2t3/code');
  await page.waitForSelector('.CodeMirror');
  check('w2t3 code: CodeMirror untouched (no .gl-term inside)', await page.evaluate(() => document.querySelectorAll('.CodeMirror .gl-term, .console .gl-term, pre .gl-term').length === 0));
  await shot('code-w2t3');
  const ov2 = await page.evaluate(() => { const r = document.querySelector('.gl-fab').getBoundingClientRect(); const els = [...document.querySelectorAll('main .console input, main .con-in, main .toolbar .btn, main .btn.primary')]; return els.filter(e => { const q = e.getBoundingClientRect(); return q.width && q.height && !(q.right < r.left || q.left > r.right || q.bottom < r.top || q.top > r.bottom); }).map(e => e.className); });
  check('w2t3 code: floating button does not cover console input / toolbar / primary buttons at first view', ov2.length === 0, ov2.join(','));
  await seed(['understand', 'plan']); await go('w3t3/tests');
  check('w3t3 tests renders', await page.evaluate(() => document.body.innerText.length > 300 && !document.querySelector('.errbox')));
  await shot('tests-w3t3');
  await seed([]); await go('w1t1/plan'); await go('w2t1/understand'); await shot('understand-w2t1');
  await go('');
  check('home page: workshop cards get a few links, none in header/h1/h2', await page.evaluate(() => document.querySelectorAll('button.gl-term').length >= 1 && !document.querySelector('header .gl-term, h1 .gl-term, h2 .gl-term')));

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  check('no network requests other than the app itself (and fonts)', requests.length === 0, requests.slice(0, 3).join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
  await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
