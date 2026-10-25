// The "运行测试点" command: compile the current C++ file, run it on every test
// case and show the results in a panel, like a mock contest.

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CaseResult, TestCase, casesIn, compile, findCases, runCase, workDir } from "./judge";

const DIRS_KEY = "judgeDirs"; // code file path -> test case folder the user picked

const VERDICT: Record<string, { text: string; color: string }> = {
  AC: { text: "AC 通过", color: "#2ea043" },
  WA: { text: "WA 答案错误", color: "#d73a49" },
  TLE: { text: "TLE 超时", color: "#b08800" },
  RE: { text: "RE 运行错误", color: "#8250df" },
  OLE: { text: "OLE 输出太多", color: "#8250df" },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

let panel: vscode.WebviewPanel | undefined;

function show(title: string, body: string) {
  if (!panel) {
    panel = vscode.window.createWebviewPanel("oiHelper.judge", title, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {});
    panel.onDidDispose(() => (panel = undefined));
  }
  panel.title = title;
  panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px 16px; }
h2 { margin: 8px 0; }
table { border-collapse: collapse; width: 100%; margin-top: 8px; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border, #8884); vertical-align: top; }
td.v { font-weight: bold; white-space: nowrap; }
td.d { font-family: var(--vscode-editor-font-family); word-break: break-all; }
pre { background: var(--vscode-textCodeBlock-background); padding: 8px; overflow-x: auto; white-space: pre-wrap; }
.muted { opacity: .7; }
</style></head><body>${body}</body></html>`;
  panel.reveal(vscode.ViewColumn.Beside, true);
}

function resultsHtml(file: string, dataDir: string, results: CaseResult[], limit: number, warnings: string): string {
  const ac = results.filter((r) => r.verdict === "AC").length;
  const score = results.length ? Math.round((100 * ac) / results.length) : 0;
  const rows = results
    .map((r) => {
      const v = VERDICT[r.verdict];
      return `<tr><td>${esc(r.name)}</td><td class="v" style="color:${v.color}">${v.text}</td><td>${r.ms} ms</td><td class="d">${esc(r.detail ?? "")}</td></tr>`;
    })
    .join("");
  return `<h2>${esc(path.basename(file))}：${ac} / ${results.length} 通过，${score} 分</h2>
<div class="muted">测试点文件夹：${esc(dataDir)}　时间限制：${limit} ms</div>
<table><tr><th>测试点</th><th>结果</th><th>用时</th><th>说明</th></tr>${rows}</table>
${warnings.trim() ? `<h3>编译警告</h3><pre>${esc(warnings)}</pre>` : ""}
<p class="muted">用时是在你电脑上测的，和洛谷评测机不完全一样，只能参考。</p>`;
}

const HELP = `把测试点放在代码旁边的同名文件夹里，例如代码是 luogu/P1001.cpp，就建文件夹 luogu/P1001/，放进 1.in、1.out、2.in、2.out……（答案文件也可以叫 .ans）。
也可以直接放在代码旁边，例如 P1001_1.in 和 P1001_1.out。
放好后按 Ctrl+Alt+T，或者点编辑器右上角的 ▶ 按钮。`;

export function registerJudge(ctx: vscode.ExtensionContext, output: vscode.OutputChannel) {
  const cfg = () => vscode.workspace.getConfiguration("oiHelper");

  ctx.subscriptions.push(
    vscode.commands.registerCommand("oiHelper.testHelp", () => {
      vscode.window.showInformationMessage(HELP, { modal: true });
    }),

    vscode.commands.registerCommand("oiHelper.pickTestFolder", async (uri?: vscode.Uri) => {
      const file = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!file) return;
      await pickFolder(ctx, file);
    }),

    vscode.commands.registerCommand("oiHelper.runTests", async (uri?: vscode.Uri) => {
      const doc = uri
        ? await vscode.workspace.openTextDocument(uri)
        : vscode.window.activeTextEditor?.document;
      if (!doc || !/\.(cpp|cc|cxx)$/i.test(doc.fileName)) {
        vscode.window.showWarningMessage("先打开一个 .cpp 代码文件，再运行测试点。");
        return;
      }
      if (doc.isDirty) await doc.save();
      const file = doc.fileName;

      // Find the test cases.
      let found: { dir: string; cases: TestCase[] } | undefined;
      const saved = ctx.workspaceState.get<Record<string, string>>(DIRS_KEY, {})[file];
      if (saved) {
        const cases = casesIn(saved);
        if (cases.length) found = { dir: saved, cases };
      }
      found ??= findCases(file);
      if (!found) {
        const a = await vscode.window.showWarningMessage(
          `没找到 ${path.basename(file)} 的测试点（.in 和 .out 文件）。`,
          "选择测试点文件夹",
          "测试点放在哪",
        );
        if (a === "测试点放在哪") vscode.commands.executeCommand("oiHelper.testHelp");
        if (a !== "选择测试点文件夹") return;
        found = await pickFolder(ctx, file);
        if (!found) return;
      }

      const compiler = cfg().get<string>("compiler", "g++").trim() || "g++";
      const args = cfg().get<string[]>("compileArgs", ["-O2", "-std=c++14"]);
      const limit = Math.max(50, cfg().get<number>("timeLimit", 1000));
      const ioName = path.basename(file, path.extname(file));
      const tmp = workDir();
      const { dir, cases } = found;

      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `测试 ${path.basename(file)}`, cancellable: true },
          async (progress, token) => {
            progress.report({ message: "正在编译…" });
            const c = await compile(file, tmp, compiler, args);
            output.appendLine(`[测试点] 编译 ${file}：${compiler} ${args.join(" ")}`);
            if (c.message.trim()) output.appendLine(c.message);
            if (!c.ok) {
              show("编译错误", `<h2 style="color:#d73a49">CE 编译错误</h2><pre>${esc(c.message || "编译失败")}</pre>
<p class="muted">从上往下看第一条 error，冒号后面的数字是行号。</p>`);
              return;
            }
            const results: CaseResult[] = [];
            for (let i = 0; i < cases.length && !token.isCancellationRequested; i++) {
              progress.report({ message: `${i + 1} / ${cases.length}：${cases[i].name}`, increment: 100 / cases.length });
              const r = await runCase(c.exe, ioName, cases[i], tmp, limit);
              results.push(r);
              output.appendLine(`[测试点] ${r.name} ${r.verdict} ${r.ms}ms ${r.detail ?? ""}`);
            }
            show(`测试结果 ${path.basename(file)}`, resultsHtml(file, dir, results, limit, c.message));
            const ac = results.filter((r) => r.verdict === "AC").length;
            vscode.window.setStatusBarMessage(`${path.basename(file)}：${ac}/${results.length} 通过`, 8000);
          },
        );
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }),
  );
}

async function pickFolder(ctx: vscode.ExtensionContext, file: string) {
  const pick = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    defaultUri: vscode.Uri.file(path.dirname(file)),
    openLabel: "用这个文件夹里的测试点",
  });
  if (!pick?.[0]) return undefined;
  const dir = pick[0].fsPath;
  const cases = casesIn(dir);
  if (!cases.length) {
    vscode.window.showWarningMessage("这个文件夹里没有成对的 .in 和 .out（或 .ans）文件。");
    return undefined;
  }
  const map = { ...ctx.workspaceState.get<Record<string, string>>(DIRS_KEY, {}), [file]: dir };
  await ctx.workspaceState.update(DIRS_KEY, map);
  vscode.window.showInformationMessage(`找到 ${cases.length} 个测试点，以后这个代码文件都用这个文件夹。`);
  return { dir, cases };
}
