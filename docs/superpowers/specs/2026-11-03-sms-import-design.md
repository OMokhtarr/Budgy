# Import bank transactions from SMS — design

Date: 2026-11-03 · Status: draft for review

## Why

Most of the user's spending already arrives as bank text messages (Egyptian banks: CIB, NBE as
"Bank-AlAhly", others), in Arabic and English. Typing each one into Budgy by hand is the main
friction. Budgy should read those texts on demand, turn them into pending transactions, and let
the user confirm each one in a tap, or fix it in the editor they already know.

## Goals

- Turned on from Settings, with the SMS permission requested there, and with sender keywords the
  user types in (partial, case-insensitive match on the sender name).
- On-demand scan of the inbox (no background reading), over a period the user picks.
- A review list where texts Budgy understood can be confirmed or dismissed directly on the card,
  and any item (understood or not) can be opened in the existing keypad editor, pre-filled.
- Budgy learns: masked digits → account, merchant → category. It suggests them next time.
- A text is never imported twice (including after a reinstall, a restore, or on a second phone;
  see "Duplicates across reinstalls and phones").

## Non-goals

- iOS and web: Apple gives apps no SMS access, and there is no "paste a text" fallback. The
  whole feature is hidden on iOS and on the web/PWA.
- Background or automatic reading when a text arrives (`RECEIVE_SMS`). The scan runs only when
  the user starts it.
- Sending SMS, notification listeners, or reading bank apps.
- Creating transfers automatically (a text about moving money between own accounts comes in as
  an expense or income; the user can change the type in the editor).

## Anti-goals (would make this a failure even if it works). These are my calls; the user didn't name any.

- **Silently wrong numbers.** A wrong amount or direction saved with one tap is worse than no
  feature. Quick-confirm appears only when amount and direction were both read with confidence.
- **Double counting.** The user may have already entered a purchase by hand. On confirm, if a
  transaction with the same amount, the same account and the same day exists, Budgy asks
  "Looks like you already added this — keep both / skip".
- **Noise.** OTPs, promotions and balance-only notices never reach the review list.
- **Message content leaving the phone.** Raw message text is never synced or backed up.

## Constraints

- **Platform:** Android only. Budgy is Ionic React 8 + Capacitor 8 + Dexie 4, local-first.
- **Store:** Budgy will be on Google Play. `READ_SMS` is a restricted permission. Play lists
  "SMS-based money management" (budget-tracking apps) as a *temporary* exception that allows
  `READ_SMS`, granted case by case through the Permissions Declaration Form in Play Console. The
  page found on 2026-11-03 is a preview of the July 2026 policy update, so recheck the live policy
  before submitting. Play also requires a prominent in-app disclosure before the permission prompt
  and expects apps to keep only the SMS data they need.
  Sources: https://support.google.com/googleplay/android-developer/answer/9047303 ,
  https://support.google.com/googleplay/android-developer/answer/16585319
- **Release gating (user's decision):** Budgy's first Play release ships **without** SMS
  import. The feature arrives in a later update, once Google approves the Permissions
  Declaration. Until then, release builds must not contain `READ_SMS` in the merged manifest, and
  the Settings section must be hidden. So the plugin must not declare the permission itself.
  Instead, a single build switch adds the permission to the app manifest and turns the feature on
  in JS, and it's off by default for release builds. The builder picks the mechanism, for example
  a Gradle property feeding a manifest overlay plus a Vite env flag. Debug builds can turn it on
  for development and testing.
- **No native project exists yet.** `android/` has not been created and is listed in
  `.gitignore`. The project is not a git repo (both are already TODO items).
- **Sequencing with sign-in/sync:** the user is building sign-in and cloud sync (see the plan in
  `TODO.md`), and it lands **before** this feature's database work. So the new tables use that
  plan's Phase 1 conventions from the start: UUID ids, `updatedAt`, soft delete, and the next
  Dexie version after sync's. Work that doesn't touch the database can start now.

## What the user decided

### Settings → "Import from SMS" (Android only)

A new section in `SettingsPage`:

- **Read bank texts** switch. Turning it on shows a short disclosure screen (texts are read on this
  phone only; Budgy keeps the amount, date, merchant and last digits), then the Android permission
  prompt. If permission is denied, the switch stays off and the section explains how to allow it
  from Android settings. Turning it off stops scanning but keeps keywords and links.
- **Bank senders:** keywords the user adds and removes (e.g. `CIB`, `Bank-AlAhly`, `Bank`). A
  sender matches if its name contains any keyword, ignoring case.
- **Linked numbers:** list of masked digits → Budgy account. The user can fix or remove links
  Budgy learned.

### Scanning

- A **Scan inbox** button on the review screen opens a sheet: "Since last scan" (default once a
  scan has happened), Last 3 days, Last week, Last 2 weeks, Last month, Last 3 months,
  Last 6 months.
- Only texts from matching senders in that period are read. Texts already imported, dismissed or
  still pending are skipped, so overlapping scans are harmless.

### Review screen ("Bank texts")

Mockup: `.superpowers/brainstorm/*/content/review-screen.html` (the user chose "A+B").

- **Understood items:** card shows sender, masked digits, date, amount (red out / green in),
  merchant, suggested category and account chips. **Confirm** creates a normal transaction;
  **Dismiss** drops it. If no category could be suggested, the chip says "Pick category" and
  Confirm waits for a choice.
- **Tap the card** (anywhere but the buttons) opens the existing transaction editor sheet,
  pre-filled with whatever was read, with the original message shown above it. Saving there
  resolves the item.
- **Unreadable items** (sender matched but amount or direction couldn't be read with confidence):
  card says "Couldn't read this one" and shows the message text. Actions: **Dismiss** and
  **Fill in…** (opens the editor with any partial guesses, e.g. an amount).

### Identifying the account

Texts may mask either the **card** number or the **account** number. Treat any masked digits
(e.g. `**4821`, `xx4821`, `ending 4821`, Arabic equivalents) as an identifier linked to a Budgy
account. One Budgy account can have several identifiers. The first time an identifier appears the
user picks the account; afterwards it is suggested.

### Learning

On confirm (on the card or via the editor), remember merchant → category and identifier →
account, and suggest them next time.

## My calls (not discussed with the user — check these)

- **Where the review screen lives:** a "Bank texts" item in the side menu (`AppMenu`), shown only
  on Android when the feature is on, with a count of pending items.
- **Message text retention:** the full text is stored only while an item is pending (needed to
  show unreadable items and the editor header) and deleted when it's confirmed or dismissed.
  Confirmed transactions keep extracted fields only; the merchant goes into the transaction's
  `note`.
- **Duplicate detection:** remember each text by the Android SMS `_id` plus a fingerprint (hash
  of sender + timestamp + body), so a changed `_id` (e.g. after restoring messages) doesn't cause
  re-imports. The fingerprint is a hash; it doesn't keep the body.
- **Duplicates across reinstalls and phones:** a confirmed transaction carries the text's
  fingerprint in an optional field (e.g. `smsFingerprint`), which syncs and goes in backups like
  any transaction field. The scan treats any fingerprint found on a transaction as already
  imported, so a reinstall, a restore or a second phone doesn't bring confirmed texts back.
  Dismissed texts are remembered on that device only, so they can reappear on a new phone. This
  field should be agreed with the sync work while its schema is being defined.
- **Filtered out without showing:** OTP / verification codes, promotions, balance-only notices.
- **Currency:** if the text's currency is one of the matched account's currencies, use it.
  Otherwise the item can't be quick-confirmed and must go through the editor.
- **Parsing approach:** per-bank templates kept as data (sender pattern + regexes for amount,
  currency, direction, merchant, digits, date), plus a generic fallback for unknown banks (amount
  + currency patterns, Arabic/English debit/credit keyword lists, masked-digit patterns). Arabic
  digits are normalized (the app's `parseNumber` already handles them). An item counts as
  "understood" only when amount and direction both come from a template or an unambiguous match.
- **Native code:** a small local Capacitor plugin kept in the repo (e.g. `plugins/sms-inbox/`,
  referenced from `package.json` with `file:`), so it survives regenerating `android/`. It
  exposes permission check/request and a `list({ since })` that queries the SMS inbox from that
  date; matching senders against keywords happens in JS.
- **Sync & backup:** pending items and the "seen" records stay on the device (not synced, not in
  backups). Identifier → account links and merchant → category rules go in backups. This feature
  needs only sync's Phase 1 data-model changes, not the backend. Links and rules stay local until
  sync adds them as tables of its own; that server work belongs to the sync plan, not this one.
  Their ids should come out the same on every phone (e.g. derived from the key), so two phones
  that learn the same link don't create conflicting records. The SMS settings (enabled, keywords,
  last scan) are per-device and not backed up.
- **Link key:** an identifier is the matched sender keyword plus the masked digits (so CIB
  `**4821` and NBE `**4821` are different), with the sender alone as a fallback for texts that
  carry no digits. The real sample texts may refine this.
- **Editor changes:** `EditorInit` (`src/core/contexts/TxEditorContext.tsx`) currently takes type,
  category, accounts, or an existing transaction. It needs amount, currency, date and note
  pre-fill, a header slot for the message, and a way to tell the review screen the item was saved.
  Confirming on the card should save through the same code path as the editor, so it picks up
  whatever sync adds (`updatedAt`, UUIDs).

## Build order

1. **Now (independent of sync):** create the Android project; native SMS plugin; parser with
   templates, generic fallback, OTP/promo filters and unit tests; the Settings section (switch,
   disclosure, permission, keywords).
2. **After sync's Phase 1 data-model changes land:** new Dexie tables (pending items, seen
   records, identifier links, merchant rules), scan flow, review screen, confirm/dismiss,
   learning, linked-numbers editor, duplicate-with-manual-entry warning.
3. **Before the SMS update (not the first release):** turn the build switch on, then Play Permissions Declaration Form, Data safety form, privacy policy wording
   for SMS, and a short demo video of the feature (Play usually asks for one with the declaration).

## Left to the builder

- Exact table shapes, indexes and names, following sync's conventions.
- UI details and wording (both languages), within the mockups' layout.
- How templates are stored and loaded, and which banks get templates first.
- Test strategy for the parser, using anonymized fixture texts.

## Parsing strategy (user's decision, 2026-11-03)

No per-bank sample texts will be collected: users bank with many different banks, so Budgy can't
ship a template for each. The **generic reader is the primary parser** and must cover common
English and Arabic wording broadly. When it isn't sure, the text still reaches review as
"Couldn't read this one" (never a wrong quick-confirm, never silently lost). The template list
stays as an optional mechanism, empty by default. Per-user learning in stage 2 (merchant →
category, digits → account) adapts suggestions to each user's banks.
