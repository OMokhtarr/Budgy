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
- [ ] **Credit cards (later phase):** today `'card'` is only an account type label, and a card's debt shows only
      because its balance is negative. Start with a design pass. Missing:
  - Credit limit and available credit.
  - Statement cycle: closing day and payment due date.
  - Statement balance versus current balance.
  - Minimum payment and due-date reminders.
  - Card payments from a bank account counted as transfers, not spending.
  - Interest and fees.
  - Credit cards told apart from debit cards.

---

## Your work (needs your accounts, devices or decisions)

1. [ ] **Privacy & store:**
   - The links are https://omokhtarr.github.io/Budgy/privacy.html (consent screen, both stores) and
     https://omokhtarr.github.io/Budgy/delete-account.html (Play's account deletion link).
   - [ ] Changes to `docs/privacy-policy.md` must also go in those pages.
   - Fill in Google Play's **Data safety** form to match the privacy policy.
2. [ ] **Supabase migration:** deploy `supabase/migrations/20261107120000_sms_learning_tables.sql` to the Supabase
   project **before** any build with stage 2 reaches users. Release builds sync the new tables too, and sync
   fails without them.

---

iOS and App Store work is in `TODO-apple.md`.
