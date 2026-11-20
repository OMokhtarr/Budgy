# App lock (phone's own lock)

## Intent
If someone picks up the owner's unlocked phone, they can't open Budgy or see balances. Budgy asks for the
phone's own unlock (fingerprint, face, or the phone's PIN/pattern/password) instead of a Budgy passcode, so there
is nothing new to remember and no way to lose data to a forgotten passcode. Keeping out people who know the
phone's PIN is not a goal (chosen by the owner).

## Goals
- **Settings → Security → "Lock Budgy"**, off by default. Turning it on shows the unlock prompt once and only
  turns on if it succeeds. Turning it off also asks to unlock (so whoever grabbed the phone can't just switch it
  off).
- **When it locks:** every app start, and on coming back from the background once the app has been away longer
  than the chosen time: *Immediately / After 1 minute / After 5 minutes* (default 1 minute).
- **Locked screen:** while locked, a full-screen cover hides the app: the Budgy logo, "Budgy is locked" and an
  **Unlock** button. The prompt opens by itself when the cover appears; cancelling it leaves the cover up, and
  Unlock shows the prompt again. Back on the cover leaves the app (as on a tab).
- **Recent-apps preview hidden** while the lock is on, on Android 13+ (`setRecentsScreenshotEnabled(false)`),
  which doesn't block screenshots. Older Android: preview left alone (the only option there, `FLAG_SECURE`, also
  blocks screenshots).
- **Phone without a screen lock:** the switch can't be turned on; say to set a screen lock in the phone's
  settings first. If the phone's screen lock is removed later, Budgy opens without the prompt (anyone could open
  the phone anyway) and the setting stays on, so it works again once a screen lock is back.
- Arabic and English text; RTL and dark mode for the cover and the new Settings rows.

## Non-goals
- A Budgy passcode, or keeping out people who know the phone's PIN.
- The web/PWA version (testing only): the Security section is hidden there and nothing locks.
- Encrypting data. The lock only stops the app being opened.
- Budgy Pro gating: the lock is free.
- iPhone now. The plugin does Face ID / iPhone passcode, so it should work after `npx cap add ios`; checking it is
  part of the iOS work in `TODO-apple.md`.

## Constraints
- Android only for now (minSdk 24). Plugin `@capgo/capacitor-native-biometric` 8.9.3 (peer `@capacitor/core >=8`;
  same vendor as the Google sign-in plugin). Its Android `verifyIdentity()` with `allowedBiometryTypes:
  [MULTIPLE, DEVICE_CREDENTIAL]` builds a plain prompt (no crypto object) with `BIOMETRIC_WEAK |
  DEVICE_CREDENTIAL`, so fingerprint, face and phone PIN all work. `isAvailable({ useFallback: true })` reports
  `deviceIsSecure`. With `DEVICE_CREDENTIAL` Android allows no Cancel button; the system back gesture still
  cancels.
- The prompt is a separate Android activity, so Capacitor fires `pause` and `resume` around every unlock. Coming
  back from Budgy's own prompt must not start the away timer or lock again. (Built: the prompt is translucent, so
  Budgy is paused but not stopped; the lock listens to `appStateChange`, which fires only on leaving / coming
  back, and times the time away with `SystemClock.elapsedRealtime()` so changing the phone's time can't skip it.)
- Per device: stored in `budgy-settings` like `smsImport`, never synced or backed up (not in `BACKUP_KEYS`).
- The cover must be up before the first screen shows on start (the splash is revealed by `revealApp`), and must
  go up when the app goes to the background so nothing sensitive is on screen when it comes back.

## Approaches
- **A (picked by the owner):** the ready-made plugin for the prompt, plus a tiny native call for the recent-apps
  preview (the plugin doesn't have one), next to `MainActivity`. Least native code; iPhone comes almost free.
- B: our own native plugin (like `plugins/sms-inbox`) wrapping BiometricPrompt and the recents flag. No third-party
  code, but more Android code to test on devices, and iPhone written separately later.
- Dropped: a Budgy passcode (the owner chose the phone's lock), and Android screen pinning (doesn't fit).

## Left to the builder
- Where the lock state lives (a provider near the top of `App` / `main.tsx`) and how the cover sits over Ionic's
  overlays (alerts, sheets, the side menu).
- How the recents call is exposed to JS (a small local Capacitor plugin registered in `MainActivity`, or similar).
- Exact copy, the cover's look (reuse the splash logo and colours), the Settings section layout.
- Unit tests for the timing rule (start, away shorter/longer than the chosen time, return from Budgy's own prompt)
  and the on/off flow with the plugin mocked; device checks listed in the TODO for what tests can't cover.
