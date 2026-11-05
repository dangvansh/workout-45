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
   • A "target" for a move in a block can be:
       40                          → 40 reps
       { reps: 18, show: "15–20" } → 18 reps, but the screen shows "15–20"
       { seconds: 45 }             → a 45-second timed hold (auto countdown)
   • Every move "id" must be unique inside its routine, and each block's
     "targets" must list every move id of that routine.
   • Exercise guide fields on a move (all optional):
       how:    ["step 1", "step 2", …]  → form steps shown in the guide
       video:  "https://youtu.be/…"     → a default video (plays in the app)
       search: "words"                  → what "Find a form video" searches
     A video pinned inside the app (Guide page) overrides `video`.
   • After editing, reload the app. On the iPad, open the app once while
     online so it picks up the new version.
   • Run `node tests/test_sessions.js` afterwards: it re-checks every day
     type in every block (it will flag differences from the ORIGINAL plan,
     which is expected if you changed reps on purpose).
   ===================================================================== */

var PLAN = {
  title: "45-Day Plan",

  // ---- Dates ---------------------------------------------------------
  startDate: "2026-11-03", // Day 1
  endDate: "2026-12-17",   // Day 45

  // Blocks decide which reps/timers apply. They must cover start → end.
  blocks: [
    { id: "A", name: "Block A", start: "2026-11-03", end: "2026-11-17" },
    { id: "B", name: "Block B", start: "2026-11-18", end: "2026-12-02" },
    { id: "C", name: "Block C", start: "2026-12-03", end: "2026-12-17" },
  ],

  // Days that prompt for a progress photo + waist measurement.
  checkpoints: ["2026-11-03", "2026-11-25", "2026-12-17"],

  // ---- Weekly schedule ----------------------------------------------
  // routines run in the order listed (ids refer to `routines` below).
  // activity: the sport you expect to play that day (an id from `activities`
  //           below). Until you log something else, the day's plan is
  //           already reduced for it. "Do the full plan anyway" undoes that.
  // rest: marks the day as a rest day on the calendar.
  schedule: {
    mon: { label: "Football day", activity: "football", routines: ["mobility", "core", "wallAbs"] },
    tue: { label: "Core day",            routines: ["mobility", "core", "wallAbs"] },
    wed: { label: "Strength day",        routines: ["mobility", "strength"] },
    thu: { label: "Core day",            routines: ["mobility", "core", "wallAbs"] },
    fri: { label: "Strength + Wall abs", routines: ["mobility", "strength", "wallAbs"] },
    sat: { label: "Walk / jog + Wall abs", routines: ["mobility", "walk", "wallAbs"] },
    sun: { label: "Rest day (mobility only)", rest: true, routines: ["mobility"] },
  },

  // ---- Guided-mode timing -------------------------------------------
  getReadySeconds: 5,       // countdown before the first move of a session
  restAddSeconds: 15,       // what the "+15 s" button adds to a rest

  // ---- Hydration ----------------------------------------------------
  hydration: {
    breakSeconds: 45,
    message: "Water break — take a few sips",
    afterMobility: true,              // after the mobility routine
    beforeWallAbs: true,              // before the wall-abs routine
    everyNRounds: 2,                  // after every 2 rounds/sets of a main routine
    mainRoutines: ["core", "strength"],
    // false: water break is its own 45 s step, then the normal round rest.
    // true:  merge it into the round rest ("Rest + water", longest of the two).
    combineWithRoundRest: false,
    walkReminderMinutes: 15,          // on walks: a reminder every 15 min (walk keeps going)
  },

  // ---- Form & safety tips (moves refer to these by key) --------------
  tips: {
    knee:  "Go easy on the left knee — never force it, stop at any twinge, twist from the hips.",
    elbow: "Right elbow: use fists or a wall if it complains.",
    back:  "Use a thick mat or folded towel under your lower back/tailbone; skip if anything presses on a sore spot.",
  },

  // ---- Routines -----------------------------------------------------
  // style "timed":    every move is a countdown, auto-advancing.
  // style "circuit":  do every move once = 1 round/set; repeat.
  // style "segments": one continuous timed activity split into parts (walk/jog).
  routines: {
    // Routine 1 — Daily mobility (5 min, same in every block)
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

    // Routine 2 — Core circuit (rep-based, rounds)
    core: {
      name: "Core circuit",
      style: "circuit",
      roundLabel: "Round",
      restBetweenMoves: 20,
      restBetweenRounds: 75,
      moves: [
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
      ],
      blocks: {
        A: { rounds: 4, targets: { claps: 40, sameKnee: 40, kneePress: 40, squatTwist: 20 } },
        B: { rounds: 4, targets: { claps: 45, sameKnee: 45, kneePress: 45, squatTwist: 20 } },
        C: { rounds: 5, targets: { claps: 50, sameKnee: 50, kneePress: 50, squatTwist: 20 } },
      },
    },

    // Routine 3 — Wall abs (feet flat on a wall, knees bent). All 5 moves = 1 set.
    wallAbs: {
      name: "Wall abs",
      style: "circuit",
      roundLabel: "Set",
      restBetweenMoves: 15,
      restBetweenRounds: 60,
      moves: [
        { id: "toeReach",  name: "Wall toe-reach crunch", tip: "back", search: "wall toe touch crunch",
          how: ["Lie on your back, feet flat on the wall, knees bent about 90°.",
                "Reach both hands up towards your toes, lifting your shoulder blades off the floor.",
                "Lower slowly. Keep your chin slightly tucked."] },
        { id: "crunch",    name: "Wall crunch (hands behind head)", speak: "Wall crunch", tip: "back", search: "wall crunch abs",
          how: ["Feet flat on the wall, knees bent. Hands lightly behind your head, elbows wide.",
                "Curl your shoulders up using your abs. Don't pull on your neck.",
                "Lower slowly with control."] },
        { id: "crossBody", name: "Wall cross-body crunch (alternating)", speak: "Wall cross-body crunch", tip: "back", search: "wall bicycle crunch cross body",
          how: ["Feet flat on the wall, hands behind your head.",
                "Curl up and rotate one elbow towards the opposite knee.",
                "Lower and switch sides. Each side counts as one rep."] },
        { id: "kneeHug",   name: "Wall knee-hug crunch", tip: "back", search: "knee hug crunch",
          how: ["Start with feet flat on the wall, arms overhead or by your sides.",
                "Bring your knees off the wall towards your chest as you curl up and hug them.",
                "Return your feet to the wall with control."] },
        { id: "reverse",   name: "Wall reverse crunch / hip lift", speak: "Wall reverse crunch", tip: "back", search: "reverse crunch hip lift",
          how: ["Feet on the wall, arms by your sides, palms down.",
                "Use your lower abs to curl your hips and tailbone a little off the floor.",
                "Lower slowly. It's a small movement, so don't swing."] },
      ],
      blocks: {
        A: { rounds: 3, targets: { toeReach: 12, crunch: 12, crossBody: 12, kneeHug: 12, reverse: 12 } },
        B: { rounds: 3, targets: { toeReach: 15, crunch: 15, crossBody: 15, kneeHug: 15, reverse: 15 } },
        C: { rounds: 4, targets: {
          toeReach:  { reps: 18, show: "15–20" },
          crunch:    { reps: 18, show: "15–20" },
          crossBody: { reps: 18, show: "15–20" },
          kneeHug:   { reps: 18, show: "15–20" },
          reverse:   { reps: 18, show: "15–20" },
        } },
      },
    },

    // Routine 4 — Full-body strength (rounds)
    strength: {
      name: "Full-body strength",
      style: "circuit",
      roundLabel: "Round",
      restBetweenMoves: 20,
      restBetweenRounds: 90,
      moves: [
        { id: "pushups",  name: "Push-ups", note: "Incline or wall push-ups are fine", tip: "elbow", search: "push up proper form incline",
          how: ["Hands slightly wider than your shoulders, body straight from head to heels.",
                "Lower your chest towards the floor with elbows about 45° from your body.",
                "Push back up. Hands on a bench or wall makes it easier."] },
        { id: "bridges",  name: "Glute bridges", tip: "back", search: "glute bridge proper form",
          how: ["Lie on your back, knees bent, feet flat and hip-width apart.",
                "Drive through your heels to lift your hips. Squeeze your glutes for 1 second at the top.",
                "Lower with control. Ribs down, no lower-back arch."] },
        { id: "lunges",   name: "Reverse lunges", eachSide: true, sideWord: "each leg", tip: "knee", search: "reverse lunge proper form",
          how: ["Stand tall and step one foot back.",
                "Lower until both knees are bent (front knee over the ankle). Go shallower if the knee complains.",
                "Push through the front heel to stand. Hold a chair or wall for balance if needed."] },
        { id: "plank",    name: "Plank", search: "forearm plank proper form",
          how: ["Forearms under your shoulders, legs straight behind you.",
                "Squeeze your glutes and brace your abs so your body is one straight line.",
                "Don't let your hips sag or pike up. Knees down is the easier version."] },
        { id: "superman", name: "Superman hold", search: "superman hold exercise form",
          how: ["Lie face down with your arms stretched overhead.",
                "Lift your arms, chest and legs a few centimetres off the floor. Look at the floor.",
                "Squeeze your glutes and hold. Breathe steadily."] },
        { id: "wallSit",  name: "Wall sit", tip: "knee", search: "wall sit proper form",
          how: ["Back flat against the wall, feet about 50 cm in front of you.",
                "Slide down until your knees are bent — 90°, or higher if the left knee complains.",
                "Knees over ankles, weight in your heels. Hold."] },
      ],
      blocks: {
        A: { rounds: 4, targets: {
          pushups: { reps: 12, show: "12–15" }, bridges: { reps: 12, show: "12–15" }, lunges: { reps: 12, show: "12–15" },
          plank: { seconds: 45 }, superman: { seconds: 20 }, wallSit: { seconds: 30 } } },
        B: { rounds: 4, targets: {
          pushups: 15, bridges: 15, lunges: 15,
          plank: { seconds: 50 }, superman: { seconds: 25 }, wallSit: { seconds: 40 } } },
        C: { rounds: 4, targets: {
          pushups: { reps: 15, show: "15–20" }, bridges: { reps: 15, show: "15–20" }, lunges: { reps: 15, show: "15–20" },
          plank: { seconds: 60 }, superman: { seconds: 30 }, wallSit: { seconds: 45 } } },
      },
    },

    // Walk / jog (Saturday). Segments run back to back; kind "jog" gets jog cues.
    walk: {
      name: "Walk / jog",
      style: "segments",
      blocks: {
        A: { segments: [
          { kind: "walk", name: "Brisk walk", minutes: 40 },
        ] },
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
  // according to its `effect` (see activityEffects below). Change the
  // default minutes or effect, or add your own sports here.
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
  // In `plan`, each routine is "full", { rounds: N } (capped at that block's
  // rounds/sets), or left out to drop it for the day. Only routines that
  // are already scheduled for that weekday are ever kept — an activity never
  // adds work. plan: null → the day's plan is unchanged.
  activityEffects: {
    hard:     { label: "Hard",     plan: { mobility: "full", core: { rounds: 1 }, strength: { rounds: 1 } } },
    moderate: { label: "Moderate", plan: { mobility: "full", core: { rounds: 2 }, strength: { rounds: 2 }, wallAbs: { rounds: 1 } } },
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
