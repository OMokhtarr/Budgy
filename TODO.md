# Budgy — TODO

## Backlog

- [ ] **Next release: recurring transactions, phone reminders and app lock.** All three work on Android and
      were checked on a device (2026-11-20); iOS is in `TODO-apple.md`.
  - [ ] Raise `versionCode`, then put it in the draft's heading and release name in `RELEASE-NOTES.md`. The
        draft is written for the release that turns on Budgy Pro; if this one goes out first, take the Pro lines out.
  - [ ] Enter the new lines of both full descriptions (`docs/play-store.md`) in Play Console with that release.
- [ ] **SMS import** (Android only; `docs/superpowers/specs/2026-11-03-sms-import-design.md`). Works in debug
      builds and was checked on a device (2026-11-20), including several texts at once, money back and combining.
      Before it goes into a release:
  - Recheck Play's live SMS policy.
  - Add `READ_SMS` to the main manifest.
  - Play Permissions Declaration Form and Data safety form.
  - Short demo video.
  - A bank-texts line in both full descriptions (part of Budgy Pro), and a `RELEASE-NOTES.md` section covering
    money back, several texts at once and combining.

---

## Your work (needs your accounts, devices or decisions)

1. [ ] **Budgy Pro setup** (spec §11, `docs/superpowers/specs/2026-11-19-budgy-pro-subscription-design.md`).
   RevenueCat and the Play products are set up; their details are in `docs/play-store.md` → "Other declarations
   and setup".
   - [ ] **RevenueCat paywall** for `default`, in Arabic and English. With the phone in English and Budgy in
     Arabic, check it reads right to left (Android 13+; older versions keep the paywall left to right).
     RevenueCat writes its own price variables in Arabic-Indic digits (٦٠٫٩٩) for Arabic in Egypt. For Western
     digits, the Arabic texts use the prices Budgy passes in: `{{ custom.price_monthly }}`,
     `{{ custom.price_yearly }}` and `{{ custom.price_lifetime }}` (e.g. `{{ custom.price_monthly }}/شهر`). Give
     each a default in the dashboard (shown if Budgy can't read the prices). The trial line follows the selected
     plan, so it needs per-plan text to use them.
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
     and the `delete-account` pages if deletion changes) on the `gh-pages` branch. All four
     match the policy and the app as of 2026-11-20, reminders and app lock included.
   - Fill in Google Play's **Data safety** form to match the privacy policy. Every answer, plus the
     listing text, graphics and release steps, is in `docs/play-store.md`. Keep that file in step with
     Play Console.
   - **Closed test:** the testers group exists. Next, publish a build to the closed testing track for that
     group, then keep 12+ testers opted in for 14 days in a row before applying for production.

---

iOS and App Store work is in `TODO-apple.md`.
