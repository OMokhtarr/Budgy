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
  - [ ] **Stage 1 fixes (deferred from review, not rechecked since):**
    - Merchant names can pick up extra words ("UBER using card \*\*4821", "UBER is pending").
    - "from **9999 to **1234" takes the first masked number.
    - Templates have no currency fallback from the amount.
    - `SmsSettingsSection`: permission request and check failures aren't handled, so the switch could look
      on while off, and the resume listener re-registers on every keyword change.
    - The disclosure says "never the full message", but stage 2 keeps the text while an item is pending.
  - [ ] **Stage 2, the import itself:** must use the new UUID data model and its write hooks. Nothing in the
        app calls the parser or `list()` yet, so users can't import anything.
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

---

iOS and App Store work is in `TODO-apple.md`.
