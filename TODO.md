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
  - A git repository: `git init` done, nothing committed yet, and the native folders are no longer
    ignored.
  - README rewritten.
  - `npm test` runs 40 tests: database migration, sync between two phones, the Supabase schema on
    PGlite, and the SMS parser.
- **Sign-in & sync, all the code** (see the plan below): UUID data model, Supabase schema, the
  delete-account function, sign-in, the sync engine, the Profile UI, and a draft privacy policy in
  `docs/privacy-policy.md`.

## Still open (code)

- [ ] **In a later release:** delete the old `budgy` IndexedDB database once everyone has upgraded
  (the data now lives in `budgy2`).
- [ ] Capacitor core is pinned to `~8.5.3` (8.6.0 was only 6 days old). Move to 8.6.x after a few weeks.
- [ ] **Later, maybe:** Supabase Realtime for instant updates between devices. Today, sync runs at
  start, on resume, after changes and every 5 minutes.
- [ ] **Later, maybe:** sign in with Apple on Android. It needs Apple's web flow and a deep link back
  into the app.

## Backlog

- [ ] Passcode / biometric lock
- [ ] Recurring transactions and reminders (`@capacitor/local-notifications`)
- [ ] **SMS import:** being built in a separate session. See `docs/superpowers/specs/2026-11-03-sms-import-design.md`
  and `docs/superpowers/plans/2026-11-03-sms-import.md`. Stage 2 (pending items stored in the database)
  must use the new UUID data model and its write hooks.

## Plan: sign-in (Google & Apple) + cloud sync, on Supabase — status

Signing in is optional: without an account Budgy works exactly as before. A build without Supabase
settings (`.env`) shows no sign-in at all.

### Phase 0 — Decisions
- [x] **Backend:** Supabase.
- [x] **Conflict rule:** last edit wins, per record, on `updatedAt`. The server enforces it, and a local
  edit is always stamped later than the version it changes, even if the phone's clock is behind.
- [x] **First sign-in with data on both sides:** ask "Merge both" or "Use the account's data", or cancel.
  When only one side has data, they merge without asking. The starting accounts and categories have
  fixed ids, so they never duplicate.
- [x] **Restore / erase while signed in:** replaces the account's data on every device. The confirmation
  says so.
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
- [x] `CloudContext`: sync runs at sign-in, 3 seconds after changes, on resume, when the connection
  returns, and every 5 minutes. It never blocks the app.
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
  - The restore and erase warnings mention all devices.
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

1. [ ] **Commit to git.** The repository exists but has no commits. Make the first commit once you've
   looked over the changes. (A separate session is also working here on SMS import; let it finish its
   current step first.)
2. [ ] **Test the data migration on a real phone** with your real data, by installing over the current
   version. Make a backup file first (Menu → Data → Back up).
3. [ ] **Supabase project:**
   - Create it at supabase.com, in the region closest to your users. Check the free tier's limits
     (inactive projects may be paused).
   - Put the project URL and the **publishable** key in `.env` (copy `.env.example`). Never use the
     secret key.
   - Apply the schema: `npx supabase@2.121.0 link --project-ref <ref>`, then `npx supabase@2.121.0 db push`.
   - Run **Database → Advisors** in the dashboard and fix anything it flags.
   - Deploy the function: `npx supabase@2.121.0 functions deploy delete-account`.
   - **Sign-in providers:** the Google and Apple settings are in `supabase/config.toml`, with their IDs and
     secrets in `supabase/.env` (copy `supabase/.env.example`). Either push them with
     `npx supabase@2.121.0 config diff`, then `config push`, after setting your real web address in
     `site_url` / `additional_redirect_urls` (see the warning there), or enter the same values in the
     dashboard (steps 4–5). The CLI hasn't validated this file yet: `config diff` will.
   - Or authorize the Supabase connector (`/mcp`) and ask me to do these steps.
4. [ ] **Google sign-in** (Google Cloud Console → APIs & Services):
   - **OAuth consent screen:** app name, support email, privacy policy link. In Testing mode, add test
     users.
   - **Credentials:** a **Web** client (put it in `VITE_GOOGLE_WEB_CLIENT_ID`), an **iOS** client (bundle
     id `com.budgy.app`, put it in `VITE_GOOGLE_IOS_CLIENT_ID`), and an **Android** client for each
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
   - Turn on the "Sign in with Apple" capability for `com.budgy.app` in the developer portal and in Xcode.
   - **Supabase → Providers → Apple:** turn it on and add `com.budgy.app` to Client IDs.
   - Only if you also want it on the web: a Services ID, a `.p8` key, and `VITE_APPLE_SIGN_IN_WEB=true`.
     The secret must be renewed every 6 months.
6. [ ] **Android project:** `android/` now exists (created by the SMS session).
   - Set up release signing.
   - **Back up the keystore and its passwords somewhere safe outside the project.** If they're lost, you
     can't publish updates.
   - Generate icons and the splash screen: copy `public/icon.png` to `assets/icon.png`, then run
     `npx @capacitor/assets generate`.
   - Check on a real phone that the header and tab bar clear the status and navigation bars (Android
     draws edge-to-edge), and that the status bar icons follow the app theme.
7. [ ] **iOS project** (on a Mac with Xcode 26+): `npx cap add ios`, then the same checks.
8. [ ] **Real-device sync test** with two phones on one account:
   - offline edits on both, the same transaction edited on both, a delete while the other edits;
   - a first sign-in with data on the phone only, in the account only, and on both;
   - sign out (keep / remove), a new phone, delete account;
   - restore a backup while signed in.
9. [ ] **Privacy & store:**
   - Finish the [bracketed] parts of `docs/privacy-policy.md` and publish it at a public link.
   - Fill in Google Play's **Data safety** form and the App Store **privacy labels** to match it.
10. [ ] **Before publishing:**
    - Replace the placeholder support email in `src/core/config/links.ts`.
    - Check that the app id `com.budgy.app` is free on Google Play and the App Store. If you change it,
      change `capacitor.config.ts`, the Google/Apple client IDs and Supabase's Apple Client IDs to match.
