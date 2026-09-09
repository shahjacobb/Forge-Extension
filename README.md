# Forge — Chrome Extension

A Cursor-themed Pomodoro timer for Chrome. Focus, break, and long-break rounds, richer chimes, and an account that follows you across Chrome profiles.

---

## What it does

- Circular focus / break / long-break timer with a daily goal
- Classic, Deep, and Sprint presets
- Session history, weekly chart, monthly heat map, and streak tracking
- Layered sound effects for start, pause, skip, focus done, break done, and milestones
- Toolbar badge that shows time remaining
- Keyboard: Space in the popup, `Alt+Shift+P` anywhere in Chrome
- Account sync across Chrome profiles via Supabase (sessions + settings)

## Across Chrome profiles

Chrome profiles do not share local extension storage. Forge keeps you signed in with a cloud account:

1. Create an account in **Settings**
2. Sign in with the same email on any other Chrome profile
3. Sessions, streak, and settings merge automatically

The auth session is stored in `chrome.storage` so the background timer can keep syncing even when the popup is closed.

## Install in Chrome

1. Clone the repo and run `npm install && npm run build`
2. Open `chrome://extensions`
3. Turn on **Developer mode**
4. Click **Load unpacked** → select the `dist/` folder
5. Forge appears in the toolbar

After a code change: `npm run build`, then **Reload** the extension card.

## Development

```bash
npm install
npm run build
npm run preview   # visual UI preview in a browser
```

Requires a `.env.local` with:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

The UI still loads without those keys. Account sync stays disabled until they are set.

## Structure

```
src/
  background/   timer, alarms, badge, notifications, sound trigger, cloud sync
  offscreen/    Web Audio chime player
  popup/        timer, activity, settings, account
  options/      standalone settings page
  activity/     standalone weekly view
  shared/       types, storage, Supabase client, analytics, account sync
public/
  manifest.json Chrome extension manifest (MV3)
```
