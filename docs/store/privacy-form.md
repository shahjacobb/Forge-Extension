# Chrome Web Store — Privacy tab

Paste these. Keep **Remote code** on **No**. Check all three certification boxes.

**Single purpose description**

```
Lahza is a focus timer for Chrome. It runs focus and break sessions, shows remaining time on the toolbar icon, and keeps a simple activity history (including a month heat map).
```

**storage**

```
Saves the timer, your session lengths, and completed sessions on this computer so closing the popup doesn’t wipe the clock or your history.
```

**alarms**

```
Fires when a focus or break session should end, even if the popup is closed, and ticks the toolbar badge.
```

**notifications**

```
Shows a Chrome notification when a focus or break session ends.
```

**offscreen**

```
Plays the end-of-session chime. Chrome service workers can’t play audio themselves, so the sound runs in an offscreen page that ships with the extension.
```

**Host permission** (`https://tiopzxojmnortiwbgfrx.supabase.co/*`)

```
Only used if you sign in. Then Lahza talks to our Supabase project to sync settings and sessions across Chrome profiles. If you don’t sign in, this isn’t used. The timer works fully on the device without it.
```

**Are you using remote code?** No

If it still asks for a justification:

```
All JavaScript is inside the extension package. We don’t load scripts from the web. Network calls (only if you sign in) are API requests to Supabase, not remote code.
```

**What user data do you collect?** Check only:

- Personally identifiable information (email, and a display name if they type one — only if they create an account)
- Authentication information (email and password for that optional account; login is handled by Supabase)

Leave the rest unchecked. Focus-session history is app data on the device (and on Supabase if they sign in). It is not “user activity” in the keystroke / browsing sense.

**Certify all three boxes.** Yes — we don’t sell data, don’t use it off-purpose, don’t use it for lending.

**Privacy policy URL**

```
https://github.com/shahjacobb/Forge-Extension/blob/cursor/sukoon-cover-serif-c024/docs/privacy.md
```

After this branch is on `main`, switch the URL to:

```
https://github.com/shahjacobb/Forge-Extension/blob/main/docs/privacy.md
```
