/* Unit tests for js/order.js + a sanity check of the constraints stored in data/w*.json.   node tests/order.test.js */
const fs = require('fs'), path = require('path');
const O = require('../js/order.js');
let fails = 0; const ok = (n, c, x) => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  -> ' + x : '')); } else console.log('PASS ' + n); };
const T = {};
for (const w of ['w1', 'w2', 'w3']) for (const t of JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', w + '.json'), 'utf8')).tasks) T[t.id] = t.stages.skeleton;
const chk = (id, order) => O.check(order, T[id].steps.length, T[id].deps, T[id].together);

for (const id of Object.keys(T)) {
  const n = T[id].steps.length, errs = O.validate(n, T[id].deps, T[id].together);
  ok(id + ' constraints are valid', errs.length === 0, errs.join('; '));
  ok(id + ' reference order accepted', chk(id, [...Array(n).keys()]).ok);
  ok(id + ' missing step rejected', !chk(id, [...Array(n - 1).keys()]).ok);
}
// w1t1: the two calculations may be swapped; printing may follow its own calculation
ok('w1t1 swapped calculations accepted', chk('w1t1', [0, 1, 3, 2, 4, 5]).ok);
ok('w1t1 calc-print-calc-print accepted', chk('w1t1', [0, 1, 2, 4, 3, 5]).ok);
ok('w1t1 inputs in the wrong order rejected', !chk('w1t1', [1, 0, 2, 3, 4, 5]).ok);
ok('w1t1 calculation before input rejected', !chk('w1t1', [0, 2, 1, 3, 4, 5]).ok);
ok('w1t1 print before its calculation rejected', !chk('w1t1', [0, 1, 4, 2, 3, 5]).ok);
ok('w1t1 outputs in the wrong order rejected', !chk('w1t1', [0, 1, 2, 3, 5, 4]).ok);
ok('w1t1 only the misplaced step is flagged', JSON.stringify(chk('w1t1', [0, 2, 1, 3, 4, 5]).bad) === '[2]');
// w1t2: three methods in any order, before or after Main, but not in the middle of Main
ok('w1t2 methods in another order accepted', chk('w1t2', [2, 0, 1, 3, 4]).ok);
ok('w1t2 Main first accepted', chk('w1t2', [3, 4, 0, 1, 2]).ok);
ok('w1t2 method in the middle of Main rejected', !chk('w1t2', [0, 1, 3, 2, 4]).ok);
ok('w1t2 print before read rejected', !chk('w1t2', [0, 1, 2, 4, 3]).ok);
// w1t3: Total() before or after Main; the chain inside Main is fixed
ok('w1t3 method after Main accepted', chk('w1t3', [1, 2, 3, 4, 5, 0]).ok);
ok('w1t3 change before total rejected', !chk('w1t3', [0, 1, 3, 2, 4, 5]).ok);
// w2t2: the two boolean calculations may be swapped
ok('w2t2 swapped calculations accepted', chk('w2t2', [0, 2, 1, 3, 4]).ok);
ok('w2t2 decision before calculations rejected', !chk('w2t2', [0, 1, 3, 2, 4]).ok);
// strict tasks stay strict
ok('w2t1 is strict', !T.w2t1.deps && !chk('w2t1', [0, 3, 4, 5, 1, 2]).ok);
ok('w2t3 is strict', !T.w2t3.deps && !chk('w2t3', [0, 2, 1, 3, 4]).ok);
// w3t1: method block and Main block in either order, each block intact
ok('w3t1 Main block first accepted', chk('w3t1', [4, 5, 0, 1, 2, 3]).ok);
ok('w3t1 400/100 checks swapped rejected', !chk('w3t1', [0, 2, 1, 3, 4, 5]).ok);
ok('w3t1 Main step inside the method rejected', !chk('w3t1', [0, 1, 4, 2, 3, 5]).ok);
ok('w3t3 method after Main accepted', chk('w3t3', [1, 2, 3, 4, 5, 0]).ok);
ok('w3t3 sensor check after dryness check rejected', !chk('w3t3', [0, 1, 3, 2, 4, 5]).ok);
console.log(fails ? '\n' + fails + ' FAILED' : '\nALL OK'); process.exit(fails ? 1 : 0);
