// Pure planning logic. No VS Code imports here, so it can be unit-tested with plain Node.

export type Level = "basic" | "advanced";

export interface Problem {
  pid: string;
  title: string;
  level: Level;
  /** Optional estimate in minutes; falls back to the stage's default for the level. */
  minutes?: number;
}

export interface Unit {
  id: string;
  title: string;
  lesson: string;
  lessonMinutes?: number;
  problems: Problem[];
}

/** One stage of the path: 零基础, 普及组 or 提高组. */
export interface Stage {
  id: string;
  name: string;
  description: string;
  minutes: { basic: number; advanced: number; lesson: number };
  units: Unit[];
}

export type Exam = "none" | "CSP-J" | "CSP-S" | "NOIP";

/** Which stage an exam needs the student to finish. */
export const EXAM_LAST_STAGE: Record<Exam, string | undefined> = {
  none: undefined,
  "CSP-J": "puji",
  "CSP-S": "tigao",
  NOIP: "tigao",
};

export interface Task {
  /** "lesson:<unitId>" for reading a lesson, otherwise the Luogu pid. */
  id: string;
  kind: "lesson" | "problem";
  level: Level;
  minutes: number;
  stageId: string;
  unitId: string;
  title: string;
}

export interface DailyPlan {
  date: string; // YYYY-MM-DD, local time
  ids: string[];
}

export interface Schedule {
  weekday: number; // minutes per school day
  weekend: number; // minutes per Saturday / Sunday
}

// ---------- dates ----------

/** Local date as YYYY-MM-DD. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toUtc(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  return fromUtc(toUtc(s) + n * 86_400_000);
}

/** Whole days from date a to date b (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function isWeekend(s: string): boolean {
  const wd = new Date(toUtc(s)).getUTCDay();
  return wd === 0 || wd === 6;
}

export function minutesOn(s: string, sch: Schedule): number {
  return isWeekend(s) ? sch.weekend : sch.weekday;
}

export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUtc(toUtc(s)) === s;
}

/** Last Saturday of a month (month is 1-12). */
function lastSaturday(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0));
  const back = (lastDay.getUTCDay() + 1) % 7; // days back to Saturday
  return fromUtc(lastDay.getTime() - back * 86_400_000);
}

/**
 * Rough guess of the next exam date. CCF announces real dates each year, so
 * the student should confirm it. CSP 第二轮 is usually late October or early
 * November; NOIP is usually late November.
 */
export function estimateExamDate(exam: Exam, today: string): string | undefined {
  if (exam === "none") return undefined;
  const month = exam === "NOIP" ? 11 : 10;
  const year = Number(today.slice(0, 4));
  const thisYear = lastSaturday(year, month);
  return daysBetween(today, thisYear) >= 0 ? thisYear : lastSaturday(year + 1, month);
}

// ---------- tasks ----------

export function lessonId(unitId: string): string {
  return `lesson:${unitId}`;
}

/** The stages a student works through: from their starting stage to the one their exam needs. */
export function stagesFor(all: Stage[], startId: string, exam: Exam): Stage[] {
  const start = Math.max(0, all.findIndex((s) => s.id === startId));
  const lastId = EXAM_LAST_STAGE[exam];
  const lastIdx = lastId ? all.findIndex((s) => s.id === lastId) : all.length - 1;
  const end = Math.max(start, lastIdx === -1 ? all.length - 1 : lastIdx);
  return all.slice(start, end + 1);
}

/** All tasks in study order: for each unit, its lesson, then basic problems, then advanced ones. */
export function buildTasks(stages: Stage[]): Task[] {
  const out: Task[] = [];
  for (const st of stages) {
    for (const u of st.units) {
      out.push({
        id: lessonId(u.id), kind: "lesson", level: "basic",
        minutes: u.lessonMinutes ?? st.minutes.lesson, stageId: st.id, unitId: u.id, title: `读讲解：${u.title}`,
      });
      for (const level of ["basic", "advanced"] as Level[]) {
        for (const p of u.problems.filter((x) => x.level === level)) {
          out.push({
            id: p.pid, kind: "problem", level, minutes: p.minutes ?? st.minutes[level],
            stageId: st.id, unitId: u.id, title: p.title,
          });
        }
      }
    }
  }
  return out;
}

// ---------- forecast ----------

/**
 * full:       there is time for everything before the exam.
 * basicFirst: only the basic problems fit, so they go first and advanced ones wait.
 * tight:      not even all basic problems fit; do basics in order and see how far you get.
 */
export type Mode = "full" | "basicFirst" | "tight";

export interface Forecast {
  mode: Mode;
  examDate?: string;
  daysLeft?: number;
  availableMinutes?: number;
  neededAll: number;
  neededBasic: number;
  /** Day the last remaining task would be finished at this pace. */
  finishDate?: string;
  /** Day each stage's remaining tasks would be finished (in the chosen order). */
  stageFinish: Record<string, string>;
  /** In tight mode: the last unit whose basic tasks fit before the exam. */
  reachUnitId?: string;
}

/** Remaining tasks in the order they should be done for this mode. */
export function orderFor(tasks: Task[], done: Set<string>, mode: Mode): Task[] {
  const left = tasks.filter((t) => !done.has(t.id));
  if (mode === "full") return left;
  return [...left.filter((t) => t.level === "basic"), ...left.filter((t) => t.level === "advanced")];
}

/** Walk the tasks day by day with the student's daily minutes. Returns the finishing day of each task. */
export function simulate(ordered: Task[], sch: Schedule, today: string): string[] {
  const out: string[] = [];
  if (sch.weekday <= 0 && sch.weekend <= 0) return ordered.map(() => "");
  let day = today;
  let left = minutesOn(day, sch);
  for (const t of ordered) {
    let need = t.minutes;
    while (need > 0) {
      while (left <= 0) {
        day = addDays(day, 1);
        left = minutesOn(day, sch);
      }
      const used = Math.min(need, left);
      need -= used;
      left -= used;
    }
    out.push(day);
  }
  return out;
}

export function forecast(tasks: Task[], done: Set<string>, sch: Schedule, today: string, examDate?: string): Forecast {
  const left = tasks.filter((t) => !done.has(t.id));
  const neededAll = left.reduce((s, t) => s + t.minutes, 0);
  const neededBasic = left.filter((t) => t.level === "basic").reduce((s, t) => s + t.minutes, 0);

  let mode: Mode = "full";
  let availableMinutes: number | undefined;
  let daysLeft: number | undefined;
  const exam = examDate && daysBetween(today, examDate) > 0 ? examDate : undefined;
  if (exam) {
    daysLeft = daysBetween(today, exam);
    availableMinutes = 0;
    for (let i = 0; i < daysLeft; i++) availableMinutes += minutesOn(addDays(today, i), sch);
    mode = availableMinutes >= neededAll ? "full" : availableMinutes >= neededBasic ? "basicFirst" : "tight";
  }

  const ordered = orderFor(tasks, done, mode);
  const days = simulate(ordered, sch, today);
  const stageFinish: Record<string, string> = {};
  ordered.forEach((t, i) => {
    if (days[i]) stageFinish[t.stageId] = days[i];
  });

  let reachUnitId: string | undefined;
  if (exam && mode === "tight") {
    ordered.forEach((t, i) => {
      if (t.level === "basic" && days[i] && daysBetween(days[i], exam) > 0) reachUnitId = t.unitId;
    });
  }

  return {
    mode, examDate: exam, daysLeft, availableMinutes, neededAll, neededBasic,
    finishDate: days.length ? days[days.length - 1] || undefined : undefined,
    stageFinish, reachUnitId,
  };
}

// ---------- today's list ----------

/** Take tasks in order until today's minutes are used up (always at least one task). */
export function pickTasks(ordered: Task[], budget: number, exclude: string[] = []): string[] {
  const skip = new Set(exclude);
  const out: string[] = [];
  let used = 0;
  for (const t of ordered) {
    if (skip.has(t.id)) continue;
    if (out.length > 0 && used + t.minutes > budget) break;
    out.push(t.id);
    used += t.minutes;
  }
  return out;
}

/**
 * Today's list. A list made earlier today is kept as is (finished tasks stay
 * on it and show as done), so the list does not shift while the student works.
 * On a new day, a fresh list is made.
 */
export function todayPlan(
  tasks: Task[],
  done: Set<string>,
  mode: Mode,
  budget: number,
  today: string,
  saved: DailyPlan | undefined,
): DailyPlan {
  if (saved && saved.date === today && Array.isArray(saved.ids)) {
    const known = new Set(tasks.map((t) => t.id));
    return { date: today, ids: saved.ids.filter((id) => known.has(id)) };
  }
  return { date: today, ids: pickTasks(orderFor(tasks, done, mode), budget) };
}

/** Index of the first unit (across stages) with unfinished tasks. */
export function currentUnit(tasks: Task[], done: Set<string>): Task | undefined {
  return tasks.find((t) => !done.has(t.id));
}
