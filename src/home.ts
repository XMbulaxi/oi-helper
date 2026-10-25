// 学习助手 panel: exam countdown, overall progress, today's tasks and the
// whole route, drawn as a web page in the sidebar.

import * as vscode from "vscode";

export interface TaskView {
  id: string;
  kind: "lesson" | "problem";
  level: "basic" | "advanced";
  title: string;
  minutes: number;
  done: boolean;
  unit: string;
}

export type HomeState =
  | { hasStart: false }
  | {
      hasStart: true;
      exam: string;
      examDate?: string;
      examPassed: boolean;
      examGuess: boolean;
      daysLeft?: number;
      forecastText: string;
      tone: "good" | "warn" | "info";
      overall: { done: number; total: number };
      current?: { unitId: string; title: string };
      today: { budget: number; planned: number; tasks: TaskView[] };
      lastSync?: string;
      luoguUser: string;
      stages: {
        id: string;
        name: string;
        description: string;
        inPlan: boolean;
        done: number;
        total: number;
        finish?: string;
        units: { id: string; title: string; done: number; total: number; current: boolean; tasks: TaskView[] }[];
      }[];
    };

/** Commands the page may run. */
const ALLOWED = new Set([
  "oiHelper.selectRoute",
  "oiHelper.setGoal",
  "oiHelper.sync",
  "oiHelper.setLuoguUser",
  "oiHelper.moreToday",
  "oiHelper.openProblem",
  "oiHelper.startCoding",
  "oiHelper.toggleDone",
  "oiHelper.openLesson",
]);

export class HomeView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(onChange: vscode.Event<void>, private state: () => Promise<HomeState>) {
    onChange(() => this.render());
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = homeHtml();
    view.webview.onDidReceiveMessage((m) => {
      if (m?.type === "ready") this.render();
      else if (m?.type === "cmd" && ALLOWED.has(m.id)) vscode.commands.executeCommand(m.id, m.arg);
    });
    view.onDidChangeVisibility(() => view.visible && this.render());
  }

  async render() {
    if (!this.view) return;
    this.view.webview.postMessage({ type: "state", state: await this.state() });
  }
}

export function homeHtml(): string {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root {
  --green: #2ea043; --yellow: #d29922; --blue: #3b82f6; --orange: #e8730c; --purple: #8957e5;
  --card: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
  --line: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
  --track: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
}
* { box-sizing: border-box; }
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 4px 10px 20px; margin: 0; }
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; padding: 0; }
.btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); padding: 4px 10px; border-radius: 4px; }
.btn:hover { background: var(--vscode-button-hoverBackground); }
.btn.sec { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.btn.sec:hover { background: var(--vscode-button-secondaryHoverBackground); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; margin: 10px 0; }
h3 { margin: 0; font-size: 105%; display: flex; align-items: center; gap: 6px; }
h3 .grow { flex: 1; }
.muted { opacity: .7; font-size: 90%; }
.row { display: flex; align-items: center; gap: 8px; }
.grow { flex: 1; min-width: 0; }

/* hero */
.hero { display: flex; gap: 14px; align-items: center; }
.ring { width: 76px; height: 76px; flex: none; position: relative; }
.ring svg { transform: rotate(-90deg); }
.ring .pct { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; }
.ring .pct b { font-size: 18px; }
.ring .pct span { font-size: 10px; opacity: .7; }
.count { font-size: 13px; opacity: .8; }
.count b { font-size: 26px; color: var(--blue); margin: 0 2px; opacity: 1; }
.count.none b { font-size: 16px; }
.tone { margin-top: 10px; padding: 6px 8px; border-radius: 6px; font-size: 92%; line-height: 1.45; }
.tone.good { background: color-mix(in srgb, var(--green) 16%, transparent); }
.tone.warn { background: color-mix(in srgb, var(--yellow) 18%, transparent); }
.tone.info { background: color-mix(in srgb, var(--blue) 14%, transparent); }
.link { color: var(--vscode-textLink-foreground); }
.link:hover { text-decoration: underline; }

/* progress bar */
.bar { height: 6px; border-radius: 3px; background: var(--track); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--blue), var(--green)); }
.bar.thin { height: 4px; }

/* tasks */
.task { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-radius: 6px; }
.task:hover { background: var(--vscode-list-hoverBackground); }
.task + .task { border-top: 1px solid var(--line); }
.check { width: 18px; height: 18px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--vscode-foreground) 45%, transparent); flex: none; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; }
.check:hover { border-color: var(--green); }
.done .check { background: var(--green); border-color: var(--green); }
.done .title { opacity: .55; text-decoration: line-through; }
.title { text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; width: 100%; }
.title:hover { color: var(--vscode-textLink-foreground); }
.sub { font-size: 85%; opacity: .6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tag { font-size: 10px; padding: 1px 6px; border-radius: 10px; flex: none; font-weight: 600; }
.tag.lesson { background: color-mix(in srgb, var(--purple) 22%, transparent); color: var(--purple); }
.tag.basic { background: color-mix(in srgb, var(--blue) 20%, transparent); color: var(--blue); }
.tag.advanced { background: color-mix(in srgb, var(--orange) 22%, transparent); color: var(--orange); }
.acts { display: flex; gap: 2px; opacity: 0; transition: opacity .1s; }
.task:hover .acts { opacity: 1; }
.act { width: 22px; height: 22px; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
.act:hover { background: var(--vscode-toolbar-hoverBackground); }
.act svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }

/* route */
.stage { padding: 0; overflow: hidden; }
.stage > summary, .unit > summary { list-style: none; cursor: pointer; }
.stage > summary::-webkit-details-marker, .unit > summary::-webkit-details-marker { display: none; }
.stage > summary { padding: 10px 12px; }
.stage > summary:hover, .unit > summary:hover { background: var(--vscode-list-hoverBackground); }
.stage.off > summary { opacity: .55; }
.chev { display: inline-block; transition: transform .15s; opacity: .6; font-size: 10px; width: 10px; }
details[open] > summary .chev { transform: rotate(90deg); }
.units { border-top: 1px solid var(--line); padding: 4px 0; }
.unit > summary { padding: 6px 12px; }
.unit.cur > summary { background: color-mix(in srgb, var(--blue) 12%, transparent); }
.num { width: 20px; height: 20px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700;
  background: var(--track); }
.unit.full .num { background: var(--green); color: #fff; }
.unit.cur .num { background: var(--blue); color: #fff; }
.unit .tasks { padding: 0 8px 6px 36px; }
.unit .task { padding: 3px 4px; }
.unit .task + .task { border-top: none; }
.mini { width: 34px; flex: none; }
@media (max-width: 260px) { .mini { display: none; } }
.empty { text-align: center; padding: 18px 8px; }
.foot { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; font-size: 90%; }
.section { margin: 16px 2px 6px; font-weight: 600; opacity: .8; font-size: 90%; letter-spacing: .5px; }
</style></head><body>
<div id="app"><p class="muted">加载中…</p></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const saved = vscode.getState() || {};
const open = new Set(saved.open || []);
let state = null;
const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cmd = (id, arg) => vscode.postMessage({ type: "cmd", id, arg });
const pct = (d, t) => (t ? Math.round((100 * d) / t) : 0);
const ICON = {
  code: '<svg viewBox="0 0 16 16"><path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4"/></svg>',
  ext: '<svg viewBox="0 0 16 16"><path d="M9 3h4v4M13 3 7.5 8.5M12 9.5V13H3V4h3.5"/></svg>',
  book: '<svg viewBox="0 0 16 16"><path d="M2.5 3h4A1.5 1.5 0 0 1 8 4.5V13a1.5 1.5 0 0 0-1.5-1.5h-4zM13.5 3h-4A1.5 1.5 0 0 0 8 4.5V13a1.5 1.5 0 0 1 1.5-1.5h4z"/></svg>',
  sync: '<svg viewBox="0 0 16 16"><path d="M13 3v3.5H9.5M3 13V9.5h3.5M12.6 6.5A5 5 0 0 0 3.5 6M3.4 9.5a5 5 0 0 0 9.1.5"/></svg>',
  plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>',
};
const LEVEL = { lesson: "讲解", basic: "基础", advanced: "进阶" };

function bar(d, t, cls) { return '<div class="bar ' + (cls || "") + '"><i style="width:' + pct(d, t) + '%"></i></div>'; }

function ring(d, t) {
  const r = 32, c = 2 * Math.PI * r, p = t ? d / t : 0;
  return '<div class="ring"><svg width="76" height="76" viewBox="0 0 76 76">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#2ea043"/></linearGradient></defs>' +
    '<circle cx="38" cy="38" r="' + r + '" fill="none" stroke="var(--track)" stroke-width="7"/>' +
    '<circle cx="38" cy="38" r="' + r + '" fill="none" stroke="url(#g)" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (c * p) + ' ' + c + '"/>' +
    '</svg><div class="pct"><b>' + pct(d, t) + '%</b><span>' + d + '/' + t + '</span></div></div>';
}

function task(t, showUnit) {
  const kind = t.kind === "lesson" ? "lesson" : t.level;
  const main = t.kind === "lesson" ? (showUnit ? t.title.replace(/^读讲解：/, "") : "读这一单元的讲解") : t.id + " " + t.title;
  const sub = showUnit ? (t.kind === "lesson" ? "读讲解" : t.unit) + " · 约 " + t.minutes + " 分钟" : "";
  let acts = "";
  if (t.kind === "problem") {
    acts = '<button class="act" data-c="oiHelper.startCoding" data-a="' + esc(t.id) + '" title="新建代码文件">' + ICON.code + '</button>' +
           '<button class="act" data-c="oiHelper.openProblem" data-a="' + esc(t.id) + '" title="在洛谷打开">' + ICON.ext + '</button>';
  }
  const open = t.kind === "lesson" ? "oiHelper.openLesson" : "oiHelper.openProblem";
  return '<div class="task' + (t.done ? " done" : "") + '">' +
    '<button class="check" data-c="oiHelper.toggleDone" data-a="' + esc(t.id) + '" title="' + (t.done ? "取消完成" : "标记完成") + '">' + (t.done ? "✓" : "") + '</button>' +
    '<span class="tag ' + kind + '">' + LEVEL[kind] + '</span>' +
    '<div class="grow"><button class="title" data-c="' + open + '" data-a="' + esc(t.id) + '" title="' + esc(main) + '">' + esc(main) + '</button>' +
    (sub ? '<div class="sub">' + esc(sub) + '</div>' : "") + '</div>' +
    '<div class="acts">' + acts + '</div></div>';
}

function render() {
  if (!state) return;
  if (!state.hasStart) {
    app.innerHTML = '<div class="card empty"><div style="font-size:28px">🧭</div><p>欢迎！先选择从哪个阶段开始学，<br>插件会帮你排好每天的任务。</p>' +
      '<button class="btn" data-c="oiHelper.selectRoute">选择起点阶段</button></div>';
    return bindAll();
  }
  const s = state;
  let h = "";

  // Hero: countdown + overall progress.
  let count;
  if (s.daysLeft !== undefined) {
    count = '<div class="count">距 ' + esc(s.exam) + ' 还有<b>' + s.daysLeft + '</b>天</div>' +
      '<div class="muted">' + esc(s.examDate) + (s.examGuess ? '（估计，<button class="link" data-c="oiHelper.setGoal">改成准确日期</button>）' : "") + '</div>';
  } else if (s.examPassed) {
    count = '<div class="count none"><b>' + esc(s.exam) + ' 已经结束</b></div><button class="link" data-c="oiHelper.setGoal">设置下一次考试</button>';
  } else {
    count = '<div class="count none"><b>还没有目标考试</b></div><button class="link" data-c="oiHelper.setGoal">设置目标考试和每天的时间</button>';
  }
  const cur = s.current ? '<div class="muted" style="margin-top:6px">正在学：<button class="link" data-c="oiHelper.openLesson" data-a="' + esc(s.current.unitId) + '">' + esc(s.current.title) + '</button></div>' : "";
  h += '<div class="card"><div class="hero">' + ring(s.overall.done, s.overall.total) + '<div class="grow">' + count + cur + '</div></div>' +
    '<div class="tone ' + s.tone + '">' + esc(s.forecastText) + '</div></div>';

  // Today.
  const td = s.today.tasks.filter((t) => t.done).length;
  h += '<div class="card"><h3><span class="grow">📅 今日任务 <span class="muted">' + td + ' / ' + s.today.tasks.length + '</span></span>' +
    '<button class="act" data-c="oiHelper.sync" title="同步洛谷进度">' + ICON.sync + '</button>' +
    '<button class="act" data-c="oiHelper.moreToday" title="再来一项">' + ICON.plus + '</button></h3>' +
    '<div class="muted" style="margin:4px 0 6px">今天可用 ' + s.today.budget + ' 分钟，任务约 ' + s.today.planned + ' 分钟 · <button class="link" data-c="oiHelper.setGoal">改时间</button></div>' +
    bar(td, s.today.tasks.length) + '<div style="margin-top:6px">';
  h += s.today.tasks.map((t) => task(t, true)).join("");
  if (s.today.tasks.length && td === s.today.tasks.length) {
    h += '<div class="empty">🎉 今日任务完成！<br><button class="btn sec" style="margin-top:8px" data-c="oiHelper.moreToday">再来一项</button></div>';
  }
  h += '</div></div>';

  // Route.
  h += '<div class="section">学习路线</div>';
  for (const st of s.stages) {
    const key = "s:" + st.id;
    const isOpen = open.has(key);
    h += '<details class="card stage' + (st.inPlan ? "" : " off") + '" data-k="' + key + '"' + (isOpen ? " open" : "") + '><summary title="' + esc(st.description) + '">' +
      '<div class="row"><span class="chev">▶</span><b class="grow">' + esc(st.name) + '</b><span class="muted">' + st.done + '/' + st.total + '</span></div>' +
      '<div style="margin:6px 0 4px 18px">' + bar(st.done, st.total) + '</div>' +
      '<div class="muted" style="margin-left:18px">' + (st.inPlan ? (st.done === st.total ? "已全部完成" : st.finish ? "预计 " + st.finish + " 学完" : "") : "不在本次计划内") + '</div>' +
      '</summary><div class="units">';
    st.units.forEach((u, i) => {
      const uk = "u:" + u.id;
      const uOpen = open.has(uk);
      const cls = (u.current ? " cur" : "") + (u.done === u.total ? " full" : "");
      h += '<details class="unit' + cls + '" data-k="' + uk + '"' + (uOpen ? " open" : "") + '><summary><div class="row">' +
        '<span class="num">' + (u.done === u.total ? "✓" : i + 1) + '</span><span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(u.title) + '</span>' +
        '<span class="mini">' + bar(u.done, u.total, "thin") + '</span><span class="muted" style="width:38px;text-align:right">' + u.done + '/' + u.total + '</span>' +
        '</div></summary><div class="tasks">' + u.tasks.map((t) => task(t, false)).join("") + '</div></details>';
    });
    h += '</div></details>';
  }

  // Footer.
  h += '<div class="foot muted">' +
    '<button class="link" data-c="oiHelper.selectRoute">换起点阶段</button>' +
    '<button class="link" data-c="oiHelper.setGoal">目标和时间</button>' +
    '<button class="link" data-c="oiHelper.setLuoguUser">' + (s.luoguUser ? "洛谷：" + esc(s.luoguUser) : "连接洛谷") + '</button>' +
    '<span>' + (s.lastSync ? "上次同步 " + esc(s.lastSync) : "还没同步过洛谷") + '</span></div>';

  app.innerHTML = h;
  bindAll();
}

function bindAll() {
  for (const el of app.querySelectorAll("[data-c]")) {
    el.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); cmd(el.dataset.c, el.dataset.a); });
  }
  for (const d of app.querySelectorAll("details[data-k]")) {
    d.addEventListener("toggle", () => {
      if (d.open) open.add(d.dataset.k); else open.delete(d.dataset.k);
      saved.open = [...open];
      vscode.setState(saved);
    });
  }
}

window.addEventListener("message", (e) => {
  if (e.data.type === "state") {
    state = e.data.state;
    // When the student moves on to a new unit, open it (and its stage) once.
    if (state.hasStart) {
      for (const st of state.stages) for (const u of st.units) {
        if (u.current && saved.lastCur !== u.id) {
          saved.lastCur = u.id; open.add("s:" + st.id); open.add("u:" + u.id);
          saved.open = [...open]; vscode.setState(saved);
        }
      }
    }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }
});
vscode.postMessage({ type: "ready" });
</script></body></html>`;
}
