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

---

iOS and App Store work is in `TODO-apple.md`.
