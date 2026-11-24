# Code-writing workshops (סדנאות כתיבת קוד) - shared spec v1

Audience: grade-10 computer science students (Hebrew speakers, ages 15-16) at Maaleh Shacharut school, Israel.
Language taught: **C#**, console programs with `static void Main()` inside `class Program`.
Chapters covered: Chapter 2 (variables, types int/double/string/bool, expressions, / and % on ints,
casts, Math, Random, Console input/output, static methods with parameters and return values) and
Chapter 3 (conditional execution: comparisons, if / if-else / else-if chains, &&, ||, !, nesting up to
3 levels, methods that return bool).

Hosting: GitHub Pages, repo `victorchina-ops/cs-activities`, folder `code-workshops/`
(URL `https://victorchina-ops.github.io/cs-activities/code-workshops/`). Plain static files, no build step.
Data: every student action is POSTed to a Google Apps Script web app that writes to a Google Sheet.

## 0. Official sub-language rules (Israeli MoE curriculum v2.63, appendix 4) - MUST be respected in all content

- Allowed: `int double bool string char`, `=`, `++`/`--`, arithmetic `+ - * / %`, comparisons, `&& || !`,
  `if`, `if-else`, `else if` chains, `return`, `static` methods with parameters, `Console.Write`,
  `Console.WriteLine`, `Console.ReadLine`, `int.Parse`, `double.Parse`, casts `(int)` `(double)`,
  `Math.Abs Max Min Pow Round Sqrt`, `Random rnd = new Random(); rnd.Next(a, b)`, string concatenation with `+`,
  string `.Length`. (`while`/`for` exist in the language subset but are NOT taught yet - chapter 4.)
- NOT allowed in any content (solutions, templates, hints): `+=` `-=` `*=` `/=` `%=`, the `?:` operator,
  `switch`, `do-while`, `break`, `continue`, string interpolation `$"..."`, `var`, `Equals`, LINQ, properties,
  top-level statements (always `class Program` + `static void Main()`), `Convert.*` (use `int.Parse`).
- Code comments `//` in English. All strings shown to the student (prompts, output) in Hebrew.
- Use a plain hyphen "-" never an em dash in any text.

## 1. Interpreter: `js/csrun.js` (agent: interpreter)

Plain ES2020, no dependencies, UMD: sets `window.CSRun` in the browser and `module.exports` in Node.

```js
CSRun.compile(source) -> { ok: boolean, errors: CSError[] , warnings: CSError[] }
// CSError = { line: number (1-based), col: number, code: "CS1002" | "SUB01" | ..., message: string (Hebrew), kind: "compile" | "runtime" | "subset" }

CSRun.run(source, options) -> Promise<RunResult>
// options: {
//   input: string[]                                  // pre-fed lines for Console.ReadLine (tests)
//     OR onInput: async () => string                 // interactive console; resolve with the typed line
//   onOutput?: (text) => void,                        // streamed stdout chunks
//   maxSteps?: number (default 2_000_000), maxDepth?: number (default 256),
//   trace?: boolean,                                  // collect a step trace (see below), cap 3000 entries
//   randomValues?: number[]                           // deterministic rnd.Next results for tests (consumed in order; if exhausted use Math.random)
// }
// RunResult = { status: "ok" | "compile_error" | "runtime_error" | "timeout" | "input_exhausted",
//               stdout: string, errors: CSError[], warnings: CSError[], steps: number,
//               trace?: TraceEntry[] }
// TraceEntry = { line, method, depth, vars: { [name]: string /* displayed like C# would print */ }, output?: string /* stdout produced by this step */ }

CSRun.runTests(source, tests) -> Promise<TestResult[]>
// tests: [{ name, input: string[], expected: string[], match?: "ordered-contains" (default) | "exact-lines", randomValues?: number[] }]
// TestResult = { name, pass: boolean, stdout, expected, status, errors, missing?: string /* first expected line not found */ }

CSRun.checkSubset(source) -> CSError[]   // kind "subset", code "SUB01".. : +=, -=, *=, /=, %=, ?:, switch, do, break, continue, $"", var, Convert., Equals( ...
```

Matching rule `ordered-contains` (default; name kept for compatibility): normalise stdout and expected (trim each line, collapse runs of
spaces, remove a trailing ".") then every expected line must be a SUFFIX of a distinct output line, in order, and the character
just before the matched suffix must be the start of the line or whitespace. This lets students print any input prompts they like
(also with Console.Write on the same line) while "קבוצות מלאות: 14" does not match "קבוצות מלאות: 1" and "אי-זוגי" does not match "זוגי".
Exported as `CSRun.matchOutput(stdout, expectedLines, mode) -> { pass, missing }` (the UI must use it). `exact-lines`: line-by-line equality after normalisation, ignoring empty lines.

### Semantics that must match real .NET 10 exactly
- `int` is 32-bit with wrap-around on overflow (unchecked). Integer `/` truncates toward zero; `%` takes the sign of the dividend.
  Int division by zero -> runtime `DivideByZeroException`. Double division by zero -> `∞` / `-∞` / `NaN` (printed as .NET prints them).
- Implicit int -> double widening is allowed; double -> int needs a cast, else compile error CS0266. `(int)3.9` -> 3, `(int)-3.9` -> -3.
- Double to string uses .NET Core 3.0+ shortest round-trip formatting. VERIFIED with dotnet 10: `0.1+0.2` -> `0.30000000000000004`,
  `7/2.0` -> `3.5`, `5.0` -> `5`, `1e15` -> `1000000000000000`, `1e16` -> `10000000000000000`, `123456789012345678.0` -> `1.2345678901234568E+17`,
  `0.0001` -> `0.0001`, `0.00001` -> `1E-05`, `1.0/0` -> `Infinity` (invariant culture), `2.0/3` -> `0.6666666666666666`.
  **Source of truth: the real compiler.** `/home/claude/tools/real_cs.sh <file.cs> [input_file]` builds and runs a program with .NET 10
  (about 2 s per program; prints stdout, or `line L col C: error CSxxxx: ...` lines and exit code 2 on compile errors). Derive edge-case rules from it.
- bool prints `True` / `False`. char prints the character. string + number concatenation uses the same formatting.
- `Math.Abs/Max/Min` keep int when all args are int, else double. `Math.Pow`, `Math.Sqrt` return double.
  `Math.Round(x)` and `Math.Round(x, digits)` use banker's rounding (MidpointRounding.ToEven) and return double.
- `int.Parse(s)` trims whitespace; non-integer text (e.g. "3.5", "abc", "") -> runtime `FormatException`; out of range -> `OverflowException`.
  `double.Parse` accepts "3.5", "-2", " 4 ". `Console.ReadLine()` returns string; when the pre-fed input is exhausted -> status "input_exhausted".
- `rnd.Next(a, b)` returns a..b-1; `rnd.Next(n)` returns 0..n-1.
- `Console.WriteLine()` with no args prints an empty line. Composite format `Console.WriteLine("{0} + {1}", a, b)` supported (incl. `{0:F2}`).
- Short-circuit `&&` `||`. `==` on strings compares values.
- Method calls: static methods in class Program, parameters by value, recursion allowed (depth limit -> runtime "StackOverflow").
- Also support `while` and `for` loops (for later chapters) with the step budget (-> status "timeout").

### Compile errors (Hebrew message + C# code), must catch at least:
CS1002 missing `;` | CS1513 missing `}` | CS1026 missing `)` | CS1010 unterminated string | CS0103 name does not exist (incl. `console.WriteLine`, typo vars) |
CS0246 unknown type (`Int`, `String` is OK - it is an alias, `integer`) | CS0128 duplicate local | CS0165 use of unassigned local |
CS0029 cannot implicitly convert (`int x = Console.ReadLine();` -> suggest int.Parse; `if (x = 5)` -> int to bool) |
CS0266 double to int without cast | CS0019 operator cannot be applied (e.g. string - int, bool && int) | CS1501/CS7036 wrong number of arguments |
CS1503 argument type mismatch | CS0161 not all code paths return a value | CS0127/CS0126 return value mismatch with void / missing value |
CS0120 calling a non-static method from static Main | CS0117 `Math.Foo` does not exist | CS0201 expression is not a statement (e.g. `x + 1;`) |
CS0136/CS0128 variable declared twice | CS5001 no `static void Main`.
Hebrew message style: `שורה 5: חסר ; בסוף ההוראה (CS1002)`. Messages short, student-friendly, with a hint when obvious.
Runtime errors: `שורה 7: חלוקה באפס (DivideByZeroException)`, `שורה 3: הקלט "abc" אינו מספר שלם (FormatException)`.

## 2. Workshop content: `data/w1.json`, `data/w2.json`, `data/w3.json` (agent: content)

```jsonc
{
  "id": "w1", "chapter": 2, "minutes": 90,
  "title": "סדנה 1 - קלט, חישוב ופלט",
  "subtitle": "...", "intro": "... (2-3 sentences, Hebrew)",
  "image": "img/w1.webp",
  "concepts": ["...", "..."],
  "tasks": [
    {
      "id": "w1t1", "mode": "parsons" | "fill" | "blank",
      "title": "...", "story": "problem statement in Hebrew, 3-6 sentences, states EXACT output lines required",
      "inputSpec": ["line 1: ...", "line 2: ..."], "outputSpec": ["קבוצות מלאות: <מספר>", "..."],
      "example": { "input": ["23", "5"], "output": ["קבוצות מלאות: 4", "נשארים: 3"] },
      "stages": {
        "understand": { "questions": [ { "id": "u1", "type": "mc", "prompt": "...", "options": ["..","..",".."], "correct": 0, "explain": "..." },
                                        { "id": "u2", "type": "text", "prompt": "הסבירו במילים שלכם מה התוכנית צריכה לעשות", "minChars": 15 } ] },
        "plan": { "fields": [ { "id": "in", "label": "קלט - אילו משתנים ומאיזה טיפוס?", "placeholder": "..." },
                              { "id": "proc", "label": "עיבוד - אילו חישובים / תנאים?", "placeholder": "..." },
                              { "id": "out", "label": "פלט - מה מודפס?", "placeholder": "..." } ],
                  "model": { "in": "...", "proc": "...", "out": "..." } },
        "tests": { "predict": [ { "input": ["30","4"] }, { "input": ["12","12"] } ],   // student predicts output; the app computes the truth by running the solution
                   "ownTests": 1, "edgeHint": "נסו מקרה קצה: ..." },
        "skeleton": { "prompt": "סדרו את שלבי האלגוריתם", "steps": ["...", "...", "..."], "distractors": ["..."] },  // correct order; app shuffles
        "code": {
           // parsons: correct full program lines in order (with indentation spaces), plus distractor lines that must NOT be used
           "parsons": { "lines": ["using System;", "class Program", "{", "    static void Main()", "    {", "...", "    }", "}"], "fixed": [0,1,2,3,4], "distractors": ["..."] },
           // fill: template with ⟦1⟧ ⟦2⟧ markers; blanks[i].accept = list of accepted answers (whitespace-insensitive); code is then RUN with tests anyway
           "fill": { "template": "...", "blanks": [ { "id": 1, "accept": ["students / size", "students/size"], "hint": "..." } ] },
           // blank: starter code (class + empty Main and maybe empty method headers if the task says so)
           "starter": "using System;\n\nclass Program\n{\n    static void Main()\n    {\n        \n    }\n}\n"
        },
        "reflect": { "questions": [ { "id": "r1", "prompt": "...", "minChars": 15 }, { "id": "r2", "prompt": "...", "minChars": 15 } ] }
      },
      "hints": ["hint 1 (gentle)", "hint 2 (more specific)", "hint 3 (almost the code)"],
      "solution": "full C# program (reference solution, verified with real dotnet)",
      "tests": [ { "name": "דוגמה מהשאלה", "input": ["23","5"], "expected": ["קבוצות מלאות: 4", "נשארים: 3"] }, ... 5-7 tests incl. edge cases ],
      "commonMistakes": [ { "pattern": "regex on student code", "message": "Hebrew tip" } ]   // optional, shown after failing tests
    }
  ]
}
```

Fading support: task 1 of each workshop = `parsons`, task 2 = `fill`, task 3 = `blank` (only `code.starter`).
`code` holds only the key for its mode (plus `starter` always, used by "reset").

### The 9 tasks (approved by the teacher - do not change topics)
W1 (chapter 2: input -> processing -> output, methods)
 1. parsons - "קבוצות לטיול": input number of students and group size; print full groups (`/`) and students left over (`%`).
 2. fill - "שעון עצר": input total seconds; methods `static int GetHours(int sec)`, `GetMinutes`, `GetSeconds` (uses / and %); print 3 lines.
 3. blank - "הקיוסק": input sandwich price, sandwich count, drink price, drink count, money paid (all int, paid >= total);
    method `static int Total(int price, int count)`; print total, change, and how many 10-shekel coins + remainder in the change.
W2 (chapter 3: if/else, logical operators)
 1. parsons - "זוגי או אי-זוגי": input an int; print "זוגי"/"אי-זוגי" and on a second line "חיובי"/"שלילי"/"אפס".
    Distractor: `if (n % 2 == 1)` (fails for negative odd numbers - great teaching moment, include a negative odd test).
 2. fill - "קיר הטיפוס": input age, height (cm), withParent (1/0). Allowed if (age >= 12 && height >= 140) || (age >= 8 && height >= 120 && withParent == 1). Print "מותר לטפס" / "אסור לטפס".
 3. blank - "תעריף כניסה": input age. age < 0 or > 120 -> "גיל לא תקין"; < 3 -> 0; 3-17 -> 30; 18-64 -> 55; 65+ -> 25. Print "מחיר: <x>".
W3 (combined: nesting up to 3 levels, bool methods)
 1. parsons - "שנה מעוברת": `static bool IsLeapYear(int year)` (Gregorian rule), print "שנה מעוברת"/"שנה רגילה".
 2. fill - "מסננת שעה": input hour and minute; `static bool IsValidHour(int h)`, `static bool IsValidMinute(int m)`; invalid hour -> "שעה לא תקינה";
    else invalid minute -> "דקות לא תקינות"; else greeting by hour: 5-11 "בוקר טוב", 12-16 "צהריים טובים", 17-21 "ערב טוב", else "לילה טוב".
 3. blank - "בקר השקיה בחממה" (Arava greenhouse): input soil moisture % (int), temperature (int), hour (int).
    `static bool IsCoolHour(int hour)` true for 6-9 or 18-21. moisture < 0 or > 100 -> "חיישן תקול"; moisture < 30: cool hour -> (temp > 35 -> "השקיה ארוכה: 20 דקות", else "השקיה רגילה: 10 דקות"), not cool -> "יבש מאוד - להשקות בשעה קרירה";
    moisture 30-59 and temp > 35 -> "השקיה קצרה: 5 דקות"; otherwise "אין צורך בהשקיה".

## 3. Events sent to the backend (front-end -> Apps Script)

POST body (Content-Type `text/plain;charset=utf-8`, to avoid CORS preflight): `{ "key": CONFIG.APP_KEY, "events": [Event, ...] }`
```jsonc
Event = {
  "v": 1, "eventId": "uuid", "ts": "2026-11-25T08:15:00.000Z", "sessionId": "uuid per page load",
  "student": { "name": "דנה כהן", "phone": "0501234567" },
  "workshop": "w1", "task": "w1t1",            // "" for login
  "type": "login" | "stage_complete" | "run" | "test_run" | "hint" | "submit",
  "stage": "understand" | "plan" | "tests" | "skeleton" | "code" | "reflect" | "",
  "testsPassed": 3, "testsTotal": 6,           // for test_run / submit
  "hintsUsed": 1,
  "score": { "total": 87, "tests": 50, "planning": 22, "reflection": 15, "hintPenalty": 0 },  // submit only
  "code": "...",                               // run / test_run / submit / stage_complete(code)
  "payload": { ... }                           // stage answers, run status, errors, durationSec, etc.
}
```
Response: `{ "ok": true, "stored": n }` (duplicates by eventId ignored).
GET `?action=progress&name=..&phone=..` -> `{ ok, tasks: { "w1t1": { "lastStage": "...", "stageIndex": 3, "bestPassed": 4, "testsTotal": 6, "submitted": true, "score": 87, "code": "last code" } } }`
GET `?action=ping` -> `{ ok: true, version }`.

## 4. Scoring (computed in the browser, stored in the sheet; teacher approves)
total = tests (60 x bestPassed/testsTotal) + planning (25: understand 8 [mc correct on first try 3 each + text 2], plan 7, predictions 5 x fraction correct, skeleton 5 if correct (3 if correct after retry)) + reflection (15 split equally over answered questions with >= minChars) - hintPenalty (first hint free, then 3 per hint, max 9). Round to integer, clamp 0..100.

## 5. Front-end files (agent: UI)
`index.html`, `css/style.css`, `js/app.js`, `js/config.js` (`window.CW_CONFIG = { ENDPOINT: "", APP_KEY: "...", CLASS_LABEL: "...", VERSION: "1.0.0" }`).
Images (may be missing - must degrade gracefully to CSS gradients): `img/hero.webp`, `img/w1.webp`, `img/w2.webp`, `img/w3.webp`.
