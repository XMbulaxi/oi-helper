// Local judge: compile a C++ file, run it on test cases (.in / .out or .ans)
// and compare the output, like a mock contest. No VS Code imports here, so it
// can be unit-tested with plain Node.

import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface TestCase {
  name: string; // e.g. "P1001_1" or "1"
  input: string; // path to .in
  answer: string; // path to .out / .ans
}

export type Verdict = "AC" | "WA" | "TLE" | "RE" | "OLE";

export interface CaseResult {
  name: string;
  verdict: Verdict;
  ms: number;
  /** For WA: where the output first differs. For RE: exit code / signal. */
  detail?: string;
  /** The program's output (cut to the first few KB), for showing next to the answer. */
  got?: string;
}

export interface Diff {
  ok: boolean;
  line?: number; // 1-based
  expected?: string;
  got?: string;
}

// ---------- comparing output ----------

/** Lines with trailing spaces and \r removed, and trailing blank lines dropped. */
function lines(s: string): string[] {
  const out = s.replace(/\r/g, "").split("\n").map((l) => l.replace(/[ \t]+$/, ""));
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

/**
 * Compare like most OI judges: ignore spaces at line ends and blank lines at
 * the end of the file, everything else must match exactly.
 */
export function compareOutput(expected: string, got: string): Diff {
  const a = lines(expected);
  const b = lines(got);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return { ok: false, line: i + 1, expected: a[i] ?? "（没有这一行）", got: b[i] ?? "（没有这一行）" };
    }
  }
  return { ok: true };
}

// ---------- finding test cases ----------

/** Natural order: "2" before "10". */
function natural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Pair every X.in in a folder with X.out or X.ans. When `prefix` is given,
 * only files whose name starts with it count (used when the data sits next to
 * the code, so other problems' data is not picked up).
 */
export function casesIn(dir: string, prefix?: string): TestCase[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const set = new Set(names);
  const out: TestCase[] = [];
  for (const f of names) {
    if (!/\.in$/i.test(f)) continue;
    const base = f.slice(0, -3);
    if (prefix && !base.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    const ans = [".out", ".ans", ".OUT", ".ANS"].map((e) => base + e).find((x) => set.has(x));
    if (ans) out.push({ name: base, input: path.join(dir, f), answer: path.join(dir, ans) });
  }
  return out.sort((x, y) => natural(x.name, y.name));
}

/**
 * Where to look for a code file's test cases, in order. For luogu/P1001.cpp:
 *   luogu/P1001/        luogu/data/P1001/      luogu/P1001_data/
 *   luogu/testcases/P1001/   then files like luogu/P1001*.in next to the code.
 */
export function findCases(codeFile: string): { dir: string; cases: TestCase[] } | undefined {
  const dir = path.dirname(codeFile);
  const name = path.basename(codeFile, path.extname(codeFile));
  const folders = [
    path.join(dir, name),
    path.join(dir, "data", name),
    path.join(dir, `${name}_data`),
    path.join(dir, "testcases", name),
  ];
  for (const d of folders) {
    const cases = casesIn(d);
    if (cases.length) return { dir: d, cases };
  }
  const beside = casesIn(dir, name);
  if (beside.length) return { dir, cases: beside };
  return undefined;
}

// ---------- compiling and running ----------

export interface CompileResult {
  ok: boolean;
  exe: string;
  message: string;
}

const isWin = process.platform === "win32";

/** A fresh work folder in the system temp folder. */
export function workDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "oi-helper-"));
}

export function compile(codeFile: string, outDir: string, compiler: string, args: string[]): Promise<CompileResult> {
  const name = path.basename(codeFile, path.extname(codeFile));
  const exe = path.join(outDir, isWin ? `${name}.exe` : name);
  return new Promise((resolve) => {
    let msg = "";
    let child;
    try {
      child = spawn(compiler, [codeFile, "-o", exe, ...args], { cwd: path.dirname(codeFile) });
    } catch (e) {
      resolve({ ok: false, exe, message: String(e) });
      return;
    }
    child.stdout.on("data", (d) => (msg += d));
    child.stderr.on("data", (d) => (msg += d));
    child.on("error", (e: NodeJS.ErrnoException) => {
      resolve({
        ok: false,
        exe,
        message: e.code === "ENOENT"
          ? `找不到编译器「${compiler}」。请先安装 g++（Windows 上可以装 MinGW-w64 或 Dev-C++ 自带的），并把它加到 PATH，或者在设置 oiHelper.compiler 里填完整路径。`
          : e.message,
      });
    });
    child.on("close", (code) => resolve({ ok: code === 0, exe, message: msg }));
  });
}

const MAX_OUTPUT = 64 * 1024 * 1024;

/**
 * Run the program on one test case. The input goes to stdin and also into
 * <name>.in in the work folder, so programs that use freopen (as NOIP
 * requires) work too; if the program writes <name>.out, that file is checked
 * instead of stdout.
 */
export function runCase(exe: string, ioName: string, tc: TestCase, cwd: string, timeLimitMs: number): Promise<CaseResult> {
  const input = fs.readFileSync(tc.input);
  const inFile = path.join(cwd, `${ioName}.in`);
  const outFile = path.join(cwd, `${ioName}.out`);
  fs.writeFileSync(inFile, input);
  fs.rmSync(outFile, { force: true });

  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const chunks: Buffer[] = [];
    let size = 0;
    let killedFor: Verdict | undefined;
    const child = spawn(exe, [], { cwd, stdio: ["pipe", "pipe", "ignore"] });
    // Give a little extra wall time before killing, so a program that just
    // misses the limit still shows its real time.
    const timer = setTimeout(() => {
      killedFor = "TLE";
      child.kill("SIGKILL");
    }, timeLimitMs * 2 + 200);
    child.stdout.on("data", (d: Buffer) => {
      size += d.length;
      if (size > MAX_OUTPUT) {
        killedFor = "OLE";
        child.kill("SIGKILL");
        return;
      }
      chunks.push(d);
    });
    child.stdin.on("error", () => {}); // program may exit without reading input
    child.stdin.end(input);
    const done = (r: Omit<CaseResult, "name" | "ms">) => {
      clearTimeout(timer);
      const ms = Number((process.hrtime.bigint() - start) / 1_000_000n);
      resolve({ name: tc.name, ms, ...r });
    };
    child.on("error", (e) => done({ verdict: "RE", detail: e.message }));
    child.on("close", (code, signal) => {
      const ms = Number((process.hrtime.bigint() - start) / 1_000_000n);
      if (killedFor) return done({ verdict: killedFor });
      if (ms > timeLimitMs) return done({ verdict: "TLE" });
      if (code !== 0) return done({ verdict: "RE", detail: signal ? `被信号 ${signal} 终止` : `返回值 ${code}（main 要 return 0；也可能是数组越界、除以 0、栈溢出）` });
      let got = Buffer.concat(chunks).toString("utf8");
      if (fs.existsSync(outFile)) got = fs.readFileSync(outFile, "utf8");
      const shown = clip(got, SHOW_LIMIT);
      const d = compareOutput(fs.readFileSync(tc.answer, "utf8"), got);
      if (d.ok) return done({ verdict: "AC", got: shown });
      done({ verdict: "WA", got: shown, detail: `第 ${d.line} 行不同：应为「${clip(d.expected!)}」，你的输出「${clip(d.got!)}」` });
    });
  });
}

/** How much of a file or output to show in the panel. */
export const SHOW_LIMIT = 8 * 1024;

export function clip(s: string, n = 80): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ---------- managing test case files ----------

/** Folder where new test cases for a code file go: luogu/P1001.cpp -> luogu/P1001/ */
export function defaultCaseDir(codeFile: string): string {
  return path.join(path.dirname(codeFile), path.basename(codeFile, path.extname(codeFile)));
}

/** Next free case name in a folder: 1, 2, 3, ... */
export function nextCaseName(dir: string): string {
  let max = 0;
  for (const c of casesIn(dir)) {
    const n = Number(c.name);
    if (Number.isInteger(n) && n > max) max = n;
  }
  let n = max + 1;
  while (fs.existsSync(path.join(dir, `${n}.in`))) n++;
  return String(n);
}

/** Add a test case as <dir>/<n>.in and <dir>/<n>.out. Returns the new case. */
export function addCase(dir: string, input = "", answer = ""): TestCase {
  fs.mkdirSync(dir, { recursive: true });
  const name = nextCaseName(dir);
  const tc = { name, input: path.join(dir, `${name}.in`), answer: path.join(dir, `${name}.out`) };
  fs.writeFileSync(tc.input, input);
  fs.writeFileSync(tc.answer, answer);
  return tc;
}

/**
 * Compiled programs are kept between runs (keyed by source path), and only
 * rebuilt when the source or the compile options change.
 */
const built = new Map<string, { key: string; dir: string; result: CompileResult }>();

export async function compileCached(codeFile: string, compiler: string, args: string[]): Promise<CompileResult> {
  const key = `${fs.statSync(codeFile).mtimeMs}|${compiler}|${args.join(" ")}`;
  const hit = built.get(codeFile);
  if (hit && hit.key === key && hit.result.ok && fs.existsSync(hit.result.exe)) return hit.result;
  const dir = hit?.dir && fs.existsSync(hit.dir) ? hit.dir : workDir();
  const result = await compile(codeFile, dir, compiler, args);
  built.set(codeFile, { key, dir, result });
  return result;
}

/** Remove the cached builds (called when the extension stops). */
export function cleanBuilds() {
  for (const b of built.values()) fs.rmSync(b.dir, { recursive: true, force: true });
  built.clear();
}

/** Problem name from Competitive Companion data: Luogu pid from the URL, else a safe file name. */
export function problemFileName(name: string, url: string): string {
  const m = url.match(/luogu\.com\.cn\/problem\/([A-Za-z0-9_]+)/);
  if (m) return m[1];
  const safe = name.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, "_").replace(/^_+|_+$/g, "");
  return safe.slice(0, 60) || "problem";
}
