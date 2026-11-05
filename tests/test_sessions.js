// Checks the session builder against the plan as written (revised plan, 5 Nov 2026).
// Run:  node tests/test_sessions.js
// The expected values below are typed in from the plan, NOT read from
// config.js, so a typo in the config shows up as a failure here.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, "config.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(root, "session.js"), "utf8"), ctx);
const Session = ctx.Session;

// ---------------- The plan, as written --------------------------------
const SCHED_A = {
  mon: ["mobility", "lightCore"], tue: ["mobility", "core"], wed: ["mobility", "strength"],
  thu: ["mobility", "wallAbs", "walkShort"], fri: ["mobility", "core"],
  sat: ["mobility", "walk", "wallAbs"], sun: ["mobility"],
};
const SCHED_BC = Object.assign({}, SCHED_A, { tue: ["mobility", "core", "wallAbs"], fri: ["mobility", "core", "wallAbs"] });
const SPEC = {
  schedule: { A: SCHED_A, B: SCHED_BC, C: SCHED_BC },
  mobility: ["Pump stretch", "Lizard twists", "Alternating pigeons", "Crab pulses", "Bridge hold"],
  coreMoves: ["Claps under the legs", "Same-side knee raises", "Knee lifts with downward press", "Squat with torso twist"],
  lightCore: { reps: ["40r", "40r/side", "40r", "20r"], restMove: 30 },
  core: {
    A: { rounds: 2, reps: ["15r", "10r/side", "15r", "8r"], restMove: 30, restRound: 90, waterEvery: 1 },
    B: { rounds: 3, reps: ["25r", "15r/side", "25r", "12r"], restMove: 25, restRound: 75, waterEvery: 2 },
    C: { rounds: 4, reps: ["30r", "20r/side", "30r", "15r"], restMove: 20, restRound: 60, waterEvery: 2 },
  },
  wallMoves: ["Wall toe-reach crunch", "Wall crunch", "Wall cross-body crunch (alternating)", "Wall knee-hug crunch", "Wall reverse crunch / hip lift"],
  wallAbs: {
    A: { rounds: 2, reps: "8r", restMove: 20, restRound: 75, waterEvery: 1 },
    B: { rounds: 3, reps: "10r", restMove: 15, restRound: 60, waterEvery: 2 },
    C: { rounds: 3, reps: "12–15r", internal: 13, restMove: 15, restRound: 60, waterEvery: 2 },
  },
  strength: {
    A: { rounds: 2, reps: "8–10r", internal: 9, plank: ["Knee plank", 20], superman: 15, restMove: 30, restRound: 90 },
    B: { rounds: 3, reps: "10–12r", internal: 11, plank: ["Knee plank", 30], superman: 20, restMove: 25, restRound: 75 },
    C: { rounds: 3, reps: "12–15r", internal: 13, plank: ["Plank (knee or full)", 40], superman: 25, restMove: 20, restRound: 60 },
  },
  // walks: total minutes, jogs as [start minute, length], water reminder minutes (every 15 on walks > 20 min)
  walkShort: { A: [20, [], []], B: [25, [], [15]], C: [25, [], [15]] },
  walk: {
    A: [30, [], [15]],
    B: [40, [[10, 1], [14, 1], [18, 1], [22, 1], [26, 1]], [15, 30]],
    C: [40, [[15, 10]], [15, 30]],
  },
  water: 45,
  blocks: { A: ["2026-11-03", "2026-11-17"], B: ["2026-11-18", "2026-12-02"], C: ["2026-12-03", "2026-12-17"] },
};

// ---------------- Expected token stream from the spec ------------------
// plan: ["mobility", "core:1", …] — ":N" limits rounds/sets. levels: { core: "B", … }.
function expected(weekday, calBlock, levels, plan) {
  const lv = (rid) => levels[{ core: "core", wallAbs: "wallAbs", strength: "strength", walkShort: "walks", walk: "walks" }[rid]] || calBlock;
  const entries = plan || SPEC.schedule[calBlock][weekday];
  const t = ["READY:5"];
  entries.forEach((entry, idx) => {
    const [rid, lim] = entry.split(":");
    if (idx > 0) t.push("WATER:45"); // between two routines (so also after mobility)
    if (rid === "mobility") SPEC.mobility.forEach((n) => t.push(`MOVE:${n}:60s` + (n === "Lizard twists" ? "+switch@30" : "")));
    const circuit = (names, reps, rounds, restMove, restRound, waterEvery) => {
      if (lim) rounds = Math.min(Number(lim), rounds);
      for (let r = 1; r <= rounds; r++) {
        names.forEach((m, i) => {
          t.push(`MOVE:${m}:${reps[i]}`);
          if (i < names.length - 1) t.push(`REST:${restMove}`);
          else if (r < rounds) {
            if (waterEvery && r % waterEvery === 0) t.push("WATER:45");
            t.push(`REST:${restRound}`);
          }
        });
      }
    };
    if (rid === "lightCore") circuit(SPEC.coreMoves, SPEC.lightCore.reps, 1, SPEC.lightCore.restMove, 0, 0);
    if (rid === "core") { const c = SPEC.core[lv(rid)]; circuit(SPEC.coreMoves, c.reps, c.rounds, c.restMove, c.restRound, c.waterEvery); }
    if (rid === "wallAbs") { const c = SPEC.wallAbs[lv(rid)]; circuit(SPEC.wallMoves, SPEC.wallMoves.map(() => c.reps), c.rounds, c.restMove, c.restRound, c.waterEvery); }
    if (rid === "strength") {
      const c = SPEC.strength[lv(rid)];
      circuit(["Wall or counter push-ups", "Glute bridges", "Chair sit-to-stand", c.plank[0], "Superman hold", "Slow chair squat"],
        [c.reps, c.reps, c.reps, c.plank[1] + "s", c.superman + "s", c.reps], c.rounds, c.restMove, c.restRound, 0);
    }
    if (rid === "walkShort" || rid === "walk") {
      const [total, jogs, water] = SPEC[rid][lv(rid)];
      t.push(`WALK:${rid}:${total}min:jogs=${jogs.map((j) => j.join("+")).join(",")}:water@${water.join(",")}`);
    }
  });
  return t;
}

function actual(session) {
  const t = [];
  const walkDone = {};
  for (const s of session.steps) {
    if (s.kind === "ready") t.push(`READY:${s.seconds}`);
    else if (s.kind === "water") t.push(`WATER:${s.seconds}`);
    else if (s.kind === "rest") t.push(`REST:${s.seconds}`);
    else if (s.segKind) {
      if (walkDone[s.routineId]) continue;
      walkDone[s.routineId] = true;
      const segs = session.steps.filter((x) => x.routineId === s.routineId);
      const total = segs.reduce((a, x) => a + x.seconds, 0) / 60;
      const jogs = segs.filter((x) => x.segKind === "jog").map((x) => `${x.walkOffset / 60}+${x.seconds / 60}`);
      const water = segs.flatMap((x) => x.cues.filter((c) => c.water).map((c) => (x.walkOffset + c.at) / 60));
      t.push(`WALK:${s.routineId}:${total}min:jogs=${jogs.join(",")}:water@${water.join(",")}`);
    } else {
      let tok = `MOVE:${s.name}:` + (s.mode === "timed" ? `${s.seconds}s` : `${s.repsShow}r` + (s.eachSide ? "/side" : ""));
      const sw = s.cues.find((c) => /switch/i.test(c.text));
      if (sw) tok += `+switch@${sw.at}`;
      t.push(tok);
    }
  }
  return t;
}

// ---------------- Run -------------------------------------------------
let failures = 0;
function check(cond, msg) { if (!cond) { failures++; console.log("   FAIL: " + msg); } }
function compare(label, exp, act) {
  const i = exp.findIndex((tok, k) => tok !== act[k]);
  const same = exp.length === act.length && i === -1;
  const at = i === -1 ? exp.length : i;
  check(same, `${label}: queue differs at step ${at}: expected "${exp[at]}", got "${act[at]}"`);
  if (!same) console.log("        expected:", exp.slice(Math.max(0, at - 2), at + 3), "\n        actual:  ", act.slice(Math.max(0, at - 2), at + 3));
  return same;
}
const all = (L) => ({ core: L, wallAbs: L, strength: L, walks: L });
function dateIn(block, wd) {
  let d = SPEC.blocks[block][0];
  while (Session.weekdayOf(d) !== wd) d = Session.addDays(d, 1);
  return d;
}

console.log("Day number / block detection");
[["2026-11-03", 1, "A"], ["2026-11-17", 15, "A"], ["2026-11-18", 16, "B"], ["2026-12-02", 30, "B"],
 ["2026-12-03", 31, "C"], ["2026-12-17", 45, "C"]].forEach(([d, n, b]) => {
  const info = Session.dayInfo(d);
  check(info.dayNumber === n && info.block.id === b && info.inPlan, `${d} → day ${info.dayNumber} block ${info.block.id}, expected day ${n} block ${b}`);
});
check(Session.totalDays() === 45, "plan should be 45 days");
check(Session.weekdayOf("2026-11-03") === "tue", "3 Nov 2026 should be a Tuesday");
console.log("   3 Nov = Day 1 (Tue, Block A) · 18 Nov = Day 16 (Block B) · 3 Dec = Day 31 (Block C) · 17 Dec = Day 45");

const sessions = {};
for (const L of ["A", "B", "C"]) {
  console.log(`\nLevel ${L} (calendar Block ${L}, every routine at Level ${L})`);
  for (const wd of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
    const d = dateIn(L, wd);
    const sess = Session.buildSession(d, { levels: all(L) });
    sessions[L + wd] = sess;
    const same = compare(`Level ${L} ${wd} ${d}`, expected(wd, L, all(L)), actual(sess));
    const water = sess.steps.filter((s) => s.kind === "water").length;
    const walkInfo = sess.steps.filter((s) => s.segKind).length ? " | " + actual(sess).filter((x) => x.startsWith("WALK")).join(" ") : "";
    console.log(`   ${same ? "ok  " : "FAIL"} ${wd} ${d}  ${sess.routines.map((r) => r.id + (r.level ? "(" + r.level + ")" : "")).join(" → ").padEnd(40)} ${String(sess.steps.length).padStart(3)} steps, ${water} water, ≈${Math.round(sess.estSeconds / 60)} min${walkInfo}`);
  }
}

console.log("\nHeld / changed levels (the calendar does not decide the level)");
[
  ["B", "tue", all("A"), "Block B Tuesday, everything held at A (B schedule, A reps)"],
  ["C", "fri", { core: "A", wallAbs: "B" }, "Block C Friday, core moved down to A, wall abs at B"],
  ["C", "wed", { strength: "B" }, "Block C Wednesday, strength held at B"],
  ["B", "sat", { walks: "A", wallAbs: "A" }, "Block B Saturday, walks + wall abs at A"],
  ["B", "thu", { walks: "C", wallAbs: "C" }, "Block B Thursday, walks + wall abs at C"],
].forEach(([cal, wd, levels, label]) => {
  const d = dateIn(cal, wd);
  const sess = Session.buildSession(d, { levels });
  const same = compare(label, expected(wd, cal, levels), actual(sess));
  console.log(`   ${same ? "ok  " : "FAIL"} ${label.padEnd(60)} ${sess.routines.map((r) => r.id + (r.level ? "(" + r.level + ")" : "")).join(" → ")}`);
});

console.log("\nStart screen + notes");
const monA = sessions.Amon, tueA = sessions.Atue;
check(/Work hard but in control/.test(tueA.steps[0].tip), "start screen shows the session-feel guidance");
check(/a few hours before football/.test(monA.steps[0].tip) && /2 × 20/.test(monA.steps[0].tip), "Monday start screen shows the light-core note");
check(!/football/.test(tueA.steps[0].tip), "light-core note only on Mondays");
const crunch = sessions.Atue && sessions.Athu.steps.find((s) => s.name === "Wall crunch");
check(crunch && /Chest-to-thighs is NOT the goal/.test(crunch.tip) && /Thick mat/.test(crunch.tip), "wall crunch shows its own tip + the wall-abs tip");
const toe = sessions.Athu.steps.find((s) => s.name === "Wall toe-reach crunch");
check(toe && /Reach for your shins/.test(toe.tip), "toe-reach crunch tip");
const push = sessions.Awed.steps.find((s) => /push-ups/.test(s.name));
check(push && /go higher on the wall/.test(push.tip), "push-up elbow tip");
const sit = sessions.Awed.steps.find((s) => s.name === "Chair sit-to-stand"), sq = sessions.Awed.steps.find((s) => s.name === "Slow chair squat");
check(sit && sq && /knees over toes/.test(sit.tip) && /knees over toes/.test(sq.tip) && /3 s down, 1 s up/.test(sq.note), "chair moves: knee tip, 3 s down / 1 s up");
console.log(`   ${failures ? "see failures above" : "ok   guidance, light-core note, and wall-abs / push-up / chair tips"}`);
const startFails = failures;

// ---------------- Activities (other sports) reduce the day -------------
console.log("\nActivities");
const plan = (d, acts, extra) => Session.dayPlan(d, Object.assign({ activities: acts }, extra)).routines.map((r) => r.id + (r.rounds ? ":" + r.rounds : "")).join(" ");
const act = (id) => ({ activity: id, effect: Session.activityDef(id).effect, name: id });
[
  ["2026-11-09", "Mon, nothing logged", [], all("A"), "mobility lightCore"],
  ["2026-11-09", "Mon + football (already planned for)", [act("football")], all("A"), "mobility lightCore"],
  ["2026-11-10", "Tue A + football", [act("football")], all("A"), "mobility core:1"],
  ["2026-11-10", "Tue A + padel (2 of 2 rounds)", [act("padel")], all("A"), "mobility core:2"],
  ["2026-11-24", "Tue B + padel", [act("padel")], all("B"), "mobility core:2 wallAbs:1"],
  ["2026-11-24", "Tue B + padel, full plan anyway", [act("padel")], Object.assign({ fullPlan: true }, all("B")), "mobility core wallAbs"],
  ["2026-11-05", "Thu A + football (walk + wall abs dropped)", [act("football")], all("A"), "mobility"],
  ["2026-11-05", "Thu A + yoga (light)", [act("yoga")], all("A"), "mobility wallAbs walkShort"],
  ["2026-11-07", "Sat A + padel", [act("padel")], all("A"), "mobility wallAbs:1"],
  ["2026-11-04", "Wed A + football", [act("football")], all("A"), "mobility strength:1"],
  ["2026-11-08", "Sun + football (never adds work)", [act("football")], all("A"), "mobility"],
].forEach(([d, label, acts, extra, want]) => {
  const levels = Object.assign({}, extra); delete levels.fullPlan;
  const got = plan(d, acts, { levels, fullPlan: extra.fullPlan });
  check(got === want, `${label}: got "${got}", expected "${want}"`);
  console.log(`   ${got === want ? "ok  " : "FAIL"} ${label.padEnd(46)} → ${got}`);
});

// Picked subsets / reduced rounds build correctly too.
console.log("\nPartial sessions");
[
  ["A", "thu", all("A"), [{ id: "wallAbs" }], ["wallAbs"], "Only wall abs (no water break first)"],
  ["A", "tue", all("A"), [{ id: "core", rounds: 1 }], ["core:1"], "Core, 1 round"],
  ["B", "fri", all("B"), [{ id: "mobility" }, { id: "wallAbs" }], ["mobility", "wallAbs"], "Mobility + wall abs at B"],
].forEach(([cal, wd, levels, routines, spec, label]) => {
  const sess = Session.buildSession(dateIn(cal, wd), { routines, levels });
  const same = compare(label, expected(wd, cal, levels, spec), actual(sess));
  console.log(`   ${same ? "ok  " : "FAIL"} ${label.padEnd(46)} ${sess.steps.length} steps, water breaks: ${sess.steps.filter((s) => s.kind === "water").length}`);
});

// Spot-print one queue so a human can eyeball it.
console.log("\nSample: Level A Thursday (mobility → wall abs → walk 20):");
sessions.Athu.steps.forEach((s) => console.log("   " + (s.kind === "move" ? `${s.roundLabel ? s.roundLabel + " " + s.round + " " : ""}${s.name} — ${Session.targetText(s)}` : `${s.name} ${s.seconds}s`)));

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll session checks passed.");
process.exit(failures ? 1 : 0);
