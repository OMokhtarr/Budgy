# Bank texts settings on the Bank texts page, and ignore words

## Intent
Everything about reading bank texts lives on the Bank texts page instead of Settings, and the user can list
words that make the app skip a text (promos, notices from their bank they never want to review).

## Goals
- Bank texts is always reachable on Android (menu), even before reading is turned on.
- Off: the page explains the feature and offers **Turn on** (same disclosure + permission flow as today,
  including the "not allowed" note after a refusal and the error note when the check fails).
- On: a gear button in the toolbar opens a settings sheet with the Read bank texts switch, Auto scan,
  permission status, sender keywords, **ignore words**, and Linked numbers.
- Settings loses its "Import from SMS" section. Linked numbers' back goes to `/sms`.
- Ignore words: chips like sender keywords; per device (stored in `smsImport`, not synced); a text whose
  body contains any word (ignoring case) is skipped by scans, and texts already waiting that match are
  removed when a word is added and on every scan.

## Non-goals
- Syncing ignore words across devices. Matching on sender or regex/whole-word matching.

## Approaches
- A: keep only the on/off switch in Settings, rest on the page. Rejected by the user: they want all of it on the page.
- **B (picked):** page always shown on Android with an "off" state that turns reading on; all settings in a sheet on the page.

## Left to the builder
- Exact copy, the sheet component (reuse the existing sheet style), the onboarding tour step wording.
