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
import { registerContest } from "./contest";
import { HomeState, HomeView, TaskView } from "./home";
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
}

/** Everything the 学习助手 panel shows, as plain data. */
async function snapshot(app: App): Promise<HomeState> {
  if (!app.hasStart) return { hasStart: false };
  const plan = await app.today();
  const s = settings();
  const today = dateKey(new Date());
  const done = app.store.done();
  const tasks = app.tasks();
  const fc = app.forecast();
  const units = app.stages.flatMap((x) => x.units);
  const unitTitle = (id: string) => units.find((u) => u.id === id)?.title ?? "";
  const view = (t: Task): TaskView => ({
    id: t.id, kind: t.kind, level: t.level, title: t.title, minutes: t.minutes, done: done.has(t.id), unit: unitTitle(t.unitId),
  });

  // One line about whether the time is enough.
  const left = hours(fc.neededAll);
  let forecastText: string;
  let tone: "good" | "warn" | "info" = "info";
  if (fc.neededAll === 0) {
    forecastText = "🎉 计划里的内容全部完成！";
    tone = "good";
  } else if (!fc.examDate) {
    forecastText = `还剩约 ${left}，按现在的时间预计 ${shortDate(fc.finishDate)} 学完`;
  } else if (fc.mode === "full") {
    forecastText = `时间够用：还剩约 ${left}，预计 ${shortDate(fc.finishDate)} 学完`;
    tone = "good";
  } else if (fc.mode === "basicFirst") {
    forecastText = `时间只够做完基础题（考前可用约 ${hours(fc.availableMinutes!)}，全部需要约 ${left}）。先做基础题，进阶题考后再做。`;
    tone = "warn";
  } else {
    const u = units.find((x) => x.id === fc.reachUnitId);
    forecastText = u
      ? `时间紧：考前大约只能学到「${u.title}」的基础题。可以增加每天的学习时间。`
      : "时间紧：考前很难学完，建议增加每天的学习时间。";
    tone = "warn";
  }

  const inPlan = new Set(app.planStages().map((x) => x.id));
  const cur = currentUnit(tasks, done);
  const planIds = new Set(tasks.map((t) => t.id));
  const ids = plan?.ids ?? [];
  return {
    hasStart: true,
    exam: s.exam,
    examDate: fc.examDate ? shortDate(fc.examDate) : undefined,
    examPassed: s.exam !== "none" && !fc.examDate,
    examGuess: s.examDateIsGuess,
    daysLeft: fc.daysLeft,
    forecastText,
    tone,
    overall: { done: tasks.filter((t) => done.has(t.id)).length, total: tasks.length },
    current: cur ? { unitId: cur.unitId, title: unitTitle(cur.unitId) } : undefined,
    today: {
      budget: minutesOn(today, s.schedule),
      planned: ids.reduce((sum, id) => sum + (app.allTasks.get(id)?.minutes ?? 0), 0),
      tasks: ids.map((id) => app.allTasks.get(id)).filter((t): t is Task => !!t).map(view),
    },
    lastSync: app.store.lastSync,
    luoguUser: cfg().get<string>("luoguUser", ""),
    stages: app.stages.map((st) => {
      const all = buildTasks([st]);
      return {
        id: st.id,
        name: st.name,
        description: st.description,
        inPlan: inPlan.has(st.id),
        done: all.filter((t) => done.has(t.id)).length,
        total: all.length,
        finish: inPlan.has(st.id) && fc.stageFinish[st.id] ? shortDate(fc.stageFinish[st.id]) : undefined,
        units: st.units.map((u) => {
          const ts = all.filter((t) => t.unitId === u.id);
          return {
            id: u.id,
            title: u.title,
            done: ts.filter((t) => done.has(t.id)).length,
            total: ts.length,
            current: cur?.unitId === u.id && planIds.has(cur.id),
            tasks: ts.map(view),
          };
        }),
      };
    }),
  };
}

// ---------- commands ----------

/** Commands get a task id (from the panel) or nothing. */
function idOf(arg: unknown): string | undefined {
  return typeof arg === "string" ? arg : undefined;
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
    vscode.window.registerWebviewViewProvider("oiHelper.home", new HomeView(app.onChange, () => snapshot(app)), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  registerContest(ctx, output, codeTemplate);

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
        { location: { viewId: "oiHelper.home" }, title: "正在同步洛谷" },
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
            const r = await fetchProblemTitle(p.pid, cookie);
            if ("missing" in r) bad.push(`| ${p.pid} | ${p.title} | （洛谷上没有这道题） | ${p.stage} · ${p.unit} |`);
            else if ("unknown" in r) failed.push(`${p.pid}（${r.unknown}）`);
            else if (!sameTitle(r.title, p.title)) bad.push(`| ${p.pid} | ${p.title} | ${r.title} | ${p.stage} · ${p.unit} |`);
          } catch (e) {
            failed.push(`${p.pid}（${(e as Error).message}）`);
          }
          if (i === 4 && failed.length === 5) {
            // Every lookup so far failed the same way: Luogu probably changed its pages. Stop early.
            failed.push("前 5 题都查不到题名，已停止核对。请把“OI 学习助手”输出面板里的日志复制给维护插件的人。");
            output.show();
            break;
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
