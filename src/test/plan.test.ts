import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { parsePassed } from "../luogu";
import {
  Route,
  currentUnitIndex,
  daysBetween,
  expectedUnitIndex,
  nextUnfinished,
  todayPlan,
} from "../plan";

const route: Route = {
  id: "t",
  name: "测试",
  description: "",
  units: [
    { id: "a", title: "A", days: 2, lesson: "", problems: [{ pid: "P1", title: "" }, { pid: "P2", title: "" }] },
    { id: "b", title: "B", days: 3, lesson: "", problems: [{ pid: "P3", title: "" }, { pid: "P4", title: "" }] },
  ],
};

test("daysBetween counts whole days across months", () => {
  assert.equal(daysBetween("2026-01-30", "2026-02-02"), 3);
  assert.equal(daysBetween("2026-03-01", "2026-03-01"), 0);
});

test("current unit is the first one with unfinished problems", () => {
  assert.equal(currentUnitIndex(route, new Set()), 0);
  assert.equal(currentUnitIndex(route, new Set(["P1", "P2"])), 1);
  assert.equal(currentUnitIndex(route, new Set(["P1", "P2", "P3", "P4"])), 2);
});

test("expected unit follows suggested days", () => {
  assert.equal(expectedUnitIndex(route, "2026-01-01", "2026-01-01"), 0);
  assert.equal(expectedUnitIndex(route, "2026-01-01", "2026-01-02"), 0);
  assert.equal(expectedUnitIndex(route, "2026-01-01", "2026-01-03"), 1);
  assert.equal(expectedUnitIndex(route, "2026-01-01", "2026-01-06"), 2);
});

test("next unfinished skips done and excluded problems, across units", () => {
  assert.deepEqual(nextUnfinished(route, new Set(["P1"]), 2), ["P2", "P3"]);
  assert.deepEqual(nextUnfinished(route, new Set(["P1"]), 2, ["P2"]), ["P3", "P4"]);
});

test("today's plan stays fixed during the day and renews the next day", () => {
  const first = todayPlan(route, new Set(), 2, "2026-01-01", undefined);
  assert.deepEqual(first.pids, ["P1", "P2"]);
  const same = todayPlan(route, new Set(["P1"]), 2, "2026-01-01", first);
  assert.deepEqual(same.pids, ["P1", "P2"]);
  const next = todayPlan(route, new Set(["P1", "P2"]), 2, "2026-01-02", first);
  assert.deepEqual(next.pids, ["P3", "P4"]);
});

test("parsePassed reads both Luogu formats", () => {
  assert.deepEqual(parsePassed({ data: { passed: [{ pid: "P1001" }, { pid: "P1000" }] } }), ["P1001", "P1000"]);
  assert.deepEqual(parsePassed({ currentData: { passedProblems: [{ pid: "P1001" }] } }), ["P1001"]);
  assert.throws(() => parsePassed({ foo: 1 }));
});

test("bundled content is valid", () => {
  const root = path.join(__dirname, "..", "..", "content");
  const seen = new Map<string, string>();
  for (const f of ["zero.json", "puji.json"]) {
    const r = JSON.parse(fs.readFileSync(path.join(root, "routes", f), "utf8")) as Route;
    assert.ok(r.units.length > 0, f);
    for (const u of r.units) {
      assert.ok(fs.existsSync(path.join(root, u.lesson)), `missing lesson ${u.lesson}`);
      assert.ok(u.days > 0 && u.problems.length > 0, u.id);
      for (const p of u.problems) {
        assert.match(p.pid, /^P\d{4,5}$/, `${u.id} ${p.pid}`);
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
