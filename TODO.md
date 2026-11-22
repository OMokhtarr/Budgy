# Budgy — TODO

## Backlog

- [x] **SMS import** (Android only; `docs/superpowers/specs/2026-11-03-sms-import-design.md`). Works in debug
      builds and was checked on a device (2026-11-20), including several texts at once, money back and combining.
      Build 6 (`READ_SMS`), the new store descriptions, the Permissions Declaration Form and the trader status
      were sent for review on 2026-11-21 and approved: build 6 is live in Closed testing (2026-11-22). Form
      answers, Data safety reasoning and the video script are in `docs/play-store.md`; the demo video is on
      Google Drive (link in the declaration form).

---

## Your work (needs your accounts, devices or decisions)

1. [ ] **Budgy Pro setup** (spec §11, `docs/superpowers/specs/2026-11-19-budgy-pro-subscription-design.md`).
   RevenueCat and the Play products are set up; their details are in `docs/play-store.md` → "Other declarations
   and setup".
   - [ ] **Expiry:** nothing is gated at `VITE_PRO_GATE=test`, so check that sync pauses after expiry (cancel,
     then wait it out) on a debug build with `VITE_PRO_GATE=on`. Then set `VITE_PRO_GATE=on` for the release.
   - [ ] **Testers:** grant the closed testers promotional Pro in RevenueCat (by Support ID, on their Profile
     pages) before the gated release reaches them.
2. [ ] **Privacy & store:**
   - The links are https://omokhtarr.github.io/Budgy/privacy.html (consent screen, both stores),
     https://omokhtarr.github.io/Budgy/delete-account.html (Play's account deletion link) and
     https://omokhtarr.github.io/Budgy/terms.html (Play's trader status; source `docs/terms-of-service.md`).
   - Changes to `docs/privacy-policy.md` must also go in those pages (`privacy.html`, `privacy-ar.html`,
     and the `delete-account` pages if deletion changes) on the `gh-pages` branch. All four
     match the policy and the app as of 2026-11-20, reminders and app lock included.
   - Every Play Console answer, plus the listing text, graphics and release steps, is in
     `docs/play-store.md`. Keep that file in step with Play Console.
   - **Closed test:** build 4 is out to the testers group (2026-11-21). Keep 12+ testers opted in for 14 days in
     a row before applying for production.

---

iOS and App Store work is in `TODO-apple.md`.
