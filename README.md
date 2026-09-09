<p align="center">
  <img src="docs/shots/banner.png" alt="Lahza — a Pomodoro timer for Chrome" width="100%" />
</p>

# Lahza

**A Pomodoro timer for Chrome.** You work for 25 minutes, rest for 5, and after four sessions you take a longer break. Pin it on the toolbar. While it runs, the icon shows how much time you have left.

*Lahza* (لحظة) is said **LAH-zah**.

![Using Lahza](docs/demo.gif)

---

## Setup

You need [Node.js](https://nodejs.org/) 18+ and Chrome.

```bash
git clone https://github.com/shahjacobb/Forge-Extension.git
cd Forge-Extension
npm install
npm run build
```

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the **`dist`** folder next to `package.json`
5. Pin **Lahza**

After you change the code, run `npm run build` and click **Reload** on the extension card.

---

## How to navigate

The popup has three tabs at the bottom.

| Tab | What it is |
| --- | --- |
| **Timer** | The clock. Start, pause, skip, restart, reset. |
| **Activity** | Today / week / streak, a 7-day chart, and a month heat map. |
| **Settings** | Durations, presets, sound, and the account that syncs profiles. |

**Sign in** in the header jumps to Settings → Account.

---

## How to use it

### 1. Run a focus block

<img src="docs/shots/timer.png" alt="Idle focus timer" width="280" />
<img src="docs/shots/running.png" alt="Focus in progress" width="280" />

1. Open Lahza from the Chrome toolbar.
2. Leave **Focus** selected (or switch to **Break** / **Long**).
3. Press **Start focus**, or press **Space**.
4. **Pause** holds the remaining time. **Resume** continues it.
5. **Skip** ends the block and records it. After four focuses, the next skip is a long break.
6. **Restart** starts the current block over. **Reset** returns to an idle focus.

While it runs, the toolbar badge shows time left. `Alt+Shift+P` starts or pauses from any Chrome tab.

### 2. When a session ends

<img src="docs/shots/complete.png" alt="Focus complete modal" width="280" />

Chrome notifies you. If the popup is open, a completion card appears. Start the next block or dismiss it. Every fourth focus is a milestone and suggests a longer break.

### 3. Check the week and month

<img src="docs/shots/activity.png" alt="Weekly activity" width="280" />
<img src="docs/shots/month.png" alt="Monthly heat map" width="280" />

Open **Activity**. **Week** is the last seven days plus a daily list. **Month** is a heat map of focus minutes. Arrow keys on the header move to earlier weeks or months.

### 4. Set lengths and sound

<img src="docs/shots/settings.png" alt="Settings presets and durations" width="280" />

Open **Settings**.

- **Classic 25/5**, **Deep 50/10**, **Sprint 15/3** apply immediately.
- Focus, break, long break, rounds, and daily goal are minutes.
- Auto-start break / auto-start focus if you want the next block to begin on its own.
- Sound on/off, volume, and **Play** to preview the chime.
- **Save changes** writes the rest of the form.

### 5. Use it on another Chrome profile

Chrome profiles do not share extension storage. Sign in once per profile with the same email.

1. Settings → **Create account**
2. On the other profile, Settings → **Sign in**
3. Sessions, streak, and settings merge

Needs a `.env.local` with Supabase keys (see Development). Without keys, the timer still works on that profile only.

---

## Chrome Web Store

```bash
npm install
npm run package
```

That writes **`lahza.zip`** next to `package.json`. Upload it in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).

1. Sign in with the Google account that should own the listing
2. Pay the one-time registration fee if the dashboard asks
3. **New item** (first time) or your item → **Package** (updates)
4. Upload `lahza.zip`
5. Fill in:
   - Name: Lahza
   - Summary: Pomodoro timer for Chrome. 25 minutes of work, 5 minutes of rest, a longer break after four sessions.
   - Category: Productivity
   - Screenshots: `docs/shots/timer.png`, `running.png`, `activity.png`, `month.png`, `settings.png`, `complete.png` (the form wants 1280×800 or 640×400)
   - Small tile: `public/icon-128.png`
   - Marquee: `docs/shots/banner.png`
6. Privacy: single purpose; add `your-project.supabase.co` if sync is on; justify `storage`, `alarms`, `notifications`, `offscreen`
7. **Submit for review**

Later updates: bump `version` in `public/manifest.json`, run `npm run package`, upload the new zip.

If you want to zip by hand:

```bash
npm run build
cd dist
zip -r ../lahza.zip .
```

---

## Development

```bash
npm install
npm run build          # typecheck + dist/
npm run package        # build + lahza.zip
npm run preview        # Vite, open /popup.html
npm run icons          # rebuild toolbar icons
```

`.env.local`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

The UI loads without those keys. Account sync stays off until they are set.

Apply `supabase/migrations/` on the Supabase project if you want cloud sync.

To regenerate README images:

```bash
npm run preview
python3 -m http.server 5174
./scripts/capture-docs.sh
node scripts/make-demo.mjs
```

---

## Structure

```
src/background    timer, alarms, badge, notifications, sync
src/offscreen     Web Audio chimes
src/popup         timer, activity, settings, account
src/options       standalone settings page
src/activity      standalone weekly view
src/shared        types, storage, auth, analytics
docs/banners      HTML/CSS cover
docs/shots        README screenshots and banner
docs/demo.gif     usage demo (GitHub renders this)
public/           manifest + icons
```
