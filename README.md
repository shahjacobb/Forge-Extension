<p align="center">
  <img src="docs/shots/banner.png" alt="Forge — a Chrome focus timer" width="100%" />
</p>

# Forge

A Chrome focus timer. Warm stone grays. Focus, short break, long break. Sessions and settings follow you across Chrome profiles when you sign in.

This is a **Chrome extension**, not an iPhone or Mac App Store app. Publishing goes through the [Chrome Web Store](https://chrome.google.com/webstore). There is no App Store deploy pipeline in this repo.

---

## Demo

<video src="docs/demo.mp4" controls width="380"></video>

If the embed does not play, open [`docs/demo.mp4`](docs/demo.mp4).

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

1. Open Forge from the toolbar.
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

## Install locally

```bash
npm install
npm run build
```

1. `chrome://extensions`
2. Developer mode on
3. **Load unpacked** → `dist/`
4. Pin Forge on the toolbar

After a code change: `npm run build`, then **Reload** the extension card.

---

## Publish to the Chrome Web Store

No store deploy scripts live in this repo. You upload a zip by hand.

### One-time

1. Register as a [Chrome Web Store developer](https://chrome.google.com/webstore/devconsole). Google charges a one-time registration fee.
2. If you use account sync, host a short privacy policy (email + session data via Supabase) and keep the URL. The store listing will ask for it.

### Each release

1. Confirm `public/manifest.json` `version` is newer than the last upload (`0.2.0` now).
2. Build a clean package:

```bash
npm run build
cd dist && zip -r ../forge.zip .
```

3. Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **New item** (or the existing item → **Package**).
4. Upload `forge.zip`.
5. Fill the store listing:
   - Name: Forge
   - Summary and description
   - Category (Productivity)
   - Screenshots: use `docs/shots/timer.png`, `running.png`, `activity.png`, `month.png`, `settings.png`, `complete.png` (store wants 1280×800 or 640×400 — scale these if the review form rejects the raw popup size)
   - Small tile: `public/icon-128.png`
   - Banner / marquee: `docs/shots/banner.png`
6. Privacy: single purpose, remote host (`your-project.supabase.co` if sync is on), permission justifications for `storage`, `alarms`, `notifications`, `offscreen`.
7. **Submit for review**. Review is usually a few days. You will get email when it is live or if they bounce it.

Updates: bump `version`, rebuild the zip, upload a new package, submit again.

This does **not** publish to the Apple App Store or Google Play. Those are different products. Forge is Chrome-only.

---

## Development

```bash
npm install
npm run build          # typecheck + dist/
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

To regenerate README images (optional, not a store deploy):

```bash
npm run preview
python3 -m http.server 5174
./scripts/capture-docs.sh
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
docs/shots        README screenshots and cover banner
public/           manifest + icons
```
