/* Order checking for the "skeleton" stage (algorithm steps).
 * A step list is correct when every real step is present, no distractor is included, and the order respects the
 * task's constraints - NOT only when it equals the one order the content author happened to write.
 *
 *   deps:     { "3": [0, 1] }      step 3 must come after steps 0 and 1 (indices into skeleton.steps)
 *   together: [[1, 2, 3]]          these steps must be adjacent (one contiguous run), in any order allowed by deps
 *
 * With no deps and no together the original strict order is required (step i at position i).
 * UMD: window.CWOrder in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CWOrder = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* order: array of step indices in the student's order (real steps only).
   * returns { ok, bad: [stepIndex...], reason } - bad lists the steps that sit in a wrong place. */
  function check(order, n, deps, together) {
    var bad = {}, i;
    var strict = !deps && !together;
    var pos = {};
    order.forEach(function (s, p) { pos[s] = p; });
    var complete = order.length === n;
    for (i = 0; i < n; i++) if (pos[i] == null) complete = false;

    if (strict) {
      order.forEach(function (s, p) { if (s !== p) bad[s] = true; });
    } else {
      // precedence: a step is misplaced when one of the steps it needs comes after it
      Object.keys(deps || {}).forEach(function (k) {
        var s = +k;
        (deps[k] || []).forEach(function (d) {
          if (pos[s] != null && pos[d] != null && pos[d] > pos[s]) bad[s] = true;
        });
      });
      // adjacency: the members of a group must form one run; outsiders standing inside the run are flagged
      (together || []).forEach(function (g) {
        var ps = g.map(function (s) { return pos[s]; }).filter(function (p) { return p != null; });
        if (ps.length < 2) return;
        var lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps);
        if (hi - lo + 1 !== ps.length) {
          for (var p = lo; p <= hi; p++) if (g.indexOf(order[p]) < 0) bad[order[p]] = true;
        }
      });
    }
    var list = Object.keys(bad).map(Number);
    return { ok: complete && list.length === 0, bad: list, complete: complete };
  }

  /* Sanity check of a task's constraints: the author's own order must satisfy them, and indices must be valid. */
  function validate(n, deps, together) {
    var errs = [];
    Object.keys(deps || {}).forEach(function (k) {
      var s = +k;
      if (!(s >= 0 && s < n)) errs.push('deps key out of range: ' + k);
      (deps[k] || []).forEach(function (d) {
        if (!(d >= 0 && d < n)) errs.push('dep out of range: ' + k + ' -> ' + d);
        if (d >= s) errs.push('dep must point to an earlier step: ' + k + ' -> ' + d);
      });
    });
    (together || []).forEach(function (g) {
      g.forEach(function (s) { if (!(s >= 0 && s < n)) errs.push('together index out of range: ' + s); });
    });
    var base = []; for (var i = 0; i < n; i++) base.push(i);
    if (!check(base, n, deps, together).ok) errs.push('the reference order violates its own constraints');
    return errs;
  }

  return { check: check, validate: validate };
});
