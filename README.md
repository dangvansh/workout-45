# 45 Days: workout tracker and guided timer

A static web app (HTML, CSS and JavaScript) that also works as an installable PWA. It has no backend and no login, and your data stays in each browser's localStorage.

| File | What it is |
|---|---|
| `config.js` | **The plan.** Dates, blocks, weekly schedule, moves, reps, rest, hydration and checklist. Edit this one to change the plan. |
| `session.js` | Works out the plan maths (day number and block) and builds each day's session queue. |
| `app.js`, `index.html`, `styles.css` | The app itself. |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install. |
| `start.bat`, `serve.py` | The PC launcher. |
| `tests/test_sessions.js` | Checks every day type in every block against the written plan. |
| `tools/make_icons.py` | Redraws the icons (Python standard library only). |

---

## 1. Use it on this PC

Double-click **`start.bat`**. A small window opens, and the app opens in your default browser at **http://localhost:8045**. Keep that window open while you use the app, and close it when you're done.

- Always use the same address (`http://localhost:8045`). The browser stores your data per address.
- You can install it as a desktop app if you like. In Edge or Chrome, use the install icon in the address bar.

## 2. Put it online for the iPad (GitHub Pages, free)

On the iPad, offline mode, the service worker and keeping the screen awake all need **HTTPS**, so the app has to be hosted. GitHub Pages is free.

### a) Create the repository (one time)
1. Go to https://github.com and sign in, or create a free account.
2. Click **+ → New repository**.
3. Name it, for example `workout-45`. Choose **Public** (Pages is free for public repositories). Don't add a README. Click **Create repository**.

### b) Upload the files. Pick ONE way.

**Option 1: Git (already installed on this PC).** Open a terminal in this folder and run the commands below, replacing `YOUR-USERNAME`:

```bash
git init -b main
```
```bash
git add .
```
```bash
git commit -m "45 Days workout app"
```
```bash
git remote add origin https://github.com/YOUR-USERNAME/workout-45.git
```
```bash
git push -u origin main
```

The first push opens a GitHub sign-in window. Later updates take three commands: `git add .`, then `git commit -m "update"`, then `git push`.

**Option 2: upload in the browser (no Git).**
1. On the new repository's page, click **uploading an existing file**.
2. Drag in **everything in this folder**: `index.html`, `styles.css`, `config.js`, `session.js`, `app.js`, `sw.js`, `manifest.webmanifest`, `.nojekyll`, and the `icons` folder. You can include `tests`, `tools`, `serve.py` and `start.bat` too. They're harmless.
3. Click **Commit changes**.
4. To update a file later, open it on GitHub, click the pencil to edit, or use **Add file → Upload files** again to replace it.

### c) Turn on Pages
1. In the repository, go to **Settings → Pages**.
2. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to **main**, and folder to **/ (root)**. Click **Save**.
3. After about a minute, the page shows your address: **https://YOUR-USERNAME.github.io/workout-45/**

## 3. Install it on the iPad

1. Open **Safari** (it must be Safari) and go to `https://YOUR-USERNAME.github.io/workout-45/`.
2. Tap **Share** (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. Open it from the new **45 Days** icon. It runs full-screen.
4. Open it once while online. After that it works offline.
5. Go to **Data & settings → Test beeps & voice**. This checks that sound and voice cues work. Make sure the volume is up. If voice doesn't start, the workout falls back to beeps and on-screen flashes.

Good to know on iPad:
- **Sound needs a tap.** Safari only plays audio after you touch the screen. That's why audio is unlocked when you press **Start today's workout**.
- **iPads can't vibrate.** Every cue also flashes the screen.
- **Screen awake.** The app uses the Screen Wake Lock API. On older iPadOS versions, or if the lock is refused, the player shows "screen may sleep". If that happens, set **Settings › Display & Brightness › Auto-Lock › Never** while you train.
- **The Home Screen app and a Safari tab keep separate data.** Always use the Home Screen icon.

## 4. Move data between the PC and the iPad

Each device keeps its own data. To combine them:
- On one device, go to **Data & settings → Export**. You get a `.json` file. On the iPad, **Share / Save to Files…** lets you save it to Files, iCloud Drive or email.
- Move the file to the other device (email, OneDrive, iCloud Drive or USB), then go to **Data & settings → Import JSON…** there.
- Import **merges**. It adds anything missing and never deletes. Exporting once a week is a good backup habit.

## 5. Change the plan

Open `config.js` in Notepad. Everything is commented. Examples:
- **Change reps:** in `routines.core.blocks.B.targets`, change `claps: 45` to `claps: 50`.
- **Swap a move:** change a move's `name` in the `moves` list. If you add or rename an `id`, update every block's `targets` to match.
- **Change rest or water timings:** edit `restBetweenMoves`, `restBetweenRounds` and the `hydration` section.

Save the file and reload the app. On the iPad, open the app while online so it picks up the new version. Then run `node tests/test_sessions.js`. It compares against the *original* plan, so deliberate changes show up as differences. That's expected.

## Exercise guide and form videos

The **Guide** page lists every move with step-by-step form cues and its safety tip. The cues work offline.

- **Videos:** tap a move, then **Find a form video on YouTube**. When you find a video you like, copy its link and paste it into **Pin a video**. From then on, it plays inside the app. Pinned videos are saved with your data, so they're included when you export and import.
- **During a workout:** press **▶ How to** (or `H`). It pauses the timer and opens the guide. On rest screens it shows the *next* move. Close the guide to resume.
- **Default videos for everyone:** add `video: "https://youtu.be/…"` to a move in `config.js`.
- Videos need an internet connection. The written steps don't.

## Voice commands (hands-free)

During a workout the app listens for spoken commands. The 🎙 chip at the top shows it's listening, along with the last thing it heard.

| Say | It does |
|---|---|
| "pause", "stop", "wait", "hold on" | Pause |
| "resume", "start", "go", "continue" | Resume (or skip the get-ready countdown) |
| "next", "done", "finished" | Mark a rep set done or skip the rest |
| "skip" | Skip the current move or rest |
| "more time", "add time", "plus 15" | Add 15 s of rest |
| "how to", "show me" / "close" | Open or close the form guide |
| "repeat", "what's next" | Say the current step again |
| "mute" / "unmute" | Turn sound off or on |
| "end workout", then "yes" or "no" | End early (logged as partial) |

- The microphone is only on during a workout. You can toggle it with the 🎙 button or `V`, or switch it off under **Data & settings**.
- **Data & settings → Test voice commands** shows exactly what the app hears. Use it once on each device.
- **On the PC:** use Chrome or Edge. Speech is converted to text by Google or Microsoft online, so it needs internet. Allow the microphone the first time you're asked.
- **On the iPad:** Safari uses Apple's dictation. Dictation must be on (**Settings › General › Keyboard › Enable Dictation**) and Safari needs microphone access.
- The app ignores its own voice for a moment after it speaks. If you answer straight away, use a different word from the one it just said, for example "skip" right after "Next: …".
- To change or add command words, edit `voiceCommands` in `config.js`.

## Keyboard shortcuts (PC)

`1` to `7` switch pages · `G` starts today's workout · during a workout: `Space` or `Enter` marks a set done or skips the rest, `H` opens the how-to guide, `P` pauses, `S` skips, `+` adds 15 s of rest, `M` mutes, `F` goes full screen, `Esc` ends early.

To preview another date, add `?date=2026-11-21` to the address.
