// Pure planning logic. No VS Code imports here, so it can be unit-tested with plain Node.

export interface Problem {
  pid: string;
  title: string;
}

export interface Unit {
  id: string;
  title: string;
  days: number;
  lesson: string;
  problems: Problem[];
}

export interface Route {
  id: string;
  name: string;
  description: string;
  units: Unit[];
}

export interface DailyPlan {
  date: string; // YYYY-MM-DD, local time
  pids: string[];
}

/** Local date as YYYY-MM-DD. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Whole days from date a to date b (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function unitDoneCount(unit: Unit, done: Set<string>): number {
  return unit.problems.filter((p) => done.has(p.pid)).length;
}

/** Index of the first unit that still has unfinished problems; units.length when all are done. */
export function currentUnitIndex(route: Route, done: Set<string>): number {
  const i = route.units.findIndex((u) => unitDoneCount(u, done) < u.problems.length);
  return i === -1 ? route.units.length : i;
}

/**
 * Index of the unit the student should be on according to the suggested days,
 * counting from the day they started the route.
 */
export function expectedUnitIndex(route: Route, startDate: string, today: string): number {
  const elapsed = Math.max(0, daysBetween(startDate, today));
  let total = 0;
  for (let i = 0; i < route.units.length; i++) {
    total += route.units[i].days;
    if (elapsed < total) return i;
  }
  return route.units.length;
}

export function totalDays(route: Route): number {
  return route.units.reduce((s, u) => s + u.days, 0);
}

/** All problems in route order. */
export function allProblems(route: Route): Problem[] {
  return route.units.flatMap((u) => u.problems);
}

export function findProblem(route: Route, pid: string): { unit: Unit; problem: Problem } | undefined {
  for (const unit of route.units) {
    const problem = unit.problems.find((p) => p.pid === pid);
    if (problem) return { unit, problem };
  }
  return undefined;
}

/** The next `count` unfinished problems in route order, skipping any in `exclude`. */
export function nextUnfinished(route: Route, done: Set<string>, count: number, exclude: string[] = []): string[] {
  const skip = new Set(exclude);
  return allProblems(route)
    .filter((p) => !done.has(p.pid) && !skip.has(p.pid))
    .slice(0, count)
    .map((p) => p.pid);
}

/**
 * Today's list. A list made earlier today is kept as is (finished problems stay
 * on it and show as done), so the list does not shift while the student works.
 * On a new day, a fresh list is made from the next unfinished problems.
 */
export function todayPlan(
  route: Route,
  done: Set<string>,
  count: number,
  today: string,
  saved: DailyPlan | undefined,
): DailyPlan {
  if (saved && saved.date === today) {
    // Drop problems that are no longer in the route (content was edited).
    const known = new Set(allProblems(route).map((p) => p.pid));
    return { date: today, pids: saved.pids.filter((pid) => known.has(pid)) };
  }
  return { date: today, pids: nextUnfinished(route, done, count) };
}
