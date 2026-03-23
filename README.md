# Forge

Built with Codex (GPT-5.4).

Forge is a minimalist Chrome extension for pomodoro timing and session tracking.

## Local development

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

## Load in Chrome

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click `Load unpacked`
4. Select the `dist` folder

After that, use `Reload` on the Forge extension card any time you rebuild.

## Current structure

- `popup.html`: main timer popup
- `activity.html`: activity and weekly focus view
- `options.html`: settings page
- `src/background`: timer logic and extension state handling
- `src/shared`: shared timer, storage, and analytics code
