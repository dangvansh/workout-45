/* =====================================================================
   PLAN CONFIG  —  edit this file to change your plan.
   ---------------------------------------------------------------------
   Everything about the plan lives here: dates, blocks, weekly schedule,
   moves, reps, timers, rest and hydration. The app logic (session.js,
   app.js) reads from this object, so you can change reps, swap moves or
   adjust rest times here without touching any other file.

   Rules of thumb when editing:
   • Dates are "YYYY-MM-DD" strings.
   • Times are in SECONDS unless the field name says "minutes".
   • Routines with levels (core circuit, wall abs, strength, walks) have
     settings for Level A, B and C. The level you're on is chosen in the
     app (it never moves up by itself), NOT by the calendar.
   • A "target" for a move at a level can be:
       15                          → 15 reps
       { reps: 9, show: "8–10" }   → 9 reps, but the screen shows "8–10"
       { seconds: 20 }             → a 20-second timed hold (auto countdown)
       { seconds: 40, name: "…" }  → …and show a different move name
   • Every move "id" must be unique inside its routine, and each level's
     "targets" must list every move id of that routine.
   • A level can override the routine's rests: restBetweenMoves / restBetweenRounds.
   • Exercise guide fields on a move (all optional):
       how:    ["step 1", "step 2", …]  → form steps shown in the guide
       video:  "https://youtu.be/…"     → a default video (plays in the app)
       search: "words"                  → what "Find a form video" searches
     A video pinned inside the app (Guide page) overrides `video`.
   • tip: a key from `tips` below, or a list of keys.
   • After editing, reload the app. On the iPad, open the app once while
     online so it picks up the new version.
   • Run `node tests/test_sessions.js` afterwards: it re-checks every
     weekday at every level against the plan as written (it flags any
     difference, which is expected if you changed reps on purpose).
   ===================================================================== */

// The four core-circuit moves (shared by the Monday light core).
var CORE_MOVES = [
  { id: "claps",     name: "Claps under the legs", search: "clap under legs abs exercise",
    how: ["Lie on your back (or sit leaning back) with your core braced.",
          "Lift one straight leg and clap your hands underneath it.",
          "Lower it and switch legs. Keep your lower back from arching."] },
  { id: "sameKnee",  name: "Same-side knee raises", eachSide: true, search: "standing same side knee to elbow crunch",
    how: ["Stand tall, hands lightly behind your head.",
          "Lift one knee to the side and crunch the same-side elbow down to meet it.",
          "Do all the reps on one side, then the other."] },
  { id: "kneePress", name: "Knee lifts with downward press", search: "standing knee raise with downward press abs",
    how: ["Stand tall, hands at chest height, palms facing down.",
          "Drive one knee up while pressing both palms down towards it, tightening your abs.",
          "Alternate legs at a steady pace."] },
  { id: "squatTwist", name: "Squat with torso twist", tip: "knee", search: "squat with torso twist",
    how: ["Feet shoulder-width apart. Sit your hips back and down, chest up.",
          "As you stand, rotate your torso to one side. Alternate sides each rep.",
          "Knees track over your toes. Only go as deep as the knee is happy."] },
];

// ---- Weekly schedules ------------------------------------------------
// Which routines run on each weekday, in order (ids refer to `routines`).
// activity: the sport played that day (an id from `activities`): it gets
//           its own log button and is already allowed for in the plan.
// rest: marks the day as a rest day on the calendar.
var SCHEDULE_A = {
  mon: { label: "Light core + football", activity: "football", routines: ["mobility", "lightCore"] },
  tue: { label: "Core day",              routines: ["mobility", "core"] },
  wed: { label: "Strength day",          routines: ["mobility", "strength"] },
  thu: { label: "Wall abs + walk",       routines: ["mobility", "wallAbs", "walkShort"] },
  fri: { label: "Core day",              routines: ["mobility", "core"] },
  sat: { label: "Walk + wall abs",       routines: ["mobility", "walk", "wallAbs"] },
  sun: { label: "Rest day (mobility only)", rest: true, routines: ["mobility"] },
};
// Blocks B and C: wall abs moves back onto the core days.
var SCHEDULE_BC = {
  mon: { label: "Light core + football", activity: "football", routines: ["mobility", "lightCore"] },
  tue: { label: "Core + wall abs",       routines: ["mobility", "core", "wallAbs"] },
  wed: { label: "Strength day",          routines: ["mobility", "strength"] },
  thu: { label: "Wall abs + walk",       routines: ["mobility", "wallAbs", "walkShort"] },
  fri: { label: "Core + wall abs",       routines: ["mobility", "core", "wallAbs"] },
  sat: { label: "Walk / jog + wall abs", routines: ["mobility", "walk", "wallAbs"] },
  sun: { label: "Rest day (mobility only)", rest: true, routines: ["mobility"] },
};

var PLAN = {
  title: "45-Day Plan",

  // ---- Dates ---------------------------------------------------------
  startDate: "2026-11-03", // Day 1
  endDate: "2026-12-17",   // Day 45

  // Calendar blocks: they pick the weekly schedule and when a "move up a
  // level?" prompt appears. They must cover start → end.
  blocks: [
    { id: "A", name: "Block A", start: "2026-11-03", end: "2026-11-17" },
    { id: "B", name: "Block B", start: "2026-11-18", end: "2026-12-02" },
    { id: "C", name: "Block C", start: "2026-12-03", end: "2026-12-17" },
  ],

  // Days that prompt for a progress photo + waist measurement.
  checkpoints: ["2026-11-03", "2026-11-25", "2026-12-17"],

  schedules: { A: SCHEDULE_A, B: SCHEDULE_BC, C: SCHEDULE_BC },

  // ---- Levels --------------------------------------------------------
  // Each group keeps its own level (A → B → C). It starts at A and only
  // moves when you say so: a prompt appears when a new block starts, and
  // you can set any level (up or down) in Data & settings.
  // askReps: after a session, ask "Could you have done 2–3 more reps?".
  levels: ["A", "B", "C"],
  levelGroups: {
    core:     { name: "Core circuit", routines: ["core"],              askReps: true },
    wallAbs:  { name: "Wall abs",     routines: ["wallAbs"],           askReps: true },
    strength: { name: "Strength",     routines: ["strength"],          askReps: true },
    walks:    { name: "Walks",        routines: ["walkShort", "walk"], askReps: false },
  },

  // ---- Guided-mode timing -------------------------------------------
  getReadySeconds: 5,       // countdown before the first move of a session
  restAddSeconds: 15,       // what the "+15 s" button adds to a rest
  // Shown on the start screen of every guided session.
  sessionNote: "Work hard but in control — you should still be able to say a short sentence. If you can't finish, stop and repeat this level next time.",

  // ---- Hydration ----------------------------------------------------
  hydration: {
    breakSeconds: 45,
    message: "Water break — take a few sips",
    betweenRoutines: true,            // between two routines on the same day (so also after mobility)
    // After every N rounds/sets of these routines, by level.
    afterRounds: {
      core:    { A: 1, B: 2, C: 2 },
      wallAbs: { A: 1, B: 2, C: 2 },
    },
    // false: water break is its own 45 s step, then the normal round rest.
    // true:  merge it into the round rest ("Rest + water", longest of the two).
    combineWithRoundRest: false,
    walkReminderMinutes: 15,          // on walks: a reminder every 15 min (walk keeps going)…
    walkReminderIfLongerThan: 20,     // …only on walks longer than this many minutes
  },

  // ---- Form & safety tips (moves refer to these by key) --------------
  tips: {
    knee:      "Go easy on the left knee — never force it, stop at any twinge, twist from the hips.",
    elbow:     "Right elbow: use fists or a wall if it complains.",
    back:      "Use a thick mat or folded towel under your lower back/tailbone; skip if anything presses on a sore spot.",
    wallBack:  "Thick mat or folded towel under your lower back/tailbone; skip any move that presses on a sore spot.",
    wallCrunch: "Short movement — slide hands up your thighs toward your knees and just lift your shoulder blades. Chest-to-thighs is NOT the goal.",
    toeReach:  "Reach for your shins; toes come later.",
    pushups:   "Right elbow: use fists, or go higher on the wall if it complains.",
    chairKnee: "Easy on the left knee — knees over toes, stop at any twinge.",
  },

  // ---- Routines -----------------------------------------------------
  // style "timed":    every move is a countdown, auto-advancing.
  // style "circuit":  do every move once = 1 round/set; repeat.
  // style "segments": one continuous timed activity split into parts (walk/jog).
  // levels: settings per level (A/B/C). fixed: the same at every level.
  routines: {
    // Daily mobility (5 min, every day, same at every level)
    mobility: {
      name: "Daily mobility",
      style: "timed",
      restBetweenMoves: 0,
      moves: [
        { id: "pump",    name: "Pump stretch",          seconds: 60, search: "downward dog to cobra pump stretch",
          how: ["Start in a high plank or downward dog.",
                "Lower your hips and lift your chest into a cobra / up-dog, looking forward.",
                "Push your hips back up into downward dog. Flow slowly with your breath."] },
        { id: "lizard",  name: "Lizard twists",         seconds: 60, tip: "knee", search: "lizard pose twist mobility",
          // Two sides inside one minute, with a "switch sides" cue.
          sides: { first: "Left side", second: "Right side", switchAt: 30 },
          how: ["Low lunge: front foot outside the same-side hand, back knee down on padding.",
                "Keep the other hand on the floor, rotate your chest open and reach the top arm to the ceiling.",
                "Return and repeat slowly. Switch legs at the cue."] },
        { id: "pigeons", name: "Alternating pigeons",   seconds: 60, tip: "knee", search: "alternating pigeon mobility drill",
          how: ["From all fours or a high plank, bring one knee forward towards the opposite wrist.",
                "Ease your hips down into a gentle pigeon — only as far as is comfortable.",
                "Return and switch sides, alternating smoothly."] },
        { id: "crab",    name: "Crab pulses",           seconds: 60, tip: "elbow", search: "crab hip pulses exercise",
          how: ["Sit with feet flat, hands on the floor behind you, fingers pointing back.",
                "Lift your hips into a reverse table-top, shoulders down away from your ears.",
                "Pulse the hips up a few centimetres, squeezing the glutes each time."] },
        { id: "bridge",  name: "Bridge hold",           seconds: 60, tip: "back", search: "glute bridge hold",
          how: ["Lie on your back, knees bent, feet flat and hip-width apart.",
                "Press through your heels and lift until knees, hips and shoulders form a line.",
                "Squeeze your glutes and hold. Don't arch your lower back."] },
      ],
    },

    // Light core (Mondays, same at every level). Uses the core-circuit moves.
    lightCore: {
      name: "Light core",
      style: "circuit",
      roundLabel: "Round",
      guideAs: "core",   // form guide + pinned videos are shared with the core circuit
      note: "Do this a few hours before football, or after you've cooled down, eaten and had water — not right before kick-off. Split any move into 2 × 20 if needed.",
      moves: CORE_MOVES,
      fixed: { rounds: 1, restBetweenMoves: 30, restBetweenRounds: 0,
        targets: { claps: 40, sameKnee: 40, kneePress: 40, squatTwist: 20 } },
    },

    // Core circuit (Tue / Fri)
    core: {
      name: "Core circuit",
      style: "circuit",
      roundLabel: "Round",
      moves: CORE_MOVES,
      levels: {
        A: { rounds: 2, restBetweenMoves: 30, restBetweenRounds: 90,
             targets: { claps: 15, sameKnee: 10, kneePress: 15, squatTwist: 8 } },
        B: { rounds: 3, restBetweenMoves: 25, restBetweenRounds: 75,
             targets: { claps: 25, sameKnee: 15, kneePress: 25, squatTwist: 12 } },
        C: { rounds: 4, restBetweenMoves: 20, restBetweenRounds: 60,
             targets: { claps: 30, sameKnee: 20, kneePress: 30, squatTwist: 15 } },
      },
    },

    // Wall abs (feet flat on a wall, knees bent). All 5 moves = 1 set.
    wallAbs: {
      name: "Wall abs",
      style: "circuit",
      roundLabel: "Set",
      moves: [
        { id: "toeReach",  name: "Wall toe-reach crunch", tip: ["toeReach", "wallBack"], search: "wall toe touch crunch",
          how: ["Lie on your back, feet flat on the wall, knees bent about 90°.",
                "Reach both hands up towards your shins, lifting your shoulder blades off the floor.",
                "Lower slowly. Keep your chin slightly tucked."] },
        { id: "crunch",    name: "Wall crunch", tip: ["wallCrunch", "wallBack"], search: "short crunch hands slide up thighs",
          how: ["Feet flat on the wall, knees bent. Hands resting on your thighs.",
                "Slide your hands up towards your knees, lifting just your shoulder blades off the floor.",
                "Lower slowly. It's a short movement — chest-to-thighs is not the goal."] },
        { id: "crossBody", name: "Wall cross-body crunch (alternating)", speak: "Wall cross-body crunch", tip: "wallBack", search: "wall bicycle crunch cross body",
          how: ["Feet flat on the wall, hands behind your head.",
                "Curl up and rotate one elbow towards the opposite knee.",
                "Lower and switch sides. Each side counts as one rep."] },
        { id: "kneeHug",   name: "Wall knee-hug crunch", tip: "wallBack", search: "knee hug crunch",
          how: ["Start with feet flat on the wall, arms overhead or by your sides.",
                "Bring your knees off the wall towards your chest as you curl up and hug them.",
                "Return your feet to the wall with control."] },
        { id: "reverse",   name: "Wall reverse crunch / hip lift", speak: "Wall reverse crunch", tip: "wallBack", search: "reverse crunch hip lift",
          how: ["Feet on the wall, arms by your sides, palms down.",
                "Use your lower abs to curl your hips and tailbone a little off the floor.",
                "Lower slowly. It's a small movement, so don't swing."] },
      ],
      levels: {
        A: { rounds: 2, restBetweenMoves: 20, restBetweenRounds: 75,
             targets: { toeReach: 8, crunch: 8, crossBody: 8, kneeHug: 8, reverse: 8 } },
        B: { rounds: 3, restBetweenMoves: 15, restBetweenRounds: 60,
             targets: { toeReach: 10, crunch: 10, crossBody: 10, kneeHug: 10, reverse: 10 } },
        C: { rounds: 3, restBetweenMoves: 15, restBetweenRounds: 60, targets: {
          toeReach:  { reps: 13, show: "12–15" },
          crunch:    { reps: 13, show: "12–15" },
          crossBody: { reps: 13, show: "12–15" },
          kneeHug:   { reps: 13, show: "12–15" },
          reverse:   { reps: 13, show: "12–15" },
        } },
      },
    },

    // Strength (Wed), easier versions
    strength: {
      name: "Strength",
      style: "circuit",
      roundLabel: "Round",
      moves: [
        { id: "pushups",  name: "Wall or counter push-ups", tip: "pushups", search: "wall push up incline counter push up form",
          how: ["Hands on a wall or kitchen counter, a bit wider than your shoulders. Walk your feet back.",
                "Keep your body straight and lower your chest towards your hands, elbows about 45° out.",
                "Push back. The higher your hands, the easier it is."] },
        { id: "bridges",  name: "Glute bridges", tip: "back", search: "glute bridge proper form",
          how: ["Lie on your back, knees bent, feet flat and hip-width apart.",
                "Drive through your heels to lift your hips. Squeeze your glutes for 1 second at the top.",
                "Lower with control. Ribs down, no lower-back arch."] },
        { id: "sitToStand", name: "Chair sit-to-stand", tip: "chairKnee", search: "chair sit to stand exercise form",
          how: ["Sit near the front of a sturdy chair, feet flat and hip-width apart.",
                "Lean forward slightly and stand up by pushing through your heels — use your hands only if needed.",
                "Sit back down slowly and with control."] },
        { id: "plank",    name: "Knee plank", search: "knee plank proper form",
          how: ["Forearms under your shoulders, knees on the mat, body straight from head to knees.",
                "Squeeze your glutes and brace your abs. Don't let your hips sag.",
                "Ready for more? Lift your knees for a full plank."] },
        { id: "superman", name: "Superman hold", search: "superman hold exercise form",
          how: ["Lie face down with your arms stretched overhead.",
                "Lift your arms, chest and legs a few centimetres off the floor. Look at the floor.",
                "Squeeze your glutes and hold. Breathe steadily."] },
        { id: "chairSquat", name: "Slow chair squat", note: "3 s down, 1 s up", tip: "chairKnee", search: "slow box squat to chair tempo",
          how: ["Stand in front of a chair, feet shoulder-width apart.",
                "Take 3 seconds to sit back until you lightly touch the chair — don't flop down.",
                "Stand back up in about 1 second. Knees over toes."] },
      ],
      levels: {
        A: { rounds: 2, restBetweenMoves: 30, restBetweenRounds: 90, targets: {
          pushups: { reps: 9, show: "8–10" }, bridges: { reps: 9, show: "8–10" }, sitToStand: { reps: 9, show: "8–10" },
          plank: { seconds: 20 }, superman: { seconds: 15 }, chairSquat: { reps: 9, show: "8–10" } } },
        B: { rounds: 3, restBetweenMoves: 25, restBetweenRounds: 75, targets: {
          pushups: { reps: 11, show: "10–12" }, bridges: { reps: 11, show: "10–12" }, sitToStand: { reps: 11, show: "10–12" },
          plank: { seconds: 30 }, superman: { seconds: 20 }, chairSquat: { reps: 11, show: "10–12" } } },
        C: { rounds: 3, restBetweenMoves: 20, restBetweenRounds: 60, targets: {
          pushups: { reps: 13, show: "12–15" }, bridges: { reps: 13, show: "12–15" }, sitToStand: { reps: 13, show: "12–15" },
          plank: { seconds: 40, name: "Plank (knee or full)" }, superman: { seconds: 25 }, chairSquat: { reps: 13, show: "12–15" } } },
      },
    },

    // Thursday walk. Segments run back to back.
    walkShort: {
      name: "Walk",
      style: "segments",
      levels: {
        A: { segments: [{ kind: "walk", name: "Brisk walk", minutes: 20 }] },
        B: { segments: [{ kind: "walk", name: "Walk", minutes: 25 }] },
        C: { segments: [{ kind: "walk", name: "Walk", minutes: 25 }] },
      },
    },

    // Saturday walk / jog. kind "jog" gets jog start / stop cues.
    walk: {
      name: "Walk / jog",
      style: "segments",
      levels: {
        A: { segments: [{ kind: "walk", name: "Brisk walk", minutes: 30 }] },
        // 10 min warm-up walk, 5 × (1 min jog + 3 min walk), 10 min cool-down walk = 40 min
        B: { segments: [
          { kind: "walk", name: "Warm-up walk", minutes: 10 },
          { kind: "jog",  name: "Jog", minutes: 1 }, { kind: "walk", name: "Walk", minutes: 3 },
          { kind: "jog",  name: "Jog", minutes: 1 }, { kind: "walk", name: "Walk", minutes: 3 },
          { kind: "jog",  name: "Jog", minutes: 1 }, { kind: "walk", name: "Walk", minutes: 3 },
          { kind: "jog",  name: "Jog", minutes: 1 }, { kind: "walk", name: "Walk", minutes: 3 },
          { kind: "jog",  name: "Jog", minutes: 1 }, { kind: "walk", name: "Walk", minutes: 3 },
          { kind: "walk", name: "Cool-down walk", minutes: 10 },
        ] },
        // 15 min walk, 10 min continuous jog, 15 min walk = 40 min
        C: { segments: [
          { kind: "walk", name: "Walk", minutes: 15 },
          { kind: "jog",  name: "Continuous jog", minutes: 10 },
          { kind: "walk", name: "Walk", minutes: 15 },
        ] },
      },
    },
  },

  // ---- Other sports / activities --------------------------------------
  // Log these on the Today page. Logging one reduces that day's workout
  // according to its `effect` (see activityEffects below) — except the
  // weekday's own `activity` (football on Monday), which the plan already
  // allows for. Change the default minutes or effect, or add sports here.
  activities: [
    { id: "football",  name: "Football",          icon: "⚽", minutes: 60, effect: "hard" },
    { id: "padel",     name: "Padel",             icon: "🎾", minutes: 60, effect: "moderate" },
    { id: "badminton", name: "Badminton",         icon: "🏸", minutes: 60, effect: "moderate" },
    { id: "running",   name: "Running",           icon: "🏃", minutes: 30, effect: "hard" },
    { id: "swimming",  name: "Swimming",          icon: "🏊", minutes: 45, effect: "moderate" },
    { id: "cycling",   name: "Cycling",           icon: "🚴", minutes: 45, effect: "moderate" },
    { id: "gym",       name: "Gym session",       icon: "🏋️", minutes: 60, effect: "hard" },
    { id: "yoga",      name: "Yoga / stretching", icon: "🧘", minutes: 30, effect: "light" },
    { id: "hike",      name: "Long walk / hike",  icon: "🥾", minutes: 60, effect: "light" },
    { id: "other",     name: "Other",             icon: "➕", minutes: 45, effect: "moderate" },
  ],

  // What's left of the day's plan after an activity. Listed strongest first:
  // with several activities on one day, the strongest one decides.
  // In `plan`, each routine is "full", { rounds: N } (capped at the rounds/
  // sets of your level), or left out to drop it for the day. Only routines that
  // are already scheduled for that weekday are ever kept — an activity never
  // adds work. plan: null → the day's plan is unchanged.
  activityEffects: {
    hard:     { label: "Hard",     plan: { mobility: "full", lightCore: "full", core: { rounds: 1 }, strength: { rounds: 1 } } },
    moderate: { label: "Moderate", plan: { mobility: "full", lightCore: "full", core: { rounds: 2 }, strength: { rounds: 2 }, wallAbs: { rounds: 1 } } },
    light:    { label: "Light",    plan: null },
  },

  // ---- Voice commands (hands-free control during a workout) ----------
  // The microphone is only on while a workout is running.
  voiceCommands: {
    enabled: true,   // default for the "Voice commands" setting
    lang: "",        // "" = the device's English variant (else en-US). Or e.g. "en-IN", "en-GB", "en-US".
    // Checked top to bottom; the first match wins, so put longer phrases
    // ("stop workout") above shorter ones ("stop"). Whole words, any case.
    commands: [
      { action: "skipRoutine", phrases: ["skip routine", "skip the routine", "skip this routine", "next routine", "skip circuit", "next circuit", "skip section", "next section"] },
      { action: "end",    phrases: ["end workout", "end the workout", "stop workout", "stop the workout", "finish workout", "quit workout", "end session"] },
      { action: "yes",    phrases: ["yes", "yeah", "yep", "confirm"] },           // only when a confirm box is open
      { action: "no",     phrases: ["no", "nope", "cancel", "never mind"] },      // ditto
      { action: "close",  phrases: ["close", "close it", "got it", "back"] },     // closes the how-to guide
      { action: "guide",  phrases: ["how to", "how do i", "show me", "demo", "guide", "help"] },
      { action: "repeat", phrases: ["repeat", "say again", "say that again", "what's next", "what is next", "what now"] },
      { action: "more",   phrases: ["more time", "more rest", "add time", "extra time", "plus fifteen", "plus 15", "fifteen more", "15 more"] },
      { action: "unmute", phrases: ["unmute", "sound on", "voice on"] },
      { action: "mute",   phrases: ["mute", "quiet", "silence", "sound off"] },
      { action: "pause",  phrases: ["pause", "stop", "hold on", "hold up", "wait", "freeze", "break", "time out"] },
      { action: "resume", phrases: ["resume", "start", "continue", "unpause", "play", "go", "let's go", "carry on", "ready", "restart"] },
      { action: "skip",   phrases: ["skip", "skip it", "skip this", "pass"] },
      { action: "next",   phrases: ["next", "next one", "done", "finished", "complete", "that's it", "move on"] },
    ],
  },

  // ---- Daily checklist -----------------------------------------------
  checklist: [
    { id: "workout", label: "Workout done" },
    { id: "protein", label: "Protein at every meal" },
    { id: "steps",   label: "8,000 steps" },
    { id: "water",   label: "3 L water", waterGoalMl: 3000, glassMl: 250 },
    { id: "food",    label: "No outside food", hint: "Sunday flex meal allowed" },
    { id: "alcohol", label: "No alcohol / within flex night" },
    { id: "sleep",   label: "7 h sleep" },
    { id: "stretch", label: "5 min stretching" },
  ],
};
