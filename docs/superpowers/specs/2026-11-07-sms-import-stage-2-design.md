# SMS import, stage 2: the import itself — design

Date: 2026-11-07 · Status: draft for review

Builds on `docs/superpowers/specs/2026-11-03-sms-import-design.md` (the "main spec") and the finished
stage 1 (`docs/superpowers/plans/2026-11-03-sms-import.md`). Read the main spec first: everything it
decided still holds unless this document says otherwise.

## Why now

Stage 1 shipped the parser, the native `SmsInbox` plugin and the Settings section, but nothing in the
app calls the parser or `list()`, so users can't import anything yet. Stage 2 was waiting for sync's
data model. That has landed: UUID ids, `updatedAt`, soft delete (`deletedAt`), the `dirty` mark and
the write hooks in `src/core/db/db.ts`, plus generic jsonb sync tables in Supabase.

## Goals

1. Scan the inbox on demand over a period the user picks, and turn bank texts into pending items.
2. A "Bank texts" review screen: Confirm or Dismiss on the card; tap to open the editor pre-filled,
   with the original message shown above it; unreadable texts show as "Couldn't read this one".
3. Learning: masked digits → account and merchant → category, suggested next time.
4. **Learned links and rules sync to the cloud** (user's decision, 2026-11-07), and go in backups.
5. "Linked numbers" in Settings, to fix or remove what Budgy learned.
6. Never import a text twice: across overlapping scans, a reinstall, a restore or a second phone.
7. A "Looks like you already added this" prompt when a confirmed text matches a hand-entered one.
8. **Fix the five deferred stage 1 issues** (user's decision, 2026-11-07), listed below.

## Non-goals

- Anything stage 3 covers: moving `READ_SMS` to the main manifest, Play forms, privacy policy text,
  the demo video. The feature stays debug-build only.
- Creating transfers from texts (main spec non-goal). A text arrives as an expense or income; the user
  can change the type in the editor.
- Background reading, iOS, web (main spec non-goals).
- An editor for merchant → category rules. They're overwritten by the user's next choice, so a wrong one
  fixes itself. Only the links get a screen.
- Shipping bank templates. `BANK_TEMPLATES` stays empty.

## Anti-goals

- **Message text leaving the phone.** The user agreed to sync links and rules only because the messages
  themselves don't leave the phone. Raw text, pending items and seen records are never synced, never
  backed up and never put in a transaction. Only the fingerprint (a one-way hash) travels, on the
  confirmed transaction.
- **Silently wrong numbers** (main spec): one-tap Confirm only when the amount, direction and currency
  were all read. The amount is never relabelled into another currency: USD 20 is never saved as EGP 20.
- **Double counting** (main spec).

## Constraints

- Android debug builds only, as gated by stage 1 (`useSmsAvailable`). The review screen, menu item and
  Linked numbers must not render anywhere else.
- **Data model:** follow `db.ts`. Synced tables get UUID ids, `updatedAt`, `deletedAt` and `dirty`
  through `stampWrites`; reads filter with `alive`; deletes use `softDelete`. Add the new tables and
  indexes as Dexie `version(2)` of `budgy2`.
- **Sync:** `src/core/cloud/sync.ts` loops over `SYNCED_TABLES`, and the cloud keeps each record's fields
  in `data` jsonb. Adding the two learned tables means adding them to `SYNCED_TABLES`, to
  `writeFromCloud`'s table list, and to a new Supabase migration that creates `sms_links` and
  `merchant_rules` (the cloud table names can differ from Dexie's) with the same shape, trigger,
  indexes, RLS and grants as the existing ones. Extend `src/test/supabase-schema.test.ts` to match.
  **The migration must be deployed before any build with this code reaches users.** Release builds
  sync these tables too, even though they're empty there, and a missing table would break sync. That
  deploy is the user's job (Supabase access), so the plan ends with it as a handover step.
- **Transactions:** a new optional `smsFingerprint?: string` on `Transaction`. It syncs and goes in
  backups like any field (jsonb, so no server change). Index it in Dexie.
- **Backups:** `BackupFile` becomes version 6 with optional `smsLinks` and `merchantRules` arrays.
  `importBackup` restores them when present, and older files restore with none. `eraseAll` also clears
  the four SMS tables. Pending and seen records are never in a backup.
- i18n in `en.json` and `ar.json`; code style as in the stage 1 plan.

## What the user decided (this round)

- Learned links and rules sync to the cloud. Messages don't.
- Stage 1's deferred fixes are part of stage 2.
- **A text in a currency the account doesn't hold is recorded in that currency**, e.g. a "USD 20.00"
  Netflix text on an EGP-only card is saved as USD 20 on that card. The user can update it later, for
  example to the EGP amount on their statement. This replaces the main spec's rule that such texts
  can't be quick-confirmed.

## Data

Four new Dexie tables. Shapes are a starting point; the builder may adjust names.

| Table | Synced | In backup | Holds |
|---|---|---|---|
| `smsPending` | no | no | One text waiting for review: SMS `_id`, sender address, received time, full body, fingerprint, and the parsed fields (`status`, amount, currency, direction, merchant, digits). |
| `smsSeen` | no | no | One text the user dismissed or skipped as a duplicate: fingerprint, outcome (`dismissed` / `duplicate`), and when. Imported texts aren't here; their transaction's fingerprint marks them. |
| `smsLinks` | yes | yes | Sender + digits → `accountId`. |
| `merchantRules` | yes | yes | Merchant key + flow → `categoryId` (and `subcategoryId` if one was picked). |

- The local-only tables are plain tables, without the sync hooks.
- **Deterministic ids for links and rules:** a link's id is a UUID made from a hash of its key, and so
  is a rule's. Two phones that learn the same link then write the same record, and "last edit wins"
  settles it. The id generator lives next to `newId` in `src/core/utils/id.ts`.
- **Suggestions are worked out when the screen shows them**, not stored on the pending item. A link
  learned on one card then shows up straight away on the other cards from the same card number.

## Flows

### Scan

The "Scan inbox" button sits on the review screen and opens the period sheet from the mockup
(`.superpowers/brainstorm/1874-1793678344/content/settings-and-scan.html`). "Since last scan" is the
default once `lastScanAt` exists. Then:

`SmsInbox.list({ since })` → keep texts whose sender matches the keywords (`matchesSender`) → skip any
whose fingerprint is in `smsSeen` or `smsPending`, or is on a transaction (including deleted ones, so a
deleted import doesn't come back) → `parseSms` → drop `ignored` → add the rest to `smsPending` → set
`lastScanAt` to the time the scan started.

Skipping goes by **fingerprint only**, never by the SMS `_id` alone (my call). Android can reuse an `_id`
after messages are deleted, and it changes ids when messages are restored. A new text landing on an old
`_id` would otherwise be dropped silently. The `_id` is kept for reference only.

**What counts as handled:** imported texts are known by the fingerprint on their transaction, which
syncs and goes in backups. `smsSeen` holds only texts the user dismissed or skipped as duplicates
(my call). So:

- After a **restore**, texts whose transactions aren't in the backup can be imported again, while
  dismissed ones stay dismissed. Pending items stay; their suggestions are worked out again from the
  restored links.
- On **sign-out with "remove data from this phone"** (`clearLocal`), and on `eraseAll`, `smsPending` and
  `smsSeen` are cleared too, so no message text is left behind.

The scan shows progress and ends with a short summary: "3 new texts", or "Nothing new". If the
permission was revoked, it explains that and points to Settings.

**Fingerprint:** SHA-256 (via `crypto.subtle`) of the sender and the received time (to the millisecond),
as hex. The body is deliberately left out: the fingerprint syncs on the transaction, and a hash of the
body would let anyone holding the cloud copy confirm guesses about the message (e.g. its balance). The
sender and time are already in the cloud (the link and the transaction's date), so this reveals nothing
new. (Changed 2026-11-08 after a security review.)

### Review screen ("Bank texts")

Follows the "A+B" mockup (`.../review-screen.html`). It's a new route, and the side menu item shows
the pending count. Newest first.

- **Understood card:** sender, `••digits`, date and time, amount (red out / green in), merchant, plus
  account and category chips filled from links and rules. A chip with nothing learned yet reads "Pick
  account" or "Pick category", and tapping a chip opens a picker. **Confirm** is enabled once an
  account and a category are chosen.
- **Currency the account doesn't hold** (user's decision): Confirm still works and saves the
  transaction in the text's currency. Before Confirm, the card shows a one-line note such as "Saved
  in USD. CIB Card holds EGP; you can change it later". The account then shows a separate USD line
  (`linesOf` in `src/core/utils/currency.ts` already shows a currency an account doesn't hold), and
  the totals convert it at the transaction's rate, as for any foreign-currency transaction.
- **Unreadable card:** "Couldn't read this one", the message text, **Dismiss** and **Fill in…**.
- **Tap a card** (outside the buttons) to open the editor.
- **Dismiss:** the item goes to `smsSeen` as `dismissed` and its body is deleted.

### Confirm (card or editor)

1. **Duplicate check:** a live transaction with the same type, amount, currency and account on the same
   local day, with no `smsFingerprint`, prompts "Looks like you already added this". **Keep both**
   saves as usual. **Skip** saves nothing and records the text in `smsSeen` as `duplicate`.
2. **Save** the transaction with `smsFingerprint`, the text's received time as `date`, and the merchant
   as `note` (cut to the note's 120-character limit). For expenses and income in a foreign currency, the
   exchange rate follows the same rule as the editor (`rateToSave`).
3. **Learn:** upsert the link from the text's sender + digits to the chosen account. A text with no
   digits makes a sender-only link (my call). Suggestions look up sender + digits for texts with
   digits, and the sender-only link only for texts without digits. If the text had a merchant, upsert
   the rule from the merchant + flow to the chosen category.
4. **Resolve:** delete the pending item, and with it the body. The fingerprint now on the transaction
   marks the text as imported.

Card Confirm and the editor's ✓ must build the record the same way. Move the record-building part of
`TransactionEditor.save` into a shared function that both call, rather than copying it.

### Editor pre-fill

`EditorInit` (`src/core/contexts/TxEditorContext.tsx`) gains:

- `amount`, `currency`, `date` (full ISO), `note`
- `header?: ReactNode`, for the message shown above the sheet
- `smsFingerprint?: string`
- `onSaved?(tx)`, called after a successful save, which the review screen uses to learn and resolve

When the editor opens from a text:

- The type follows the direction: `out` → expense, `in` → income, unknown → expense. The user can switch
  between expense, income and transfer.
- The account and category come from links and rules, when there are any.
- If the user leaves the day alone, the text's own time is kept. Today the editor would put in the
  current time.
- Closing the editor without saving leaves the item pending.
- **The text's currency stays, even when the account doesn't hold it.** Today the editor keeps a
  currency the account doesn't hold only for an existing transaction (the `keep(...)` logic in
  `TransactionEditor.tsx`). Otherwise it falls back to the account's currency, which would turn USD 20
  into EGP 20. Extend `keep` to the pre-filled currency, and keep it when the user switches accounts.
  The currency key then offers the account's currencies as well, so the user can change it.

### Updating a foreign-currency import later

The "update later" path is the normal editor on the saved transaction, which already keeps the USD
choice (`keep`) and lets the currency key switch to EGP. Two small additions, both my calls:

- When the editor shows a transaction whose currency its account doesn't hold, one hint line says so
  ("CIB Card holds EGP. To match your statement, switch to EGP and enter the amount charged.").
- Changing the currency on that path keeps the rest of the record, including `smsFingerprint`, so the
  text is still known as imported.

### Linked numbers (Settings)

A "Linked numbers" row in the SMS section, showing a count, opens a list of `CIB ••4821 → CIB Card`.
Tap a row to pick another account; delete removes it (`softDelete`). A link whose account was deleted
or archived reads "Account removed" and is never suggested.

## Stage 1 fixes

1. **Merchant names pick up extra words.** "UBER using card \*\*4821" and "UBER is pending" should give
   `UBER`. Stop the merchant at words like `using`, `with`, `via`, `is`, `was`, `for`, `card`,
   `pending`, and at masked digits, plus their common Arabic equivalents. Cover these cases with tests.
2. **"from \*\*9999 to \*\*1234" takes the first masked number.** For `out`, use the digits next to
   "from" / `من`; for `in`, the ones next to "to" / `إلى` / `الى`. When neither is there, keep taking the
   first. Add tests.
3. **Templates have no currency fallback.** When a template's `currency` regex is missing or doesn't
   match, use the currency `findAmounts` finds attached to the template's amount.
4. **`SmsSettingsSection` errors.** If `requestPermissions` or `checkPermissions` fails, the switch stays
   off and a note says so. The `resume` listener is registered once, reading the current settings
   through a ref, and not again on every keyword change.
5. **Disclosure wording.** Replace "never the full message". The new text says: texts are read on this
   phone only; while a text waits for review its message is kept on this phone, and it's deleted once
   you confirm or dismiss it; Budgy keeps the amount, date, merchant and last digits; when you're signed
   in, the last digits and merchant names you link are saved to your account so other phones can use
   them. Both languages.

## My calls (not discussed with the user — check these)

- **Link key is the sender address, not the matched keyword.** The main spec keyed links by the
  matched keyword. But a broad keyword like `Bank` matches several banks, and then NBE `**4821` and
  Banque Misr `**4821` would collide. The sender address (case-folded) plus the digits avoids that.
  It's also unaffected when the user edits keywords. Texts with no digits use a sender-only link,
  which Linked numbers shows as "CIB · no number". Risk: a bank that sends texts without digits for
  several of the user's accounts will always suggest the last one picked. It's only a suggestion, and
  it shows on the card's chip before Confirm.
- **Merchant key:** the merchant text in upper case, with spaces collapsed and trailing branch or
  terminal numbers dropped, so "CARREFOUR MAADI 0231" and "Carrefour Maadi" share a rule.
- **Rules are per flow:** an income merchant and an expense merchant with the same name don't share a
  category.
- **Duplicate "Skip" counts as handled**, so the text doesn't come back on the next scan.
- **Deleted imports stay out:** a fingerprint on a deleted transaction still blocks a re-import. Deleting
  the transaction was the user saying no.
- **Review screen location:** the side menu, as the main spec said, between Data and Rate.
- **Default type for an unclear direction** in the editor is expense.

## Left to the builder

- Exact table and index names, route path and component split.
- The picker used by the card's chips (a sheet with the editor's `Bubble` grid is the obvious fit).
- Wording in both languages, within the meaning above.
- How the scan reports progress.
- Tests: the pure parts (fingerprint, deterministic ids, merchant key, duplicate match, scan filtering,
  record building, backup round-trip with links and rules, sync of the new tables against the
  in-memory remote in `sync.test.ts`) get unit tests. The screens get a manual check on a debug build.
