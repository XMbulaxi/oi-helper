// 比赛助手: a sidebar for the current C++ file with its test cases. Run all of
// them with one key, edit or add samples, grab samples from the browser with
// Competitive Companion, and a mock-contest countdown.

import * as vscode from "vscode";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import {
  CaseResult,
  SHOW_LIMIT,
  TestCase,
  addCase,
  casesIn,
  cleanBuilds,
  clip,
  compileCached,
  defaultCaseDir,
  findCases,
  problemFileName,
  runCase,
  workDir,
} from "./judge";

const DIRS_KEY = "judgeDirs"; // code file -> test case folder the user picked
const LIMITS_KEY = "judgeLimits"; // code file -> time limit (ms) from the problem
const TIMER_KEY = "contestEnd"; // mock contest end time (ms since epoch)

const isCpp = (f: string) => /\.(cpp|cc|cxx)$/i.test(f);
const cfg = () => vscode.workspace.getConfiguration("oiHelper");

interface CaseView {
  name: string;
  input: string;
  answer: string;
  big: boolean; // too large to edit in the panel
}

export class ContestView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  file?: string;
  private results = new Map<string, CaseResult>();
  private busy = false;

  constructor(private ctx: vscode.ExtensionContext, private output: vscode.OutputChannel) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = html();
    view.webview.onDidReceiveMessage((m) => this.onMessage(m));
    view.onDidChangeVisibility(() => view.visible && this.render());
  }

  /** Follow the editor: the panel shows the last C++ file that was opened. */
  setFile(file: string | undefined) {
    if (!file || !isCpp(file) || file === this.file) return;
    this.file = file;
    this.results.clear();
    this.render();
  }

  // ---------- where the cases are ----------

  caseDir(): string | undefined {
    if (!this.file) return undefined;
    const picked = this.ctx.workspaceState.get<Record<string, string>>(DIRS_KEY, {})[this.file];
    if (picked && fs.existsSync(picked)) return picked;
    return findCases(this.file)?.dir ?? defaultCaseDir(this.file);
  }

  cases(): TestCase[] {
    const dir = this.caseDir();
    if (!dir || !this.file) return [];
    // Files next to the code (P1001_1.in) only count when they start with the code's name.
    const name = path.basename(this.file, path.extname(this.file));
    return dir === path.dirname(this.file) ? casesIn(dir, name) : casesIn(dir);
  }

  timeLimit(): number {
    const own = this.file ? this.ctx.workspaceState.get<Record<string, number>>(LIMITS_KEY, {})[this.file] : undefined;
    return Math.max(50, own ?? cfg().get<number>("timeLimit", 1000));
  }

  async setTimeLimit(ms: number) {
    if (!this.file || !(ms >= 50)) return;
    const map = { ...this.ctx.workspaceState.get<Record<string, number>>(LIMITS_KEY, {}), [this.file]: Math.round(ms) };
    await this.ctx.workspaceState.update(LIMITS_KEY, map);
  }

  // ---------- drawing ----------

  render() {
    if (!this.view?.visible) return;
    const read = (f: string) => {
      try {
        const st = fs.statSync(f);
        const big = st.size > SHOW_LIMIT;
        const text = big ? clip(fs.readFileSync(f, "utf8").slice(0, SHOW_LIMIT), SHOW_LIMIT) : fs.readFileSync(f, "utf8");
        return { text, big };
      } catch {
        return { text: "", big: false };
      }
    };
    const cases: CaseView[] = this.cases().map((c) => {
      const i = read(c.input);
      const a = read(c.answer);
      return { name: c.name, input: i.text, answer: a.text, big: i.big || a.big };
    });
    const dir = this.caseDir();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const rel = (p?: string) => (p && root && p.startsWith(root) ? path.relative(root, p) : p);
    this.view.webview.postMessage({
      type: "state",
      file: this.file ? path.basename(this.file) : undefined,
      dir: rel(dir),
      cases,
      results: Object.fromEntries(this.results),
      timeLimit: this.timeLimit(),
      busy: this.busy,
    });
  }

  private post(m: unknown) {
    this.view?.webview.postMessage(m);
  }

  // ---------- running ----------

  async run(only?: string) {
    if (!this.file) {
      vscode.window.showWarningMessage("先打开一个 .cpp 代码文件。");
      return;
    }
    if (this.busy) return;
    const doc = vscode.workspace.textDocuments.find((d) => d.fileName === this.file);
    if (doc?.isDirty) await doc.save();

    const all = this.cases();
    const list = only ? all.filter((c) => c.name === only) : all;
    if (!list.length) {
      vscode.window.showInformationMessage("还没有测试点。点“+ 新增样例”把题目的样例贴进来，或者用浏览器插件 Competitive Companion 一键导入。");
      return;
    }
    this.busy = true;
    if (!only) this.results.clear();
    for (const c of list) this.results.delete(c.name);
    this.render();
    this.post({ type: "running", names: list.map((c) => c.name) });

    const file = this.file;
    const compiler = cfg().get<string>("compiler", "g++").trim() || "g++";
    const args = cfg().get<string[]>("compileArgs", ["-O2", "-std=c++14"]);
    const limit = this.timeLimit();
    const tmp = workDir();
    try {
      const c = await compileCached(file, compiler, args);
      if (!c.ok) {
        this.output.appendLine(`[比赛助手] 编译失败 ${file}\n${c.message}`);
        this.post({ type: "compileError", message: c.message || "编译失败" });
        return;
      }
      if (c.message.trim()) this.post({ type: "warnings", message: c.message });
      const ioName = path.basename(file, path.extname(file));
      for (const tc of list) {
        const r = await runCase(c.exe, ioName, tc, tmp, limit);
        this.results.set(tc.name, r);
        this.post({ type: "result", result: r });
      }
      if (!only) {
        const ac = [...this.results.values()].filter((r) => r.verdict === "AC").length;
        vscode.window.setStatusBarMessage(`${path.basename(file)}：${ac}/${list.length} 通过`, 8000);
      }
    } finally {
      this.busy = false;
      fs.rmSync(tmp, { recursive: true, force: true });
      this.post({ type: "done" });
    }
  }

  // ---------- messages from the panel ----------

  private async onMessage(m: any) {
    const find = (name: string) => this.cases().find((c) => c.name === name);
    switch (m.type) {
      case "ready":
        this.render();
        break;
      case "runAll":
        await this.run();
        break;
      case "runOne":
        await this.run(String(m.name));
        break;
      case "add": {
        let dir = this.caseDir();
        if (!dir || !this.file) return vscode.window.showWarningMessage("先打开一个 .cpp 代码文件。");
        // New cases never go loose next to the code; they go in the same-name folder.
        if (dir === path.dirname(this.file)) dir = defaultCaseDir(this.file);
        addCase(dir);
        this.render();
        this.post({ type: "focusLast" });
        break;
      }
      case "delete": {
        const c = find(m.name);
        if (!c) return;
        const a = await vscode.window.showWarningMessage(`删除测试点 ${c.name}？`, { modal: true }, "删除");
        if (a !== "删除") return;
        fs.rmSync(c.input, { force: true });
        fs.rmSync(c.answer, { force: true });
        this.results.delete(c.name);
        this.render();
        break;
      }
      case "save": {
        const c = find(m.name);
        if (!c) return;
        fs.writeFileSync(m.field === "input" ? c.input : c.answer, String(m.text));
        this.results.delete(c.name);
        break;
      }
      case "timeLimit":
        await this.setTimeLimit(Number(m.ms));
        break;
      case "pickFolder":
        await this.pickFolder();
        break;
      case "openFolder": {
        const dir = this.caseDir();
        if (dir) {
          fs.mkdirSync(dir, { recursive: true });
          vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(dir));
        }
        break;
      }
      case "openFile":
        if (m.name) {
          const c = find(m.name);
          const f = c && (m.field === "input" ? c.input : c.answer);
          if (f) vscode.window.showTextDocument(vscode.Uri.file(f), { preview: true });
        }
        break;
      case "help":
        vscode.commands.executeCommand("oiHelper.contestHelp");
        break;
    }
  }

  async pickFolder() {
    if (!this.file) return;
    const pick = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      defaultUri: vscode.Uri.file(path.dirname(this.file)),
      openLabel: "用这个文件夹里的测试点",
    });
    if (!pick?.[0]) return;
    const dir = pick[0].fsPath;
    if (!casesIn(dir).length) {
      vscode.window.showWarningMessage("这个文件夹里没有成对的 .in 和 .out（或 .ans）文件。");
      return;
    }
    const map = { ...this.ctx.workspaceState.get<Record<string, string>>(DIRS_KEY, {}), [this.file]: dir };
    await this.ctx.workspaceState.update(DIRS_KEY, map);
    this.results.clear();
    this.render();
  }
}

// ---------- mock contest countdown ----------

class ContestTimer {
  private item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 49);
  private tick?: NodeJS.Timeout;
  private warned = new Set<number>();

  constructor(private ctx: vscode.ExtensionContext) {
    this.item.command = "oiHelper.stopContest";
    this.item.tooltip = "模拟赛倒计时（点击结束）";
    ctx.subscriptions.push(this.item, { dispose: () => this.tick && clearInterval(this.tick) });
    if (this.end) this.startTicking();
  }

  get end(): number | undefined {
    return this.ctx.globalState.get<number>(TIMER_KEY);
  }

  async start(minutes: number) {
    await this.ctx.globalState.update(TIMER_KEY, Date.now() + minutes * 60_000);
    this.warned.clear();
    this.startTicking();
  }

  async stop() {
    await this.ctx.globalState.update(TIMER_KEY, undefined);
    if (this.tick) clearInterval(this.tick);
    this.tick = undefined;
    this.item.hide();
  }

  private startTicking() {
    if (this.tick) clearInterval(this.tick);
    this.update();
    this.tick = setInterval(() => this.update(), 1000);
  }

  private update() {
    const end = this.end;
    if (!end) return this.item.hide();
    const left = Math.round((end - Date.now()) / 1000);
    if (left <= 0) {
      this.stop();
      vscode.window.showWarningMessage("⏰ 模拟赛时间到！停止写代码，检查文件名和 freopen。", { modal: true });
      return;
    }
    const h = Math.floor(left / 3600);
    const m = Math.floor((left % 3600) / 60);
    const s = left % 60;
    this.item.text = `$(watch) 模拟赛 ${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    this.item.backgroundColor = left <= 15 * 60 ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
    this.item.show();
    for (const mark of [30, 15, 5]) {
      if (left <= mark * 60 && !this.warned.has(mark)) {
        this.warned.add(mark);
        if (left > mark * 60 - 5) vscode.window.showWarningMessage(`模拟赛还剩 ${mark} 分钟。`);
      }
    }
  }
}

// ---------- Competitive Companion ----------

/**
 * Competitive Companion is a browser extension: on a problem page (Luogu,
 * Codeforces, AtCoder, ...) you click its green + and it sends the samples to
 * a local port. We listen on that port, make the code file and save the
 * samples as test cases.
 */
function startCompanion(
  ctx: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  onProblem: (p: { name: string; url: string; timeLimit?: number; tests: { input: string; output: string }[] }) => Promise<void>,
) {
  if (!cfg().get<boolean>("companion", true)) return;
  const port = cfg().get<number>("companionPort", 27121);
  const server = http.createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(200).end("OI 学习助手");
      return;
    }
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (d) => {
      body += d;
      if (body.length > 20 * 1024 * 1024) req.destroy();
    });
    req.on("end", async () => {
      res.writeHead(200).end();
      try {
        const p = JSON.parse(body);
        if (!Array.isArray(p?.tests)) throw new Error("数据里没有样例");
        await onProblem({
          name: String(p.name ?? "problem"),
          url: String(p.url ?? ""),
          timeLimit: typeof p.timeLimit === "number" ? p.timeLimit : undefined,
          tests: p.tests.map((t: any) => ({ input: String(t.input ?? ""), output: String(t.output ?? "") })),
        });
      } catch (e) {
        output.appendLine(`[比赛助手] 导入题目失败：${(e as Error).message}`);
        vscode.window.showErrorMessage(`导入题目失败：${(e as Error).message}`);
      }
    });
  });
  server.on("error", (e: NodeJS.ErrnoException) => {
    // Usually another VS Code window or another extension (such as CPH) already listens here.
    output.appendLine(`[比赛助手] 端口 ${port} 用不了（${e.code ?? e.message}），这个窗口收不到 Competitive Companion 的题目。`);
  });
  server.listen(port, "127.0.0.1", () => output.appendLine(`[比赛助手] 正在端口 ${port} 等待 Competitive Companion 发来的题目`));
  ctx.subscriptions.push({ dispose: () => server.close() });
}

// ---------- wiring ----------

const HELP = `比赛助手会显示当前 .cpp 文件的测试点。

放测试点：代码是 luogu/P1001.cpp，测试点就放在 luogu/P1001/ 文件夹里：1.in、1.out、2.in、2.out……（答案也可以叫 .ans）。也可以在面板里点“+ 新增样例”直接粘贴。

运行：按 Ctrl+Alt+T，或面板里的“▶ 全部运行”。

从洛谷一键导入样例：在浏览器装 Competitive Companion 扩展，打开洛谷题目页点它的绿色加号，插件会自动建好代码文件并存好样例。

模拟赛：命令面板运行“开始模拟赛计时”，状态栏会倒计时。`;

export function registerContest(
  ctx: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  codeTemplate: (pid: string, title: string) => string,
) {
  const view = new ContestView(ctx, output);
  const timer = new ContestTimer(ctx);
  view.setFile(vscode.window.activeTextEditor?.document.fileName);

  const reveal = () => vscode.commands.executeCommand("oiContest.cases.focus");

  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider("oiContest.cases", view, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.onDidChangeActiveTextEditor((e) => view.setFile(e?.document.fileName)),
    vscode.workspace.onDidSaveTextDocument(() => view.render()),
    { dispose: cleanBuilds },

    vscode.commands.registerCommand("oiHelper.runTests", async (uri?: vscode.Uri) => {
      const file = uri?.fsPath ?? vscode.window.activeTextEditor?.document.fileName;
      if (file && isCpp(file)) view.setFile(file);
      await reveal();
      await view.run();
    }),
    vscode.commands.registerCommand("oiHelper.pickTestFolder", async (uri?: vscode.Uri) => {
      if (uri && isCpp(uri.fsPath)) view.setFile(uri.fsPath);
      await view.pickFolder();
    }),
    vscode.commands.registerCommand("oiHelper.contestHelp", () => {
      vscode.window.showInformationMessage(HELP, { modal: true });
    }),
    vscode.commands.registerCommand("oiHelper.startContest", async () => {
      const choices = [
        { label: "4 小时", minutes: 240, description: "CSP-S 第二轮" },
        { label: "3.5 小时", minutes: 210 },
        { label: "4.5 小时", minutes: 270, description: "NOIP" },
        { label: "3 小时", minutes: 180 },
        { label: "自定义…", minutes: 0 },
      ];
      const pick = await vscode.window.showQuickPick(choices, { placeHolder: "模拟赛多长时间？（以当年 CCF 公布的考试时长为准）" });
      if (!pick) return;
      let minutes = pick.minutes;
      if (!minutes) {
        const s = await vscode.window.showInputBox({ prompt: "多少分钟？", validateInput: (v) => (/^\d+$/.test(v) && +v > 0 ? undefined : "填一个正整数") });
        if (!s) return;
        minutes = Number(s);
      }
      await timer.start(minutes);
    }),
    vscode.commands.registerCommand("oiHelper.stopContest", async () => {
      if (!timer.end) return;
      const a = await vscode.window.showWarningMessage("提前结束模拟赛计时？", { modal: true }, "结束");
      if (a === "结束") await timer.stop();
    }),
  );

  startCompanion(ctx, output, async (p) => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showWarningMessage("收到了题目，但 VS Code 没有打开文件夹。先用“文件 → 打开文件夹”打开放代码的文件夹，再点一次浏览器里的加号。");
      return;
    }
    const name = problemFileName(p.name, p.url);
    const dir = path.join(folder.uri.fsPath, cfg().get<string>("codeFolder", "luogu"));
    const file = path.join(dir, `${name}.cpp`);
    fs.mkdirSync(dir, { recursive: true });
    const title = p.name.startsWith(name) ? p.name.slice(name.length).trim() : p.name;
    if (!fs.existsSync(file)) fs.writeFileSync(file, codeTemplate(name, title));

    // Save the samples, skipping ones that are already there.
    const caseDir = defaultCaseDir(file);
    const have = casesIn(caseDir).map((c) => fs.readFileSync(c.input, "utf8").trim());
    let added = 0;
    for (const t of p.tests) {
      if (have.includes(t.input.trim())) continue;
      addCase(caseDir, t.input, t.output);
      added++;
    }
    if (p.timeLimit) {
      const map = { ...ctx.workspaceState.get<Record<string, number>>(LIMITS_KEY, {}), [file]: p.timeLimit };
      await ctx.workspaceState.update(LIMITS_KEY, map);
    }
    output.appendLine(`[比赛助手] 导入 ${p.name}（${p.url}），新增 ${added} 个样例`);
    await vscode.window.showTextDocument(vscode.Uri.file(file));
    view.setFile(file);
    view.render();
    await reveal();
    vscode.window.setStatusBarMessage(`已导入 ${p.name}：${added} 个样例`, 6000);
  });

  return view;
}

// ---------- the panel's page ----------

export function html(_webview?: vscode.Webview): string {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 0 8px 16px; }
button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 10px; cursor: pointer; border-radius: 2px; }
button:hover { background: var(--vscode-button-hoverBackground); }
button.sec { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
button:disabled { opacity: .5; cursor: default; }
.bar { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; align-items: center; }
.file { font-weight: bold; margin-top: 8px; word-break: break-all; }
.muted { opacity: .7; font-size: 90%; word-break: break-all; }
.summary { font-size: 120%; font-weight: bold; margin: 8px 0; }
.case { border: 1px solid var(--vscode-panel-border, #8884); border-radius: 4px; margin: 8px 0; padding: 6px; }
.head { display: flex; align-items: center; gap: 6px; }
.head .name { font-weight: bold; flex: 1; }
.head button { padding: 2px 6px; }
.badge { font-weight: bold; padding: 1px 6px; border-radius: 3px; color: #fff; font-size: 90%; }
.AC { background: #2ea043; } .WA { background: #d73a49; } .TLE { background: #b08800; } .RE, .OLE { background: #8250df; } .RUN { background: #6e7781; }
label { display: block; margin-top: 4px; font-size: 90%; opacity: .8; }
textarea { width: 100%; box-sizing: border-box; min-height: 3.2em; resize: vertical; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size);
  background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, #8884); }
textarea[readonly] { opacity: .85; }
.detail { font-family: var(--vscode-editor-font-family); font-size: 90%; margin-top: 4px; color: var(--vscode-errorForeground); word-break: break-all; }
pre { white-space: pre-wrap; word-break: break-all; background: var(--vscode-textCodeBlock-background); padding: 6px; font-size: 90%; }
input[type=number] { width: 70px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, #8884); }
a { color: var(--vscode-textLink-foreground); cursor: pointer; }
</style></head><body>
<div id="app"><p class="muted">加载中…</p></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let state = null;
const running = new Set();
const app = document.getElementById("app");
const send = (m) => vscode.postMessage(m);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const VERDICT = { AC: "AC 通过", WA: "WA 答案错误", TLE: "TLE 超时", RE: "RE 运行错误", OLE: "OLE 输出太多" };

function render() {
  if (!state) return;
  if (!state.file) {
    app.innerHTML = '<p>打开一个 <b>.cpp</b> 代码文件，这里会显示它的测试点。</p><p><a id="help">测试点放在哪？怎么从洛谷导入样例？</a></p>';
    document.getElementById("help").onclick = () => send({ type: "help" });
    return;
  }
  const busy = state.busy || running.size > 0;
  let h = '<div class="file">' + esc(state.file) + '</div>';
  h += '<div class="muted">测试点文件夹：' + esc(state.dir) + '</div>';
  h += '<div class="bar"><button id="runAll"' + (busy ? " disabled" : "") + '>▶ 全部运行</button>';
  h += '<button class="sec" id="add">+ 新增样例</button>';
  h += '<button class="sec" id="pick" title="选择别的测试点文件夹">📁</button>';
  h += '<button class="sec" id="open" title="在资源管理器中打开测试点文件夹">↗</button>';
  h += '<button class="sec" id="help" title="帮助">?</button></div>';
  h += '<div class="bar muted">时间限制 <input type="number" id="tl" min="50" step="100" value="' + state.timeLimit + '"> 毫秒</div>';
  const rs = state.cases.map((c) => state.results[c.name]).filter(Boolean);
  if (rs.length && rs.length === state.cases.length) {
    const ac = rs.filter((r) => r.verdict === "AC").length;
    h += '<div class="summary">' + ac + ' / ' + rs.length + ' 通过，' + Math.round(100 * ac / rs.length) + ' 分</div>';
  }
  h += '<div id="ce"></div>';
  if (!state.cases.length) h += '<p class="muted">还没有测试点。点“+ 新增样例”，把题目里的输入输出样例粘贴进来。</p>';
  for (const c of state.cases) {
    const r = state.results[c.name];
    const badge = running.has(c.name) ? '<span class="badge RUN">运行中</span>' : r ? '<span class="badge ' + r.verdict + '">' + VERDICT[r.verdict] + '</span> <span class="muted">' + r.ms + ' ms</span>' : "";
    h += '<div class="case" data-name="' + esc(c.name) + '"><div class="head"><span class="name">测试点 ' + esc(c.name) + '</span>' + badge;
    h += '<button class="sec run" title="只运行这个"' + (busy ? " disabled" : "") + '>▶</button><button class="sec del" title="删除">✕</button></div>';
    if (c.big) {
      h += '<p class="muted">文件较大，只能在编辑器里看：<a class="of" data-f="input">打开输入</a> · <a class="of" data-f="answer">打开答案</a></p>';
    } else {
      h += '<label>输入</label><textarea data-f="input" rows="' + rows(c.input) + '">' + esc(c.input) + '</textarea>';
      h += '<label>期望输出</label><textarea data-f="answer" rows="' + rows(c.answer) + '">' + esc(c.answer) + '</textarea>';
    }
    if (r && r.got !== undefined && r.verdict !== "AC") h += '<label>你的输出</label><textarea readonly rows="' + rows(r.got) + '">' + esc(r.got) + '</textarea>';
    if (r && r.detail) h += '<div class="detail">' + esc(r.detail) + '</div>';
    h += '</div>';
  }
  app.innerHTML = h;
  bind();
}

function rows(s) { return Math.min(10, Math.max(2, String(s || "").split("\\n").length)); }

function bind() {
  const on = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
  on("runAll", () => send({ type: "runAll" }));
  on("add", () => send({ type: "add" }));
  on("pick", () => send({ type: "pickFolder" }));
  on("open", () => send({ type: "openFolder" }));
  on("help", () => send({ type: "help" }));
  const tl = document.getElementById("tl");
  if (tl) tl.onchange = () => { send({ type: "timeLimit", ms: Number(tl.value) }); state.timeLimit = Number(tl.value); };
  for (const box of document.querySelectorAll(".case")) {
    const name = box.dataset.name;
    box.querySelector(".run").onclick = () => send({ type: "runOne", name });
    box.querySelector(".del").onclick = () => send({ type: "delete", name });
    for (const a of box.querySelectorAll("a.of")) a.onclick = () => send({ type: "openFile", name, field: a.dataset.f });
    for (const t of box.querySelectorAll("textarea[data-f]")) {
      t.onchange = () => {
        const c = state.cases.find((x) => x.name === name);
        if (c) c[t.dataset.f] = t.value;
        delete state.results[name];
        send({ type: "save", name, field: t.dataset.f, text: t.value });
      };
    }
  }
}

window.addEventListener("message", (e) => {
  const m = e.data;
  if (m.type === "state") { state = m; render(); }
  else if (m.type === "running") { m.names.forEach((n) => running.add(n)); render(); }
  else if (m.type === "result") { running.delete(m.result.name); if (state) state.results[m.result.name] = m.result; render(); }
  else if (m.type === "done") { running.clear(); if (state) state.busy = false; render(); }
  else if (m.type === "compileError") {
    running.clear(); render();
    document.getElementById("ce").innerHTML = '<div class="summary" style="color:#d73a49">CE 编译错误</div><pre>' + esc(m.message) + '</pre><div class="muted">从上往下看第一条 error，冒号后面的数字是行号。</div>';
  }
  else if (m.type === "focusLast") {
    const ts = document.querySelectorAll('textarea[data-f="input"]');
    if (ts.length) ts[ts.length - 1].focus();
  }
});
send({ type: "ready" });
</script></body></html>`;
}
