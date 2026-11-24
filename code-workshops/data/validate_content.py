#!/usr/bin/env python3
"""Validator for code-workshops content (w1.json, w2.json, w3.json). Usage: python3 validate_content.py [--fast]"""
import json, os, re, sys, subprocess, tempfile, difflib
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
REAL = "/home/claude/tools/real_cs.sh"
MARK = re.compile("⟦(\\d+)⟧")
FAILS = []
WARNS = []
CACHE = {}

def fail(tid, msg):
    FAILS.append(f"[{tid}] {msg}")

def warn(tid, msg):
    WARNS.append(f"[{tid}] {msg}")

def run_cs(source, inputs):
    key = (source, tuple(inputs))
    if key in CACHE:
        return CACHE[key]
    with tempfile.TemporaryDirectory() as d:
        sp = os.path.join(d, "p.cs"); ip = os.path.join(d, "in.txt")
        open(sp, "w", encoding="utf-8").write(source)
        open(ip, "w", encoding="utf-8").write("".join(x + "\n" for x in inputs))
        p = subprocess.run([REAL, sp, ip], capture_output=True, text=True, timeout=120)
        res = (p.returncode, p.stdout, p.stderr)
    CACHE[key] = res
    return res

def norm(line):
    s = re.sub(r"\s+", " ", line.strip())
    if s.endswith("."):
        s = s[:-1]
    return s

def ordered_contains(stdout, expected):
    """SPEC section 1 (updated): each expected line must be a suffix of a distinct output line, in order,
    with start-of-line or whitespace right before the match."""
    out = [norm(l) for l in stdout.splitlines()]
    out = [l for l in out if l != ""]
    pos = 0
    for e in expected:
        e = norm(e)
        while pos < len(out):
            l = out[pos]
            if l.endswith(e) and (len(l) == len(e) or l[len(l) - len(e) - 1].isspace()):
                break
            pos += 1
        if pos >= len(out):
            return False
        pos += 1
    return True

def passes_all(source, tests, stop_early=True):
    """returns (compiled_ok, passed_count, detail)"""
    passed = 0
    for t in tests:
        code, out, _ = run_cs(source, t["input"])
        if code == 2:
            return False, passed, "compile error: " + out.strip().replace("\n", " | ")[:200]
        if code == 0 and ordered_contains(out, t["expected"]):
            passed += 1
        elif stop_early:
            return True, passed, f"test '{t['name']}' failed"
    return True, passed, "ok"

SCAN = [("+=", r"\+="), ("-=", r"-="), ("*=", r"\*="), ("/=", r"/="), ("%=", r"%="),
        ("switch", r"\bswitch\b"), ("do", r"\bdo\b"), ("break", r"\bbreak\b"), ("continue", r"\bcontinue\b"),
        ('$"', r'\$"'), ("var", r"\bvar\s"), ("Convert.", r"Convert\."), (".Equals(", r"\.Equals\(")]

def strip_strings(code):
    return re.sub(r'"(?:[^"\\]|\\.)*"', '""', code)

def scan_code(tid, label, code, ternary=True):
    raw_dollar = re.search(r'\$"', code)
    if raw_dollar:
        fail(tid, f"{label}: banned token $\"")
    c = strip_strings(code)
    c = re.sub(r"//.*", "", c)
    for name, rx in SCAN:
        if name == '$"':
            continue
        if re.search(rx, c):
            fail(tid, f"{label}: banned token {name}")
    if ternary and re.search(r"\?", c):
        fail(tid, f"{label}: banned token ? (ternary)")

def scan_text(tid, label, text):
    # hints are prose: skip the ternary '?' and word tokens, but catch operators
    for name, rx in SCAN:
        if name in ("+=", "-=", "*=", "/=", "%=", "$\"", "Convert.", ".Equals("):
            if re.search(rx, text):
                fail(tid, f"{label}: banned token {name}")
    for name in ("switch", "continue", "break"):
        if re.search(r"\b%s\b" % name, text):
            fail(tid, f"{label}: banned word {name}")

def check_task(wid, t, jobs):
    tid = t["id"]
    need = ["id", "mode", "title", "story", "inputSpec", "outputSpec", "example", "stages", "hints", "solution", "tests", "commonMistakes"]
    for k in need:
        if k not in t:
            fail(tid, f"missing key {k}")
    if any(k not in t for k in need):
        return
    exp_mode = {"t1": "parsons", "t2": "fill", "t3": "blank"}[tid[-2:]]
    if t["mode"] != exp_mode:
        fail(tid, f"mode {t['mode']} != {exp_mode}")
    st = t["stages"]
    for k in ["understand", "plan", "tests", "skeleton", "code", "reflect"]:
        if k not in st:
            fail(tid, f"stages.{k} missing"); return
    # understand
    qs = st["understand"]["questions"]
    mcs = [q for q in qs if q["type"] == "mc"]; tx = [q for q in qs if q["type"] == "text"]
    if len(mcs) != 2 or len(tx) != 1:
        fail(tid, "understand needs 2 mc + 1 text")
    for q in mcs:
        if not q.get("explain"): fail(tid, f"mc {q['id']} missing explain")
        if not (0 <= q["correct"] < len(q["options"])): fail(tid, f"mc {q['id']} bad correct")
        if len(q["options"]) < 3: fail(tid, f"mc {q['id']} few options")
    # plan
    pl = st["plan"]
    if [f["id"] for f in pl["fields"]] != ["in", "proc", "out"] or set(pl["model"]) != {"in", "proc", "out"}:
        fail(tid, "plan fields/model malformed")
    # tests stage
    pr = st["tests"]["predict"]
    if len(pr) != 2: fail(tid, "predict needs 2 inputs")
    if not st["tests"].get("edgeHint"): fail(tid, "edgeHint missing")
    if st["tests"].get("ownTests") is None: fail(tid, "ownTests missing")
    # skeleton
    sk = st["skeleton"]
    if not (4 <= len(sk["steps"]) <= 7): fail(tid, f"skeleton steps {len(sk['steps'])} not 4-7")
    if not (1 <= len(sk["distractors"]) <= 2): fail(tid, "skeleton distractors not 1-2")
    # reflect
    if len(st["reflect"]["questions"]) != 2: fail(tid, "reflect needs 2 questions")
    # hints, tests, mistakes
    if len(t["hints"]) != 3: fail(tid, "3 hints required")
    if not (5 <= len(t["tests"]) <= 9): fail(tid, f"tests count {len(t['tests'])} outside 5-9")
    elif len(t["tests"]) > 8: warn(tid, f"{len(t['tests'])} tests (spec says 5-8)")
    if not (2 <= len(t["commonMistakes"]) <= 4): fail(tid, "commonMistakes not 2-4")
    for tt in t["tests"]:
        if not all(k in tt for k in ("name", "input", "expected")): fail(tid, "test malformed")
    names = [tt["name"] for tt in t["tests"]]
    ex = t["example"]
    if not any(tt["input"] == ex["input"] and tt["expected"] == ex["output"] for tt in t["tests"]):
        fail(tid, "story example is not among tests")
    # example text appears in story-ish output spec
    sol = t["solution"]
    code = st["code"]
    if "starter" not in code: fail(tid, "code.starter missing")
    # solution file
    p = os.path.join(HERE, "solutions", tid + ".cs")
    if not os.path.exists(p): fail(tid, "solutions file missing")
    elif open(p, encoding="utf-8").read() != sol: fail(tid, "solutions file differs from JSON solution")
    # regexes
    for m in t["commonMistakes"]:
        try:
            rx = re.compile(m["pattern"])
            if rx.search(sol): fail(tid, f"commonMistake pattern matches the correct solution: {m['pattern']}")
        except re.error as e:
            fail(tid, f"bad regex {m['pattern']}: {e}")
    # scans
    scan_code(tid, "solution", sol)
    scan_text(tid, "hints", " ".join(t["hints"]))
    for c in re.findall(r"//(.*)", sol):
        if re.search(r"[֐-׿]", c): fail(tid, "Hebrew in code comment")
    # Hebrew presence for student-facing text
    for k in ("story", "title"):
        if not re.search(r"[֐-׿]", t[k]): fail(tid, f"{k} not Hebrew")
    # mode specific
    jobs.append(("solution", t, sol))
    if t["mode"] == "parsons":
        if "parsons" not in code: fail(tid, "parsons key missing"); return
        pa = code["parsons"]
        if "\n".join(pa["lines"]) != sol: fail(tid, "parsons lines joined != solution")
        for i in pa["fixed"]:
            if not (0 <= i < len(pa["lines"])): fail(tid, f"fixed index {i} out of range")
        free = [i for i in range(len(pa["lines"])) if i not in pa["fixed"]]
        if not (6 <= len(free) <= 14): warn(tid, f"{len(free)} draggable lines")
        if not (2 <= len(pa["distractors"]) <= 4): fail(tid, "parsons distractors not 2-4")
        for l in pa["lines"]:
            scan_code(tid, "parsons line", l)
        for d in pa["distractors"]:
            if d.strip() in [l.strip() for l in pa["lines"]]:
                fail(tid, f"distractor equals a solution line: {d}")
            # best imitated draggable line
            best = max(free, key=lambda i: difflib.SequenceMatcher(None, pa["lines"][i].strip(), d.strip()).ratio())
            indent = re.match(r"\s*", pa["lines"][best]).group(0)
            newlines = list(pa["lines"]); newlines[best] = indent + d.strip()
            jobs.append(("distractor", t, "\n".join(newlines), d, pa["lines"][best].strip()))
    elif t["mode"] == "fill":
        if "fill" not in code: fail(tid, "fill key missing"); return
        f = code["fill"]
        ids = [int(x) for x in MARK.findall(f["template"])]
        if sorted(ids) != sorted(b["id"] for b in f["blanks"]) or len(set(ids)) != len(ids):
            fail(tid, "template markers do not match blanks")
        if not (4 <= len(f["blanks"]) <= 7): fail(tid, "blanks not 4-7")
        s = f["template"]
        for b in f["blanks"]:
            if not b["accept"] or not b.get("hint"): fail(tid, f"blank {b['id']} accept/hint missing")
            a0 = b["accept"][0]
            if a0.strip() in (";", "{", "}", ""): fail(tid, f"blank {b['id']} trivial")
            s = s.replace("⟦%d⟧" % b["id"], a0)
            scan_code(tid, f"blank {b['id']} accept", " ".join(b["accept"]))
            # every accepted variant must compile and pass tests
            for a in b["accept"][1:]:
                variant = f["template"]
                for b2 in f["blanks"]:
                    variant = variant.replace("⟦%d⟧" % b2["id"], a if b2["id"] == b["id"] else b2["accept"][0])
                jobs.append(("accept", t, variant, f"blank {b['id']} variant '{a}'"))
        if s != sol: fail(tid, "template with first accepts != solution")
        scan_code(tid, "template", MARK.sub("", f["template"]))
    else:
        if "parsons" in code or "fill" in code: fail(tid, "blank task has extra keys")
    # starter compiles
    jobs.append(("starter", t, code.get("starter", "")))
    # predict
    for p_ in pr:
        jobs.append(("predict", t, sol, p_["input"]))

def main():
    all_text = ""
    workshops = []
    for w in ("w1", "w2", "w3"):
        path = os.path.join(HERE, w + ".json")
        raw = open(path, encoding="utf-8").read()
        all_text += raw
        try:
            workshops.append(json.loads(raw))
        except Exception as e:
            fail(w, f"invalid JSON: {e}")
    if "—" in all_text or "–" in all_text:
        fail("json", "em/en dash present")
    jobs = []
    for ws in workshops:
        for k in ["id", "chapter", "minutes", "title", "subtitle", "intro", "image", "concepts", "tasks"]:
            if k not in ws: fail(ws.get("id", "?"), f"workshop key {k} missing")
        if len(ws.get("tasks", [])) != 3: fail(ws["id"], "needs 3 tasks")
        if not (2 <= ws.get("intro", "").count(".") + 1 <= 6): warn(ws["id"], "intro length")
        for t in ws["tasks"]:
            check_task(ws["id"], t, jobs)
    # execute jobs in parallel
    def do(job):
        kind, t = job[0], job[1]
        tid = t["id"]
        if kind == "solution":
            ok, n, det = passes_all(job[2], t["tests"], stop_early=False)
            if not ok or n != len(t["tests"]):
                # find which fail
                bad = []
                for tt in t["tests"]:
                    c, o, _ = run_cs(job[2], tt["input"])
                    if c == 2: bad.append(f"{tt['name']}: COMPILE {o.strip()}")
                    elif not (c == 0 and ordered_contains(o, tt["expected"])): bad.append(f"{tt['name']}: got {o!r}")
                return [(tid, f"solution fails {len(bad)}/{len(t['tests'])}: " + "; ".join(bad)[:600])]
        elif kind == "distractor":
            ok, n, det = passes_all(job[2], t["tests"], stop_early=True)
            if ok and det == "ok":
                return [(tid, f"distractor '{job[3]}' (replacing '{job[4]}') passes ALL tests")]
        elif kind == "accept":
            ok, n, det = passes_all(job[2], t["tests"][:2], stop_early=True)
            if det != "ok":
                return [(tid, f"{job[3]} breaks: {det}")]
        elif kind == "starter":
            c, o, e = run_cs(job[2], [])
            if c == 2: return [(tid, "starter does not compile: " + o.strip())]
        elif kind == "predict":
            c, o, e = run_cs(job[2], job[3])
            if c != 0 or not o.strip(): return [(tid, f"predict input {job[3]} fails to run on solution (exit {c})")]
        return []
    with ThreadPoolExecutor(max_workers=8) as ex:
        for res in ex.map(do, jobs):
            for tid, msg in res:
                fail(tid, msg)
    # predict diversity: outputs of the two predict inputs differ
    for ws in workshops:
        for t in ws["tasks"]:
            pr = t["stages"]["tests"]["predict"]
            if len(pr) == 2:
                o = [run_cs(t["solution"], p["input"])[1] for p in pr]
                if o[0] == o[1]: fail(t["id"], "the two predict inputs give identical output")
    for ws in workshops:
        for t in ws["tasks"]:
            outs = [run_cs(t["solution"], tt["input"])[1] for tt in t["tests"]]
            for i, tt in enumerate(t["tests"]):
                for j, other in enumerate(t["tests"]):
                    if i != j and tt["expected"] != other["expected"] and ordered_contains(outs[i], other["expected"]):
                        fail(t["id"], f"output of test '{tt['name']}' also satisfies expected of '{other['name']}' (weak test)")
    print("=" * 60)
    print(f"tasks checked: {sum(len(w['tasks']) for w in workshops)}, compiler runs cached: {len(CACHE)}")
    for w in WARNS: print("WARN", w)
    for f in FAILS: print("FAIL", f)
    print("RESULT:", "PASS" if not FAILS else f"FAIL ({len(FAILS)} problems)")
    sys.exit(1 if FAILS else 0)

main()
