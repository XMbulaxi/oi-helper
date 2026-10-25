import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  Route,
  Unit,
  DailyPlan,
  dateKey,
  currentUnitIndex,
  expectedUnitIndex,
  findProblem,
  nextUnfinished,
  todayPlan,
  unitDoneCount,
  allProblems,
  totalDays,
} from "./plan";
import { fetchPassed, problemUrl, LuoguError, setLogger } from "./luogu";

// ---------- content ----------

const ROUTE_FILES = ["zero.json", "puji.json"];

function loadRoutes(extPath: string): Route[] {
  return ROUTE_FILES.map((f) =>
    JSON.parse(fs.readFileSync(path.join(extPath, "content", "routes", f), "utf8")) as Route,
  );
}

// ---------- saved state (stays on this computer) ----------

const K = {
  route: "routeId",
  start: "startDate",
  passed: "luoguPassed",
  manual: "manualDone",
  unmarked: "manualUndone",
  plan: "dailyPlan",
  lastSync: "lastSync",
};

class Store {
  constructor(private s: vscode.Memento) {}
  get routeId() { return this.s.get<string>(K.route); }
  get startDate() { return this.s.get<string>(K.start) ?? dateKey(new Date()); }
  get plan() { return this.s.get<DailyPlan>(K.plan); }
  get lastSync() { return this.s.get<string>(K.lastSync); }
  private list(k: string) { return this.s.get<string[]>(k) ?? []; }

  /** Finished = AC on Luogu, plus ticked by hand, minus unticked by hand. */
  done(): Set<string> {
    const out = new Set([...this.list(K.passed), ...this.list(K.manual)]);
    for (const pid of this.list(K.unmarked)) out.delete(pid);
    return out;
  }

  async setRoute(id: string) {
    await this.s.update(K.route, id);
    await this.s.update(K.start, dateKey(new Date()));
    await this.s.update(K.plan, undefined);
  }
  async setPlan(p: DailyPlan) { await this.s.update(K.plan, p); }
  async setPassed(pids: string[]) {
    await this.s.update(K.passed, pids);
    await this.s.update(K.lastSync, new Date().toLocaleString());
    // A real AC overrides an earlier "untick".
    const passed = new Set(pids);
    await this.s.update(K.unmarked, this.list(K.unmarked).filter((p) => !passed.has(p)));
  }
  async toggle(pid: string) {
    const manual = new Set(this.list(K.manual));
    const unmarked = new Set(this.list(K.unmarked));
    if (this.done().has(pid)) {
      manual.delete(pid);
      if (this.list(K.passed).includes(pid)) unmarked.add(pid);
    } else {
      unmarked.delete(pid);
      if (!this.list(K.passed).includes(pid)) manual.add(pid);
    }
    await this.s.update(K.manual, [...manual]);
    await this.s.update(K.unmarked, [...unmarked]);
  }
}

// ---------- tree items ----------

type Node =
  | { kind: "info"; label: string; tooltip?: string; icon?: string; command?: vscode.Command }
  | { kind: "unit"; unit: Unit; index: number }
  | { kind: "lesson"; unit: Unit }
  | { kind: "problem"; pid: string };

class App {
  routes: Route[];
  store: Store;
  private changed = new vscode.EventEmitter<void>();
  readonly onChange = this.changed.event;
  status: vscode.StatusBarItem;

  constructor(private ctx: vscode.ExtensionContext) {
    this.routes = loadRoutes(ctx.extensionPath);
    this.store = new Store(ctx.globalState);
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.status.command = "workbench.view.extension.oiHelper";
  }

  get route(): Route | undefined {
    return this.routes.find((r) => r.id === this.store.routeId);
  }

  get count(): number {
    return vscode.workspace.getConfiguration("oiHelper").get<number>("dailyProblemCount", 3);
  }

  /** Today's plan, saved so it stays the same all day. */
  async today(): Promise<DailyPlan | undefined> {
    const route = this.route;
    if (!route) return undefined;
    const p = todayPlan(route, this.store.done(), this.count, dateKey(new Date()), this.store.plan);
    if (JSON.stringify(p) !== JSON.stringify(this.store.plan)) await this.store.setPlan(p);
    return p;
  }

  async refresh() {
    await vscode.commands.executeCommand("setContext", "oiHelper.hasRoute", !!this.route);
    const plan = await this.today();
    if (plan) {
      const done = this.store.done();
      const n = plan.pids.filter((p) => done.has(p)).length;
      this.status.text = `$(checklist) 今日 ${n}/${plan.pids.length}`;
      this.status.tooltip = "OI 学习助手：今日题单";
      this.status.show();
    } else {
      this.status.hide();
    }
    this.changed.fire();
  }

  problemItem(pid: string): vscode.TreeItem {
    const route = this.route!;
    const found = findProblem(route, pid);
    const done = this.store.done().has(pid);
    const item = new vscode.TreeItem(`${pid} ${found?.problem.title ?? ""}`);
    item.description = done ? "已完成" : found?.unit.title;
    item.iconPath = new vscode.ThemeIcon(done ? "pass-filled" : "circle-large-outline",
      done ? new vscode.ThemeColor("testing.iconPassed") : undefined);
    item.contextValue = done ? "problem-done" : "problem";
    item.tooltip = `${pid} ${found?.problem.title ?? ""}\n点击在洛谷打开`;
    item.command = { command: "oiHelper.openProblem", title: "在洛谷打开", arguments: [pid] };
    return item;
  }
}

class TodayView implements vscode.TreeDataProvider<Node> {
  constructor(private app: App) {}
  get onDidChangeTreeData() { return this.app.onChange; }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node) return [];
    const route = this.app.route;
    const plan = await this.app.today();
    if (!route || !plan) return [];
    const done = this.app.store.done();
    const today = dateKey(new Date());
    const cur = currentUnitIndex(route, done);
    const exp = expectedUnitIndex(route, this.app.store.startDate, today);
    const out: Node[] = [];

    // Where the student is vs. where the schedule says they should be.
    if (cur >= route.units.length) {
      out.push({ kind: "info", label: `🎉 ${route.name}全部完成！`, icon: "star-full" });
    } else {
      const unit = route.units[cur];
      out.push({
        kind: "info",
        label: `正在学：${unit.title}`,
        icon: "book",
        tooltip: "点击打开知识点讲解",
        command: { command: "oiHelper.openLesson", title: "打开讲解", arguments: [unit.id] },
      });
      let pace: string;
      if (exp >= route.units.length) pace = "已超过建议总天数，加油完成剩下的单元";
      else if (cur > exp) pace = `比计划快了 ${cur - exp} 个单元`;
      else if (cur < exp) pace = `比计划慢了 ${exp - cur} 个单元，可以点右上角 + 多做一题`;
      else pace = "进度正好跟上计划";
      out.push({ kind: "info", label: pace, icon: cur < exp ? "warning" : "pulse" });
    }

    if (plan.pids.length === 0 && cur < route.units.length) {
      out.push({ kind: "info", label: "今天的题单是空的" });
    }
    for (const pid of plan.pids) out.push({ kind: "problem", pid });
    if (plan.pids.length > 0 && plan.pids.every((p) => done.has(p))) {
      out.push({ kind: "info", label: "今日题单完成！想继续可以点右上角 +", icon: "smiley" });
    }
    return out;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "problem") return this.app.problemItem(node.pid);
    if (node.kind === "info") {
      const item = new vscode.TreeItem(node.label);
      item.tooltip = node.tooltip;
      if (node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);
      item.command = node.command;
      return item;
    }
    return new vscode.TreeItem("");
  }
}

class RouteView implements vscode.TreeDataProvider<Node> {
  constructor(private app: App) {}
  get onDidChangeTreeData() { return this.app.onChange; }

  getChildren(node?: Node): Node[] {
    const route = this.app.route;
    if (!route) return [];
    if (!node) {
      const done = this.app.store.done();
      const all = allProblems(route);
      const n = all.filter((p) => done.has(p.pid)).length;
      const sync = this.app.store.lastSync;
      return [
        { kind: "info", label: `${route.name}：${n}/${all.length} 题`, icon: "milestone",
          tooltip: `${route.description}\n建议用时约 ${totalDays(route)} 天` },
        { kind: "info", label: sync ? `上次同步洛谷：${sync}` : "还没有同步过洛谷", icon: "sync",
          command: { command: "oiHelper.sync", title: "同步" } },
        ...route.units.map((unit, index): Node => ({ kind: "unit", unit, index })),
      ];
    }
    if (node.kind === "unit") {
      return [{ kind: "lesson", unit: node.unit }, ...node.unit.problems.map((p): Node => ({ kind: "problem", pid: p.pid }))];
    }
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case "problem":
        return this.app.problemItem(node.pid);
      case "lesson": {
        const item = new vscode.TreeItem("知识点讲解");
        item.iconPath = new vscode.ThemeIcon("book");
        item.command = { command: "oiHelper.openLesson", title: "打开讲解", arguments: [node.unit.id] };
        return item;
      }
      case "unit": {
        const done = this.app.store.done();
        const n = unitDoneCount(node.unit, done);
        const total = node.unit.problems.length;
        const cur = currentUnitIndex(this.app.route!, done);
        const item = new vscode.TreeItem(
          `${node.index + 1}. ${node.unit.title}`,
          node.index === cur ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.description = `${n}/${total} · 建议 ${node.unit.days} 天`;
        item.iconPath = new vscode.ThemeIcon(n === total ? "pass-filled" : node.index === cur ? "play-circle" : "circle-outline");
        item.contextValue = "unit";
        item.id = node.unit.id;
        return item;
      }
      case "info": {
        const item = new vscode.TreeItem(node.label);
        item.tooltip = node.tooltip;
        if (node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);
        item.command = node.command;
        return item;
      }
    }
  }
}

// ---------- commands ----------

/** Commands from tree inline buttons get the Node; commands from item clicks get the pid. */
function pidOf(arg: unknown): string | undefined {
  if (typeof arg === "string") return arg;
  const n = arg as Node | undefined;
  return n && n.kind === "problem" ? n.pid : undefined;
}

function codeTemplate(pid: string, title: string): string {
  return `// ${pid} ${title}
// ${problemUrl(pid)}
#include <bits/stdc++.h>
using namespace std;

int main() {

    return 0;
}
`;
}

export function activate(ctx: vscode.ExtensionContext) {
  const app = new App(ctx);
  const output = vscode.window.createOutputChannel("OI 学习助手");
  setLogger((line) => output.appendLine(`[${new Date().toLocaleTimeString()}] ${line}`));
  ctx.subscriptions.push(
    output,
    app.status,
    vscode.window.registerTreeDataProvider("oiHelper.today", new TodayView(app)),
    vscode.window.registerTreeDataProvider("oiHelper.route", new RouteView(app)),
  );

  const cmd = (id: string, fn: (...a: any[]) => unknown) =>
    ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));

  cmd("oiHelper.selectRoute", async () => {
    const pick = await vscode.window.showQuickPick(
      app.routes.map((r) => ({ label: r.name, detail: `${r.description}（约 ${totalDays(r)} 天）`, id: r.id })),
      { placeHolder: "选择你的学习路线（换路线会从今天重新计算进度计划）" },
    );
    if (!pick) return;
    await app.store.setRoute(pick.id);
    await app.refresh();
    if (!vscode.workspace.getConfiguration("oiHelper").get<string>("luoguUser")) {
      const a = await vscode.window.showInformationMessage("要连接洛谷账号吗？连上后 AC 的题会自动打勾。", "设置洛谷账号", "以后再说");
      if (a === "设置洛谷账号") await vscode.commands.executeCommand("oiHelper.setLuoguUser");
    }
  });

  cmd("oiHelper.setLuoguUser", async () => {
    const cfg = vscode.workspace.getConfiguration("oiHelper");
    const v = await vscode.window.showInputBox({
      prompt: "输入你的洛谷用户名或 UID（个人主页网址里的数字）",
      value: cfg.get<string>("luoguUser", ""),
    });
    if (v === undefined) return;
    await cfg.update("luoguUser", v.trim(), vscode.ConfigurationTarget.Global);
    if (v.trim()) await vscode.commands.executeCommand("oiHelper.sync");
  });

  cmd("oiHelper.setLuoguCookie", async () => {
    const cfg = vscode.workspace.getConfiguration("oiHelper");
    const v = await vscode.window.showInputBox({
      prompt: "粘贴洛谷登录 Cookie，格式：__client_id=xxx; _uid=xxx（只保存在你自己的电脑上）",
      placeHolder: "__client_id=...; _uid=...",
      password: true,
      ignoreFocusOut: true,
    });
    if (v === undefined) return;
    const cleaned = v.trim().replace(/^cookie:\s*/i, "");
    if (cleaned && !/__client_id=/.test(cleaned)) {
      vscode.window.showWarningMessage("没有找到 __client_id，请检查复制的内容。");
      return;
    }
    await cfg.update("luoguCookie", cleaned, vscode.ConfigurationTarget.Global);
    if (cleaned) await vscode.commands.executeCommand("oiHelper.sync");
  });

  cmd("oiHelper.sync", async (silent?: boolean) => {
    const cfg = vscode.workspace.getConfiguration("oiHelper");
    const user = cfg.get<string>("luoguUser", "").trim();
    if (!user) {
      if (silent !== true) {
        const a = await vscode.window.showWarningMessage("还没有设置洛谷账号。", "设置洛谷账号");
        if (a) await vscode.commands.executeCommand("oiHelper.setLuoguUser");
      }
      return;
    }
    const cookie = cfg.get<string>("luoguCookie", "").trim() || undefined;
    try {
      const pids = await vscode.window.withProgress(
        { location: { viewId: "oiHelper.today" }, title: "正在同步洛谷" },
        () => fetchPassed(user, cookie),
      );
      await app.store.setPassed(pids);
      await app.refresh();
      if (silent !== true) vscode.window.showInformationMessage(`同步完成：洛谷上共 AC ${pids.length} 题。`);
    } catch (e) {
      const msg = e instanceof LuoguError ? e.message : `同步失败：${(e as Error).message}`;
      output.appendLine(`同步失败：${msg}`);
      if (silent !== true) {
        const a = await vscode.window.showErrorMessage(msg + " 也可以先手动给做完的题打勾。", "设置洛谷 Cookie", "查看日志");
        if (a === "查看日志") output.show();
        if (a === "设置洛谷 Cookie") await vscode.commands.executeCommand("oiHelper.setLuoguCookie");
      }
    }
  });

  cmd("oiHelper.moreToday", async () => {
    const route = app.route;
    const plan = await app.today();
    if (!route || !plan) return;
    const next = nextUnfinished(route, app.store.done(), 1, plan.pids);
    if (next.length === 0) {
      vscode.window.showInformationMessage("这条路线已经没有没做的题了！");
      return;
    }
    await app.store.setPlan({ date: plan.date, pids: [...plan.pids, ...next] });
    await app.refresh();
  });

  cmd("oiHelper.openProblem", (arg) => {
    const pid = pidOf(arg);
    if (pid) vscode.env.openExternal(vscode.Uri.parse(problemUrl(pid)));
  });

  cmd("oiHelper.toggleDone", async (arg) => {
    const pid = pidOf(arg);
    if (!pid) return;
    await app.store.toggle(pid);
    await app.refresh();
  });

  cmd("oiHelper.openLesson", async (arg) => {
    const route = app.route;
    if (!route) return;
    const unitId = typeof arg === "string" ? arg : (arg as Node)?.kind === "unit" ? (arg as any).unit.id : undefined;
    const unit = route.units.find((u) => u.id === unitId);
    if (!unit) return;
    const uri = vscode.Uri.file(path.join(ctx.extensionPath, "content", unit.lesson));
    await vscode.commands.executeCommand("markdown.showPreview", uri);
  });

  cmd("oiHelper.startCoding", async (arg) => {
    const pid = pidOf(arg);
    const route = app.route;
    if (!pid || !route) return;
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      const a = await vscode.window.showWarningMessage("先用“文件 → 打开文件夹”打开一个放代码的文件夹，再新建代码文件。", "打开文件夹");
      if (a) await vscode.commands.executeCommand("vscode.openFolder");
      return;
    }
    const sub = vscode.workspace.getConfiguration("oiHelper").get<string>("codeFolder", "luogu");
    const dir = vscode.Uri.joinPath(folder.uri, sub);
    const file = vscode.Uri.joinPath(dir, `${pid}.cpp`);
    try {
      await vscode.workspace.fs.stat(file);
    } catch {
      await vscode.workspace.fs.createDirectory(dir);
      const title = findProblem(route, pid)?.problem.title ?? "";
      await vscode.workspace.fs.writeFile(file, Buffer.from(codeTemplate(pid, title), "utf8"));
    }
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
  });

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("oiHelper.dailyProblemCount")) app.refresh();
    }),
    // Pick up a new day's list if VS Code stays open past midnight.
    vscode.window.onDidChangeWindowState((s) => { if (s.focused) app.refresh(); }),
  );

  app.refresh();
  if (vscode.workspace.getConfiguration("oiHelper").get<boolean>("syncOnStartup", true) && app.route) {
    vscode.commands.executeCommand("oiHelper.sync", true);
  }
}

export function deactivate() {}
