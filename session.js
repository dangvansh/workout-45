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
    var block = blockFor(key);
    return {
      key: key,
      dayNumber: n,
      totalDays: totalDays(),
      inPlan: n >= 1 && n <= totalDays(),
      block: block,
      weekday: wd,
      weekdayName: WEEKDAY_NAMES[wd],
      schedule: PLAN.schedules[block.id][wd],
      isCheckpoint: PLAN.checkpoints.indexOf(key) !== -1,
    };
  }

  // ---- Levels ----------------------------------------------------------
  // Level group of a routine ("core", "walks", …), or null if it has no levels.
  function levelGroupOf(rid) {
    var g = PLAN.levelGroups || {};
    for (var k in g) if (g[k].routines.indexOf(rid) !== -1) return k;
    return null;
  }
  // The level a routine runs at: levels[group] if given, else `fallback`
  // (the calendar block). Routines without levels → null.
  function levelFor(rid, levels, fallback) {
    var r = PLAN.routines[rid];
    if (!r || !r.levels) return null;
    var g = levelGroupOf(rid);
    var lvl = (levels && g && levels[g]) || fallback;
    return r.levels[lvl] ? lvl : Object.keys(r.levels)[0];
  }
  function cfgFor(rid, level) {
    var r = PLAN.routines[rid];
    return r.fixed || (r.levels ? r.levels[level] : null);
  }

  // ---- Targets ---------------------------------------------------------
  function normTarget(t) {
    if (typeof t === "number") return { reps: t, show: String(t) };
    if (t.seconds != null) return { seconds: t.seconds, name: t.name };
    return { reps: t.reps, show: t.show != null ? String(t.show) : String(t.reps), name: t.name };
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
    var name = (step.speakName || step.name).replace(/[()]/g, "");
    if (step.mode === "timed") return name + ", " + saySeconds(step.seconds);
    return name + ", " + sayDash(step.repsShow) + " reps" + (step.eachSide ? " " + (step.sideWord || "each side") : "");
  }

  // ---- Session builder -------------------------------------------------
  // tip: a key of PLAN.tips, or a list of keys.
  function tipText(keys) {
    if (!keys) return "";
    return [].concat(keys).map(function (k) { return PLAN.tips[k] || ""; }).filter(Boolean).join(" ");
  }

  function moveStep(routineId, routine, move, target, extra) {
    var t = normTarget(target);
    var name = t.name || move.name;
    var step = {
      kind: "move",
      routineId: routineId,
      routineName: routine.name,
      id: move.id,
      name: name,
      speakName: t.name || move.speak || move.name,
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

  function addCircuit(steps, routineId, routine, level, roundsWanted) {
    var cfg = cfgFor(routineId, level);
    var h = PLAN.hydration;
    var rounds = roundsWanted ? Math.min(roundsWanted, cfg.rounds) : cfg.rounds;
    var restMove = cfg.restBetweenMoves != null ? cfg.restBetweenMoves : routine.restBetweenMoves || 0;
    var restRound = cfg.restBetweenRounds != null ? cfg.restBetweenRounds : routine.restBetweenRounds || 0;
    var waterEvery = ((h.afterRounds || {})[routineId] || {})[level] || 0;
    for (var r = 1; r <= rounds; r++) {
      routine.moves.forEach(function (m, i) {
        if (!(m.id in cfg.targets)) throw new Error("Level " + level + " of " + routineId + " has no target for move " + m.id);
        steps.push(moveStep(routineId, routine, m, cfg.targets[m.id], {
          round: r, rounds: rounds, roundLabel: routine.roundLabel || "Round",
          index: i + 1, count: routine.moves.length, level: level,
        }));
        if (i < routine.moves.length - 1) {
          if (restMove > 0) steps.push(restStep(routineId, routine, restMove, "move"));
          return;
        }
        // End of a round. The last round needs nothing: a following routine
        // gets its own between-routines water break.
        if (r === rounds) return;
        var waterDue = waterEvery > 0 && r % waterEvery === 0;
        var rest = restStep(routineId, routine, restRound, "round");
        rest.afterRound = r;
        if (waterDue && h.combineWithRoundRest) {
          rest.water = true;
          rest.name = "Rest + water";
          rest.seconds = Math.max(rest.seconds, h.breakSeconds);
        } else if (waterDue) {
          steps.push(waterStep("After " + (routine.roundLabel || "round").toLowerCase() + " " + r));
        }
        if (rest.seconds > 0) steps.push(rest);
      });
    }
  }

  function addSegments(steps, routineId, routine, level) {
    var segs = cfgFor(routineId, level).segments;
    var total = segs.reduce(function (a, s) { return a + s.minutes * 60; }, 0);
    var h = PLAN.hydration;
    var every = (h.walkReminderMinutes || 0) * 60;
    if (total <= (h.walkReminderIfLongerThan || 0) * 60) every = 0;
    var offset = 0;
    segs.forEach(function (seg, i) {
      var len = seg.minutes * 60;
      var s = moveStep(routineId, routine, { id: "seg" + (i + 1), name: seg.name }, { seconds: len }, {
        segKind: seg.kind, index: i + 1, count: segs.length, walkOffset: offset, walkTotal: total, level: level,
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

  // ---- Activities (other sports) and the day's plan ---------------------
  function activityDef(id) {
    return (PLAN.activities || []).filter(function (a) { return a.id === id; })[0] || null;
  }
  // Rounds/sets of a circuit routine at a level (null for timed / walk routines).
  function fullRounds(rid, level) {
    var r = PLAN.routines[rid];
    if (!r || r.style !== "circuit") return null;
    var cfg = cfgFor(rid, level || (r.levels && Object.keys(r.levels)[0]));
    return cfg ? cfg.rounds : null;
  }

  // What to do on a date: the weekday's routines (from that calendar block's
  // schedule), each at its own level, reduced by the strongest logged
  // activity. The weekday's own activity (football on Monday) is already
  // allowed for in the schedule, so logging it changes nothing.
  // opts: { activities: [{ activity, effect, name }], fullPlan, levels: { core: "A", … } }
  // Returns { routines: [{ id, rounds, level }] } — rounds null = the level's full amount.
  function dayPlan(key, opts) {
    opts = opts || {};
    var info = dayInfo(key), sch = info.schedule, blockId = info.block.id;
    var effects = PLAN.activityEffects || {}, order = Object.keys(effects);
    var effectId = null, source = null;
    if (!opts.fullPlan) {
      (opts.activities || []).forEach(function (a) {
        if (sch.activity && a.activity === sch.activity) return;
        if (a.effect in effects && (effectId === null || order.indexOf(a.effect) < order.indexOf(effectId))) { effectId = a.effect; source = a; }
      });
    }
    var eff = effectId ? effects[effectId] : null;
    var keep = sch.routines.filter(function (id) { return !(eff && eff.plan) || id in eff.plan; });
    var routines = keep.map(function (id) {
      var level = levelFor(id, opts.levels, blockId);
      var v = eff && eff.plan ? eff.plan[id] : null, full = fullRounds(id, level);
      return { id: id, level: level, rounds: v && v.rounds != null && full ? Math.min(v.rounds, full) : null };
    });
    return {
      key: key, blockId: blockId, routines: routines,
      effect: effectId, effectLabel: eff ? eff.label : null,
      activity: source, reduced: !!(eff && eff.plan),
      scheduled: sch.routines.slice(),
    };
  }

  // Builds the guided queue for a date: routines in schedule order, with
  // rests and water breaks inserted.
  // opts.routines: [{ id, rounds, level }] to do (default: the day's plan).
  // opts.levels: { core: "B", … } (default: the calendar block for every routine).
  function buildSession(key, opts) {
    opts = opts || {};
    var info = dayInfo(key);
    var blockId = info.block.id;
    var h = PLAN.hydration;
    var steps = [];
    var plan = (opts.routines || dayPlan(key, opts).routines).map(function (p) {
      return { id: p.id, rounds: p.rounds || null, level: p.level || levelFor(p.id, opts.levels, blockId) };
    });

    plan.forEach(function (p, idx) {
      var rid = p.id, routine = PLAN.routines[rid];
      if (!routine) throw new Error("Unknown routine '" + rid + "' in schedule");
      if (idx > 0 && h.betweenRoutines) steps.push(waterStep("Before " + routine.name.toLowerCase()));
      if (routine.style === "timed") addTimed(steps, rid, routine);
      else if (routine.style === "circuit") addCircuit(steps, rid, routine, p.level, p.rounds);
      else if (routine.style === "segments") addSegments(steps, rid, routine, p.level);
      else throw new Error("Unknown routine style '" + routine.style + "'");
    });

    // Never two water breaks in a row, and none as the first or very last step.
    steps = steps.filter(function (s, i) { return !(s.kind === "water" && steps[i + 1] && steps[i + 1].kind === "water"); });
    while (steps.length && steps[0].kind === "water") steps.shift();
    while (steps.length && (steps[steps.length - 1].kind === "water" || steps[steps.length - 1].kind === "rest")) steps.pop();

    if (opts.getReady !== false && PLAN.getReadySeconds > 0) {
      // The start screen: session guidance plus any routine notes (e.g. light core timing).
      var notes = [PLAN.sessionNote].concat(plan.map(function (p) { return PLAN.routines[p.id].note; })).filter(Boolean);
      steps.unshift({ kind: "ready", routineId: null, routineName: "Get ready", name: "Get ready", seconds: PLAN.getReadySeconds, mode: "timed", cues: [], tip: notes.join(" ") });
    }
    steps.forEach(function (s, i) { s.n = i; });

    return {
      date: key,
      dayNumber: info.dayNumber,
      blockId: blockId,
      dayLabel: info.schedule.label,
      routines: plan.map(function (p) {
        var full = fullRounds(p.id, p.level);
        return { id: p.id, name: PLAN.routines[p.id].name, level: p.level, rounds: full ? Math.min(p.rounds || full, full) : null, fullRounds: full };
      }),
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

  // One-line description of a routine at a level (dashboard cards).
  function routineSummary(rid, level, rounds) {
    var r = PLAN.routines[rid];
    if (r.style === "timed") {
      var t = r.moves.reduce(function (a, m) { return a + m.seconds; }, 0);
      return r.moves.length + " moves · " + fmtSeconds(t);
    }
    var cfg = cfgFor(rid, level);
    if (r.style === "segments") {
      var segs = cfg.segments;
      var total = segs.reduce(function (a, s) { return a + s.minutes; }, 0);
      var jogs = segs.filter(function (s) { return s.kind === "jog"; });
      if (!jogs.length) return total + " min " + segs[0].name.toLowerCase();
      if (jogs.length === 1) return total + " min with " + jogs[0].minutes + " min continuous jog";
      return total + " min walk with " + jogs.length + " × " + jogs[0].minutes + "-min jog intervals";
    }
    var parts = r.moves.map(function (m) {
      var tg = normTarget(cfg.targets[m.id]);
      return tg.seconds != null ? fmtSeconds(tg.seconds) : tg.show + (m.eachSide ? " each side" : "");
    });
    var n = rounds ? Math.min(rounds, cfg.rounds) : cfg.rounds;
    var label = (r.roundLabel || "round").toLowerCase() + (n === 1 ? "" : "s");
    return n + " " + label + (n < cfg.rounds ? " (of " + cfg.rounds + ")" : "") + " × " + parts.join(" / ");
  }


  return {
    parseKey: parseKey, localKey: localKey, addDays: addDays, diffDays: diffDays, weekdayOf: weekdayOf,
    totalDays: totalDays, dayNumber: dayNumber, planDays: planDays, blockFor: blockFor, dayInfo: dayInfo,
    buildSession: buildSession, dayPlan: dayPlan, activityDef: activityDef, fullRounds: fullRounds, nextMove: nextMove, routineSummary: routineSummary,
    levelGroupOf: levelGroupOf, levelFor: levelFor, cfgFor: cfgFor,
    targetText: targetText, speechTarget: speechTarget, fmtSeconds: fmtSeconds, saySeconds: saySeconds,
    WEEKDAY_NAMES: WEEKDAY_NAMES,
  };
})();
