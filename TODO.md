# Budgy — TODO

## Backlog

- [ ] Passcode / biometric lock
- [x] **Recurring transactions and phone reminders** (`docs/superpowers/specs/2026-11-20-recurring-transactions-design.md`):
      repeat from the editor, Menu → Recurring, due lines on Overview and Transactions, Auto, and Settings → Reminders
      (also covers card due dates).
  - [ ] **Before the release:** deploy `supabase/migrations/20261120120000_recurring_table.sql` (until then the
        app syncs everything else and keeps recurring ones waiting to upload); copy the privacy policy's
        "Reminders" paragraph to `privacy.html` and `privacy-ar.html` on `gh-pages`; mention recurring transactions
        and reminders in both store descriptions; add a `RELEASE-NOTES.md` section (needs the `versionCode` bump).
  - [ ] **Checks on a phone (debug build):** turning reminders on asks for the notification permission (Android 13+),
        and refusing it turns the switch back off; a reminder comes at the picked time (set one for today a few minutes
        ahead) with the Budgy icon; tapping it opens Recurring (and a card's opens Accounts); reminders still come after
        a restart; no "Alarms & reminders" screen ever opens; the lock screen hides the amount when the phone hides
        sensitive content; an Auto one is added on opening the app a day later, and on a second synced phone it
        doesn't appear twice; iOS: `npx cap sync ios` and the same checks.
- [ ] **SMS import:** see `docs/superpowers/specs/2026-11-03-sms-import-design.md` and
      `docs/superpowers/plans/2026-11-03-sms-import.md`. Android only, and not in the first Play release.
  - [ ] **Stage 1 checks still open:**
    - Re-run from "turning on" onward after the `com.budgymoney.app` rename.
    - Check that a keyword chip shows after a restart. So far only the saved value was confirmed.
    - Test `list({ since })` with texts older than the cutoff. The emulator refused backdated texts.
    - Install a release build and check that the section is hidden. So far only the manifests were read.
  - [ ] **Stage 2 checks still open (need a debug build on a device):**
    - Ordinary add, edit and delete of an expense, a transfer and a cross-currency transfer still work after
      the editor change.
    - First Confirm asks for account and category; the next text from the same card and merchant arrives with
      both filled.
    - A USD text on an EGP-only account confirms in USD with the note, and the account shows a USD line.
    - The "already added" prompt: Keep both, Skip (doesn't come back on rescan), and closing it (nothing
      happens).
    - Dismiss, then rescan: the text doesn't come back.
    - Fill in… opens the editor with the message above it; saving resolves it, closing leaves it pending.
    - Linked numbers: re-pointing and deleting a link change the next suggestion; a change syncs to a second
      phone.
    - Settings: keywords add/remove and the permission row still updates after resume.
    - Arabic (RTL) layout and dark mode of the new screens.
  - [ ] **Several texts at once, money back and combining — checks (need a debug build on a device):**
    - Long-press a card to select it; tap toggles; ✕ and the back button leave selection.
    - Selecting money in and money out together shows the "one category needs…" hint under the buttons.
    - Same category with one text missing an account: the others save, it stays selected with the category set.
    - The "some look already added" prompt: Skip those, Keep all, and closing it (nothing saved).
    - Money in picked as "Money back on" Food: the card's note shows, and after Confirm Food's spending drops.
    - Take off a purchase from a hand-entered dinner, and from one in another currency: the category drops by
      the texts' value and each account's balance moves by its own text.
    - Combine two card payments for one purchase, and a payment with two friends paying back: one entry each,
      with the net shown in the sheet matching the transactions list.
    - Arabic (RTL) layout and dark mode of the selection bar, the purchase picker, the texts and combine sheets.
    - Transactions list: a combined entry shows once with the net; with a payback in the next month it shows
      "+1 more…", and with the account filter only that account's part shows.
    - Group sheet: change category and note (all rows follow), take a row out, delete all; long-press a group
      entry selects all its rows.
    - When SMS import ships, add a `RELEASE-NOTES.md` section for money back, several texts at once and
      combining (needs the `versionCode` bump).
  - [ ] **Stage 3, before the SMS release:**
    - Recheck Play's live SMS policy.
    - Add `READ_SMS` to the main manifest.
    - Play Permissions Declaration Form and Data safety form.
    - Short demo video.
- [x] **Credit cards:** limit, statement cycle, statement vs current balance, minimum payment, in-app due
      reminders, payments as transfers, interest and fees, credit vs debit
      (`docs/superpowers/specs/2026-11-08-credit-cards-design.md`).
  - [x] Phone notifications for card due dates: part of phone reminders (above).

---

## Your work (needs your accounts, devices or decisions)

1. [ ] **Budgy Pro setup** (spec §11, `docs/superpowers/specs/2026-11-19-budgy-pro-subscription-design.md`):
   - [x] **RevenueCat:** project "Budgy", app "Budgy (Android)", entitlement `budgy_pro`, offering `default`
     (Monthly → `budgy_pro:monthly`, Annual → `budgy_pro:yearly`, Lifetime → `budgy_pro_lifetime`), Customer
     Center on, Android key in `.env.local` (2026-11-19).
   - [ ] **RevenueCat paywall** for `default`, in Arabic and English.
   - [x] **Play Console products** (2026-11-19, all active): subscription `budgy_pro` with base plans `monthly`
     (US$0.99, backwards compatible) and `yearly` (US$4.99), each with a 7-day free-trial offer for new customers
     (`free-trial-7d-monthly`, `free-trial-7d-yearly`; one trial per person across both plans); one-time product
     `budgy_pro_lifetime` (US$14.99, purchase option `lifetime`, backwards compatible). Play's converted local prices.
   - [ ] **Play ↔ RevenueCat:** upload the Play service account's credentials in RevenueCat, turn on Google
     developer notifications, then check Product catalog → Products no longer says "Could not check". Add a license tester.
   - [ ] **Test** with `VITE_PRO_GATE=test` on a testing-track build: buy, reinstall and restore; sign in and
     check Pro follows to a second phone. Nothing is gated at `test`, so check that sync pauses after expiry
     (cancel, then wait it out) on a debug build with `VITE_PRO_GATE=on`. Then set `VITE_PRO_GATE=on` for the release.
   - [ ] **Testers:** grant the closed testers promotional Pro in RevenueCat (by Support ID, on their Profile
     pages) before the gated release reaches them.
   - [ ] **Privacy and store text:** the policy (`docs/privacy-policy.md` and the `gh-pages` pages) and the
     listing and Data safety changes (`docs/play-store.md` → "When Budgy Pro turns on") are written, and the
     `gh-pages` pages are live. Left: enter the listing, Data safety and App access changes in Play Console with the
     release that turns Pro on.
2. [ ] **Privacy & store:**
   - The links are https://omokhtarr.github.io/Budgy/privacy.html (consent screen, both stores) and
     https://omokhtarr.github.io/Budgy/delete-account.html (Play's account deletion link).
   - Changes to `docs/privacy-policy.md` must also go in those pages (`privacy.html`, `privacy-ar.html`,
     and the `delete-account` pages if deletion changes) on the `gh-pages` branch. All four matched the
     policy and the app on 2026-11-08, SMS import included.
   - Fill in Google Play's **Data safety** form to match the privacy policy. Every answer, plus the
     listing text, graphics and release steps, is in `docs/play-store.md`. Keep that file in step with
     Play Console.
   - **Closed test:** the testers group exists. Next, publish a build to the closed testing track for that
     group, then keep 12+ testers opted in for 14 days in a row before applying for production.

---

iOS and App Store work is in `TODO-apple.md`.
