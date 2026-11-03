/* Plan maths + session builder. Pure functions over PLAN (config.js), no DOM,
   so tests/test_sessions.js can run it under Node. */
var Session = (function () {
  "use strict";

  var DAY_MS = 86400000;
  var WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  var WEEKDAY_NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

  // ---- Dates (all "YYYY-MM-DD" keys, maths in UTC to dodge DST) ----------
  function parseKey(key) {
    var p = key.split("-").map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]);
  }
  function fromUTC(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function localKey(date) {
    date = date || new Date();
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }
  function addDays(key, n) { return fromUTC(parseKey(key) + n * DAY_MS); }
  function diffDays(a, b) { return Math.round((parseKey(b) - parseKey(a)) / DAY_MS); }
  function weekdayOf(key) { return WEEKDAYS[new Date(parseKey(key)).getUTCDay()]; }

  function totalDays() { return diffDays(PLAN.startDate, PLAN.endDate) + 1; }
  function dayNumber(key) { return diffDays(PLAN.startDate, key) + 1; }
  function planDays() {
    var out = [];
    for (var i = 0; i < totalDays(); i++) out.push(addDays(PLAN.startDate, i));
    return out;
  }

  // Block for a date. Outside the plan, falls back to the nearest block so a
  // workout can still be built (dayInfo().inPlan tells you it is outside).
  function blockFor(key) {
    var blocks = PLAN.blocks;
    for (var i = 0; i < blocks.length; i++) {
      if (key >= blocks[i].start && key <= blocks[i].end) return blocks[i];
    }
    return key < blocks[0].start ? blocks[0] : blocks[blocks.length - 1];
  }

  function dayInfo(key) {
    var n = dayNumber(key);
    var wd = weekdayOf(key);
    return {
      key: key,
      dayNumber: n,
      totalDays: totalDays(),
      inPlan: n >= 1 && n <= totalDays(),
      block: blockFor(key),
      weekday: wd,
      weekdayName: WEEKDAY_NAMES[wd],
      schedule: PLAN.schedule[wd],
      isCheckpoint: PLAN.checkpoints.indexOf(key) !== -1,
    };
  }

  // ---- Targets ---------------------------------------------------------
  function normTarget(t) {
    if (typeof t === "number") return { reps: t, show: String(t) };
    if (t.seconds != null) return { seconds: t.seconds };
    return { reps: t.reps, show: t.show != null ? String(t.show) : String(t.reps) };
  }

  function fmtSeconds(s) {
    if (s >= 60 && s % 60 === 0) return s / 60 + " min";
    if (s > 90) return Math.floor(s / 60) + ":" + pad(s % 60);
    return s + " s";
  }
  function sayDash(s) { return String(s).replace(/[–-]/g, " to "); }
  function saySeconds(s) {
    if (s >= 60 && s % 60 === 0) { var m = s / 60; return m + (m === 1 ? " minute" : " minutes"); }
    return s + " seconds";
  }

  // "40 reps each side" / "45 s"
  function targetText(step) {
    if (step.mode === "timed") return fmtSeconds(step.seconds);
    return step.repsShow + " reps" + (step.eachSide ? " " + (step.sideWord || "each side") : "");
  }
  // "wall crunch, 12 reps" — used for voice cues
  function speechTarget(step) {
    var name = step.speakName || step.name;
    if (step.mode === "timed") return name + ", " + saySeconds(step.seconds);
    return name + ", " + sayDash(step.repsShow) + " reps" + (step.eachSide ? " " + (step.sideWord || "each side") : "");
  }

  // ---- Session builder -------------------------------------------------
  function tipText(key) { return key ? PLAN.tips[key] || "" : ""; }

  function moveStep(routineId, routine, move, target, extra) {
    var t = normTarget(target);
    var step = {
      kind: "move",
      routineId: routineId,
      routineName: routine.name,
      id: move.id,
      name: move.name,
      speakName: move.speak || move.name,
      tip: tipText(move.tip),
      note: move.note || "",
      mode: t.seconds != null ? "timed" : "reps",
      cues: [],
    };
    if (step.mode === "timed") step.seconds = t.seconds;
    else { step.reps = t.reps; step.repsShow = t.show; step.eachSide = !!move.eachSide; step.sideWord = move.sideWord || ""; }
    for (var k in extra) step[k] = extra[k];
    return step;
  }

  function restStep(routineId, routine, seconds, restType) {
    return { kind: "rest", routineId: routineId, routineName: routine.name, name: "Rest", seconds: seconds, restType: restType, mode: "timed", cues: [] };
  }

  function waterStep(reason) {
    var h = PLAN.hydration;
    return { kind: "water", routineId: null, routineName: "Hydration", name: h.message, seconds: h.breakSeconds, reason: reason, mode: "timed", cues: [] };
  }

  function addTimed(steps, routineId, routine) {
    routine.moves.forEach(function (m, i) {
      var s = moveStep(routineId, routine, m, { seconds: m.seconds }, { index: i + 1, count: routine.moves.length });
      if (m.sides) {
        s.sides = m.sides;
        s.cues.push({ at: m.sides.switchAt, say: "Switch sides", text: "Switch sides", flash: true });
      }
      steps.push(s);
      if (routine.restBetweenMoves > 0 && i < routine.moves.length - 1) steps.push(restStep(routineId, routine, routine.restBetweenMoves, "move"));
    });
  }

  function addCircuit(steps, routineId, routine, blockId) {
    var cfg = routine.blocks[blockId];
    var h = PLAN.hydration;
    var isMain = h.mainRoutines.indexOf(routineId) !== -1;
    for (var r = 1; r <= cfg.rounds; r++) {
      routine.moves.forEach(function (m, i) {
        if (!(m.id in cfg.targets)) throw new Error("Block " + blockId + " of " + routineId + " has no target for move " + m.id);
        steps.push(moveStep(routineId, routine, m, cfg.targets[m.id], {
          round: r, rounds: cfg.rounds, roundLabel: routine.roundLabel || "Round",
          index: i + 1, count: routine.moves.length,
        }));
        var last = i === routine.moves.length - 1;
        if (!last) {
          if (routine.restBetweenMoves > 0) steps.push(restStep(routineId, routine, routine.restBetweenMoves, "move"));
          return;
        }
        var waterDue = isMain && h.everyNRounds > 0 && r % h.everyNRounds === 0;
        if (r < cfg.rounds) {
          var rest = restStep(routineId, routine, routine.restBetweenRounds, "round");
          rest.afterRound = r;
          if (waterDue && h.combineWithRoundRest) {
            rest.water = true;
            rest.name = "Rest + water";
            rest.seconds = Math.max(rest.seconds, h.breakSeconds);
          } else if (waterDue) {
            steps.push(waterStep("After " + (routine.roundLabel || "round").toLowerCase() + " " + r));
          }
          steps.push(rest);
        } else if (waterDue) {
          steps.push(waterStep("After " + routine.name.toLowerCase()));
        }
      });
    }
  }

  function addSegments(steps, routineId, routine, blockId) {
    var segs = routine.blocks[blockId].segments;
    var total = segs.reduce(function (a, s) { return a + s.minutes * 60; }, 0);
    var every = (PLAN.hydration.walkReminderMinutes || 0) * 60;
    var offset = 0;
    segs.forEach(function (seg, i) {
      var len = seg.minutes * 60;
      var s = moveStep(routineId, routine, { id: "seg" + (i + 1), name: seg.name }, { seconds: len }, {
        segKind: seg.kind, index: i + 1, count: segs.length, walkOffset: offset, walkTotal: total,
      });
      if (every > 0) {
        for (var t = every; t < total; t += every) {
          if (t >= offset && t < offset + len) {
            s.cues.push({ at: t - offset, water: true, flash: true, text: "Water reminder — take a few sips", say: "Water reminder. Take a few sips." });
          }
        }
      }
      steps.push(s);
      offset += len;
    });
  }

  // Builds the full guided queue for a date: mobility first, then the main
  // routine, then wall abs, with water breaks and rests inserted.
  function buildSession(key, opts) {
    opts = opts || {};
    var info = dayInfo(key);
    var blockId = info.block.id;
    var h = PLAN.hydration;
    var steps = [];
    var routineIds = info.schedule.routines.slice();

    routineIds.forEach(function (rid) {
      var routine = PLAN.routines[rid];
      if (!routine) throw new Error("Unknown routine '" + rid + "' in schedule");
      if (rid === "wallAbs" && h.beforeWallAbs) steps.push(waterStep("Before wall abs"));
      if (routine.style === "timed") addTimed(steps, rid, routine);
      else if (routine.style === "circuit") addCircuit(steps, rid, routine, blockId);
      else if (routine.style === "segments") addSegments(steps, rid, routine, blockId);
      else throw new Error("Unknown routine style '" + routine.style + "'");
      if (rid === "mobility" && h.afterMobility) steps.push(waterStep("After mobility"));
    });

    // Never two water breaks in a row, and none as the very last step.
    steps = steps.filter(function (s, i) { return !(s.kind === "water" && steps[i + 1] && steps[i + 1].kind === "water"); });
    while (steps.length && (steps[steps.length - 1].kind === "water" || steps[steps.length - 1].kind === "rest")) steps.pop();

    if (opts.getReady !== false && PLAN.getReadySeconds > 0) {
      steps.unshift({ kind: "ready", routineId: null, routineName: "Get ready", name: "Get ready", seconds: PLAN.getReadySeconds, mode: "timed", cues: [] });
    }
    steps.forEach(function (s, i) { s.n = i; });

    return {
      date: key,
      dayNumber: info.dayNumber,
      blockId: blockId,
      dayLabel: info.schedule.label,
      routines: routineIds.map(function (rid) { return { id: rid, name: PLAN.routines[rid].name }; }),
      steps: steps,
      estSeconds: estimateSeconds(steps),
    };
  }

  function estimateSeconds(steps) {
    return steps.reduce(function (a, s) {
      if (s.mode === "timed") return a + s.seconds;
      return a + s.reps * 2 * (s.eachSide ? 2 : 1);
    }, 0);
  }

  // Next actual move after step i (skipping rests / water), for "Next up".
  function nextMove(steps, i) {
    for (var j = i + 1; j < steps.length; j++) if (steps[j].kind === "move") return steps[j];
    return null;
  }

  // One-line description of a routine for the given block (dashboard cards).
  function routineSummary(rid, blockId) {
    var r = PLAN.routines[rid];
    if (r.style === "timed") {
      var t = r.moves.reduce(function (a, m) { return a + m.seconds; }, 0);
      return r.moves.length + " moves · " + fmtSeconds(t);
    }
    if (r.style === "segments") {
      var segs = r.blocks[blockId].segments;
      var total = segs.reduce(function (a, s) { return a + s.minutes; }, 0);
      var jogs = segs.filter(function (s) { return s.kind === "jog"; });
      if (!jogs.length) return total + " min " + segs[0].name.toLowerCase();
      if (jogs.length === 1) return total + " min with " + jogs[0].minutes + " min continuous jog";
      return total + " min walk with " + jogs.length + " × " + jogs[0].minutes + "-min jog intervals";
    }
    var cfg = r.blocks[blockId];
    var parts = r.moves.map(function (m) {
      var t = normTarget(cfg.targets[m.id]);
      return t.seconds != null ? fmtSeconds(t.seconds) : t.show;
    });
    return cfg.rounds + " " + (r.roundLabel || "round").toLowerCase() + "s × " + parts.join(" / ");
  }

  return {
    parseKey: parseKey, localKey: localKey, addDays: addDays, diffDays: diffDays, weekdayOf: weekdayOf,
    totalDays: totalDays, dayNumber: dayNumber, planDays: planDays, blockFor: blockFor, dayInfo: dayInfo,
    buildSession: buildSession, nextMove: nextMove, routineSummary: routineSummary,
    targetText: targetText, speechTarget: speechTarget, fmtSeconds: fmtSeconds, saySeconds: saySeconds,
    WEEKDAY_NAMES: WEEKDAY_NAMES,
  };
})();
