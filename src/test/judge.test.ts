import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { addCase, casesIn, compareOutput, compile, findCases, nextCaseName, problemFileName, runCase, workDir } from "../judge";
import { parseProblemTitle } from "../luogu";

test("compareOutput ignores trailing spaces, \\r and final blank lines", () => {
  assert.ok(compareOutput("1 2\n3\n", "1 2   \r\n3\r\n\n\n").ok);
  const d = compareOutput("1\n2\n3\n", "1\n5\n3\n");
  assert.deepEqual(d, { ok: false, line: 2, expected: "2", got: "5" });
  assert.equal(compareOutput("1\n2\n", "1\n").line, 2);
  assert.equal(compareOutput("a b", "a  b").ok, false);
});

test("findCases looks in the same-name folder, then beside the code", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oi-find-"));
  const code = path.join(root, "P1001.cpp");
  fs.writeFileSync(code, "");
  fs.writeFileSync(path.join(root, "P1001_2.in"), "");
  fs.writeFileSync(path.join(root, "P1001_2.ans"), "");
  fs.writeFileSync(path.join(root, "P1002_1.in"), "");
  fs.writeFileSync(path.join(root, "P1002_1.out"), "");
  assert.deepEqual(findCases(code)!.cases.map((c) => c.name), ["P1001_2"]);
  fs.mkdirSync(path.join(root, "P1001"));
  for (const n of ["10", "2", "1"]) {
    fs.writeFileSync(path.join(root, "P1001", `${n}.in`), "");
    fs.writeFileSync(path.join(root, "P1001", `${n}.out`), "");
  }
  fs.writeFileSync(path.join(root, "P1001", "3.in"), ""); // no answer: skipped
  const f = findCases(code)!;
  assert.equal(f.dir, path.join(root, "P1001"));
  assert.deepEqual(f.cases.map((c) => c.name), ["1", "2", "10"]);
  assert.equal(casesIn(path.join(root, "nope")).length, 0);
});

test("parseProblemTitle finds the title in old and new page formats", () => {
  assert.equal(parseProblemTitle({ data: { problem: { pid: "P1001", title: "A+B Problem" } } }), "A+B Problem");
  assert.equal(parseProblemTitle({ currentData: { problem: { title: "X" } } }), "X");
  assert.equal(parseProblemTitle({ data: { problem: { pid: "P1001", content: { name: "A+B Problem" } } } }), "A+B Problem");
  assert.equal(parseProblemTitle({ data: { x: [{ pid: "P1000", title: "no" }, { pid: "P1001", name: "yes" }] } }, "P1001"), "yes");
  assert.equal(parseProblemTitle({ data: {} }, "P1001"), undefined);
});

let hasGpp = true;
try { execSync("g++ --version", { stdio: "ignore" }); } catch { hasGpp = false; }

test("compile and judge AC / WA / TLE / RE / freopen / CE", { skip: !hasGpp }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oi-judge-"));
  const data = path.join(root, "add");
  fs.mkdirSync(data);
  const put = (n: string, i: string, o: string) => {
    fs.writeFileSync(path.join(data, `${n}.in`), i);
    fs.writeFileSync(path.join(data, `${n}.out`), o);
  };
  put("1", "1 2\n", "3\n");
  put("2", "5 5\n", "10\n");
  put("3", "0 0\n", "1\n"); // wrong answer on purpose
  const run = async (name: string, src: string) => {
    const file = path.join(root, `${name}.cpp`);
    fs.writeFileSync(file, src);
    const tmp = workDir();
    const c = await compile(file, tmp, "g++", ["-O2"]);
    if (!c.ok) return { c, rs: [] };
    const rs = [];
    for (const tc of casesIn(data)) rs.push(await runCase(c.exe, name, tc, tmp, 300));
    return { c, rs };
  };

  const add = await run("add", "#include <cstdio>\nint main(){int a,b;scanf(\"%d%d\",&a,&b);printf(\"%d\\n\",a+b);return 0;}");
  assert.deepEqual(add.rs.map((r) => r.verdict), ["AC", "AC", "WA"]);
  assert.match(add.rs[2].detail!, /第 1 行/);

  const fio = await run("fio", "#include <cstdio>\nint main(){freopen(\"fio.in\",\"r\",stdin);freopen(\"fio.out\",\"w\",stdout);int a,b;scanf(\"%d%d\",&a,&b);printf(\"%d\\n\",a+b);return 0;}");
  assert.deepEqual(fio.rs.map((r) => r.verdict), ["AC", "AC", "WA"]);

  const slow = await run("slow", "int main(){volatile unsigned long long x=0;while(true)x++;}");
  assert.equal(slow.rs[0].verdict, "TLE");

  const re = await run("re", "int main(){return 3;}");
  assert.equal(re.rs[0].verdict, "RE");

  const ce = await run("ce", "int main(){ this is not c++ }");
  assert.equal(ce.c.ok, false);
  assert.match(ce.c.message, /error/);
});

test("addCase numbers new cases and problemFileName picks the Luogu pid", () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "oi-add-")), "P1001");
  assert.equal(addCase(dir, "1 2\n", "3\n").name, "1");
  assert.equal(addCase(dir).name, "2");
  assert.equal(nextCaseName(dir), "3");
  assert.deepEqual(casesIn(dir).map((c) => c.name), ["1", "2"]);
  assert.equal(fs.readFileSync(path.join(dir, "1.out"), "utf8"), "3\n");
  assert.equal(problemFileName("P1001 A+B Problem", "https://www.luogu.com.cn/problem/P1001"), "P1001");
  assert.equal(problemFileName("A. Watermelon", "https://codeforces.com/problemset/problem/4/A"), "A._Watermelon");
  assert.equal(problemFileName("a/b:c", ""), "a_b_c");
});
