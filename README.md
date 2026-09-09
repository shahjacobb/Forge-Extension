<p align="center">
  <img src="docs/shots/banner.png" alt="Sukoon — a focus timer for Chrome" width="100%" />
</p>

# Sukoon

**A focus timer for Chrome.** Focus sessions for deep work: you work a block, you rest a little, and after four rounds you take a longer pause. Pin it to the toolbar. The badge keeps the remaining minutes while you look away from the clock.

*Sukoon* (سكون) is Arabic for stillness — said **soo-KOON**. The quiet you enter to work.

The face matches the clock: clay, dust, dry stone.

![Using Sukoon](docs/demo.gif)

This is a **Chrome extension**. It is not an iPhone app, not a Mac app, and it does not go through the Apple App Store. You publish it on the [Chrome Web Store](https://chrome.google.com/webstore) — Google’s store for extensions.

---

## Run it on your machine

You need [Node.js](https://nodejs.org/) (18 or newer) and desktop Chrome.

```bash
git clone https://github.com/shahjacobb/Forge-Extension.git
cd Forge-Extension
npm install
npm run build
```

Then load it:

1. Open `chrome://extensions`
2. Turn **Developer mode** on (top right)
3. Click **Load unpacked**
4. Choose the **`dist`** folder inside the repo — not the repo root, not `src`
5. Pin **Sukoon** on the toolbar

That is the whole local setup. After you change code: `npm run build`, then **Reload** on the extension card.

### Do not install it these ways

- **GitHub → Code → Download ZIP.** That zip is the source repo (README, `src/`, configs). Chrome cannot load it as an extension, and the Chrome Web Store will reject it.
- **A “Chrome extension downloader” / CRX extractor.** Those extensions scrape `.crx` files out of the store. They are the wrong tool for this project, they skip review, and they are a common malware vector. This repo is not installed that way.
- **Dragging a zip onto `chrome://extensions`.** Chrome wants an **unpacked folder** (`dist/`) for local testing, or a zip you built with `npm run package` for the store dashboard — not a GitHub zip, not a CRX from a downloader.

To try it: clone, `npm run build`, Load unpacked → `dist/`.
To publish: `npm run package`, then upload **`sukoon.zip`** in the [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole).

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

1. Open Sukoon from the Chrome toolbar.
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

## Publish to the Chrome Web Store

The store for Chrome extensions is the **Chrome Web Store**, via the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). That is not the Apple App Store, not Google Play, and not a “download the repo zip” flow.

### Make the zip (this is the file you upload)

From the project root, after you have Node installed:

```bash
npm install
npm run package
```

That command builds the extension and writes **`sukoon.zip`** next to `package.json`. Upload **that** file.

What `sukoon.zip` is: the contents of `dist/` (manifest, HTML, scripts, icons).
What it is not: GitHub **Code → Download ZIP**. That download is the repository. The store will reject it, or Chrome will not treat it as an extension.

If you prefer to zip by hand:

```bash
npm run build
cd dist
zip -r ../sukoon.zip .
```

### One-time, as the publisher

1. Pay the one-time [Chrome Web Store developer](https://chrome.google.com/webstore/devconsole) registration fee.
2. If account sync is on, host a short privacy policy (email + session data via Supabase). The listing form asks for the URL.

### Each release

1. Bump `version` in `public/manifest.json` (it is `0.5.0` now).
2. Run `npm run package`.
3. Dashboard → **New item**, or the existing item → **Package**.
4. Upload `sukoon.zip`.
5. Listing copy:
   - Name: Sukoon
   - Summary: A focus timer for Chrome. Focus sessions for deep work, a short rest, a longer pause after four.
   - Category: Productivity
   - Screenshots: `docs/shots/timer.png`, `running.png`, `activity.png`, `month.png`, `settings.png`, `complete.png` (the store wants 1280×800 or 640×400 — scale these if the form rejects the raw popup size)
   - Small tile: `public/icon-128.png`
   - Marquee: `docs/shots/banner.png`
6. Privacy: single purpose; remote host (`your-project.supabase.co` if sync is on); justify `storage`, `alarms`, `notifications`, `offscreen`.
7. **Submit for review**. Google emails you when it is live or when they bounce it.

Updates: bump `version`, `npm run package`, upload the new zip, submit again.

---

## Development

```bash
npm install
npm run build          # typecheck + dist/
npm run package        # build + sukoon.zip
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
