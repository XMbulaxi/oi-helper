import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  Stage,
  Task,
  Exam,
  DailyPlan,
  Forecast,
  buildTasks,
  currentUnit,
  dateKey,
  daysBetween,
  estimateExamDate,
  forecast,
  isValidDate,
  lessonId,
  minutesOn,
  orderFor,
  pickTasks,
  stagesFor,
  todayPlan,
} from "./plan";
import { fetchPassed, fetchProblemTitle, problemUrl, LuoguError, setLogger } from "./luogu";

// ---------- content ----------

const STAGE_FILES = ["zero.json", "puji.json", "tigao.json"];

function loadStages(extPath: string): Stage[] {
  return STAGE_FILES.map((f) =>
    JSON.parse(fs.readFileSync(path.join(extPath, "content", "routes", f), "utf8")) as Stage,
  );
}

// ---------- saved state (stays on this computer) ----------

const K = {
  start: "startStage",
  oldRoute: "routeId", // v0.1 name for the starting stage
  passed: "luoguPassed",
  manual: "manualDone",
  unmarked: "manualUndone",
  plan: "dailyPlan2",
  lastSync: "lastSync",
};

class Store {
  constructor(private s: vscode.Memento) {}
  get startStage() { return this.s.get<string>(K.start) ?? this.s.get<string>(K.oldRoute); }
  get plan() { return this.s.get<DailyPlan>(K.plan); }
  get lastSync() { return this.s.get<string>(K.lastSync); }
  private list(k: string) { return this.s.get<string[]>(k) ?? []; }

  /** Finished = AC on Luogu, plus ticked by hand, minus unticked by hand. */
  done(): Set<string> {
    const out = new Set([...this.list(K.passed), ...this.list(K.manual)]);
    for (const id of this.list(K.unmarked)) out.delete(id);
    return out;
  }

  async setStart(id: string) {
    await this.s.update(K.start, id);
    await this.clearPlan();
  }
  async clearPlan() { await this.s.update(K.plan, undefined); }
  async setPlan(p: DailyPlan) { await this.s.update(K.plan, p); }
  async setPassed(pids: string[]) {
    await this.s.update(K.passed, pids);
    await this.s.update(K.lastSync, new Date().toLocaleString());
    // A real AC overrides an earlier "untick".
    const passed = new Set(pids);
    await this.s.update(K.unmarked, this.list(K.unmarked).filter((p) => !passed.has(p)));
  }
  async toggle(id: string) {
    const manual = new Set(this.list(K.manual));
    const unmarked = new Set(this.list(K.unmarked));
    if (this.done().has(id)) {
      manual.delete(id);
      if (this.list(K.passed).includes(id)) unmarked.add(id);
    } else {
      unmarked.delete(id);
      if (!this.list(K.passed).includes(id)) manual.add(id);
    }
    await this.s.update(K.manual, [...manual]);
    await this.s.update(K.unmarked, [...unmarked]);
  }
}

// ---------- settings ----------

function cfg() {
  return vscode.workspace.getConfiguration("oiHelper");
}

function settings() {
  const c = cfg();
  const exam = c.get<Exam>("targetExam", "none");
  const rawDate = c.get<string>("examDate", "").trim();
  const today = dateKey(new Date());
  const examDate = exam === "none" ? undefined : isValidDate(rawDate) ? rawDate : estimateExamDate(exam, today);
  return {
    exam,
    examDate,
    examDateIsGuess: exam !== "none" && !isValidDate(rawDate),
    schedule: {
      weekday: Math.max(0, c.get<number>("weekdayMinutes", 90)),
      weekend: Math.max(0, c.get<number>("weekendMinutes", 180)),
    },
  };
}

function shortDate(s?: string): string {
  if (!s) return "?";
  const [, m, d] = s.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

function hours(min: number): string {
  if (min < 60) return `${min} 分钟`;
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} 小时`;
}

// ---------- app ----------

type Node =
  | { kind: "info"; label: string; tooltip?: string; icon?: string; command?: vscode.Command }
  | { kind: "stage"; stage: Stage; inPlan: boolean }
  | { kind: "unit"; stage: Stage; unitId: string; index: number }
  | { kind: "task"; id: string };

class App {
  stages: Stage[];
  store: Store;
  output = vscode.window.createOutputChannel("OI 学习助手");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  private changed = new vscode.EventEmitter<void>();
  readonly onChange = this.changed.event;

  /** Every task of every stage, for looking things up. */
  allTasks: Map<string, Task>;

  constructor(private ctx: vscode.ExtensionContext) {
    this.stages = loadStages(ctx.extensionPath);
    this.store = new Store(ctx.globalState);
    this.status.command = "workbench.view.extension.oiHelper";
    this.allTasks = new Map(buildTasks(this.stages).map((t) => [t.id, t]));
  }

  get hasStart(): boolean {
    return !!this.stages.find((s) => s.id === this.store.startStage);
  }

  /** Stages in the current plan (start stage up to what the exam needs). */
  planStages(): Stage[] {
    if (!this.hasStart) return [];
    return stagesFor(this.stages, this.store.startStage!, settings().exam);
  }

  tasks(): Task[] {
    return buildTasks(this.planStages());
  }

  forecast(): Forecast {
    const s = settings();
    return forecast(this.tasks(), this.store.done(), s.schedule, dateKey(new Date()), s.examDate);
  }

  /** Today's plan, saved so it stays the same all day. */
  async today(): Promise<DailyPlan | undefined> {
    if (!this.hasStart) return undefined;
    const s = settings();
    const today = dateKey(new Date());
    const fc = this.forecast();
    const p = todayPlan(this.tasks(), this.store.done(), fc.mode, minutesOn(today, s.schedule), today, this.store.plan);
    if (JSON.stringify(p) !== JSON.stringify(this.store.plan)) await this.store.setPlan(p);
    return p;
  }

  async refresh() {
    const plan = await this.today();
    if (plan) {
      const done = this.store.done();
      const n = plan.ids.filter((p) => done.has(p)).length;
      const s = settings();
      const exam = s.examDate ? ` · 距 ${s.exam} ${daysBetween(dateKey(new Date()), s.examDate)} 天` : "";
      this.status.text = `$(checklist) 今日 ${n}/${plan.ids.length}${exam}`;
      this.status.tooltip = "OI 学习助手：今日任务";
      this.status.show();
    } else {
      this.status.hide();
    }
    this.changed.fire();
  }

  taskItem(id: string): vscode.TreeItem {
    const t = this.allTasks.get(id);
    const done = this.store.done().has(id);
    const unit = t && this.stages.flatMap((s) => s.units).find((u) => u.id === t.unitId);
    if (!t) return new vscode.TreeItem(id);
    if (t.kind === "lesson") {
      const item = new vscode.TreeItem(t.title);
      item.description = done ? "已读" : `约 ${t.minutes} 分钟`;
      item.iconPath = new vscode.ThemeIcon(done ? "pass-filled" : "book",
        done ? new vscode.ThemeColor("testing.iconPassed") : undefined);
      item.contextValue = "lesson";
      item.tooltip = "点击打开讲解，读完后点右边的 ✓ 打勾";
      item.command = { command: "oiHelper.openLesson", title: "打开讲解", arguments: [t.unitId] };
      return item;
    }
    const item = new vscode.TreeItem(`${t.id} ${t.title}`);
    const lv = t.level === "basic" ? "基础" : "进阶";
    item.description = done ? `${lv} · 已完成` : `${lv} · ${unit?.title ?? ""}`;
    item.iconPath = new vscode.ThemeIcon(
      done ? "pass-filled" : t.level === "basic" ? "circle-large-outline" : "flame",
      done ? new vscode.ThemeColor("testing.iconPassed") : undefined,
    );
    item.contextValue = done ? "problem-done" : "problem";
    item.tooltip = `${t.id} ${t.title}\n${lv}题，预计 ${t.minutes} 分钟\n点击在洛谷打开`;
    item.command = { command: "oiHelper.openProblem", title: "在洛谷打开", arguments: [t.id] };
    return item;
  }
}

function infoItem(node: Extract<Node, { kind: "info" }>): vscode.TreeItem {
  const item = new vscode.TreeItem(node.label);
  item.tooltip = node.tooltip ?? node.label;
  if (node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);
  item.command = node.command;
  return item;
}

const GOAL_CMD: vscode.Command = { command: "oiHelper.setGoal", title: "设置目标" };

class TodayView implements vscode.TreeDataProvider<Node> {
  constructor(private app: App) {}
  get onDidChangeTreeData() { return this.app.onChange; }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node) return [];
    const plan = await this.app.today();
    if (!plan) return [];
    const s = settings();
    const today = dateKey(new Date());
    const done = this.app.store.done();
    const tasks = this.app.tasks();
    const fc = this.app.forecast();
    const out: Node[] = [];

    // Goal line.
    if (fc.examDate) {
      out.push({
        kind: "info", icon: "calendar", command: GOAL_CMD,
        label: `目标 ${s.exam}：${shortDate(fc.examDate)}${s.examDateIsGuess ? "（估计）" : ""}，还有 ${fc.daysLeft} 天`,
        tooltip: s.examDateIsGuess ? "考试日期是估计的，CCF 公布日期后请点这里改成准确日期" : "点这里修改目标",
      });
    } else if (s.exam !== "none") {
      out.push({ kind: "info", icon: "calendar", command: GOAL_CMD, label: `${s.exam} 已经过了，点这里设置下一次考试` });
    } else {
      out.push({ kind: "info", icon: "calendar", command: GOAL_CMD, label: "还没有设置目标考试（点这里设置）" });
    }

    // Forecast line.
    const left = hours(fc.neededAll);
    if (fc.neededAll === 0) {
      out.push({ kind: "info", icon: "star-full", label: "🎉 计划里的内容全部完成！" });
    } else if (!fc.examDate) {
      out.push({ kind: "info", icon: "pulse", label: `还剩约 ${left}，按现在的时间预计 ${shortDate(fc.finishDate)} 学完` });
    } else if (fc.mode === "full") {
      out.push({ kind: "info", icon: "pass", label: `时间够用：还剩约 ${left}，预计 ${shortDate(fc.finishDate)} 学完` });
    } else if (fc.mode === "basicFirst") {
      out.push({
        kind: "info", icon: "warning", label: "时间只够做完基础题：先做基础题，进阶题考后再做",
        tooltip: `考前可用约 ${hours(fc.availableMinutes!)}，基础题需要约 ${hours(fc.neededBasic)}，全部需要约 ${left}`,
      });
    } else {
      const unit = this.app.stages.flatMap((x) => x.units).find((u) => u.id === fc.reachUnitId);
      out.push({
        kind: "info", icon: "warning",
        label: unit ? `时间紧：考前大约只能学到「${unit.title}」的基础题` : "时间紧：考前很难学完，建议增加每天的学习时间",
        tooltip: `考前可用约 ${hours(fc.availableMinutes!)}，只做基础题也需要约 ${hours(fc.neededBasic)}。可以点“设置目标”增加每天的时间。`,
      });
    }

    const cur = currentUnit(tasks, done);
    if (cur) {
      const unit = this.app.stages.flatMap((x) => x.units).find((u) => u.id === cur.unitId);
      out.push({
        kind: "info", icon: "book", label: `正在学：${unit?.title}`, tooltip: "点击打开知识点讲解",
        command: { command: "oiHelper.openLesson", title: "打开讲解", arguments: [cur.unitId] },
      });
    }

    const budget = minutesOn(today, s.schedule);
    const planned = plan.ids.reduce((sum, id) => sum + (this.app.allTasks.get(id)?.minutes ?? 0), 0);
    out.push({
      kind: "info", icon: "clock", command: GOAL_CMD,
      label: `今天可用 ${budget} 分钟，任务约 ${planned} 分钟`,
      tooltip: "点这里修改每天的学习时间",
    });

    for (const id of plan.ids) out.push({ kind: "task", id });
    if (plan.ids.length > 0 && plan.ids.every((p) => done.has(p))) {
      out.push({ kind: "info", label: "今日任务完成！想继续可以点右上角 +", icon: "smiley" });
    }
    return out;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "task") return this.app.taskItem(node.id);
    if (node.kind === "info") return infoItem(node);
    return new vscode.TreeItem("");
  }
}

class RouteView implements vscode.TreeDataProvider<Node> {
  constructor(private app: App) {}
  get onDidChangeTreeData() { return this.app.onChange; }

  getChildren(node?: Node): Node[] {
    if (!this.app.hasStart) return [];
    if (!node) {
      const inPlan = new Set(this.app.planStages().map((s) => s.id));
      const sync = this.app.store.lastSync;
      return [
        { kind: "info", label: sync ? `上次同步洛谷：${sync}` : "还没有同步过洛谷", icon: "sync",
          command: { command: "oiHelper.sync", title: "同步" } },
        ...this.app.stages.map((stage): Node => ({ kind: "stage", stage, inPlan: inPlan.has(stage.id) })),
      ];
    }
    if (node.kind === "stage") {
      return node.stage.units.map((u, index): Node => ({ kind: "unit", stage: node.stage, unitId: u.id, index }));
    }
    if (node.kind === "unit") {
      return buildTasks([node.stage]).filter((t) => t.unitId === node.unitId).map((t): Node => ({ kind: "task", id: t.id }));
    }
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const done = this.app.store.done();
    switch (node.kind) {
      case "task":
        return this.app.taskItem(node.id);
      case "info":
        return infoItem(node);
      case "stage": {
        const probs = node.stage.units.flatMap((u) => u.problems);
        const n = probs.filter((p) => done.has(p.pid)).length;
        const cur = currentUnit(this.app.tasks(), done);
        const item = new vscode.TreeItem(
          node.stage.name,
          cur?.stageId === node.stage.id ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
        );
        const finish = this.app.forecast().stageFinish[node.stage.id];
        item.description = `${n}/${probs.length} 题` + (node.inPlan ? (finish ? ` · 预计 ${shortDate(finish)} 学完` : "") : " · 不在本次计划内");
        item.tooltip = node.stage.description;
        item.iconPath = new vscode.ThemeIcon(n === probs.length ? "pass-filled" : node.inPlan ? "milestone" : "circle-slash");
        item.id = `stage:${node.stage.id}`;
        return item;
      }
      case "unit": {
        const unit = node.stage.units.find((u) => u.id === node.unitId)!;
        const ids = [lessonId(unit.id), ...unit.problems.map((p) => p.pid)];
        const n = ids.filter((id) => done.has(id)).length;
        const basic = unit.problems.filter((p) => p.level === "basic").length;
        const cur = currentUnit(this.app.tasks(), done);
        const item = new vscode.TreeItem(
          `${node.index + 1}. ${unit.title}`,
          cur?.unitId === unit.id ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.description = `${n}/${ids.length} · 基础 ${basic} 进阶 ${unit.problems.length - basic}`;
        item.iconPath = new vscode.ThemeIcon(n === ids.length ? "pass-filled" : cur?.unitId === unit.id ? "play-circle" : "circle-outline");
        item.contextValue = "unit";
        item.id = `unit:${unit.id}`;
        return item;
      }
    }
  }
}

// ---------- commands ----------

/** Commands from tree inline buttons get the Node; commands from item clicks get the id. */
function idOf(arg: unknown): string | undefined {
  if (typeof arg === "string") return arg;
  const n = arg as Node | undefined;
  return n && n.kind === "task" ? n.id : undefined;
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

/** Loose title comparison: ignore spaces, brackets and punctuation width. */
export function sameTitle(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.normalize("NFKC").replace(/[\s【】\[\]（）()·•\-—_,，:：/]/g, "").toLowerCase();
  return norm(a) === norm(b);
}

export function activate(ctx: vscode.ExtensionContext) {
  const app = new App(ctx);
  const output = app.output;
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
      app.stages.map((s) => ({ label: s.name, detail: s.description, id: s.id })),
      { placeHolder: "你现在从哪个阶段开始学？（前面阶段的内容不会排进计划）" },
    );
    if (!pick) return;
    await app.store.setStart(pick.id);
    await app.refresh();
    if (settings().exam === "none") {
      const a = await vscode.window.showInformationMessage("要设置目标考试吗？插件会按考试日期和你每天的时间排计划。", "设置目标", "以后再说");
      if (a === "设置目标") await vscode.commands.executeCommand("oiHelper.setGoal");
    }
    if (!cfg().get<string>("luoguUser")) {
      const a = await vscode.window.showInformationMessage("要连接洛谷账号吗？连上后 AC 的题会自动打勾。", "设置洛谷账号", "以后再说");
      if (a === "设置洛谷账号") await vscode.commands.executeCommand("oiHelper.setLuoguUser");
    }
  });

  cmd("oiHelper.setGoal", async () => {
    const today = dateKey(new Date());
    const exams: { label: string; detail: string; exam: Exam }[] = [
      { label: "CSP-J", detail: "学完零基础和普及组", exam: "CSP-J" },
      { label: "CSP-S", detail: "学完到提高组", exam: "CSP-S" },
      { label: "NOIP", detail: "学完到提高组", exam: "NOIP" },
      { label: "不设考试", detail: "只按每天的时间往前学", exam: "none" },
    ];
    const pick = await vscode.window.showQuickPick(exams, { placeHolder: "目标考试是哪个？" });
    if (!pick) return;
    let date = "";
    if (pick.exam !== "none") {
      const guess = estimateExamDate(pick.exam, today)!;
      const v = await vscode.window.showInputBox({
        prompt: `${pick.label} 的考试日期（格式 2026-11-28）。默认值是估计的，请以 CCF 公布的日期为准。`,
        value: guess,
        validateInput: (x) => (isValidDate(x.trim()) ? undefined : "请按 年-月-日 填写，例如 2026-11-28"),
      });
      if (v === undefined) return;
      date = v.trim();
    }
    const num = (x: string) => (/^\d+$/.test(x.trim()) && Number(x) <= 1440 ? undefined : "请填 0 到 1440 之间的整数");
    const wd = await vscode.window.showInputBox({
      prompt: "上学的日子（周一到周五）每天能学多少分钟？",
      value: String(cfg().get<number>("weekdayMinutes", 90)),
      validateInput: num,
    });
    if (wd === undefined) return;
    const we = await vscode.window.showInputBox({
      prompt: "周末（周六、周日）每天能学多少分钟？",
      value: String(cfg().get<number>("weekendMinutes", 180)),
      validateInput: num,
    });
    if (we === undefined) return;
    const g = vscode.ConfigurationTarget.Global;
    await cfg().update("targetExam", pick.exam, g);
    await cfg().update("examDate", date, g);
    await cfg().update("weekdayMinutes", Number(wd), g);
    await cfg().update("weekendMinutes", Number(we), g);
    await app.store.clearPlan();
    await app.refresh();
  });

  cmd("oiHelper.setLuoguUser", async () => {
    const v = await vscode.window.showInputBox({
      prompt: "输入你的洛谷用户名或 UID（个人主页网址里的数字）",
      value: cfg().get<string>("luoguUser", ""),
    });
    if (v === undefined) return;
    await cfg().update("luoguUser", v.trim(), vscode.ConfigurationTarget.Global);
    if (v.trim()) await vscode.commands.executeCommand("oiHelper.sync");
  });

  cmd("oiHelper.setLuoguCookie", async () => {
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
    await cfg().update("luoguCookie", cleaned, vscode.ConfigurationTarget.Global);
    if (cleaned) await vscode.commands.executeCommand("oiHelper.sync");
  });

  cmd("oiHelper.sync", async (silent?: boolean) => {
    const user = cfg().get<string>("luoguUser", "").trim();
    if (!user) {
      if (silent !== true) {
        const a = await vscode.window.showWarningMessage("还没有设置洛谷账号。", "设置洛谷账号");
        if (a) await vscode.commands.executeCommand("oiHelper.setLuoguUser");
      }
      return;
    }
    const cookie = cfg().get<string>("luoguCookie", "").trim() || undefined;
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
    const plan = await app.today();
    if (!plan) return;
    const ordered = orderFor(app.tasks(), app.store.done(), app.forecast().mode);
    const next = pickTasks(ordered, 0, plan.ids);
    if (next.length === 0) {
      vscode.window.showInformationMessage("计划里已经没有没做的任务了！");
      return;
    }
    await app.store.setPlan({ date: plan.date, ids: [...plan.ids, ...next] });
    await app.refresh();
  });

  cmd("oiHelper.openProblem", (arg) => {
    const id = idOf(arg);
    if (id && !id.startsWith("lesson:")) vscode.env.openExternal(vscode.Uri.parse(problemUrl(id)));
  });

  cmd("oiHelper.toggleDone", async (arg) => {
    const id = idOf(arg);
    if (!id) return;
    await app.store.toggle(id);
    await app.refresh();
  });

  cmd("oiHelper.openLesson", async (arg) => {
    let unitId: string | undefined;
    if (typeof arg === "string") unitId = arg.replace(/^lesson:/, "");
    else if ((arg as Node)?.kind === "unit") unitId = (arg as any).unitId;
    else if ((arg as Node)?.kind === "task") unitId = app.allTasks.get((arg as any).id)?.unitId;
    const unit = app.stages.flatMap((s) => s.units).find((u) => u.id === unitId);
    if (!unit) return;
    const uri = vscode.Uri.file(path.join(ctx.extensionPath, "content", unit.lesson));
    await vscode.commands.executeCommand("markdown.showPreview", uri);
  });

  cmd("oiHelper.startCoding", async (arg) => {
    const pid = idOf(arg);
    if (!pid || pid.startsWith("lesson:")) return;
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      const a = await vscode.window.showWarningMessage("先用“文件 → 打开文件夹”打开一个放代码的文件夹，再新建代码文件。", "打开文件夹");
      if (a) await vscode.commands.executeCommand("vscode.openFolder");
      return;
    }
    const dir = vscode.Uri.joinPath(folder.uri, cfg().get<string>("codeFolder", "luogu"));
    const file = vscode.Uri.joinPath(dir, `${pid}.cpp`);
    try {
      await vscode.workspace.fs.stat(file);
    } catch {
      await vscode.workspace.fs.createDirectory(dir);
      const title = app.allTasks.get(pid)?.title ?? "";
      await vscode.workspace.fs.writeFile(file, Buffer.from(codeTemplate(pid, title), "utf8"));
    }
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));
  });

  cmd("oiHelper.checkContent", async () => {
    const cookie = cfg().get<string>("luoguCookie", "").trim() || undefined;
    const problems = app.stages.flatMap((s) => s.units.flatMap((u) => u.problems.map((p) => ({ ...p, unit: u.title, stage: s.name }))));
    const bad: string[] = [];
    const failed: string[] = [];
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "正在用洛谷核对题目", cancellable: true },
      async (progress, token) => {
        for (let i = 0; i < problems.length && !token.isCancellationRequested; i++) {
          const p = problems[i];
          progress.report({ message: `${i + 1}/${problems.length} ${p.pid}`, increment: 100 / problems.length });
          try {
            const title = await fetchProblemTitle(p.pid, cookie);
            if (title === undefined) bad.push(`| ${p.pid} | ${p.title} | （洛谷上没有这道题） | ${p.stage} · ${p.unit} |`);
            else if (!sameTitle(title, p.title)) bad.push(`| ${p.pid} | ${p.title} | ${title} | ${p.stage} · ${p.unit} |`);
          } catch (e) {
            failed.push(`${p.pid}（${(e as Error).message}）`);
          }
          await new Promise((r) => setTimeout(r, 400)); // be gentle with Luogu
        }
      },
    );
    const lines = [
      "# 题目核对结果",
      "",
      `共核对 ${problems.length} 题，题名对不上 ${bad.length} 题，查询失败 ${failed.length} 题。`,
      "",
    ];
    if (bad.length) {
      lines.push("## 题名对不上", "", "| 题号 | 插件里写的 | 洛谷上的 | 所在单元 |", "| --- | --- | --- | --- |", ...bad, "");
    }
    if (failed.length) lines.push("## 查询失败", "", ...failed.map((f) => `- ${f}`), "");
    if (!bad.length && !failed.length) lines.push("全部对得上 🎉");
    lines.push("", "把这份结果发给维护插件的人，或者直接改 `content/routes/` 里对应的 JSON。");
    const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: lines.join("\n") });
    await vscode.window.showTextDocument(doc);
  });

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (["targetExam", "examDate", "weekdayMinutes", "weekendMinutes"].some((k) => e.affectsConfiguration(`oiHelper.${k}`))) {
        await app.store.clearPlan();
        await app.refresh();
      }
    }),
    // Pick up a new day's list if VS Code stays open past midnight.
    vscode.window.onDidChangeWindowState((s) => { if (s.focused) app.refresh(); }),
  );

  app.refresh();
  if (cfg().get<boolean>("syncOnStartup", true) && app.hasStart) {
    vscode.commands.executeCommand("oiHelper.sync", true);
  }
}

export function deactivate() {}
