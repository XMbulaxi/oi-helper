import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { parsePassed } from "../luogu";
import {
  Stage,
  buildTasks,
  daysBetween,
  estimateExamDate,
  forecast,
  isValidDate,
  pickTasks,
  simulate,
  stagesFor,
  todayPlan,
} from "../plan";

const stage = (id: string, units: string[][]): Stage => ({
  id, name: id, description: "", minutes: { basic: 30, advanced: 60, lesson: 20 },
  units: units.map((ps, i) => ({
    id: `${id}${i}`, title: `${id}${i}`, lesson: "",
    problems: ps.map((pid) => ({ pid, title: "", level: pid.endsWith("a") ? "advanced" : "basic" } as const)),
  })),
});
const zero = stage("zero", [["P1", "P2a"], ["P3", "P4a"]]);
const puji = stage("puji", [["P5"]]);
const tigao = stage("tigao", [["P6"]]);
const all = [zero, puji, tigao];

test("dates", () => {
  assert.equal(daysBetween("2026-01-30", "2026-02-02"), 3);
  assert.ok(isValidDate("2026-02-28"));
  assert.ok(!isValidDate("2026-02-30"));
  // Last Saturday of October / November.
  assert.equal(estimateExamDate("CSP-S", "2026-10-01"), "2026-10-31");
  assert.equal(estimateExamDate("NOIP", "2026-10-25"), "2026-11-28");
  assert.equal(estimateExamDate("CSP-J", "2026-11-05"), "2027-10-30");
});

test("stages run from the start stage to what the exam needs", () => {
  assert.deepEqual(stagesFor(all, "zero", "CSP-J").map((s) => s.id), ["zero", "puji"]);
  assert.deepEqual(stagesFor(all, "puji", "NOIP").map((s) => s.id), ["puji", "tigao"]);
  assert.deepEqual(stagesFor(all, "tigao", "CSP-J").map((s) => s.id), ["tigao"]);
  assert.deepEqual(stagesFor(all, "zero", "none").map((s) => s.id), ["zero", "puji", "tigao"]);
});

test("tasks: lesson, then basic, then advanced, per unit", () => {
  const ids = buildTasks([zero]).map((t) => t.id);
  assert.deepEqual(ids, ["lesson:zero0", "P1", "P2a", "lesson:zero1", "P3", "P4a"]);
});

test("simulate spreads tasks over days by minutes", () => {
  const tasks = buildTasks([zero]); // 20,30,60,20,30,60
  // 2026-01-05 is a Monday.
  const days = simulate(tasks, { weekday: 60, weekend: 0 }, "2026-01-05");
  assert.deepEqual(days, ["2026-01-05", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-07", "2026-01-08"]);
});

test("forecast picks a mode from the time left before the exam", () => {
  const tasks = buildTasks([zero]); // basic 100 min, all 220 min
  const sch = { weekday: 60, weekend: 60 };
  assert.equal(forecast(tasks, new Set(), sch, "2026-01-05", "2026-01-10").mode, "full"); // 300 min
  assert.equal(forecast(tasks, new Set(), sch, "2026-01-05", "2026-01-07").mode, "basicFirst"); // 120 min
  const tight = forecast(tasks, new Set(), sch, "2026-01-05", "2026-01-06"); // 60 min
  assert.equal(tight.mode, "tight");
  assert.equal(tight.reachUnitId, "zero0");
  assert.equal(forecast(tasks, new Set(), sch, "2026-01-05").mode, "full");
});

test("today's list fills the day's minutes and stays fixed during the day", () => {
  const tasks = buildTasks([zero]);
  const first = todayPlan(tasks, new Set(), "full", 60, "2026-01-05", undefined);
  assert.deepEqual(first.ids, ["lesson:zero0", "P1"]);
  const same = todayPlan(tasks, new Set(["P1"]), "full", 60, "2026-01-05", first);
  assert.deepEqual(same.ids, first.ids);
  const basicFirst = todayPlan(tasks, new Set(["lesson:zero0", "P1"]), "basicFirst", 60, "2026-01-06", first);
  assert.deepEqual(basicFirst.ids, ["lesson:zero1", "P3"]);
  // A task longer than the budget is still picked alone.
  assert.deepEqual(pickTasks(tasks.filter((t) => t.id === "P2a"), 10), ["P2a"]);
});

test("parsePassed reads both Luogu formats", () => {
  assert.deepEqual(parsePassed({ data: { passed: [{ pid: "P1001" }, { pid: "P1000" }] } }), ["P1001", "P1000"]);
  assert.deepEqual(parsePassed({ currentData: { passedProblems: [{ pid: "P1001" }] } }), ["P1001"]);
  assert.throws(() => parsePassed({ foo: 1 }));
});

test("bundled content is valid", () => {
  const root = path.join(__dirname, "..", "..", "content");
  const seen = new Map<string, string>();
  for (const f of ["zero.json", "puji.json", "tigao.json"]) {
    const r = JSON.parse(fs.readFileSync(path.join(root, "routes", f), "utf8")) as Stage;
    assert.ok(r.units.length > 0, f);
    for (const u of r.units) {
      assert.ok(fs.existsSync(path.join(root, u.lesson)), `missing lesson ${u.lesson}`);
      assert.ok(u.problems.length > 0, u.id);
      assert.ok(u.problems.some((p) => p.level === "basic"), `${u.id} has no basic problem`);
      for (const p of u.problems) {
        assert.match(p.pid, /^P\d{4,5}$/, `${u.id} ${p.pid}`);
        assert.ok(p.level === "basic" || p.level === "advanced", `${p.pid} level`);
        assert.ok(!seen.has(p.pid), `${p.pid} appears in both ${seen.get(p.pid)} and ${u.id}`);
        seen.set(p.pid, u.id);
      }
    }
  }
});

test("challengeCookie finds the C3VK value in Luogu's anti-bot page", async () => {
  const { challengeCookie } = await import("../luogu");
  assert.equal(challengeCookie("<script>document.cookie='C3VK=a1b2c3;path=/;max-age=300';location.reload();</script>"), "a1b2c3");
  assert.equal(challengeCookie('{"data":{}}'), undefined);
});

test("getJson keeps cookies across redirects (Luogu's redirect loop)", async () => {
  const http = await import("http");
  const { getJson } = await import("../luogu");
  const server = http.createServer((req, res) => {
    const cookie = req.headers.cookie ?? "";
    if (req.url === "/login-only") {
      res.writeHead(302, { Location: "/auth/login" }).end();
    } else if (!cookie.includes("__client_id=abc")) {
      // Without the cookie it just set, the server redirects to itself forever.
      res.writeHead(302, { "Set-Cookie": "__client_id=abc; path=/; HttpOnly", Location: req.url }).end();
    } else {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data: { passed: [{ pid: "P1001" }] } }));
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as any).port;
  try {
    assert.deepEqual(await getJson(`http://127.0.0.1:${port}/user/1/practice`), { data: { passed: [{ pid: "P1001" }] } });
    await assert.rejects(getJson(`http://127.0.0.1:${port}/login-only`), /登录/);
  } finally {
    server.close();
  }
});
