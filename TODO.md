# Budgy — TODO

## Done so far (2026-11-02 → 2026-11-03)

- **Review fixes:**
  - Missing exchange rates are flagged, and changing the main currency converts rates and budgets.
  - Editing keeps a transaction's currency, and double-tapping save no longer duplicates.
  - Backups include settings, and major changes ask for confirmation.
  - Number fields accept Arabic digits and comma decimals, and 3-decimal currencies work.
  - Arabic plurals are correct.
  - CSV dates are right.
  - Deleting an account warns about transfers with other accounts.
  - The period moves to the new day on resume and at midnight.
  - A currency picker appears on first run, and the database-error screen exists.
- **Data safety:**
  - The web build asks the browser to keep its data, and a backup reminder appears when there's no
    recent backup.
  - Fonts ship with the app.
  - Cancelling the share sheet no longer reports an error.
  - The PWA icon entries are fixed.
- **Tooling:**
  - Capacitor 8 (8.5.3).
  - A git repository, and the native folders are no longer ignored.
  - README rewritten.
  - `npm test` runs 78 tests, including: database migration, sync between two phones, the Supabase schema on
    PGlite, and the SMS parser.
- **Sign-in & sync, all the code** (see the plan below): UUID data model, Supabase schema, the
  delete-account function, sign-in, the sync engine, the Profile UI, and a draft privacy policy in
  `docs/privacy-policy.md`.

## Still open (code)

- [ ] **Restore / erase on a phone with a slow clock:** `syncOnce` and `deleteMissingInCloud` in
  `src/core/cloud/sync.ts` stamp with the phone's clock, so if it's behind the cloud's copy, the server can
  ignore the restore. Found by reading the code; not reproduced. Normal edits already handle this.
- [ ] **In a later release:** delete the old `budgy` IndexedDB database once everyone has upgraded
  (the data now lives in `budgy2`).
- [ ] Capacitor core is pinned to `~8.5.3` (8.6.0 was only 6 days old). Move to 8.6.x after a few weeks.
- [ ] **Later, maybe:** sign in with Apple on Android. It needs Apple's web flow and a deep link back
  into the app.

## Backlog

- [ ] Passcode / biometric lock
- [ ] Recurring transactions and reminders (`@capacitor/local-notifications`)
- [ ] **SMS import:** see `docs/superpowers/specs/2026-11-03-sms-import-design.md` and
  `docs/superpowers/plans/2026-11-03-sms-import.md`. Android only, and not in the first Play release.
  - [x] **Stage 1 code:** Android project, `plugins/sms-inbox`, parser, and the Settings section (switch,
    disclosure, permission, sender keywords). Nothing in the app calls the parser or `list()` yet, so users
    can't import anything.
  - [x] **Stage 1 device checks (2026-11-04, emulator, `com.budgy.app` debug build):** section, turning on,
    denying, allowing later, sender keywords and the `list({ since })` cutoff all passed.
  - [ ] **Stage 1 checks still open:**
    - Re-run from "turning on" onward after the `com.budgymoney.app` rename.
    - Check that a keyword chip shows after a restart. So far only the saved value was confirmed.
    - Test `list({ since })` with texts older than the cutoff. The emulator refused backdated texts.
    - Install a release build and check that the section is hidden. So far only the manifests were read.
  - [ ] **Stage 1 fixes (deferred from review, not rechecked since):**
    - Merchant names can pick up extra words ("UBER using card **4821", "UBER is pending").
    - "from **9999 to **1234" takes the first masked number.
    - Templates have no currency fallback from the amount.
    - `SmsSettingsSection`: permission request and check failures aren't handled, so the switch could look
      on while off, and the resume listener re-registers on every keyword change.
    - The disclosure says "never the full message", but stage 2 keeps the text while an item is pending.
  - [ ] **Stage 2, the import itself:** must use the new UUID data model and its write hooks.
    - Tables for pending items, seen texts, account links and merchant rules.
    - Scan inbox button with a period picker.
    - "Bank texts" review screen and menu item with a pending count: Confirm, Dismiss, Fill in.
    - Editor pre-fill (amount, currency, date, note), with the original message shown above it.
    - Learning (masked digits → account, merchant → category), and Linked numbers in Settings.
    - "Looks like you already added this" warning, and `smsFingerprint` on transactions, agreed with sync.
    - Delete the full text once an item is confirmed or dismissed.
  - [ ] **Stage 3, before the SMS release:**
    - Recheck Play's live SMS policy.
    - Add `READ_SMS` to the main manifest.
    - Play Permissions Declaration Form and Data safety form.
    - SMS wording in the privacy policy.
    - Short demo video.

## Plan: sign-in (Google & Apple) + cloud sync, on Supabase — status

Signing in is optional: without an account Budgy works exactly as before. A build without Supabase
settings (`.env`) shows no sign-in at all.

### Phase 0 — Decisions
- [x] **Backend:** Supabase.
- [x] **What sync is for:** a copy of this device's data in the account, to get it back after changing phones
  or reinstalling. Using several phones at once isn't a goal, but two signed-in phones stay safe: the second
  sees the first's changes when it next starts.
- [x] **Conflict rule:** last edit wins, per record, on `updatedAt`. The server enforces it, and a local
  edit is always stamped later than the version it changes, even if the phone's clock is behind.
- [x] **First sign-in with data on both sides:** ask "Merge both" or "Use the account's data", or cancel.
  When only one side has data, they merge without asking. The starting accounts and categories have
  fixed ids, so they never duplicate.
- [x] **Restore / erase while signed in:** replaces the account's data too. The confirmation says so.
- [ ] **Your part:** create the project and check the costs (see "Your work" at the end).

### Phase 1 — Data model ✅
- [x] **UUID ids:** existing data is copied from the old `budgy` database into `budgy2` on first launch.
  The old database is kept as a safety copy.
- [x] **Write hooks:** `updatedAt`, soft deletes and a local `dirty` ("upload me") mark are set on every
  write. Changes that come from sync don't set them.
- [x] **Backups:** format version 5. Older backups still restore.
- [x] **Tests:** `src/core/db/db.test.ts`.

### Phase 2 — Supabase database ✅ (written and tested; not deployed)
- [x] Migration `supabase/migrations/20261103114647_sync_tables.sql`:
  - **Tables:** `accounts`, `categories`, `transactions` and `settings`, with each record's fields in
    `data`. The key is `(user_id, id)`.
  - **Server time:** a trigger stamps `server_updated_at`, and ignores older or repeated edits.
  - **Access:** row-level security on every table (each user reads, adds and changes only their own rows,
    and can't delete). No access for `anon`, and explicit grants for `authenticated`.
  - **Indexes** for pulls.
- [x] **Tests:** `src/test/supabase-schema.test.ts` runs the migration on PGlite (real Postgres) and checks
  the access rules, "last edit wins" and account deletion.
- [ ] **Your part:** apply it and run the advisors (see "Your work").

### Phase 3 — Sign-in ✅ (code; needs your keys)
- [x] `src/core/cloud/auth.ts`:
  - **Native:** Google and Apple sign-in on the phone (`@capgo/capacitor-social-login` 8.7.4), then
    `signInWithIdToken`. The provider gets the hashed nonce and Supabase the raw one.
  - **Web:** the redirect flow.
  - **Apple:** the name it sends on first sign-in fills the profile name.
- [x] **Sign out:** the app asks whether to keep this phone's data. Removing it uploads anything unsent
  first.
- [x] **Delete account:** done in the Edge Function `supabase/functions/delete-account`, which uses the
  caller's own id from their JWT. The app asks whether to keep the local copy.
- [ ] **Your part:** Google, Apple and Supabase setup (see "Your work"). The Edge Function hasn't been
  typechecked or run here (no Deno / Docker available).

### Phase 4 — Sync ✅
- [x] `src/core/cloud/sync.ts`:
  - **Pull** by server time, with a 1-minute overlap.
  - **Push** records marked `dirty`, in batches.
  - **Settings:** the account's settings win on a phone's first sync.
  - **Restore / erase:** makes the cloud match the phone.
- [x] `CloudContext`: sync runs at sign-in, on start, and 3 seconds after changes. On resume, when the
  connection returns, and every 5 minutes it only runs if something is left to send or finish, so an idle
  app makes no requests. It never blocks the app.
- [x] **Tests:** `src/core/cloud/sync.test.ts` with two phones and a server following the same rules:
  - merging defaults, no echo, conflicting edits, late offline edits;
  - deletes, restore, and switching accounts.

### Phase 5 — UI ✅
- [x] **Profile → Account & sync:**
  - Signed out: sign-in buttons.
  - Signed in: email, sync status, Sync now, Sign out, Delete account.
- [x] **Elsewhere:**
  - The side menu shows the last sync when signed in.
  - The "stays on this device" text changes when signed in.
  - The restore and erase warnings mention the account.
  - The backup reminder is off when signed in.

### Phase 6 — Privacy & store
- [x] **Draft privacy policy:** `docs/privacy-policy.md`.
- [ ] **Your part:** finish it, publish it, and fill in the store forms (see "Your work").

### Phase 7 — Testing
- [x] **Automated:** the data migration, two-phone sync, and the schema's access rules (`npm test`).
- [ ] **Your part:** real phones against the real project (see "Your work").

---

## Your work (needs your accounts, devices or decisions)

Roughly in this order:

0. [x] **App id: `com.budgymoney.app`.** The old `com.budgy.app` is taken on Google Play by "Budgy – Budget
   & Money Tracker" (JOBITEX). The new id had no public listing on either store on 2026-11-04, but a store
   only confirms an id is free when you register it there. The Google and Apple client IDs depend on the
   app id, so register it soon.
   - [ ] **Decide about the store name.** Google Play has that other Budgy, and several other finance apps
     are called Budgy on the App Store.
1. [x] **Commit to git.** Done. The 57 build files from `plugins/sms-inbox/android/build/` it first included
   have since been removed from git and are ignored.
2. [ ] **Test the data migration on a real phone** with your real data, by installing over the current
   version. Make a backup file first (Menu → Data → Back up), and copy it off the phone.
   - Use `android/budgy-migration-test-com.budgy.app.apk` (git-ignored). It's a debug build that still has
     the old id, so it can install over the old copy and test the migration on your real data.
   - If the install fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, the phone's copy was signed with a
     different key. **Don't uninstall it: that deletes the data.**
   - Builds with the new id install as a separate, empty app. To move your data, make a backup in the old
     app and restore it in the new one. Then the old app can go.
3. [ ] **Supabase project:**
   - [x] Project created (ref `zceojylbdjzhzlrqgtbt`). Check the free tier's limits (inactive projects may
     be paused).
   - [x] URL and **publishable** key are in `.env`, which is the file Vite reads for `npm run dev` and for
     builds. It doesn't read `.env.dev` unless you pass `--mode dev`. Never use the secret key.
   - [ ] **Turn off email sign-up:** Authentication → Sign In / Providers → Email (the Email provider's own
     switch, not "Allow new users to sign up", which would also block new Google and Apple users). The app
     doesn't use it, and it's on in the live project. `supabase/config.toml` already has it off for `config push`.
   - [x] Schema applied with `npx supabase@2.121.0 db push`. To change it, add a migration and push again.
   - [x] Advisors (`npx supabase@2.121.0 db advisors --linked`): no security warnings. The "unused index"
     notes are expected until the app has real traffic.
   - [x] `delete-account` is deployed (`npx supabase@2.121.0 functions deploy delete-account --use-api`;
     `--use-api` doesn't need Docker). It rejects callers who aren't signed in. **The real deletion hasn't
     run yet:** it needs a signed-in user, so step 8's "delete account" is its first real test.
   - **Sign-in providers:** the Google and Apple settings are in `supabase/config.toml`, with their IDs and
     secrets in `supabase/.env` (copy `supabase/.env.example`). Either push them with
     `npx supabase@2.121.0 config diff`, then `config push`, after setting your real web address in
     `site_url` / `additional_redirect_urls` (see the warning there), or enter the same values in the
     dashboard (steps 4–5). The CLI hasn't validated this file yet: `config diff` will.
   - Or authorize the Supabase connector (`/mcp`) and ask me to do these steps.
4. [ ] **Google sign-in** (Google Cloud Console → APIs & Services):
   - **Status:** web and two Android clients exist (project `budgy-513623`), both env files are filled in, and
     Google is on in Supabase. **Not yet tested on a real phone.** `supabase/config.toml` now matches the live
     project, with Apple off, so `config diff` should show nothing. Turn Apple on there in step 5.
   - **OAuth consent screen:** app name, support email, privacy policy link. In Testing mode, add test
     users.
   - **Credentials:** a **Web** client (put it in `VITE_GOOGLE_WEB_CLIENT_ID`), an **iOS** client (bundle
     id `com.budgymoney.app`, put it in `VITE_GOOGLE_IOS_CLIENT_ID`), and an **Android** client for each
     signing key's SHA-1 (debug, upload, and Play app signing).
   - **Supabase → Authentication → Providers → Google:** turn it on and enter the client IDs separated by
     commas, **web client first**. For web sign-in, also add the web client's secret, and add your web
     domain under Authentication → URL Configuration → Redirect URLs (`https://<domain>/profile`).
   - Follow the plugin's native setup in `node_modules/@capgo/capacitor-social-login/README.md`, after
     `npx cap sync`. `capacitor.config.ts` already turns on only Google and Apple, so the Facebook SDK isn't
     bundled.
   - While you set this up, the app says "Sign-in with Google isn't set up yet" whenever Supabase rejects
     the provider or the client IDs don't match. That message means you should check these steps.
5. [ ] **Sign in with Apple** (needs a paid Apple Developer account, and only for iOS):
   - [ ] **Code needed first:** `delete-account` doesn't revoke the user's Apple token. App Store review expects
     that when an account is deleted, so add it before submitting. `delete-account.html` tells users to
     remove the link themselves in the meantime; update it when this is done.
   - Turn on the "Sign in with Apple" capability for `com.budgymoney.app` in the developer portal and in Xcode.
   - **Supabase → Providers → Apple:** turn it on and add `com.budgymoney.app` to Client IDs.
   - Only if you also want it on the web: a Services ID, a `.p8` key, and `VITE_APPLE_SIGN_IN_WEB=true`.
     The secret must be renewed every 6 months.
6. [ ] **Android project:** `android/` now exists (created by the SMS session).
   - [x] Release signing is set up: `android/app/build.gradle` reads `android/keystore.properties`, and the
     upload key is `android/budgy-upload.jks`. Both are git-ignored.
   - [x] **Back up `android/budgy-upload.jks` and `android/keystore.properties` (it holds the password)
     somewhere safe outside the project.** They exist only on this computer. If they're lost, you can't
     publish updates until Google resets the upload key, and only if you use Play App Signing.
   - SHA-1s for the Android OAuth clients (step 4): debug `E4:BC:45:A6:EE:9A:77:78:F0:07:9B:D8:95:31:1A:5E:2B:D1:11:DA`,
     upload `1E:0E:0A:E1:C3:15:DD:CF:74:BE:E9:44:61:C8:4B:10:D1:61:42:F4`. The Play app signing SHA-1 appears
     in Play Console.
   - [x] Icons and splash screens are generated. To change them, edit `scripts/generate-icons.mjs`, run it,
     run `npx @capacitor/assets@3.0.5 generate --android`, then undo the tool's reformatting of
     `AndroidManifest.xml`. The script also rewrites `public/`.
   - [ ] Check the icon and splash on a real phone.
   - Check on a real phone that the header and tab bar clear the status and navigation bars (Android
     draws edge-to-edge), and that the status bar icons follow the app theme.
7. [ ] **iOS project** (on a Mac with Xcode 26+): `npx cap add ios`, then the same checks.
8. [ ] **Real-device backup test** on one account:
   - reinstall: delete the app, install it again, sign in, and check that everything comes back;
   - a new phone: sign in and check the same;
   - offline edits that upload when the connection returns;
   - a first sign-in with data on the phone only, in the account only, and on both;
   - sign out (keep / remove), delete account;
   - restore a backup while signed in.
9. [ ] **Privacy & store:**
   - [ ] Update `privacy.html` and `privacy-ar.html` on `gh-pages`: `docs/privacy-policy.md` now describes
     sync as a backup, not as a way to use several devices.
   - [x] The [bracketed] parts of `docs/privacy-policy.md` are filled in. The minimum age is 13, so choose
     13+ age groups in Play Console's target audience form too.
   - [x] Pushed to the `gh-pages` branch: `privacy.html`, `delete-account.html` and their `-ar` versions. The
     Arabic pages still need checking by a fluent speaker.
   - [x] Pages is on (Settings → Pages → Deploy from a branch → `gh-pages`, `/ (root)`). The links are https://omokhtarr.github.io/Budgy/privacy.html (consent screen, both stores) and
     https://omokhtarr.github.io/Budgy/delete-account.html (Play's account deletion link).
   - [ ] Changes to `docs/privacy-policy.md` must also go in those pages.
   - [x] Android Auto Backup is off (`android:allowBackup="false"`), so cloud backups match the policy. Direct
     phone-to-phone transfers on Android 12+ can still copy data between a user's own phones.
   - Fill in Google Play's **Data safety** form and the App Store **privacy labels** to match it.
10. [ ] **Before publishing:**
    - Register `com.budgymoney.app` in Play Console and the Apple developer portal.
