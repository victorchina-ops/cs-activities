#!/usr/bin/env node
// Unit tests for js/csrun.js. Run: node tests/csrun.test.js
'use strict';
const fs = require('fs'), path = require('path');
const CSRun = require('../js/csrun.js');
let passed = 0, failed = 0;
const failures = [];
function ok(cond, name, extra) { if (cond) passed++; else { failed++; failures.push(name + (extra ? ' :: ' + extra : '')); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name, 'got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }
const wrap = body => 'using System;\nclass Program\n{\n    static void Main()\n    {\n' + body + '\n    }\n}\n';

(async () => {
  // ---- basic run
  let r = await CSRun.run(wrap('Console.WriteLine("hi " + 7 / 2.0);'), {});
  eq([r.status, r.stdout], ['ok', 'hi 3.5\n'], 'basic run');
  ok(r.steps > 0, 'steps counted');

  // ---- compile API
  let c = CSRun.compile(wrap('int x = 5'));
  ok(!c.ok && c.errors[0].code === 'CS1002' && c.errors[0].line === 6 && c.errors[0].kind === 'compile', 'compile: CS1002 line', JSON.stringify(c.errors));
  ok(/^שורה 6: /.test(c.errors[0].message) && /\(CS1002\)$/.test(c.errors[0].message), 'compile: message format', c.errors[0].message);
  c = CSRun.compile(wrap('int x = 1;'));
  ok(c.ok && c.errors.length === 0, 'compile ok');
  c = CSRun.compile(wrap('int x = 1; x += 1;'));
  ok(c.ok && c.warnings.length === 1 && c.warnings[0].kind === 'subset', 'compile: warnings carry subset');
  c = CSRun.compile(wrap('int x = Console.ReadLine();'));
  ok(c.errors[0].code === 'CS0029' && /int\.Parse/.test(c.errors[0].message), 'hint int.Parse');
  c = CSRun.compile(wrap('int x = 1; if (x = 5) { }'));
  ok(c.errors[0].code === 'CS0029' && /==/.test(c.errors[0].message), 'hint ==');
  c = CSRun.compile(wrap('console.WriteLine("a");'));
  ok(c.errors[0].code === 'CS0103' && /Console/.test(c.errors[0].message), 'hint Console');
  c = CSRun.compile('class Program { static void Main() { } }');
  ok(c.ok, 'no using is fine when unused');
  c = CSRun.compile(wrap('int a = 1; int a = 2; int b; Console.WriteLine(b); string s = 5;'));
  eq(c.errors.map(e => e.code), ['CS0128', 'CS0165', 'CS0029'], 'multiple errors collected, sorted');

  // ---- interactive onInput
  const typed = ['21', '2'];
  let asked = 0, outChunks = [];
  r = await CSRun.run(wrap('Console.Write("a: ");\nint a = int.Parse(Console.ReadLine());\nConsole.Write("b: ");\nint b = int.Parse(Console.ReadLine());\nConsole.WriteLine(a * b);'), {
    onInput: async () => { asked++; await new Promise(res => setTimeout(res, 1)); return typed.shift(); },
    onOutput: t => outChunks.push(t),
  });
  eq([r.status, r.stdout, asked], ['ok', 'a: b: 42\n', 2], 'interactive onInput');
  eq(outChunks.join(''), 'a: b: 42\n', 'onOutput streams exactly once (no duplication on replay)');
  ok(outChunks.length >= 3, 'onOutput streamed in chunks before the end', JSON.stringify(outChunks));
  // random with interactive replay stays consistent
  r = await CSRun.run(wrap('Random r = new Random();\nint a = r.Next(1, 1000000);\nConsole.WriteLine(a);\nstring s = Console.ReadLine();\nConsole.WriteLine(a);'), { onInput: async () => 'x', randomValues: [] });
  const ls = r.stdout.trim().split('\n'); ok(ls[0] === ls[1] && r.status === 'ok', 'replay keeps random values', r.stdout);
  r = await CSRun.run(wrap('Random r = new Random();\nstring s = Console.ReadLine();\nConsole.WriteLine(r.Next(1, 7) + " " + r.Next(1, 7));'), { onInput: async () => 'x', randomValues: [3, 5] });
  eq(r.stdout, '3 5\n', 'randomValues consumed in order (interactive)');
  // onInput returning null => input_exhausted
  r = await CSRun.run(wrap('string s = Console.ReadLine(); Console.WriteLine(s);'), { onInput: async () => null });
  eq(r.status, 'input_exhausted', 'onInput null -> input_exhausted');

  // ---- input_exhausted
  r = await CSRun.run(wrap('Console.WriteLine("start");\nstring a = Console.ReadLine();\nstring b = Console.ReadLine();\nConsole.WriteLine(a + b);'), { input: ['x'] });
  eq([r.status, r.stdout], ['input_exhausted', 'start\n'], 'input_exhausted keeps stdout');
  ok(r.errors.length === 1 && r.errors[0].kind === 'runtime', 'input_exhausted has an error entry');
  r = await CSRun.run(wrap('Console.ReadLine();'), {});
  eq(r.status, 'input_exhausted', 'no input at all -> input_exhausted');

  // ---- timeout / depth
  r = await CSRun.run(wrap('int i = 0; while (true) { i++; }'), {});
  eq(r.status, 'timeout', 'infinite loop -> timeout');
  r = await CSRun.run(wrap('int i = 0; while (true) { i++; }'), { maxSteps: 1000 });
  ok(r.status === 'timeout' && r.steps <= 1002, 'maxSteps honoured', String(r.steps));
  r = await CSRun.run(wrap('while (true) { Console.WriteLine("x"); }'), {});
  eq(r.status, 'timeout', 'endless output -> timeout');
  r = await CSRun.run('using System;\nclass Program\n{\n    static int F(int n) { return F(n + 1); }\n    static void Main() { Console.WriteLine("a"); Console.WriteLine(F(0)); }\n}\n', {});
  ok(r.status === 'runtime_error' && /StackOverflow/.test(r.errors[0].message) && r.errors[0].line === 4 && r.stdout === 'a\n', 'stack overflow', JSON.stringify(r.errors));
  r = await CSRun.run('using System;\nclass Program\n{\n    static int F(int n) { if (n == 0) return 0; return 1 + F(n - 1); }\n    static void Main() { Console.WriteLine(F(100)); }\n}\n', {});
  eq(r.stdout, '100\n', 'depth 100 ok');
  r = await CSRun.run('using System;\nclass Program\n{\n    static int F(int n) { if (n == 0) return 0; return 1 + F(n - 1); }\n    static void Main() { Console.WriteLine(F(100)); }\n}\n', { maxDepth: 50 });
  eq(r.status, 'runtime_error', 'maxDepth option');

  // ---- runtime errors
  r = await CSRun.run(wrap('int a = 0;\nConsole.WriteLine(5 / a);'), {});
  ok(r.status === 'runtime_error' && r.errors[0].code === 'DivideByZeroException' && r.errors[0].line === 7 && /^שורה 7: /.test(r.errors[0].message), 'divide by zero', JSON.stringify(r.errors));
  r = await CSRun.run(wrap('Console.WriteLine("a");\nint x = int.Parse(Console.ReadLine());'), { input: ['abc'] });
  ok(r.status === 'runtime_error' && r.errors[0].code === 'FormatException' && r.errors[0].line === 7 && /abc/.test(r.errors[0].message), 'FormatException', JSON.stringify(r.errors));
  r = await CSRun.run(wrap('int x = int.Parse(Console.ReadLine());'), { input: ['3000000000'] });
  eq(r.errors[0].code, 'OverflowException', 'OverflowException');

  // ---- trace
  r = await CSRun.run('using System;\nclass Program\n{\n    static int Twice(int x)\n    {\n        int y = x * 2;\n        return y;\n    }\n    static void Main()\n    {\n        int a;\n        a = 3;\n        double d = a / 2.0;\n        Console.WriteLine(Twice(a) + " " + d);\n        if (a > 2) { a = 0; }\n    }\n}\n', { trace: true });
  ok(Array.isArray(r.trace) && r.trace.length >= 6, 'trace has entries', JSON.stringify(r.trace && r.trace.length));
  const t0 = r.trace.find(t => t.line === 12);
  eq(t0 && t0.vars, { a: '3' }, 'trace vars after assignment (a=3; unassigned locals declared later not shown)');
  const t1 = r.trace.find(t => t.line === 13);
  eq(t1 && t1.vars, { a: '3', d: '1.5' }, 'trace formats doubles');
  const t2 = r.trace.find(t => t.line === 6);
  ok(t2 && t2.method === 'Twice' && t2.depth === 1 && t2.vars.x === '3' && t2.vars.y === '6', 'trace method/depth/vars', JSON.stringify(t2));
  const t3 = r.trace.find(t => t.line === 14);
  ok(t3 && t3.output === '6 1.5\n', 'trace output captured', JSON.stringify(t3));
  const tu = r.trace.find(t => t.line === 11);
  ok(tu && tu.vars.a === '?', 'trace shows ? for unassigned', JSON.stringify(tu));
  r = await CSRun.run(wrap('for (int i = 0; i < 10000; i++) { }'), { trace: true });
  ok(r.trace.length === 3000, 'trace capped at 3000', String(r.trace.length));
  r = await CSRun.run(wrap('int x = 1;'), {});
  ok(r.trace === undefined, 'no trace unless asked');

  // ---- runTests matching rules
  const prog = wrap('int n = int.Parse(Console.ReadLine());\nConsole.Write("Enter: ");\nConsole.WriteLine(n % 2 == 0 ? "זוגי" : "אי-זוגי");\nConsole.WriteLine("קבוצות מלאות: " + n);');
  let tr = await CSRun.runTests(prog, [
    { name: 'prompt on same line ok', input: ['4'], expected: ['זוגי'] },
    { name: 'suffix: אי-זוגי must not match זוגי', input: ['3'], expected: ['זוגי'] },
    { name: 'exact value suffix', input: ['14'], expected: ['קבוצות מלאות: 14'] },
    { name: 'prefix of number must not match', input: ['14'], expected: ['קבוצות מלאות: 1'] },
    { name: 'trailing dot and spaces normalised', input: ['4'], expected: ['  קבוצות   מלאות:  4. '] },
    { name: 'order matters', input: ['4'], expected: ['קבוצות מלאות: 4', 'זוגי'] },
    { name: 'order ok', input: ['4'], expected: ['זוגי', 'קבוצות מלאות: 4'] },
    { name: 'exact-lines ok', input: ['4'], expected: ['Enter: זוגי', 'קבוצות מלאות: 4'], match: 'exact-lines' },
    { name: 'exact-lines fails on prompt', input: ['4'], expected: ['זוגי', 'קבוצות מלאות: 4'], match: 'exact-lines' },
    { name: 'status not ok fails', input: [], expected: ['זוגי'] },
  ]);
  eq(tr.map(t => t.pass), [true, false, true, false, true, false, true, true, false, false], 'runTests pass/fail matrix');
  eq(tr[1].missing, 'זוגי', 'missing reported');
  eq(tr[9].status, 'input_exhausted', 'runTests reports status');
  eq(CSRun.matchOutput('הכנס מספר: זוגי\n', ['זוגי']).pass, true, 'matchOutput: prompt then suffix');
  eq(CSRun.matchOutput('אי-זוגי\n', ['זוגי']).pass, false, 'matchOutput: אי-זוגי vs זוגי');
  eq(CSRun.matchOutput('קבוצות מלאות: 14\n', ['קבוצות מלאות: 1']), { pass: false, missing: 'קבוצות מלאות: 1' }, 'matchOutput: 14 vs 1');
  eq(CSRun.matchOutput('a\nb\n', ['a', 'b'], 'exact-lines').pass, true, 'matchOutput exact');
  eq(CSRun.matchOutput('a\n\nb\n', ['a', 'b'], 'exact-lines').pass, true, 'matchOutput exact ignores empty lines');
  eq(CSRun.matchOutput('x a\n', ['a', 'a']).pass, false, 'each output line matches at most one expected');
  tr = await CSRun.runTests(wrap('Random r = new Random();\nConsole.WriteLine(r.Next(1, 7));'), [{ name: 'rv', input: [], expected: ['4'], randomValues: [4] }]);
  eq(tr[0].pass, true, 'runTests randomValues');
  tr = await CSRun.runTests(wrap('int x = 5'), [{ name: 'ce', input: [], expected: ['a'] }]);
  ok(!tr[0].pass && tr[0].status === 'compile_error' && tr[0].errors.length, 'runTests with compile error');

  // ---- checkSubset
  const sub = s => CSRun.checkSubset(s).map(w => w.code + '@' + w.line);
  eq(sub(wrap('int x = 1;\nx += 2; x -= 1; x *= 2; x /= 2; x %= 2;')), ['SUB01@7', 'SUB01@7', 'SUB01@7', 'SUB01@7', 'SUB01@7'], 'subset: compound assignment');
  eq(sub(wrap('int x = 1 > 0 ? 1 : 2;')), ['SUB02@6'], 'subset: ternary');
  eq(sub(wrap('switch (1) { case 1: break; }')).sort(), ['SUB03@6', 'SUB05@6'], 'subset: switch+break');
  eq(sub(wrap('do { } while (false);')), ['SUB04@6'], 'subset: do');
  eq(sub(wrap('while (true) { continue; }')), ['SUB06@6'], 'subset: continue');
  eq(sub(wrap('int a = 1; Console.WriteLine($"{a}");')), ['SUB07@6'], 'subset: interpolation');
  eq(sub(wrap('var x = 5;')), ['SUB08@6'], 'subset: var');
  eq(sub(wrap('int x = Convert.ToInt32("5");')), ['SUB09@6'], 'subset: Convert');
  eq(sub(wrap('bool b = "a".Equals("b");')), ['SUB10@6'], 'subset: Equals');
  eq(sub(wrap('goto end;')), ['SUB11@6'], 'subset: goto');
  eq(sub(wrap('string s = "a ? b += c switch do break continue $\\" var Convert. .Equals(";\n// x += 1 ? : switch\n/* do break\n continue */')), [], 'subset: strings and comments ignored');
  eq(sub(wrap('int var = 1;')), [], 'subset: var as identifier is not flagged');
  ok(/לא נלמד/.test(CSRun.checkSubset(wrap('int x = 1 > 0 ? 1 : 2;'))[0].message), 'subset message is Hebrew');
  // non-course constructs still run
  r = await CSRun.run(wrap('int x = 5; x += 3; var y = x > 7 ? "big" : "small"; Console.WriteLine(y + x); switch (x) { case 8: Console.WriteLine("eight"); break; default: break; }'), {});
  ok(r.status === 'ok' && r.stdout === 'big8\neight\n' && r.warnings.length >= 4, 'subset constructs run and warn', r.stdout + JSON.stringify(r.errors));

  // ---- unsupported constructs give a clean error
  c = CSRun.compile(wrap('int[] a = new int[3];'));
  ok(!c.ok && c.errors[0].code === 'SUB90', 'arrays -> SUB90', JSON.stringify(c.errors));

  // ---- never throws
  const weird = [null, undefined, '', ' ', '{', '}', '"', "'", '/*', '\u0000', 'class', 'class Program', 'class Program {', 'static void Main() { }', 'using', 'using System;;;', '$"{', 'int x = ;', wrap('Console.WriteLine($"{"'), wrap('int x = (((((((('), wrap('Console.WriteLine(1 +'), '@"abc', 'namespace', 'namespace A {', wrap('for (;;'), wrap('x.y.z.w()'), wrap('Console.WriteLine("{0:F2}", )')];
  let thrown = 0, internal = 0;
  for (const w of weird) {
    try {
      const a = CSRun.compile(w); const b = await CSRun.run(w, { input: [] }); await CSRun.runTests(w, [{ name: 'a', input: [], expected: [] }]); CSRun.checkSubset(w);
      if ([].concat(a.errors, b.errors).some(e => e.code === 'INTERNAL')) internal++;
    } catch (e) { thrown++; console.log('THROWN for', JSON.stringify(w), e); }
  }
  eq([thrown, internal], [0, 0], 'weird inputs never throw / no internal errors');

  // ---- performance
  let t = Date.now();
  r = await CSRun.run(wrap('int s = 0;\nfor (int i = 0; i < 30000; i++) { s = s + i % 7; if (s > 100000) { s = 0; } }\nConsole.WriteLine(s);'), {});
  const dt = Date.now() - t;
  ok(r.status === 'ok' && dt < 1000, '100k steps well under 1s', dt + 'ms steps=' + r.steps);
  t = Date.now();
  r = await CSRun.run('using System;\nclass Program\n{\n    static int Fib(int n) { if (n < 2) return n; return Fib(n - 1) + Fib(n - 2); }\n    static void Main() { Console.WriteLine(Fib(22)); }\n}\n', {});
  ok(r.stdout === '17711\n' && Date.now() - t < 1500, 'fib(22) fast', (Date.now() - t) + 'ms');

  // ---- fuzz: truncated corpus programs
  const dir = path.join(__dirname, 'diff');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.cs'));
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let fz = 0, fzBad = 0, fzNoErr = 0, fzInternal = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (let k = 0; k < 6; k++) {
      const cut = Math.floor(rnd() * src.length);
      const piece = src.slice(0, cut);
      fz++;
      try {
        const res = await CSRun.run(piece, { input: ['1', '2', '3'], maxSteps: 20000 });
        if (res.errors.some(e => e.code === 'INTERNAL')) { fzInternal++; console.log('INTERNAL for cut', f, cut); }
        // a truncated program (cut inside Main or a method) normally cannot compile; if it does it must at least not crash
        if (res.status !== 'compile_error') fzNoErr++;
      } catch (e) { fzBad++; console.log('FUZZ THROWN', f, cut, e); }
    }
  }
  ok(fzBad === 0 && fzInternal === 0, 'fuzz: ' + fz + ' truncated programs never throw nor hit internal errors', fzBad + ' thrown, ' + fzInternal + ' internal');
  console.log(`fuzz: ${fz} truncations, ${fz - fzNoErr} gave compile errors, ${fzNoErr} still compiled (cut at a harmless place)`);

  console.log(`\n${passed} passed, ${failed} failed`);
  for (const f of failures) console.log('FAIL: ' + f);
  process.exit(failed ? 1 : 0);
})();
