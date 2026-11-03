/* 45 Days — tracker + guided workout player.
   Plan data: config.js · Plan maths / session queue: session.js · This file: UI, storage, player. */
(function () {
  "use strict";

  // =====================================================================
  // Utilities
  // =====================================================================
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function clock(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function minutes(sec) { return Math.round(sec / 60); }
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function dateParts(key) { var p = key.split("-").map(Number); return { y: p[0], m: p[1], d: p[2] }; }
  function longDate(key) { var p = dateParts(key); return Session.WEEKDAY_NAMES[Session.weekdayOf(key)] + " " + p.d + " " + MONTHS[p.m - 1] + " " + p.y; }
  function shortDate(key) { var p = dateParts(key); return p.d + " " + MONTHS[p.m - 1].slice(0, 3); }
  // Lower-case words only, for matching speech ("Plus 15!" → "plus 15").
  function normSpeech(s) {
    return String(s || "").toLowerCase().replace(/\+/g, " plus ").replace(/[’`]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function isTyping() { var a = document.activeElement; return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable); }

  // ?date=2026-11-07 overrides "today" (handy for previewing other days)
  var DATE_OVERRIDE = (function () {
    var d = new URLSearchParams(location.search).get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  })();
  function today() { return DATE_OVERRIDE || Session.localKey(); }

  // =====================================================================
  // Storage (localStorage, one JSON blob)
  // =====================================================================
  var STORE_KEY = "wt45.data.v1";
  var Store = {
    data: null,
    blank: function () {
      return {
        version: 1, sessions: [], football: {}, checklist: {}, body: [], checkpoints: {}, videos: {},
        settings: { muted: false, voice: true, listen: !!(PLAN.voiceCommands && PLAN.voiceCommands.enabled) },
        lastExport: null,
      };
    },
    load: function () {
      var d = null;
      try { d = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { d = null; }
      var b = this.blank();
      this.data = Object.assign(b, d || {});
      this.data.settings = Object.assign(this.blank().settings, (d && d.settings) || {});
    },
    save: function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); }
      catch (e) { toast("Couldn't save — browser storage is full or blocked"); }
    },
  };

  // =====================================================================
  // Tracker maths
  // =====================================================================
  function sessionsOn(key) { return Store.data.sessions.filter(function (s) { return s.date === key; }); }
  function checklistFor(key) {
    var c = Store.data.checklist[key];
    if (!c) c = { items: {}, waterMl: 0 };
    return c;
  }
  function waterItem() { return PLAN.checklist.filter(function (i) { return i.waterGoalMl; })[0]; }
  function isTicked(key, item) {
    var c = checklistFor(key);
    if (item.waterGoalMl) return !!c.items[item.id] || c.waterMl >= item.waterGoalMl;
    return !!c.items[item.id];
  }
  function checklistCount(key) {
    return PLAN.checklist.filter(function (i) { return isTicked(key, i); }).length;
  }

  // status: done | partial | missed | rest | today | upcoming
  function dayStatus(key) {
    var info = Session.dayInfo(key);
    var t = today();
    var ss = sessionsOn(key);
    var complete = ss.some(function (s) { return s.status === "complete"; });
    var partial = ss.some(function (s) { return s.status === "partial"; });
    var fb = !!Store.data.football[key];
    var st;
    if (info.schedule.football) {
      if (fb && complete) st = "done";
      else if (fb || complete || partial) st = "partial";
    } else if (complete) st = "done";
    else if (partial) st = "partial";
    if (!st) {
      if (info.schedule.rest) st = key <= t ? "rest" : "upcoming";
      else if (key < t) st = "missed";
      else if (key === t) st = "today";
      else st = "upcoming";
    }
    return { status: st, info: info, sessions: ss, football: Store.data.football[key] || null };
  }

  // Consecutive days kept (done; rest days don't break it). Today only counts once done.
  function streak() {
    var t = today();
    var key = t, n = 0;
    if (dayStatus(t).status !== "done") key = Session.addDays(t, -1);
    while (key >= PLAN.startDate) {
      var st = dayStatus(key).status;
      if (st === "done") n++;
      else if (st !== "rest") break;
      key = Session.addDays(key, -1);
    }
    return n;
  }

  function weeks() {
    var days = Session.planDays(), out = [];
    for (var i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }
  function weekStats(days) {
    var t = today();
    var s = { planned: days.length, done: 0, partial: 0, minutes: 0, water: 0, ticks: 0, possible: 0, ratings: [] };
    days.forEach(function (d) {
      var ds = dayStatus(d);
      if (ds.status === "done") s.done++;
      if (ds.status === "partial") s.partial++;
      ds.sessions.forEach(function (x) {
        s.minutes += x.durationSec / 60;
        s.water += x.waterBreaks || 0;
        if (x.rating) s.ratings.push(x.rating);
      });
      if (ds.football) s.minutes += ds.football.minutes || 0;
      if (d <= t) { s.possible += PLAN.checklist.length; s.ticks += checklistCount(d); }
    });
    s.minutes = Math.round(s.minutes);
    s.checklistPct = s.possible ? Math.round((s.ticks / s.possible) * 100) : null;
    s.avgRating = s.ratings.length ? (s.ratings.reduce(function (a, b) { return a + b; }, 0) / s.ratings.length).toFixed(1) : null;
    return s;
  }

  // =====================================================================
  // Toast + modal
  // =====================================================================
  var toastTimer;
  function toast(msg, ms) {
    var el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, ms || 3200);
  }

  var modalOnClose = null;
  function openModal(html, onClose) {
    var m = $("#modal");
    m.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true">' +
      '<button class="icon-btn modal-x" data-close aria-label="Close">✕</button>' + html + "</div>";
    m.hidden = false;
    modalOnClose = onClose || null;
    var f = m.querySelector("[autofocus]") || m.querySelector(".modal-card");
    if (f) f.focus && f.focus();
    return m;
  }
  function closeModal() {
    var m = $("#modal");
    if (m.hidden) return;
    m.hidden = true;
    m.innerHTML = "";
    var cb = modalOnClose; modalOnClose = null;
    if (cb) cb();
  }
  function confirmModal(title, body, okLabel, onOk, danger) {
    var m = openModal('<h2>' + esc(title) + '</h2><p class="muted">' + body + '</p>' +
      '<div class="row gap end"><button class="btn ghost" data-close>Cancel</button>' +
      '<button class="btn ' + (danger ? "danger" : "primary") + '" id="cmOk" autofocus>' + esc(okLabel) + "</button></div>");
    $("#cmOk", m).onclick = function () { closeModal(); onOk(); };
  }
  document.addEventListener("click", function (e) {
    if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal();
  });

  // =====================================================================
  // Sound: beeps (Web Audio) + voice (Web Speech) with beep-only fallback
  // =====================================================================
  var Sound = {
    ctx: null,
    voiceState: "unknown", // unknown | ok | unavailable
    voice: null,
    lastSpoken: "",
    speakingUntil: 0,
    muted: function () { return Store.data.settings.muted; },

    // Must run inside a tap/click: Safari only allows audio after a gesture.
    unlock: function () {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC && !this.ctx) this.ctx = new AC();
        if (this.ctx) {
          if (this.ctx.state !== "running") this.ctx.resume();
          var buf = this.ctx.createBuffer(1, 1, 22050);
          var src = this.ctx.createBufferSource();
          src.buffer = buf; src.connect(this.ctx.destination); src.start(0);
        }
      } catch (e) { /* no audio — flashes still work */ }
      if ("speechSynthesis" in window) {
        this.pickVoice();
        try {
          // A silent utterance inside the gesture unlocks speech on iOS Safari.
          var u = new SpeechSynthesisUtterance(" ");
          u.volume = 0;
          speechSynthesis.speak(u);
        } catch (e) { this.voiceState = "unavailable"; }
      } else this.voiceState = "unavailable";
    },

    pickVoice: function () {
      if (!("speechSynthesis" in window)) return;
      var voices = speechSynthesis.getVoices() || [];
      var en = voices.filter(function (v) { return /^en/i.test(v.lang); });
      var pref = ["en-GB", "en-IN", "en-US", "en-AU"];
      var best = null;
      for (var i = 0; i < pref.length && !best; i++) {
        best = en.filter(function (v) { return v.lang === pref[i] && v.localService; })[0] || en.filter(function (v) { return v.lang === pref[i]; })[0];
      }
      this.voice = best || en[0] || null;
    },

    beep: function (freq, dur, vol, delay) {
      if (this.muted() || !this.ctx) return;
      try {
        if (this.ctx.state !== "running") this.ctx.resume();
        var t = this.ctx.currentTime + (delay || 0);
        var o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = "sine"; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol || 0.4, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t); o.stop(t + dur + 0.05);
      } catch (e) { /* ignore */ }
    },
    tick: function () { this.beep(880, 0.13, 0.45); },
    go: function () { this.beep(1320, 0.45, 0.5); },
    rest: function () { this.beep(520, 0.25, 0.35); this.beep(390, 0.35, 0.35, 0.22); },
    done: function () { this.beep(990, 0.12, 0.4); this.beep(1480, 0.2, 0.4, 0.12); },
    water: function () { this.beep(660, 0.16, 0.35); this.beep(880, 0.16, 0.35, 0.18); this.beep(660, 0.25, 0.35, 0.36); },
    finish: function () { [660, 880, 1100, 1320].forEach(function (f, i) { Sound.beep(f, 0.22, 0.4, i * 0.16); }); },

    say: function (text) {
      if (this.muted() || !Store.data.settings.voice || this.voiceState === "unavailable") return;
      if (!("speechSynthesis" in window)) { this.voiceState = "unavailable"; return; }
      var self = this;
      var speak = function () {
        try {
          var u = new SpeechSynthesisUtterance(text);
          if (self.voice) { u.voice = self.voice; u.lang = self.voice.lang; } else u.lang = "en-GB";
          u.rate = 1; u.pitch = 1; u.volume = 1;
          u.onstart = function () { self.voiceState = "ok"; };
          // Remember what we're saying so voice commands don't react to our own cues.
          self.lastSpoken = normSpeech(text);
          self.speakingUntil = Date.now() + 2000 + text.length * 80;
          u.onend = function () { self.speakingUntil = Date.now() + 1500; };
          speechSynthesis.speak(u);
          if (self.voiceState === "unknown") {
            setTimeout(function () {
              if (self.voiceState === "unknown" && !speechSynthesis.speaking) {
                self.voiceState = "unavailable";
                toast("Voice cues aren't available here — using beeps and flashes only", 5000);
                Player.renderStatus && Player.renderStatus();
              }
            }, 3500);
          }
        } catch (e) { self.voiceState = "unavailable"; }
      };
      // iOS sometimes drops a speak() issued straight after cancel(), so leave a gap.
      if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); setTimeout(speak, 80); }
      else speak();
    },
    stopVoice: function () { try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch (e) { /* ignore */ } },
  };
  if ("speechSynthesis" in window && speechSynthesis.addEventListener) {
    speechSynthesis.addEventListener("voiceschanged", function () { Sound.pickVoice(); });
  }

  // =====================================================================
  // Screen wake lock (with visible fallback advice)
  // =====================================================================
  var Wake = {
    lock: null,
    state: "off", // off | on | unsupported | failed
    on: function () {
      var self = this;
      if (!("wakeLock" in navigator)) { this.state = "unsupported"; return Promise.resolve(false); }
      return navigator.wakeLock.request("screen").then(function (l) {
        self.lock = l; self.state = "on";
        l.addEventListener("release", function () { if (self.lock === l) { self.lock = null; if (Player.active) self.state = "failed"; Player.renderStatus(); } });
        Player.renderStatus();
        return true;
      }).catch(function () { self.state = "failed"; Player.renderStatus(); return false; });
    },
    off: function () {
      var l = this.lock; this.lock = null; this.state = "off";
      if (l) l.release().catch(function () {});
    },
  };
  // =====================================================================
  // Voice commands (Web Speech recognition). The mic is only on while a
  // workout (or the Settings test) is running.
  // =====================================================================
  var VOICE_CMDS = ((PLAN.voiceCommands && PLAN.voiceCommands.commands) || []).map(function (c) {
    return {
      action: c.action,
      phrases: c.phrases.map(function (p) {
        var n = normSpeech(p);
        return { text: n, re: new RegExp("(^| )" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "( |$)") };
      }),
    };
  });

  // First command (in config order) found in the text. While the app is
  // talking, phrases that are part of what it's saying are ignored (echo).
  function matchCommand(text) {
    var t = normSpeech(text);
    if (!t) return null;
    var echo = Date.now() < Sound.speakingUntil ? Sound.lastSpoken : "";
    for (var i = 0; i < VOICE_CMDS.length; i++) {
      for (var j = 0; j < VOICE_CMDS[i].phrases.length; j++) {
        var p = VOICE_CMDS[i].phrases[j];
        if (p.re.test(t) && !(echo && p.re.test(echo))) return { action: VOICE_CMDS[i].action, phrase: p.text };
      }
    }
    return null;
  }

  var Listen = {
    rec: null,
    on: false,
    state: "off", // off | starting | listening | blocked | unsupported | error
    lastError: "",
    heard: "",
    heardAt: 0,
    handler: null,  // function(action, text) → label to show, or null if ignored
    onHeard: null,
    onState: null,
    supported: function () { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
    enabled: function () { return !!Store.data.settings.listen; },
    notify: function () { Player.renderStatus(); if (this.onState) this.onState(this.state); },

    start: function (force) {
      if (!force && !this.enabled()) { this.state = "off"; return this.notify(); }
      if (!this.supported()) { this.state = "unsupported"; return this.notify(); }
      if (this.on && this.rec) return;
      this.on = true; this.fails = 0; this.lastError = "";
      this._start();
    },
    _start: function () {
      var self = this, SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      var lang = (PLAN.voiceCommands && PLAN.voiceCommands.lang) || (/^en/i.test(navigator.language || "") ? navigator.language : "en-US");
      try {
        var r = new SR();
        r.lang = lang;
        r.continuous = true;
        r.interimResults = true; // react as soon as a word is recognised
        r.maxAlternatives = 3;
        r._handled = {};
        r.onstart = function () { self.state = "listening"; self.startedAt = Date.now(); self.notify(); };
        r.onresult = function (e) { self.onResult(e, r); };
        r.onerror = function (e) {
          if (e.error === "not-allowed" || e.error === "service-not-allowed") {
            self.on = false; self.state = "blocked";
            toast("Microphone access is blocked, so voice commands are off. Allow the mic for this site to use them.", 7000);
          } else if (e.error === "audio-capture") {
            self.on = false; self.state = "error"; self.lastError = "no microphone";
          } else if (e.error === "network") {
            self.lastError = "needs internet";
          }
          self.notify();
        };
        r.onend = function () {
          if (self.rec === r) self.rec = null;
          if (!self.on) { if (self.state !== "blocked" && self.state !== "error") self.state = "off"; return self.notify(); }
          // Browsers end recognition every so often; restart it, backing off if it keeps failing.
          var quick = Date.now() - (self.startedAt || 0) < 2000;
          self.fails = quick ? (self.fails || 0) + 1 : 0;
          if (self.fails > 6) { self.on = false; self.state = "error"; self.lastError = self.lastError || "keeps stopping"; return self.notify(); }
          setTimeout(function () { if (self.on && !self.rec && document.visibilityState === "visible") self._start(); }, quick ? 800 * self.fails : 200);
        };
        this.rec = r;
        this.state = "starting";
        r.start();
      } catch (e) {
        this.rec = null; this.on = false; this.state = "error"; this.lastError = "couldn't start";
      }
      this.notify();
    },
    stop: function () {
      this.on = false;
      var r = this.rec;
      this.rec = null;
      if (this.state !== "blocked" && this.state !== "unsupported") this.state = "off";
      if (r) { try { r.abort(); } catch (e) { /* ignore */ } }
      this.notify();
    },

    // Results can grow word by word (interim), so remember how many words of
    // each result were already used and only look at the new ones.
    onResult: function (e, r) {
      var handled = r._handled;
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var res = e.results[i];
        var words = normSpeech(res[0].transcript).split(" ").filter(Boolean);
        var from = handled[i] || 0;
        if (words.length <= from) continue;
        var fresh = words.slice(from).join(" ");
        this.heard = fresh; this.heardAt = Date.now();
        if (this.onHeard) this.onHeard(fresh, res.isFinal);
        var hit = matchCommand(fresh);
        for (var a = 1; !hit && a < res.length; a++) {
          hit = matchCommand(normSpeech(res[a].transcript).split(" ").filter(Boolean).slice(from).join(" "));
        }
        if (hit) { handled[i] = words.length; this.fire(hit, fresh); }
        else if (Date.now() < Sound.speakingUntil) handled[i] = words.length; // our own voice — drop it
      }
      this.notify();
    },
    fire: function (hit, text) {
      var now = Date.now();
      if (hit.action === this.lastAction && now - this.lastAt < 1500) return; // same word, interim + final
      this.lastAction = hit.action; this.lastAt = now;
      var label = this.handler ? this.handler(hit.action, text) : null;
      if (label) { Sound.beep(1250, 0.07, 0.25); toast("🎙 " + label, 2500); }
    },
  };

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      if (Listen.on && !Listen.rec) Listen._start(); // recognition stops while the page is hidden
      if (Player.active && !Wake.lock) Wake.on(); // the lock drops whenever the page is hidden
      if (!Player.active) render();               // date may have rolled over
    }
  });

  // =====================================================================
  // Rendering helpers
  // =====================================================================
  var STATUS_LABEL = { done: "Done", partial: "Partial", missed: "Missed", rest: "Rest", today: "Today", upcoming: "Upcoming" };

  function arcPath(cx, cy, r, a0, a1) {
    var p0 = [cx + r * Math.sin(a0), cy - r * Math.cos(a0)], p1 = [cx + r * Math.sin(a1), cy - r * Math.cos(a1)];
    return "M" + p0[0].toFixed(2) + " " + p0[1].toFixed(2) + " A" + r + " " + r + " 0 " + (a1 - a0 > Math.PI ? 1 : 0) + " 1 " + p1[0].toFixed(2) + " " + p1[1].toFixed(2);
  }

  // 45 segments, one per day, coloured by status.
  function progressRing(dayNum) {
    var days = Session.planDays(), n = days.length, gap = 0.035;
    var t = today();
    var segs = days.map(function (d, i) {
      var a0 = (i / n) * 2 * Math.PI + gap / 2, a1 = ((i + 1) / n) * 2 * Math.PI - gap / 2;
      var st = dayStatus(d).status;
      return '<path class="seg s-' + st + (d === t ? " is-today" : "") + '" d="' + arcPath(110, 110, 92, a0, a1) + '"><title>Day ' + (i + 1) + " · " + shortDate(d) + " · " + STATUS_LABEL[st] + "</title></path>";
    }).join("");
    var inPlan = dayNum >= 1 && dayNum <= n;
    var center = inPlan
      ? '<text x="110" y="104" class="ring-big">' + dayNum + '</text><text x="110" y="134" class="ring-small">of ' + n + " days</text>"
      : dayNum < 1 ? '<text x="110" y="104" class="ring-big">' + (1 - dayNum) + '</text><text x="110" y="134" class="ring-small">days to go</text>'
      : '<text x="110" y="112" class="ring-big sm">Done</text>';
    return '<svg class="ring" viewBox="0 0 220 220" role="img" aria-label="Plan progress">' + segs + center + "</svg>";
  }

  function legend() {
    return '<div class="legend">' + ["done", "partial", "missed", "rest", "upcoming"].map(function (s) {
      return '<span><i class="dot s-' + s + '"></i>' + STATUS_LABEL[s] + "</span>";
    }).join("") + "</div>";
  }

  // =====================================================================
  // Views
  // =====================================================================
  var Views = {};

  Views.today = function () {
    var t = today();
    var ds = dayStatus(t), info = ds.info;
    var n = info.dayNumber, total = info.totalDays;
    var sess = Session.buildSession(t);
    var doneToday = ds.sessions.some(function (s) { return s.status === "complete"; });
    var wk = currentWeek();
    var wkStats = wk ? weekStats(wk) : null;
    var c = checklistFor(t), wItem = waterItem();

    var head = info.inPlan
      ? "Day " + n + ' <span class="of">of ' + total + "</span>"
      : n < 1 ? "Starts in " + (1 - n) + " day" + (n === 0 ? "" : "s") : "Plan complete";

    var routines = sess.routines.map(function (r) {
      return '<li><span class="r-name">' + esc(r.name) + '</span><span class="r-sum">' + esc(Session.routineSummary(r.id, sess.blockId)) + "</span></li>";
    }).join("");

    var html = '<header class="page-head"><div>' +
      '<p class="eyebrow">' + esc(longDate(t)) + (DATE_OVERRIDE ? ' <span class="chip warn">preview date</span>' : "") + "</p>" +
      "<h1>" + head + "</h1>" +
      '<p class="sub"><span class="chip block-' + info.block.id + '">' + esc(info.block.name) + "</span> " + esc(info.schedule.label) + "</p>" +
      "</div></header>";

    html += '<div class="dash">';

    // Session card
    html += '<section class="card session-card">' +
      '<div class="card-head"><h2>Today\'s session</h2><span class="muted">≈ ' + minutes(sess.estSeconds) + " min · " + sess.steps.length + " steps</span></div>" +
      (info.schedule.football ? '<p class="note">⚽ Football first (' + info.schedule.football.minutes + " min) — then this mobility session.</p>" : "") +
      '<ol class="routine-list">' + routines + "</ol>" +
      (doneToday ? '<p class="done-line">✓ Logged today — nice work.</p>' : "") +
      '<button class="btn primary huge" id="startBtn">' + (doneToday ? "Start again" : "▶ Start today's workout") + '<kbd>G</kbd></button>' +
      '<button class="btn ghost small" id="previewBtn">Preview the full queue</button>' +
      "</section>";

    // Progress ring
    html += '<section class="card ring-card">' + progressRing(n) +
      '<div class="ring-side"><div class="stat"><b>' + streak() + '</b><span>day streak</span></div>' +
      '<div class="stat"><b>' + Session.planDays().filter(function (d) { return dayStatus(d).status === "done"; }).length + '</b><span>days done</span></div>' +
      legend() + "</div></section>";

    // Football (Mondays)
    if (info.schedule.football) {
      var fb = Store.data.football[t];
      html += '<section class="card football-card"><div class="card-head"><h2>⚽ Football</h2>' + (fb ? '<span class="chip ok">Logged · ' + fb.minutes + " min</span>" : "") + "</div>" +
        '<div class="row gap wrap"><label class="field inline"><span>Minutes</span><input type="number" id="fbMin" min="0" max="240" inputmode="numeric" value="' + (fb ? fb.minutes : info.schedule.football.minutes) + '"></label>' +
        '<button class="btn ' + (fb ? "ghost" : "primary") + '" id="fbBtn">' + (fb ? "Update" : "Played football") + "</button>" +
        (fb ? '<button class="btn ghost" id="fbUndo">Remove</button>' : "") + "</div></section>";
    }

    // Checkpoint
    if (info.isCheckpoint) {
      var cp = Store.data.checkpoints[t] || {};
      var hasWaist = Store.data.body.some(function (b) { return b.date === t && b.waist; });
      html += '<section class="card checkpoint-card"><div class="card-head"><h2>📸 Checkpoint day</h2></div>' +
        "<p>Take a progress photo and measure your waist today.</p>" +
        '<label class="tick"><input type="checkbox" id="cpPhoto"' + (cp.photo ? " checked" : "") + "><span>Photo taken</span></label>" +
        (hasWaist ? '<p class="done-line">✓ Waist logged</p>' : '<div class="row gap wrap"><label class="field inline"><span>Waist (cm)</span><input type="number" step="0.1" id="cpWaist" inputmode="decimal"></label><button class="btn primary" id="cpSave">Save waist</button></div>') +
        "</section>";
    }

    // Checklist mini
    var cnt = checklistCount(t);
    var glasses = Math.round(c.waterMl / wItem.glassMl), goalG = wItem.waterGoalMl / wItem.glassMl;
    html += '<section class="card mini-check"><div class="card-head"><h2>Daily checklist</h2><a href="#checklist" class="muted">' + cnt + " / " + PLAN.checklist.length + " ›</a></div>" +
      '<div class="meter"><i style="width:' + Math.round((cnt / PLAN.checklist.length) * 100) + '%"></i></div>' +
      '<div class="water-row"><span>💧 ' + (c.waterMl / 1000).toFixed(2).replace(/0$/, "") + " L of " + wItem.waterGoalMl / 1000 + ' L</span>' +
      '<button class="btn small" data-water="-1" aria-label="Remove a glass">−</button><button class="btn primary small" data-water="1">+ ' + wItem.glassMl + " ml</button></div>" +
      '<div class="glasses">' + glassIcons(glasses, goalG) + "</div></section>";

    // This week
    if (wkStats) {
      html += '<section class="card"><div class="card-head"><h2>This plan week</h2><a href="#weekly" class="muted">Weekly ›</a></div>' +
        '<div class="stats3"><div class="stat"><b>' + wkStats.done + "/" + wkStats.planned + '</b><span>days done</span></div>' +
        '<div class="stat"><b>' + wkStats.minutes + '</b><span>minutes</span></div>' +
        '<div class="stat"><b>' + (wkStats.checklistPct == null ? "–" : wkStats.checklistPct + "%") + '</b><span>checklist</span></div></div></section>';
    }
    html += "</div>";
    view(html);

    $("#startBtn").onclick = function () { startWorkout(t); };
    $("#previewBtn").onclick = function () { previewQueue(t); };
    bindWaterButtons(t);
    if (info.schedule.football) {
      $("#fbBtn").onclick = function () {
        Store.data.football[t] = { minutes: Math.max(0, parseInt($("#fbMin").value, 10) || 0), at: new Date().toISOString() };
        Store.save(); toast("Football logged ⚽"); render();
      };
      if ($("#fbUndo")) $("#fbUndo").onclick = function () { delete Store.data.football[t]; Store.save(); render(); };
    }
    if (info.isCheckpoint) {
      $("#cpPhoto").onchange = function () { Store.data.checkpoints[t] = { photo: this.checked }; Store.save(); };
      if ($("#cpSave")) $("#cpSave").onclick = function () {
        var v = parseFloat($("#cpWaist").value);
        if (!(v > 0)) return toast("Enter your waist in cm");
        Store.data.body.push({ id: uid(), date: t, waist: v, weight: null }); Store.save(); toast("Waist saved"); render();
      };
    }
  };

  function glassIcons(n, goal) {
    var out = "";
    for (var i = 0; i < Math.max(goal, n); i++) out += '<i class="glass' + (i < n ? " full" : "") + '"></i>';
    return out;
  }
  function bindWaterButtons(key) {
    $$("[data-water]").forEach(function (b) {
      b.onclick = function () {
        var w = waterItem();
        var c = Store.data.checklist[key] || (Store.data.checklist[key] = { items: {}, waterMl: 0 });
        c.waterMl = Math.max(0, c.waterMl + Number(b.dataset.water) * w.glassMl);
        Store.save(); render();
      };
    });
  }
  function currentWeek() {
    var t = today(), ws = weeks();
    for (var i = 0; i < ws.length; i++) if (ws[i].indexOf(t) !== -1) return ws[i];
    return null;
  }

  function previewQueue(key) {
    var sess = Session.buildSession(key);
    var rows = sess.steps.map(function (s, i) {
      var what, cls = s.kind;
      if (s.kind === "move") {
        what = "<b>" + esc(s.name) + "</b> " + (s.round ? '<span class="muted">' + s.roundLabel + " " + s.round + "/" + s.rounds + "</span>" : "") + ' <span class="tgt">' + esc(Session.targetText(s)) + "</span>";
        if (s.cues.length) what += ' <span class="muted">· ' + s.cues.map(function (c) { return esc(c.text) + " @ " + clock(c.at); }).join(", ") + "</span>";
      } else what = esc(s.name) + ' <span class="tgt">' + Session.fmtSeconds(s.seconds) + "</span>" + (s.reason ? ' <span class="muted">· ' + esc(s.reason) + "</span>" : "");
      return '<li class="q-' + cls + '"><span class="qn">' + (i + 1) + "</span>" + what + "</li>";
    }).join("");
    openModal("<h2>" + esc(longDate(key)) + "</h2><p class=\"muted\">" + esc(PLAN.blocks.filter(function (b) { return b.id === sess.blockId; })[0].name) + " · " + esc(sess.dayLabel) + " · ≈ " + minutes(sess.estSeconds) + " min</p><ol class=\"queue\">" + rows + "</ol>");
  }

  Views.calendar = function () {
    var days = Session.planDays();
    var wdIndex = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
    var lead = wdIndex[Session.weekdayOf(days[0])];
    var t = today();
    var cells = "";
    for (var i = 0; i < lead; i++) cells += '<div class="cal-blank"></div>';
    days.forEach(function (d, i) {
      var ds = dayStatus(d), p = dateParts(d);
      var blockStart = PLAN.blocks.filter(function (b) { return b.start === d; })[0];
      var icons = "";
      if (ds.football) icons += "⚽";
      if (ds.info.isCheckpoint) icons += "📸";
      if (ds.status === "rest" || (ds.info.schedule.rest && ds.status === "done")) icons += "☾";
      cells += '<button class="cal-day s-' + ds.status + (d === t ? " is-today" : "") + '" data-date="' + d + '">' +
        '<span class="cd-num">' + p.d + "</span>" +
        '<span class="cd-day">D' + (i + 1) + (p.d === 1 || i === 0 ? " · " + MONTHS[p.m - 1].slice(0, 3) : "") + "</span>" +
        (blockStart ? '<span class="cd-block block-' + blockStart.id + '">' + blockStart.id + "</span>" : "") +
        '<span class="cd-icons">' + icons + "</span>" +
        '<span class="cd-status">' + STATUS_LABEL[ds.status] + "</span></button>";
    });
    var head = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (d) { return "<div class=\"cal-h\">" + d + "</div>"; }).join("");
    view('<header class="page-head"><div><p class="eyebrow">' + esc(shortDate(PLAN.startDate)) + " – " + esc(shortDate(PLAN.endDate)) + "</p><h1>Calendar</h1>" +
      '<p class="sub">' + PLAN.blocks.map(function (b) { return '<span class="chip block-' + b.id + '">' + esc(b.name) + " · " + shortDate(b.start) + "–" + shortDate(b.end) + "</span>"; }).join(" ") + "</p></div></header>" +
      '<section class="card">' + legend() + '<div class="cal">' + head + cells + "</div></section>");
    $$(".cal-day").forEach(function (b) { b.onclick = function () { dayDetail(b.dataset.date); }; });
  };

  function dayDetail(key) {
    var ds = dayStatus(key), info = ds.info;
    var html = "<h2>" + esc(longDate(key)) + "</h2>" +
      '<p class="muted">Day ' + info.dayNumber + " · " + esc(info.block.name) + " · " + esc(info.schedule.label) + ' · <span class="chip s-' + ds.status + '">' + STATUS_LABEL[ds.status] + "</span></p>";
    if (ds.sessions.length) {
      html += "<h3>Workouts logged</h3>" + ds.sessions.map(function (s) {
        return '<div class="log-entry"><div class="row between"><b>' + (s.status === "complete" ? "✓ Complete" : "◐ Partial") + "</b><span class=\"muted\">" +
          new Date(s.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " · " + minutes(s.durationSec) + " min</span></div>" +
          '<p class="muted">' + s.routines.map(function (r) { return (r.done ? "✓ " : "✗ ") + esc(r.name) + " (" + r.movesDone + "/" + r.movesTotal + ")"; }).join(" · ") + "</p>" +
          "<p>💧 " + s.waterBreaks + " water break" + (s.waterBreaks === 1 ? "" : "s") + (s.movesSkipped ? " · " + s.movesSkipped + " skipped" : "") +
          (s.rating ? " · Felt " + "★".repeat(s.rating) + "☆".repeat(5 - s.rating) : "") + "</p>" +
          (s.note ? '<p class="note">' + esc(s.note) + "</p>" : "") +
          '<button class="btn ghost small" data-del-session="' + s.id + '">Delete this log</button></div>';
      }).join("");
    } else html += '<p class="muted">No workout logged.</p>';
    if (info.schedule.football) html += "<h3>Football</h3>" + (ds.football ? "<p>⚽ Played · " + ds.football.minutes + " min</p>" : '<p class="muted">Not logged.</p>') +
      '<div class="row gap"><button class="btn small" id="ddFb">' + (ds.football ? "Remove football log" : "Log football (" + info.schedule.football.minutes + " min)") + "</button></div>";
    var ticks = PLAN.checklist.filter(function (i) { return isTicked(key, i); });
    html += "<h3>Checklist · " + ticks.length + "/" + PLAN.checklist.length + "</h3><p>" + (ticks.length ? ticks.map(function (i) { return "✓ " + esc(i.label); }).join("<br>") : '<span class="muted">Nothing ticked.</span>') + "</p>" +
      '<p class="muted">💧 ' + (checklistFor(key).waterMl / 1000) + " L water</p>";
    var body = Store.data.body.filter(function (b) { return b.date === key; });
    if (body.length) html += "<h3>Body</h3><p>" + body.map(function (b) { return (b.weight ? b.weight + " kg " : "") + (b.waist ? b.waist + " cm waist" : ""); }).join("<br>") + "</p>";
    html += '<div class="row gap wrap end"><a class="btn ghost" href="#checklist" data-close data-goto-day="' + key + '">Edit checklist</a><button class="btn primary" id="ddStart">Do this day\'s workout</button></div>';
    var m = openModal(html);
    $("#ddStart", m).onclick = function () { closeModal(); startWorkout(key); };
    $("[data-goto-day]", m).onclick = function () { checklistDay = key; };
    if ($("#ddFb", m)) $("#ddFb", m).onclick = function () {
      if (ds.football) delete Store.data.football[key];
      else Store.data.football[key] = { minutes: info.schedule.football.minutes, at: new Date().toISOString() };
      Store.save(); closeModal(); render(); dayDetail(key);
    };
    $$("[data-del-session]", m).forEach(function (b) {
      b.onclick = function () {
        confirmModal("Delete this workout log?", "This can't be undone.", "Delete", function () {
          Store.data.sessions = Store.data.sessions.filter(function (s) { return s.id !== b.dataset.delSession; });
          Store.save(); render(); dayDetail(key);
        }, true);
      };
    });
  }

  var checklistDay = null;
  Views.checklist = function () {
    var key = checklistDay || today();
    var c = checklistFor(key), w = waterItem();
    var isSun = Session.weekdayOf(key) === "sun";
    var items = PLAN.checklist.map(function (it) {
      var on = isTicked(key, it);
      var extra = "";
      if (it.waterGoalMl) {
        extra = '<div class="water-row big"><span>' + (c.waterMl / 1000).toFixed(2).replace(/0$/, "") + " / " + it.waterGoalMl / 1000 + " L</span>" +
          '<button class="btn small" data-water="-1" aria-label="Remove a glass">−</button><button class="btn primary" data-water="1">+ ' + it.glassMl + " ml glass</button></div>" +
          '<div class="glasses">' + glassIcons(Math.round(c.waterMl / it.glassMl), it.waterGoalMl / it.glassMl) + "</div>";
      }
      var hint = it.hint ? '<small class="' + (isSun && it.id === "food" ? "hl" : "muted") + '">' + esc(it.hint) + "</small>" : "";
      return '<li class="check-item' + (on ? " on" : "") + '"><label class="tick big"><input type="checkbox" data-item="' + it.id + '"' + (on ? " checked" : "") + "><span>" + esc(it.label) + hint + "</span></label>" + extra + "</li>";
    }).join("");
    var cnt = checklistCount(key);
    view('<header class="page-head"><div><p class="eyebrow">Day ' + Session.dayNumber(key) + "</p><h1>Checklist</h1></div>" +
      '<div class="date-nav"><button class="btn icon" id="clPrev" aria-label="Previous day">‹</button><span>' + esc(longDate(key)) + '</span><button class="btn icon" id="clNext" aria-label="Next day">›</button>' +
      (key !== today() ? '<button class="btn ghost small" id="clToday">Today</button>' : "") + "</div></header>" +
      '<section class="card"><div class="meter"><i style="width:' + Math.round((cnt / PLAN.checklist.length) * 100) + '%"></i></div><p class="muted">' + cnt + " of " + PLAN.checklist.length + ' done</p><ul class="checklist">' + items + "</ul></section>");
    $$("[data-item]").forEach(function (cb) {
      cb.onchange = function () {
        var e = Store.data.checklist[key] || (Store.data.checklist[key] = { items: {}, waterMl: 0 });
        e.items[cb.dataset.item] = cb.checked;
        var it = PLAN.checklist.filter(function (i) { return i.id === cb.dataset.item; })[0];
        if (it.waterGoalMl && !cb.checked && e.waterMl >= it.waterGoalMl) e.waterMl = it.waterGoalMl - it.glassMl;
        Store.save(); render();
      };
    });
    bindWaterButtons(key);
    $("#clPrev").onclick = function () { checklistDay = Session.addDays(key, -1); render(); };
    $("#clNext").onclick = function () { checklistDay = Session.addDays(key, 1); render(); };
    if ($("#clToday")) $("#clToday").onclick = function () { checklistDay = null; render(); };
  };

  Views.body = function () {
    var t = today();
    var entries = Store.data.body.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var cps = PLAN.checkpoints.map(function (d) {
      var hasW = entries.some(function (e) { return e.date === d && e.waist; });
      var photo = (Store.data.checkpoints[d] || {}).photo;
      return '<li class="' + (d === t ? "hl" : "") + '"><b>' + shortDate(d) + "</b> <span class=\"muted\">Day " + Session.dayNumber(d) + "</span> " +
        (hasW ? '<span class="chip ok">waist ✓</span>' : '<span class="chip">waist</span>') + " " +
        '<label class="tick inline"><input type="checkbox" data-cp="' + d + '"' + (photo ? " checked" : "") + "><span>photo</span></label></li>";
    }).join("");
    var rows = entries.slice().reverse().map(function (e) {
      return "<tr><td>" + shortDate(e.date) + "</td><td>" + (e.weight != null ? e.weight + " kg" : "–") + "</td><td>" + (e.waist != null ? e.waist + " cm" : "–") +
        '</td><td><button class="icon-btn" data-del-body="' + e.id + '" aria-label="Delete entry">✕</button></td></tr>';
    }).join("");
    view('<header class="page-head"><div><p class="eyebrow">Weight &amp; waist</p><h1>Body log</h1></div></header><div class="dash">' +
      '<section class="card"><h2>Add measurement</h2><div class="form-grid">' +
      '<label class="field"><span>Date</span><input type="date" id="bDate" value="' + t + '"></label>' +
      '<label class="field"><span>Weight (kg)</span><input type="number" step="0.1" inputmode="decimal" id="bWeight" placeholder="e.g. 82.4"></label>' +
      '<label class="field"><span>Waist (cm)</span><input type="number" step="0.1" inputmode="decimal" id="bWaist" placeholder="e.g. 94"></label>' +
      '<button class="btn primary" id="bSave">Save</button></div></section>' +
      '<section class="card"><h2>📸 Checkpoints</h2><p class="muted">Progress photo + waist on these days.</p><ul class="cp-list">' + cps + "</ul></section>" +
      '<section class="card wide"><h2>Weight (kg)</h2>' + lineChart(entries.filter(function (e) { return e.weight != null; }).map(function (e) { return { date: e.date, v: e.weight }; }), "kg", "var(--orange)") + "</section>" +
      '<section class="card wide"><h2>Waist (cm)</h2>' + lineChart(entries.filter(function (e) { return e.waist != null; }).map(function (e) { return { date: e.date, v: e.waist }; }), "cm", "var(--teal-bright)") + "</section>" +
      '<section class="card wide"><h2>Entries</h2>' + (rows ? '<table class="tbl"><thead><tr><th>Date</th><th>Weight</th><th>Waist</th><th></th></tr></thead><tbody>' + rows + "</tbody></table>" : '<p class="muted">No entries yet.</p>') + "</section></div>");
    $("#bSave").onclick = function () {
      var w = parseFloat($("#bWeight").value), ws = parseFloat($("#bWaist").value), d = $("#bDate").value || t;
      if (!(w > 0) && !(ws > 0)) return toast("Enter a weight and/or a waist measurement");
      Store.data.body.push({ id: uid(), date: d, weight: w > 0 ? w : null, waist: ws > 0 ? ws : null });
      Store.save(); toast("Saved"); render();
    };
    $$("[data-del-body]").forEach(function (b) {
      b.onclick = function () { Store.data.body = Store.data.body.filter(function (e) { return e.id !== b.dataset.delBody; }); Store.save(); render(); };
    });
    $$("[data-cp]").forEach(function (cb) {
      cb.onchange = function () { Store.data.checkpoints[cb.dataset.cp] = { photo: cb.checked }; Store.save(); };
    });
  };

  // Plain SVG line chart. x = date across the plan (stretches if data falls outside).
  function lineChart(pts, unit, color) {
    if (!pts.length) return '<p class="muted chart-empty">No data yet — add a measurement above.</p>';
    var W = 640, H = 230, L = 46, R = 18, T = 16, B = 34;
    var x0 = Session.parseKey(pts[0].date < PLAN.startDate ? pts[0].date : PLAN.startDate);
    var x1 = Session.parseKey(pts[pts.length - 1].date > PLAN.endDate ? pts[pts.length - 1].date : PLAN.endDate);
    var vals = pts.map(function (p) { return p.v; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var padv = Math.max(1, (hi - lo) * 0.2); lo = Math.floor(lo - padv); hi = Math.ceil(hi + padv);
    var X = function (d) { return L + ((Session.parseKey(d) - x0) / Math.max(1, x1 - x0)) * (W - L - R); };
    var Y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
    var g = "";
    for (var i = 0; i <= 4; i++) {
      var v = lo + ((hi - lo) * i) / 4, y = Y(v);
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" class="grid"/><text x="' + (L - 8) + '" y="' + (y + 4) + '" class="axis" text-anchor="end">' + (Math.round(v * 10) / 10) + "</text>";
    }
    PLAN.blocks.concat([{ start: PLAN.endDate, id: "" }]).forEach(function (b) {
      var x = X(b.start);
      g += '<line x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + (H - B) + '" class="grid v"/><text x="' + x + '" y="' + (H - 12) + '" class="axis" text-anchor="middle">' + shortDate(b.start) + "</text>";
    });
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + X(p.date).toFixed(1) + " " + Y(p.v).toFixed(1); }).join(" ");
    var dots = pts.map(function (p) { return '<circle cx="' + X(p.date).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="4.5" fill="' + color + '"><title>' + shortDate(p.date) + ": " + p.v + " " + unit + "</title></circle>"; }).join("");
    var last = pts[pts.length - 1], first = pts[0];
    var delta = last.v - first.v;
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + unit + ' chart">' + g +
      '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' + dots + "</svg>" +
      '<p class="muted">Latest <b class="fg">' + last.v + " " + unit + "</b> (" + shortDate(last.date) + ")" + (pts.length > 1 ? " · change " + (delta > 0 ? "+" : "") + (Math.round(delta * 10) / 10) + " " + unit : "") + "</p>";
  }

  // ---- Exercise guide: form steps + videos ---------------------------
  function moveDef(rid, id) {
    var r = PLAN.routines[rid];
    return r && r.moves ? r.moves.filter(function (m) { return m.id === id; })[0] || null : null;
  }
  function ytId(url) {
    var m = String(url || "").match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  function videoFor(rid, m) { return Store.data.videos[rid + "." + m.id] || m.video || ""; }
  function searchUrl(m) {
    return "https://www.youtube.com/results?search_query=" + encodeURIComponent(m.search || (m.speak || m.name) + " exercise proper form");
  }

  // onClose is kept across re-renders (pin / unpin), so the player resumes correctly.
  function openGuide(rid, id, onClose) {
    var m = moveDef(rid, id);
    if (!m) return;
    var key = rid + "." + id, url = videoFor(rid, m), yt = ytId(url);
    var pinned = !!Store.data.videos[key];
    var html = '<p class="eyebrow">' + esc(PLAN.routines[rid].name) + "</p><h2>" + esc(m.name) + "</h2>" +
      (m.tip ? '<p class="note">⚠ ' + esc(PLAN.tips[m.tip]) + "</p>" : "") +
      (m.note ? '<p class="muted">' + esc(m.note) + "</p>" : "") +
      (m.how ? '<ol class="how">' + m.how.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" : "");
    if (yt) {
      html += '<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/' + yt + '?rel=0&playsinline=1" title="' + esc(m.name) + ' form video" ' +
        'allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>' +
        '<p class="muted small">' + (navigator.onLine === false ? "You're offline — videos need internet. " : "") +
        '<a href="' + esc(url) + '" target="_blank" rel="noopener">Open on YouTube ↗</a> · <a href="' + esc(searchUrl(m)) + '" target="_blank" rel="noopener">Find a different video ↗</a></p>';
    } else if (url) {
      html += '<p><a class="btn primary" href="' + esc(url) + '" target="_blank" rel="noopener">▶ Open pinned video ↗</a></p>';
    } else {
      html += '<p><a class="btn primary" href="' + esc(searchUrl(m)) + '" target="_blank" rel="noopener">▶ Find a form video on YouTube ↗</a></p>' +
        '<p class="muted small">Found one you like? Copy its link (Share › Copy link) and pin it below — next time it plays right here.</p>';
    }
    html += '<div class="pin-row"><label class="field"><span>' + (pinned ? "Pinned video link" : "Pin a video (paste a YouTube link)") + "</span>" +
      '<input type="url" id="gUrl" inputmode="url" autocomplete="off" placeholder="https://youtu.be/…" value="' + esc(pinned ? url : "") + '"></label>' +
      '<button class="btn" id="gPin">' + (pinned ? "Update" : "Pin") + "</button>" +
      (pinned ? '<button class="btn ghost" id="gUnpin">Unpin</button>' : "") + "</div>";
    var md = openModal(html, onClose);
    $(".modal-card", md).classList.add("wide");
    $("#gPin", md).onclick = function () {
      var v = $("#gUrl", md).value.trim();
      if (!/^https?:\/\//i.test(v)) return toast("Paste a full link starting with https://");
      Store.data.videos[key] = v; Store.save();
      toast(ytId(v) ? "Video pinned ✓" : "Link pinned — it will open in a new tab");
      openGuide(rid, id, modalOnClose);
      if (currentView() === "guide" && !Player.active) Views.guide();
    };
    if ($("#gUnpin", md)) $("#gUnpin", md).onclick = function () {
      delete Store.data.videos[key]; Store.save();
      openGuide(rid, id, modalOnClose);
      if (currentView() === "guide" && !Player.active) Views.guide();
    };
  }

  Views.guide = function () {
    var html = '<header class="page-head"><div><p class="eyebrow">Form &amp; safety</p><h1>Exercise guide</h1>' +
      '<p class="sub">Tap a move for form steps and a video. During a workout, press <b>How to</b> (or <kbd>H</kbd>).</p></div></header>';
    Object.keys(PLAN.routines).forEach(function (rid) {
      var r = PLAN.routines[rid];
      if (!r.moves) return;
      html += '<section class="guide-group"><h2>' + esc(r.name) + '</h2><div class="guide-grid">' + r.moves.map(function (m) {
        var url = videoFor(rid, m);
        return '<button class="card guide-card" data-guide="' + rid + "|" + m.id + '">' +
          '<span class="g-name">' + esc(m.name) + "</span>" +
          (m.how ? '<span class="g-how">' + esc(m.how[0]) + "</span>" : "") +
          '<span class="g-foot">' + (url ? '<span class="chip ok">▶ ' + (ytId(url) ? "video pinned" : "link pinned") + "</span>" : '<span class="chip">▶ find a video</span>') +
          (m.tip ? '<span class="chip warn">⚠ safety tip</span>' : "") + "</span></button>";
      }).join("") + "</div></section>";
    });
    view(html);
    $$("[data-guide]").forEach(function (b) {
      b.onclick = function () { var p = b.dataset.guide.split("|"); openGuide(p[0], p[1]); };
    });
  };

  Views.weekly = function () {
    var t = today();
    var html = '<header class="page-head"><div><p class="eyebrow">7-day plan weeks</p><h1>Weekly summary</h1></div></header><div class="weeks">';
    weeks().forEach(function (days, i) {
      var s = weekStats(days);
      var current = days.indexOf(t) !== -1, future = days[0] > t;
      var pct = Math.round((s.done / s.planned) * 100);
      html += '<section class="card week' + (current ? " current" : "") + (future ? " future" : "") + '">' +
        '<div class="card-head"><h2>Week ' + (i + 1) + '</h2><span class="muted">' + shortDate(days[0]) + " – " + shortDate(days[days.length - 1]) + (current ? ' · <span class="chip warn">this week</span>' : "") + "</span></div>" +
        '<div class="wk-days">' + days.map(function (d) { var st = dayStatus(d).status; return '<i class="dot big s-' + st + '" title="' + shortDate(d) + " · " + STATUS_LABEL[st] + '"></i>'; }).join("") + "</div>" +
        '<div class="stats4"><div class="stat"><b>' + s.done + "<small>/" + s.planned + '</small></b><span>sessions done' + (s.partial ? " (+" + s.partial + " partial)" : "") + '</span></div>' +
        '<div class="stat"><b>' + s.minutes + '</b><span>workout min</span></div>' +
        '<div class="stat"><b>' + (s.checklistPct == null ? "–" : s.checklistPct + "%") + '</b><span>checklist</span></div>' +
        '<div class="stat"><b>' + s.water + '</b><span>water breaks</span></div></div>' +
        '<div class="meter"><i style="width:' + pct + '%"></i></div>' +
        (s.avgRating ? '<p class="muted">Average feel ' + s.avgRating + " / 5</p>" : "") + "</section>";
    });
    view(html + "</div>");
  };

  Views.settings = function () {
    var st = Store.data.settings;
    var counts = Store.data.sessions.length + " workouts · " + Object.keys(Store.data.checklist).length + " checklist days · " + Store.data.body.length + " body entries · " + Object.keys(Store.data.football).length + " football logs";
    var canShare = !!(navigator.canShare && window.File && (function () { try { return navigator.canShare({ files: [new File(["{}"], "x.json", { type: "application/json" })] }); } catch (e) { return false; } })());
    var standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    view('<header class="page-head"><div><p class="eyebrow">Sound, data, shortcuts</p><h1>Data &amp; settings</h1></div></header><div class="dash">' +
      '<section class="card"><h2>Sound</h2>' +
      '<label class="tick big"><input type="checkbox" id="sMute"' + (st.muted ? " checked" : "") + "><span>Mute all sound <small class=\"muted\">(M during a workout)</small></span></label>" +
      '<label class="tick big"><input type="checkbox" id="sVoice"' + (st.voice ? " checked" : "") + "><span>Voice cues <small class=\"muted\">(“Next: wall crunch, 12 reps”)</small></span></label>" +
      '<button class="btn" id="sTest">Test beeps &amp; voice</button><p class="muted" id="sTestOut">On iPad, tap this once to check that sound and voice work (and the silent switch / volume are up).</p></section>' +
      '<section class="card"><h2>🎙 Voice commands</h2>' +
      (Listen.supported()
        ? '<label class="tick big"><input type="checkbox" id="sListen"' + (st.listen ? " checked" : "") + "><span>Listen for commands during workouts <small class=\"muted\">(V during a workout)</small></span></label>"
        : '<p class="note">This browser doesn\'t support speech recognition, so voice commands are unavailable here. Use Chrome or Edge on the PC, or Safari on the iPad.</p>') +
      '<p class="small">Say: <b>pause</b> / <b>stop</b> · <b>resume</b> / <b>start</b> / <b>go</b> · <b>next</b> / <b>done</b> · <b>skip</b> · <b>more time</b> · <b>how to</b> · <b>close</b> · <b>repeat</b> · <b>mute</b> / <b>unmute</b> · <b>end workout</b> (then “yes”). ' +
      'All the phrases are in <code>config.js</code>.</p>' +
      (Listen.supported() ? '<button class="btn" id="sListenTest">Test voice commands</button><p class="muted" id="sListenOut">Tap, allow the microphone, then say a command — e.g. “pause”.</p>' : "") +
      '<p class="muted small">The mic is only on during a workout (or this test). Your browser\'s speech service turns speech into text: Chrome and Edge send the audio to Google / Microsoft and need internet; Safari uses Apple dictation. Tip: right after the app speaks, use a word it didn\'t just say (e.g. “skip” instead of “next”) — it ignores its own words for a moment.</p></section>' +
      '<section class="card"><h2>Move data between devices</h2><p class="muted">Each device keeps its own data. Export on one, import on the other — import merges, it never deletes.</p>' +
      '<p class="muted small">' + counts + (Store.data.lastExport ? "<br>Last export: " + new Date(Store.data.lastExport).toLocaleString() : "") + "</p>" +
      '<div class="row gap wrap"><button class="btn primary" id="sExport">⬇ Export (JSON file)</button>' + (canShare ? '<button class="btn" id="sShare">Share / Save to Files…</button>' : "") +
      '<label class="btn" for="sImport">⬆ Import JSON…</label><input type="file" id="sImport" accept="application/json,.json" hidden></div></section>' +
      '<section class="card"><h2>Screen &amp; install</h2><p>Screen wake lock: <b>' + ("wakeLock" in navigator ? "supported" : "not supported in this browser") + "</b>. " +
      "If the screen still dims during a workout, set <i>Settings › Display &amp; Brightness › Auto-Lock › Never</i> on the iPad while you train.</p>" +
      "<p>Running as installed app: <b>" + (standalone ? "yes" : "no (browser tab)") + '</b>. Offline support: <b id="sSw">checking…</b></p>' +
      '<p class="muted small">On iPad: Safari › Share › Add to Home Screen. Note: the Home Screen app keeps separate data from a Safari tab.</p></section>' +
      '<section class="card"><h2>Keyboard shortcuts (PC)</h2><table class="tbl keys"><tbody>' +
      "<tr><td><kbd>1</kbd>–<kbd>7</kbd></td><td>Switch page</td></tr><tr><td><kbd>H</kbd></td><td>How-to guide for the current / next move (pauses the timer)</td></tr><tr><td><kbd>G</kbd></td><td>Start today's workout</td></tr>" +
      "<tr><td><kbd>Space</kbd> / <kbd>Enter</kbd></td><td>Done (rep moves) · skip rest</td></tr><tr><td><kbd>P</kbd></td><td>Pause / resume</td></tr>" +
      "<tr><td><kbd>S</kbd></td><td>Skip move or rest</td></tr><tr><td><kbd>+</kbd></td><td>+15 s rest</td></tr><tr><td><kbd>M</kbd></td><td>Mute</td></tr>" +
      "<tr><td><kbd>V</kbd></td><td>Voice commands on / off</td></tr><tr><td><kbd>F</kbd></td><td>Full screen</td></tr><tr><td><kbd>Esc</kbd></td><td>End workout early</td></tr></tbody></table></section>" +
      '<section class="card"><h2>Reset</h2><p class="muted">Export first — this deletes everything on this device.</p><button class="btn danger" id="sReset">Delete all data on this device</button></section></div>');

    $("#sMute").onchange = function () { st.muted = this.checked; Store.save(); };
    $("#sVoice").onchange = function () { st.voice = this.checked; Store.save(); };
    if ($("#sListen")) $("#sListen").onchange = function () { st.listen = this.checked; Store.save(); };
    if ($("#sListenTest")) $("#sListenTest").onclick = function () {
      var out = $("#sListenOut"), btn = this;
      if (Listen.on) { Listen.stop(); return; }
      var labels = { pause: "Pause", resume: "Resume / start", next: "Next / done", skip: "Skip", more: "+15 s rest", guide: "How-to guide",
        close: "Close guide", repeat: "Repeat", mute: "Mute", unmute: "Unmute", end: "End workout", yes: "Yes (confirm)", no: "No (cancel)" };
      Listen.handler = function (action) { out.innerHTML = "✓ Understood: <b>" + esc(labels[action] || action) + "</b>"; return labels[action] || action; };
      Listen.onHeard = function (text) { if (!/Understood/.test(out.innerHTML) || Date.now() - Listen.lastAt > 2500) out.textContent = "Heard: “" + text + "”"; };
      Listen.onState = function (s) {
        btn.textContent = Listen.on ? "Stop test" : "Test voice commands";
        if (s === "listening" && /^Tap|Starting/.test(out.textContent)) out.textContent = "Listening… say “pause”, “next”, “skip”…";
        if (s === "blocked") out.textContent = "Microphone access was blocked. Allow the mic for this site (address bar on PC; Settings › Safari › Microphone on iPad) and try again.";
        if (s === "error") out.textContent = "Couldn't listen: " + (Listen.lastError || "unknown error") + ".";
      };
      out.textContent = "Starting… allow the microphone if asked.";
      Sound.unlock();
      Listen.start(true);
      clearTimeout(Listen.testTimer);
      Listen.testTimer = setTimeout(function () { if (!Player.active) Listen.stop(); }, 30000);
    };
    $("#sTest").onclick = function () {
      var out = $("#sTestOut");
      Sound.unlock();
      Sound.voiceState = "unknown";
      if (st.muted) { out.textContent = "Sound is muted — untick “Mute all sound” first."; return; }
      Sound.tick(); setTimeout(function () { Sound.tick(); }, 500); setTimeout(function () { Sound.go(); }, 1000);
      out.textContent = "Beeps played. Checking voice…";
      if (!st.voice) { out.textContent = "Beeps played. Voice cues are switched off."; return; }
      setTimeout(function () { Sound.say("Next: wall crunch, 12 reps."); }, 1500);
      setTimeout(function () {
        out.textContent = Sound.voiceState === "ok" ? "✓ Beeps and voice both work here." :
          "Beeps played. Voice didn't start — the workout will use beeps and flashes only.";
      }, 5200);
    };
    $("#sExport").onclick = function () { exportData(false); };
    if ($("#sShare")) $("#sShare").onclick = function () { exportData(true); };
    $("#sImport").onchange = function () { if (this.files[0]) importFile(this.files[0]); this.value = ""; };
    $("#sReset").onclick = function () {
      confirmModal("Delete all data?", "Every workout log, checklist, football and body entry on <b>this device</b> will be removed. This can't be undone.", "Delete everything", function () {
        var settings = Store.data.settings;
        Store.data = Store.blank(); Store.data.settings = settings; Store.save(); toast("All data deleted"); render();
      }, true);
    };
    var swEl = $("#sSw");
    if (!("serviceWorker" in navigator)) swEl.textContent = "not available here";
    else if (location.protocol === "file:") swEl.textContent = "off (opened as a file — use start.bat or the website)";
    else navigator.serviceWorker.getRegistration().then(function (r) { swEl.textContent = r && r.active ? "ready ✓" : "installing…"; });
  };

  // =====================================================================
  // Export / import
  // =====================================================================
  function exportData(share) {
    var payload = JSON.stringify({ app: "wt45", exportedAt: new Date().toISOString(), data: Object.assign({}, Store.data, { settings: undefined }) }, null, 2);
    var name = "workout-45-backup-" + today() + ".json";
    var done = function () { Store.data.lastExport = new Date().toISOString(); Store.save(); render(); };
    if (share) {
      var file = new File([payload], name, { type: "application/json" });
      navigator.share({ files: [file], title: name }).then(done).catch(function (e) { if (e && e.name !== "AbortError") toast("Sharing failed — try Export instead"); });
      return;
    }
    var url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    var a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast("Exported " + name); done();
  }

  function importFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var obj;
      try { obj = JSON.parse(r.result); } catch (e) { return toast("That file isn't valid JSON"); }
      var d = obj && obj.app === "wt45" ? obj.data : obj;
      if (!d || !Array.isArray(d.sessions) || typeof d.checklist !== "object") return toast("That doesn't look like a 45 Days backup");
      var res = mergeData(d);
      Store.save(); render();
      toast("Imported: " + res.sessions + " new workouts, " + res.days + " checklist days, " + res.body + " body entries, " + res.football + " football logs", 5000);
    };
    r.readAsText(file);
  }

  // Merge never deletes: union by id, OR the ticks, keep the larger water count.
  function mergeData(d) {
    var D = Store.data, res = { sessions: 0, days: 0, body: 0, football: 0 };
    var have = {};
    D.sessions.forEach(function (s) { have[s.id] = s; });
    (d.sessions || []).forEach(function (s) {
      if (!have[s.id]) { D.sessions.push(s); res.sessions++; }
      else if (!have[s.id].rating && s.rating) { have[s.id].rating = s.rating; have[s.id].note = s.note; }
    });
    Object.keys(d.checklist || {}).forEach(function (k) {
      var src = d.checklist[k], dst = D.checklist[k];
      if (!dst) { D.checklist[k] = src; res.days++; return; }
      Object.keys(src.items || {}).forEach(function (i) { dst.items[i] = dst.items[i] || src.items[i]; });
      dst.waterMl = Math.max(dst.waterMl || 0, src.waterMl || 0);
      res.days++;
    });
    var bodyIds = {};
    D.body.forEach(function (b) { bodyIds[b.id] = 1; });
    (d.body || []).forEach(function (b) { if (!bodyIds[b.id]) { D.body.push(b); res.body++; } });
    Object.keys(d.football || {}).forEach(function (k) { if (!D.football[k]) { D.football[k] = d.football[k]; res.football++; } });
    Object.keys(d.checkpoints || {}).forEach(function (k) {
      D.checkpoints[k] = { photo: !!((D.checkpoints[k] || {}).photo || d.checkpoints[k].photo) };
    });
    Object.keys(d.videos || {}).forEach(function (k) { if (!D.videos[k]) D.videos[k] = d.videos[k]; });
    D.sessions.sort(function (a, b) { return a.startedAt < b.startedAt ? -1 : 1; });
    return res;
  }

  // =====================================================================
  // Guided workout player
  // =====================================================================
  var Player = {
    active: false,
    renderStatus: function () {},
  };

  function startWorkout(key) {
    // Everything here runs inside the click/keypress, which is what unlocks audio on Safari.
    Sound.unlock();
    Sound.voiceState = Sound.voiceState === "ok" ? "ok" : "unknown";
    var sess = Session.buildSession(key);
    Player.session = sess;
    Player.steps = sess.steps;
    Player.i = -1;
    Player.active = true;
    Player.paused = false;
    Player.startMs = Date.now();
    Player.pausedMs = 0;
    Player.outcomes = [];  // per step: "done" | "skipped"
    Player.water = 0;
    Player.lastAdvance = 0;
    buildPlayerDom();
    $("#player").hidden = false;
    document.body.classList.add("in-workout");
    Wake.on().then(function (ok) {
      if (!ok) toast("Couldn't lock the screen awake — set Auto-Lock to Never while you train", 6000);
    });
    // Mic starts inside this tap too (Safari wants a gesture for the first start).
    Listen.handler = voiceAction;
    Listen.onHeard = null;
    Listen.onState = null;
    Listen.start();
    Player.timer = setInterval(tick, 100);
    next();
  }

  function buildPlayerDom() {
    var p = $("#player");
    p.innerHTML =
      '<div class="pl-top">' +
        '<div class="pl-where"><span id="plSection"></span><span id="plRound"></span></div>' +
        '<div class="pl-ctrl">' +
          '<span class="pl-elapsed" id="plElapsed">0:00</span>' +
          '<span class="pl-status" id="plStatus"></span>' +
          '<button class="pl-btn" id="plMic" title="Voice commands on/off (V)">🎙</button>' +
          '<button class="pl-btn" id="plMute" title="Mute (M)"></button>' +
          (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen ? '<button class="pl-btn" id="plFull" title="Full screen (F)">⛶</button>' : "") +
          '<button class="pl-btn" id="plPause" title="Pause (P)">❚❚</button>' +
          '<button class="pl-btn danger" id="plEnd" title="End early (Esc)">End</button>' +
        "</div>" +
        '<div class="pl-bar"><i id="plBar"></i></div>' +
      "</div>" +
      '<div class="pl-main">' +
        '<div class="pl-info">' +
          '<div class="pl-kind" id="plKind"></div>' +
          '<h1 class="pl-name" id="plName"></h1>' +
          '<p class="pl-side" id="plSide"></p>' +
          '<p class="pl-tip" id="plTip"></p>' +
        "</div>" +
        '<div class="pl-count">' +
          '<div class="pl-big" id="plBig"></div>' +
          '<div class="pl-unit" id="plUnit"></div>' +
          '<div class="pl-actions" id="plActions"></div>' +
        "</div>" +
      "</div>" +
      '<div class="pl-next"><span>Next up</span><b id="plNext"></b></div>' +
      '<div class="pl-flash" id="plFlash"></div>' +
      '<button class="pl-paused" id="plPaused" hidden><span>Paused</span><small>Tap anywhere or press P to resume</small></button>';
    $("#plMute").onclick = toggleMute;
    $("#plMic").onclick = toggleListen;
    if ($("#plFull")) $("#plFull").onclick = toggleFullscreen;
    $("#plPause").onclick = togglePause;
    $("#plPaused").onclick = togglePause;
    $("#plEnd").onclick = askEnd;
    Player.renderStatus = renderStatus;
    renderStatus();
  }

  function renderStatus() {
    if (!Player.active || !$("#plMute")) return;
    $("#plMute").textContent = Store.data.settings.muted ? "🔇" : "🔊";
    var bits = [];
    if (Wake.state === "unsupported" || Wake.state === "failed") bits.push('<span class="chip warn" title="Set Auto-Lock to Never">screen may sleep</span>');
    if (Sound.voiceState === "unavailable" && Store.data.settings.voice && !Store.data.settings.muted) bits.push('<span class="chip">beeps only</span>');
    var L = Listen.state, recent = Listen.heard && Date.now() - Listen.heardAt < 3000;
    if (L === "listening") bits.push('<span class="chip ok mic-chip" title="Say pause, resume, next, skip, more time, how to, repeat, end workout">🎙 ' + (recent ? "“" + esc(Listen.heard.slice(-28)) + "”" : "listening") + "</span>");
    else if (L === "starting") bits.push('<span class="chip">🎙 starting…</span>');
    else if (L === "blocked") bits.push('<span class="chip warn">🎙 mic blocked</span>');
    else if (L === "unsupported") bits.push('<span class="chip">🎙 not supported here</span>');
    else if (L === "error") bits.push('<span class="chip warn">🎙 ' + esc(Listen.lastError || "off") + "</span>");
    $("#plStatus").innerHTML = bits.join(" ");
    $("#plMic").classList.toggle("off", !Listen.on);
    $("#plMic").hidden = !Listen.supported();
    var hint = $("#plPaused small");
    if (hint) hint.textContent = "Tap anywhere, press P" + (Listen.on ? " or say “resume”" : "") + " to carry on";
    clearTimeout(Player.heardTimer);
    if (recent) Player.heardTimer = setTimeout(renderStatus, 3100);
  }

  function toggleListen() {
    if (!Listen.supported()) return toast("Voice commands aren't supported in this browser");
    var on = !Listen.on;
    Store.data.settings.listen = on; Store.save();
    if (on) Listen.start(); else Listen.stop();
    toast(on ? "🎙 Voice commands on" : "Voice commands off");
  }

  // What the current step is, spoken on "repeat".
  function describeStep() {
    var st = cur(), nm = Session.nextMove(Player.steps, Player.i);
    if (st.kind === "move") return (st.round ? st.roundLabel + " " + st.round + " of " + st.rounds + ". " : "") + Session.speechTarget(st) + ".";
    var left = Math.max(0, Math.ceil((Player.paused ? Player.remainingMs : Player.endsAt - Date.now()) / 1000));
    return (st.kind === "water" ? "Water break" : st.kind === "ready" ? "Get ready" : "Rest") + ", " + left + " seconds left." + (nm ? " Next: " + Session.speechTarget(nm) + "." : "");
  }

  // Voice command → player action. Returns the label to show, or null if it didn't apply.
  function voiceAction(action) {
    if (!Player.active || Player.done) return null;
    var st = cur();
    if (!$("#modal").hidden) {
      var ok = $("#cmOk");
      if (action === "yes" && ok) { ok.click(); return "Ending workout"; }
      if (action === "no" || action === "close" || action === "resume" || (action === "next" && !ok)) {
        closeModal();
        return ok ? "Carrying on" : "Guide closed";
      }
      return null;
    }
    switch (action) {
      case "pause":
        if (Player.paused) return null;
        togglePause();
        return "Paused — say “resume”";
      case "resume":
        if (Player.paused) { togglePause(); return "Resumed"; }
        if (st.kind === "ready") { skipStep(); return "Starting"; }
        return null;
      case "next":
      case "skip":
        if (Player.paused) return "Paused — say “resume” first";
        if (Date.now() - Player.lastAdvance < 1200) return null;
        if (action === "next" && st.kind === "move" && st.mode === "reps") { doneRep(); return "Done ✓"; }
        skipStep();
        return st.kind === "move" ? "Skipped " + st.name : st.kind === "ready" ? "Starting" : st.kind === "water" ? "Skipped water break" : "Skipped rest";
      case "more":
        if (Player.paused || st.kind === "move") return null;
        addRest();
        return "+" + PLAN.restAddSeconds + " s rest";
      case "mute":
        if (Store.data.settings.muted) return null;
        toggleMute(); return "Muted";
      case "unmute":
        if (!Store.data.settings.muted) return null;
        toggleMute(); return "Sound on";
      case "guide":
        if (!guideTarget()) return null;
        playerGuide(); return "How-to guide — say “close” to carry on";
      case "repeat":
        Sound.say(describeStep()); return "Repeating";
      case "end":
        askEnd();
        Sound.say("End the workout?"); // don't say "yes"/"no" aloud: the echo guard would then ignore the answer
        return "End workout? Say “yes” or “no”";
    }
    return null;
  }

  function cur() { return Player.steps[Player.i]; }

  function next(outcome) {
    var now = Date.now();
    if (Player.i >= 0) {
      var s = cur();
      Player.outcomes[Player.i] = outcome || "done";
      var ranFor = (now - Player.stepStart) / 1000;
      if ((s.kind === "water" || s.water) && (outcome !== "skipped" || ranFor >= 10)) Player.water++;
    }
    Player.lastAdvance = now;
    Player.i++;
    if (Player.i >= Player.steps.length) return finish("complete");
    var st = cur();
    Player.stepStart = now;
    Player.endsAt = st.mode === "timed" ? now + st.seconds * 1000 : null;
    Player.beeped = {};
    Player.cuesFired = {};
    Player.lastShown = null;
    announce(st, Player.steps[Player.i - 1]);
    renderStep();
  }

  function announce(st, prev) {
    var nm = Session.nextMove(Player.steps, st.n);
    var prevAnnounced = prev && (prev.kind === "rest" || prev.kind === "water" || prev.kind === "ready");
    var text = "";
    if (st.kind === "ready") {
      Sound.rest();
      text = "Let's go. First up: " + Session.speechTarget(nm) + ".";
      flash("ready");
    } else if (st.kind === "rest") {
      Sound.rest();
      var prevMove = prev && prev.kind === "move" ? prev : null;
      if (st.restType === "round" && prevMove) text = prevMove.roundLabel + " " + st.afterRound + " done. ";
      if (st.water) text += "Rest and take some water. ";
      text += "Rest " + Session.saySeconds(st.seconds) + ". " + (nm ? "Next: " + Session.speechTarget(nm) + "." : "");
      if (st.water) Sound.water();
      flash(st.water ? "water" : "rest");
    } else if (st.kind === "water") {
      Sound.water();
      var newRoutine = nm && prev && nm.routineId !== prev.routineId;
      text = "Water break. Take a few sips." + (nm ? " Next: " + (newRoutine ? nm.routineName + ". " : "") + Session.speechTarget(nm) + "." : "");
      flash("water");
    } else {
      Sound.go();
      flash("move");
      if (st.segKind) {
        var after = prev && prev.segKind;
        if (st.segKind === "jog") text = "Jog now. " + Session.saySeconds(st.seconds) + ".";
        else if (after === "jog") text = "Back to walking. " + Session.saySeconds(st.seconds) + ".";
        else text = st.name + ". " + Session.saySeconds(st.seconds) + ".";
      } else if (prevAnnounced) {
        text = (st.round > 1 && st.index === 1 ? st.roundLabel + " " + st.round + ". " : "") + (st.speakName || st.name) + ". Go!";
      } else {
        text = Session.speechTarget(st) + (st.sides ? ". " + st.sides.first + " first." : ".");
      }
    }
    Sound.say(text);
  }

  function renderStep() {
    var st = cur(), p = $("#player");
    p.dataset.kind = st.kind === "move" ? (st.segKind === "jog" ? "jog" : "move") : st.water ? "water" : st.kind;
    p.dataset.mode = st.mode;
    var routine = st.routineName;
    $("#plSection").textContent = st.kind === "water" ? "Hydration" : st.kind === "ready" ? "Starting" : routine;
    var round = "";
    if (st.round) round = st.roundLabel + " " + st.round + " of " + st.rounds;
    else if (st.kind === "rest" && st.restType === "round") round = "Between rounds";
    else if (st.index && st.count && !st.segKind) round = "Move " + st.index + " of " + st.count;
    else if (st.segKind && st.count > 1) round = "Part " + st.index + " of " + st.count;
    $("#plRound").textContent = round;

    var kindLabel = { ready: "Get ready", rest: st.water ? "Rest + water" : "Rest", water: "Water break", move: st.mode === "timed" ? "Hold / timed" : "Reps" }[st.kind];
    if (st.segKind) kindLabel = st.segKind === "jog" ? "Jog" : "Walk";
    $("#plKind").textContent = kindLabel;

    var name = st.kind === "rest" ? (st.restType === "round" ? "Rest between " + (Player.steps[st.n - 1] && Player.steps[st.n - 1].roundLabel || "round").toLowerCase() + "s" : "Rest") : st.name;
    if (st.kind === "water") name = "💧 " + st.name;
    $("#plName").textContent = name;
    $("#plTip").textContent = st.kind === "move" ? [st.note, st.tip].filter(Boolean).join(" · ") : st.kind === "water" ? "Take a few sips. " + (st.reason || "") : "";
    $("#plSide").textContent = "";

    var actions = $("#plActions");
    if (st.kind === "move" && st.mode === "reps") {
      $("#plBig").textContent = st.repsShow;
      $("#plUnit").textContent = "reps" + (st.eachSide ? " " + (st.sideWord || "each side") : "");
      actions.innerHTML = '<button class="pl-done" id="plDone">Done <kbd>Space</kbd></button><button class="pl-skip" id="plSkip">Skip</button>';
      $("#plDone").onclick = doneRep;
    } else if (st.kind === "move") {
      $("#plUnit").textContent = "";
      actions.innerHTML = '<button class="pl-skip" id="plSkip">Skip <kbd>S</kbd></button>';
    } else {
      $("#plUnit").textContent = "";
      actions.innerHTML = '<button class="pl-add" id="plAdd">+' + PLAN.restAddSeconds + ' s</button><button class="pl-skip big" id="plSkip">Skip <kbd>Space</kbd></button>';
      $("#plAdd").onclick = addRest;
    }
    $("#plSkip").onclick = skipStep;
    var gm = guideTarget();
    if (gm) {
      actions.insertAdjacentHTML("beforeend", '<button class="pl-how" id="plHow">▶ How to' + (st.kind === "move" ? "" : ": " + esc(gm.name)) + " <kbd>H</kbd></button>");
      $("#plHow").onclick = playerGuide;
    }

    var nm = Session.nextMove(Player.steps, Player.i);
    var nextText = "";
    if (st.kind === "move" || st.kind === "ready") {
      var after = Player.steps[Player.i + 1];
      if (after && after.kind !== "move") nextText = (after.kind === "water" ? "💧 Water break · " : after.water ? "Rest + water · " : "Rest " + Session.fmtSeconds(after.seconds) + " · ") + (nm ? "then " + nm.name : "");
      else nextText = nm ? nm.name + " — " + Session.targetText(nm) : "";
      if (st.kind === "ready" && nm) nextText = nm.name + " — " + Session.targetText(nm);
    } else nextText = nm ? nm.name + " — " + Session.targetText(nm) + (nm.round ? " · " + nm.roundLabel + " " + nm.round + "/" + nm.rounds : "") : "";
    $("#plNext").textContent = nextText || "Finish 🎉";
    $("#plBar").style.width = Math.round((Player.i / Player.steps.length) * 100) + "%";
    tick();
  }

  function tick() {
    if (!Player.active) return;
    var now = Date.now();
    var el = $("#plElapsed");
    if (el && !Player.paused) el.textContent = clock((now - Player.startMs - Player.pausedMs) / 1000);
    if (Player.paused || Player.i < 0) return;
    var st = cur();
    if (st.mode !== "timed") {
      // Rep move: show how long this set has taken, no auto-advance.
      $("#plSide").textContent = clock((now - Player.stepStart) / 1000) + " on this set";
      return;
    }
    var remMs = Player.endsAt - now;
    var rem = Math.ceil(remMs / 1000);
    var elapsed = st.seconds - remMs / 1000;
    if (rem !== Player.lastShown) {
      Player.lastShown = rem;
      $("#plBig").textContent = rem >= 60 ? clock(rem) : String(Math.max(rem, 0));
      if (st.kind === "move" && !st.segKind) $("#plUnit").textContent = rem >= 60 ? "" : "seconds";
      $("#plBig").classList.toggle("final", rem <= 3 && rem > 0);
      if (st.sides) $("#plSide").textContent = elapsed < st.sides.switchAt ? st.sides.first : st.sides.second;
      else if (st.segKind) $("#plSide").textContent = "Walk total left " + clock(st.walkTotal - st.walkOffset - elapsed);
      if (rem <= 3 && rem >= 1 && !Player.beeped[rem] && st.seconds > 3) { Player.beeped[rem] = 1; Sound.tick(); flash("tick"); }
    }
    st.cues.forEach(function (c, ci) {
      if (!Player.cuesFired[ci] && elapsed >= c.at) {
        Player.cuesFired[ci] = 1;
        if (c.water) { Player.water++; Sound.water(); flash("water"); toast("💧 " + c.text, 6000); }
        else { Sound.done(); flash("cue"); }
        if (c.say) Sound.say(c.say);
        $("#plSide").textContent = c.text;
        if (st.sides) setTimeout(function () { if (cur() === st) $("#plSide").textContent = st.sides.second; }, 2500);
      }
    });
    if (remMs <= 0) next("done");
  }

  function flash(kind) {
    var f = $("#plFlash");
    if (!f) return;
    f.className = "pl-flash";
    void f.offsetWidth; // restart the animation
    f.className = "pl-flash on f-" + kind;
  }

  function doneRep() {
    var st = cur();
    if (!st || st.mode !== "reps" || Player.paused) return;
    Sound.done();
    next("done");
  }
  function skipStep() { if (Player.paused) return; next("skipped"); }
  function addRest() {
    var st = cur();
    if (!st || st.kind === "move" || Player.paused) return;
    Player.endsAt += PLAN.restAddSeconds * 1000;
    Player.lastShown = null; Player.beeped = {};
    tick();
  }
  function togglePause() {
    if (!Player.active || Player.done) return;
    var now = Date.now();
    if (!Player.paused) {
      Player.paused = true;
      Player.pausedAt = now;
      if (Player.endsAt) Player.remainingMs = Player.endsAt - now;
      Sound.stopVoice();
      $("#plPaused").hidden = false;
      $("#plPause").textContent = "▶";
    } else {
      Player.paused = false;
      Player.pausedMs += now - Player.pausedAt;
      Player.stepStart += now - Player.pausedAt;
      if (Player.endsAt) Player.endsAt = now + Player.remainingMs;
      $("#plPaused").hidden = true;
      $("#plPause").textContent = "❚❚";
      Sound.unlock();
    }
  }
  function toggleMute() {
    Store.data.settings.muted = !Store.data.settings.muted;
    if (Store.data.settings.muted) Sound.stopVoice();
    Store.save(); renderStatus();
    toast(Store.data.settings.muted ? "Sound muted" : "Sound on");
  }
  function toggleFullscreen() {
    var d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
  function askEnd() {
    if (!Player.active) return;
    if (Player.done) return closePlayer();
    var wasPaused = Player.paused;
    if (!wasPaused) togglePause();
    confirmModal("End workout early?", "What you've done so far is logged as a <b>partial</b> session." +
      (Listen.on ? "<br>Say <b>“yes”</b> to end or <b>“no”</b> to keep going." : ""), "End & log partial", function () { finish("partial"); }, true);
    modalOnClose = function () { if (Player.active && !Player.done && Player.paused && !wasPaused) togglePause(); };
  }

  // The move the How-to button explains: the current move, or the next one during rests.
  function guideTarget() {
    var st = cur();
    if (!st) return null;
    var m = st.kind === "move" ? st : Session.nextMove(Player.steps, Player.i);
    return m && moveDef(m.routineId, m.id) ? m : null;
  }
  function playerGuide() {
    var m = guideTarget();
    if (!m || !Player.active || Player.done) return;
    var wasPaused = Player.paused;
    if (!wasPaused) togglePause();
    $("#plPaused").hidden = true; // the guide covers the screen instead
    openGuide(m.routineId, m.id, function () {
      if (!Player.active || Player.done) return;
      if (Player.paused && !wasPaused) togglePause();
      else if (Player.paused) $("#plPaused").hidden = false;
    });
  }

  function finish(status) {
    if (Player.done) return;
    var now = Date.now();
    if (Player.paused) { Player.pausedMs += now - Player.pausedAt; Player.paused = false; }
    Player.done = true;
    clearInterval(Player.timer);
    Listen.stop();
    Wake.off();
    Sound.stopVoice();
    var sess = Player.session, steps = Player.steps;
    var routines = sess.routines.map(function (r) {
      var moves = steps.filter(function (s) { return s.kind === "move" && s.routineId === r.id; });
      var reached = moves.filter(function (s) { return Player.outcomes[s.n]; });
      return {
        id: r.id, name: r.name,
        done: moves.length > 0 && reached.length === moves.length,
        movesDone: moves.filter(function (s) { return Player.outcomes[s.n] === "done"; }).length,
        movesTotal: moves.length,
      };
    });
    var moveSteps = steps.filter(function (s) { return s.kind === "move"; });
    var rec = {
      id: uid(),
      date: sess.date,
      dayNumber: sess.dayNumber,
      blockId: sess.blockId,
      dayLabel: sess.dayLabel,
      startedAt: new Date(Player.startMs).toISOString(),
      endedAt: new Date(now).toISOString(),
      durationSec: Math.round((now - Player.startMs - Player.pausedMs) / 1000),
      status: status,
      routines: routines,
      movesDone: moveSteps.filter(function (s) { return Player.outcomes[s.n] === "done"; }).length,
      movesSkipped: moveSteps.filter(function (s) { return Player.outcomes[s.n] === "skipped"; }).length,
      movesTotal: moveSteps.length,
      waterBreaks: Player.water,
      rating: null,
      note: "",
    };
    Store.data.sessions.push(rec);
    if (status === "complete") {
      var c = Store.data.checklist[sess.date] || (Store.data.checklist[sess.date] = { items: {}, waterMl: 0 });
      c.items.workout = true;
      Sound.finish();
      Sound.say("Workout complete. Great job!");
    }
    Store.save();
    Player.record = rec;
    renderSummary(rec);
  }

  function renderSummary(rec) {
    var p = $("#player");
    p.dataset.kind = "summary";
    p.innerHTML = '<div class="pl-summary">' +
      '<p class="eyebrow">' + esc(longDate(rec.date)) + " · Day " + rec.dayNumber + "</p>" +
      "<h1>" + (rec.status === "complete" ? "Workout complete 🎉" : "Logged as partial") + "</h1>" +
      '<div class="stats4"><div class="stat"><b>' + clock(rec.durationSec) + '</b><span>duration</span></div>' +
      '<div class="stat"><b>' + rec.movesDone + "<small>/" + rec.movesTotal + '</small></b><span>moves done</span></div>' +
      '<div class="stat"><b>' + rec.waterBreaks + '</b><span>water breaks</span></div>' +
      '<div class="stat"><b>' + rec.routines.filter(function (r) { return r.done; }).length + "<small>/" + rec.routines.length + '</small></b><span>routines</span></div></div>' +
      '<p class="muted">' + rec.routines.map(function (r) { return (r.done ? "✓ " : "✗ ") + esc(r.name); }).join(" · ") + "</p>" +
      "<h2>How did it feel?</h2>" +
      '<div class="rating" id="rating">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<button data-r="' + n + '"><b>' + n + "</b><small>" + ["Awful", "Hard", "OK", "Good", "Great"][n - 1] + "</small></button>";
      }).join("") + "</div>" +
      '<label class="field"><span>Note (optional) — e.g. knee or elbow pain</span><textarea id="rNote" rows="3" placeholder="Left knee fine today, elbow a bit sore on push-ups…"></textarea></label>' +
      '<div class="row gap end"><button class="btn ghost" id="rSkip">Skip</button><button class="btn primary huge" id="rSave">Save &amp; close</button></div></div>';
    var rating = null;
    $$("#rating button").forEach(function (b) {
      b.onclick = function () {
        rating = Number(b.dataset.r);
        $$("#rating button").forEach(function (x) { x.classList.toggle("on", Number(x.dataset.r) <= rating); });
      };
    });
    $("#rSave").onclick = function () {
      Player.record.rating = rating;
      Player.record.note = $("#rNote").value.trim();
      Store.save(); toast("Saved ✓"); closePlayer();
    };
    $("#rSkip").onclick = closePlayer;
  }

  function closePlayer() {
    clearInterval(Player.timer);
    Listen.stop();
    Listen.handler = null;
    Wake.off();
    Sound.stopVoice();
    Player.active = false;
    Player.done = false;
    $("#player").hidden = true;
    $("#player").innerHTML = "";
    document.body.classList.remove("in-workout");
    var d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    render();
  }

  // Leaving mid-workout: keep it from being lost silently.
  window.addEventListener("beforeunload", function (e) {
    if (Player.active && !Player.done) { e.preventDefault(); e.returnValue = ""; }
  });

  // =====================================================================
  // Keyboard
  // =====================================================================
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (!$("#modal").hidden) { if (k === "Escape") closeModal(); return; }
    if (isTyping()) return;
    if (Player.active && !Player.done) {
      var st = cur();
      if (k === " " || k === "Enter") {
        e.preventDefault();
        if (Player.paused) return togglePause();
        if (Date.now() - Player.lastAdvance < 700) return; // guard against double presses
        if (st.kind === "move" && st.mode === "reps") doneRep();
        else if (st.kind !== "move") skipStep();
      } else if (k === "p" || k === "P") togglePause();
      else if (k === "s" || k === "S") skipStep();
      else if (k === "+" || k === "=") addRest();
      else if (k === "m" || k === "M") toggleMute();
      else if (k === "h" || k === "H") playerGuide();
      else if (k === "v" || k === "V") toggleListen();
      else if ((k === "f" || k === "F") && $("#plFull")) toggleFullscreen();
      else if (k === "Escape") askEnd();
      return;
    }
    if (Player.active) return;
    var views = ["today", "calendar", "checklist", "body", "guide", "weekly", "settings"];
    if (/^[1-7]$/.test(k)) location.hash = "#" + views[Number(k) - 1];
    else if (k === "g" || k === "G") { e.preventDefault(); startWorkout(today()); }
  });

  // =====================================================================
  // Router
  // =====================================================================
  function view(html) { $("#view").innerHTML = html; }
  function currentView() {
    var v = (location.hash || "#today").slice(1);
    return Views[v] ? v : "today";
  }
  function render() {
    var v = currentView();
    $$("#nav a").forEach(function (a) { a.classList.toggle("active", a.dataset.view === v); });
    Views[v]();
  }
  window.addEventListener("hashchange", function () {
    if (!Player.active && Listen.on) { Listen.stop(); Listen.onState = null; Listen.onHeard = null; } // end a Settings mic test
    render();
    $("#view").scrollTop = 0; window.scrollTo(0, 0);
  });

  // =====================================================================
  // Boot
  // =====================================================================
  Store.load();
  render();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* offline mode unavailable */ });
    });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  // Exposed for debugging in the console only.
  window.WT45 = { Store: Store, Session: Session, dayStatus: dayStatus, Player: Player, Listen: Listen, Sound: Sound, matchCommand: matchCommand };
})();
