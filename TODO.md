# Budgy — TODO

## Backlog

- [ ] Passcode / biometric lock
- [ ] Recurring transactions and reminders (`@capacitor/local-notifications`)
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
  - [ ] **Stage 3, before the SMS release:**
    - Recheck Play's live SMS policy.
    - Add `READ_SMS` to the main manifest.
    - Play Permissions Declaration Form and Data safety form.
    - SMS wording in the privacy policy.
    - Privacy policy: the last card digits and merchant names Budgy learns are saved to the signed-in account
      (not the messages).
    - Short demo video.
- [x] **Credit cards:** limit, statement cycle, statement vs current balance, minimum payment, in-app due
      reminders, payments as transfers, interest and fees, credit vs debit
      (`docs/superpowers/specs/2026-11-08-credit-cards-design.md`).
  - [ ] Phone notifications for card due dates (needs `@capacitor/local-notifications`, the notification
        permission, and store/privacy wording).

---

## Your work (needs your accounts, devices or decisions)

1. [ ] **Privacy & store:**
   - The links are https://omokhtarr.github.io/Budgy/privacy.html (consent screen, both stores) and
     https://omokhtarr.github.io/Budgy/delete-account.html (Play's account deletion link).
   - Changes to `docs/privacy-policy.md` must also go in those pages (`privacy.html`, `privacy-ar.html`,
     and the `delete-account` pages if deletion changes) on the `gh-pages` branch. All four matched the
     policy and the app on 2026-11-07. The next change is due with the SMS import update.
   - Fill in Google Play's **Data safety** form to match the privacy policy. Every answer, plus the
     listing text, graphics and release steps, is in `docs/play-store.md`. Keep that file in step with
     Play Console.
2. [ ] **Supabase migration:** deploy `supabase/migrations/20261107120000_sms_learning_tables.sql` to the Supabase
   project **before** any build with stage 2 reaches users. Until it's there, sync skips the new tables, so
   learned card numbers and merchant rules stay on each phone.

---

iOS and App Store work is in `TODO-apple.md`.
