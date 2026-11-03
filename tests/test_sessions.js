// Checks the session builder against the ORIGINAL written plan.
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
const SPEC = {
  schedule: {
    mon: ["mobility"], tue: ["mobility", "core", "wallAbs"], wed: ["mobility", "strength"],
    thu: ["mobility", "core", "wallAbs"], fri: ["mobility", "strength", "wallAbs"],
    sat: ["mobility", "walk", "wallAbs"], sun: ["mobility"],
  },
  mobility: ["Pump stretch", "Lizard twists", "Alternating pigeons", "Crab pulses", "Bridge hold"],
  core: {
    moves: ["Claps under the legs", "Same-side knee raises", "Knee lifts with downward press", "Squat with torso twist"],
    eachSide: [false, true, false, false],
    A: { rounds: 4, reps: ["40", "40", "40", "20"] },
    B: { rounds: 4, reps: ["45", "45", "45", "20"] },
    C: { rounds: 5, reps: ["50", "50", "50", "20"] },
    restMove: 20, restRound: 75,
  },
  wallAbs: {
    moves: ["Wall toe-reach crunch", "Wall crunch (hands behind head)", "Wall cross-body crunch (alternating)", "Wall knee-hug crunch", "Wall reverse crunch / hip lift"],
    A: { sets: 3, reps: "12" }, B: { sets: 3, reps: "15" }, C: { sets: 4, reps: "15–20", internal: 18 },
    restMove: 15, restSet: 60,
  },
  strength: {
    moves: ["Push-ups", "Glute bridges", "Reverse lunges", "Plank", "Superman hold", "Wall sit"],
    A: { rounds: 4, reps: "12–15", plank: 45, superman: 20, wallSit: 30 },
    B: { rounds: 4, reps: "15", plank: 50, superman: 25, wallSit: 40 },
    C: { rounds: 4, reps: "15–20", plank: 60, superman: 30, wallSit: 45 },
    restMove: 20, restRound: 90,
  },
  walkTotalMin: 40,
  water: 45, waterEveryRounds: 2, walkReminderMin: 15,
  blocks: { A: ["2026-11-03", "2026-11-17"], B: ["2026-11-18", "2026-12-02"], C: ["2026-12-03", "2026-12-17"] },
};

// ---------------- Expected token stream from the spec ------------------
function expected(weekday, block) {
  const t = ["READY:5"];
  const routines = SPEC.schedule[weekday];
  routines.forEach((rid, ri) => {
    if (rid === "wallAbs" && t[t.length - 1] !== "WATER:45") t.push("WATER:45");
    if (rid === "mobility") SPEC.mobility.forEach((n) => t.push(`MOVE:${n}:60s` + (n === "Lizard twists" ? "+switch@30" : "")));
    if (rid === "core" || rid === "strength") {
      const c = SPEC[rid], b = c[block];
      const targets = rid === "core"
        ? b.reps.map((r, i) => `${r}r` + (c.eachSide[i] ? "/side" : ""))
        : [`${b.reps}r`, `${b.reps}r`, `${b.reps}r/leg`, `${b.plank}s`, `${b.superman}s`, `${b.wallSit}s`];
      for (let r = 1; r <= b.rounds; r++) {
        c.moves.forEach((m, i) => {
          t.push(`MOVE:${m}:${targets[i]}`);
          if (i < c.moves.length - 1) t.push(`REST:${c.restMove}`);
          else if (r < b.rounds) {
            if (r % SPEC.waterEveryRounds === 0) t.push("WATER:45");
            t.push(`REST:${c.restRound}`);
          } else if (r % SPEC.waterEveryRounds === 0 && ri < routines.length - 1) t.push("WATER:45");
        });
      }
    }
    if (rid === "wallAbs") {
      const c = SPEC.wallAbs, b = c[block];
      for (let s = 1; s <= b.sets; s++) {
        c.moves.forEach((m, i) => {
          t.push(`MOVE:${m}:${b.reps}r`);
          if (i < c.moves.length - 1) t.push(`REST:${c.restMove}`);
          else if (s < b.sets) t.push(`REST:${c.restSet}`);
        });
      }
    }
    if (rid === "walk") t.push("WALK"); // segments are checked separately below
    if (rid === "mobility" && ri < routines.length - 1) t.push("WATER:45");
  });
  return t;
}

function actual(session) {
  const t = [];
  let inWalk = false;
  for (const s of session.steps) {
    if (s.kind === "ready") t.push(`READY:${s.seconds}`);
    else if (s.kind === "water") t.push(`WATER:${s.seconds}`);
    else if (s.kind === "rest") t.push(`REST:${s.seconds}`);
    else if (s.routineId === "walk") { if (!inWalk) t.push("WALK"); inWalk = true; continue; }
    else {
      let tok = `MOVE:${s.name}:` + (s.mode === "timed" ? `${s.seconds}s` : `${s.repsShow}r` + (s.eachSide ? (s.sideWord === "each leg" ? "/leg" : "/side") : ""));
      const sw = s.cues.find((c) => /switch/i.test(c.text));
      if (sw) tok += `+switch@${sw.at}`;
      t.push(tok);
    }
    inWalk = false;
  }
  return t;
}

// ---------------- Run -------------------------------------------------
let failures = 0;
function check(cond, msg) { if (!cond) { failures++; console.log("   FAIL: " + msg); } }

console.log("Day number / block detection");
[["2026-11-03", 1, "A"], ["2026-11-17", 15, "A"], ["2026-11-18", 16, "B"], ["2026-12-02", 30, "B"],
 ["2026-12-03", 31, "C"], ["2026-12-17", 45, "C"]].forEach(([d, n, b]) => {
  const info = Session.dayInfo(d);
  check(info.dayNumber === n && info.block.id === b && info.inPlan, `${d} → day ${info.dayNumber} block ${info.block.id}, expected day ${n} block ${b}`);
});
check(Session.totalDays() === 45, "plan should be 45 days");
check(Session.weekdayOf("2026-11-03") === "tue", "3 Nov 2026 should be a Tuesday");
console.log("   3 Nov = Day 1 (Tue, Block A) · 18 Nov = Day 16 (Block B) · 3 Dec = Day 31 (Block C) · 17 Dec = Day 45");

const rows = [];
for (const block of ["A", "B", "C"]) {
  console.log(`\nBlock ${block}`);
  const [start] = SPEC.blocks[block];
  for (const wd of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
    let d = start;
    while (Session.weekdayOf(d) !== wd) d = Session.addDays(d, 1);
    check(Session.blockFor(d).id === block, `${d} should be in block ${block}`);
    const sess = Session.buildSession(d);
    const exp = expected(wd, block), act = actual(sess);
    const firstDiff = exp.findIndex((tok, i) => tok !== act[i]);
    const same = exp.length === act.length && firstDiff === -1;
    check(same, `${wd} ${d}: queue differs at step ${firstDiff === -1 ? exp.length : firstDiff}: expected "${exp[firstDiff]}", got "${act[firstDiff]}"`);

    // Walk details
    let walkInfo = "";
    if (wd === "sat") {
      const segs = sess.steps.filter((s) => s.routineId === "walk");
      const total = segs.reduce((a, s) => a + s.seconds, 0);
      const jogs = segs.filter((s) => s.segKind === "jog");
      check(total === SPEC.walkTotalMin * 60, `walk total ${total}s, expected 2400s`);
      if (block === "A") check(jogs.length === 0, "Block A walk should have no jogs");
      if (block === "B") check(jogs.length === 5 && jogs.every((j) => j.seconds === 60), "Block B: 5 × 1-min jogs");
      if (block === "C") {
        check(jogs.length === 1 && jogs[0].seconds === 600, "Block C: one 10-min jog");
        check(jogs[0] && jogs[0].walkOffset === 900, "Block C jog should sit in the middle (starts at 15:00)");
      }
      const reminders = segs.flatMap((s) => s.cues.filter((c) => c.water).map((c) => (s.walkOffset + c.at) / 60));
      check(JSON.stringify(reminders) === "[15,30]", `walk water reminders at ${reminders} min, expected 15,30`);
      walkInfo = ` | walk ${total / 60} min, jogs: ${jogs.map((j) => `${j.seconds / 60}′@${j.walkOffset / 60}′`).join(" ") || "none"}, water reminders @ ${reminders.join(", ")} min`;
    }
    const water = sess.steps.filter((s) => s.kind === "water").length;
    const moves = sess.steps.filter((s) => s.kind === "move" && s.routineId !== "walk").length;
    console.log(`   ${same ? "ok  " : "FAIL"} ${wd} ${d}  ${sess.routines.map((r) => r.id).join(" → ").padEnd(30)} ${String(sess.steps.length).padStart(3)} steps, ${String(moves).padStart(3)} moves, ${water} water breaks, ≈${Math.round(sess.estSeconds / 60)} min${walkInfo}`);
    if (!same) console.log("        expected:", exp.slice(Math.max(0, firstDiff - 2), firstDiff + 3), "\n        actual:  ", act.slice(Math.max(0, firstDiff - 2), firstDiff + 3));
    rows.push({ block, wd, sess });
  }
}

// Spot-print one full queue per main routine so a human can eyeball it.
console.log("\nSample: Block C Thursday (core 5 rounds + wall abs 4 sets), first 16 steps:");
const sample = rows.find((r) => r.block === "C" && r.wd === "thu").sess;
sample.steps.slice(0, 16).forEach((s) => console.log("   " + (s.kind === "move" ? `${s.roundLabel || ""} ${s.round || ""} ${s.name} — ${Session.targetText(s)}` : `${s.name} ${s.seconds}s`)));
console.log("Wall abs Block C display:", Session.targetText(sample.steps.find((s) => s.routineId === "wallAbs" && s.kind === "move")), "(internal target", sample.steps.find((s) => s.routineId === "wallAbs" && s.kind === "move").reps + ")");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll session checks passed.");
process.exit(failures ? 1 : 0);
