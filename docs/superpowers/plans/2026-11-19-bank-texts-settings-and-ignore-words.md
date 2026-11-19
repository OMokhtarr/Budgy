# Bank Texts Settings and Ignore Words Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every bank texts setting from Settings onto the Bank texts page and add ignore words that make scans skip texts.

**Architecture:** The keyword list helpers and the "text contains a keyword" check become generic and serve both sender keywords and ignore words. `scanInbox` takes the ignore words and clears waiting texts that match them. The permission logic moves out of `SmsSettingsSection` into a hook, which the Bank texts page uses for its "off" state and its new settings sheet.

**Tech Stack:** React + Ionic, Capacitor, Dexie, i18next, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-bank-texts-settings-and-ignore-words-design.md`

## Global Constraints

- Ignore words stay on this phone only: `smsImport.ignoreWords` (optional `string[]`), never backed up or synced.
- Matching: the text's body contains the word, ignoring case (`toLocaleLowerCase('en')`, like senders). Blank words never match.
- Every new or changed string goes in both `en.json` and `ar.json`.

## Review Focus

- Adding an ignore word while texts are waiting removes the matching ones right away, not only at the next scan.
- Permission revoked in Android settings while reading is on: when the app comes back on the Bank texts page, reading turns off and the page shows the off state (it used to be the Settings section's resume check).
- An Arabic ignore word (e.g. `عرض`) matches an Arabic body. Mixed-case Latin words match in any case.
- The Bank texts page no longer redirects away when reading is off. It still redirects when SMS isn't available.
- Scan sheet "no permission" alert no longer sends people to Settings.

---

### Task 1: Generic keyword helpers and ignore words in the scan

**Files:**
- Rename: `src/features/sms/senderList.ts` → `src/features/sms/keywordList.ts`, and its test to `keywordList.test.ts`
- Modify: `src/features/sms/parser/senders.ts`, `src/features/sms/scan.ts`, `src/features/sms/useInboxScan.ts`, `src/core/contexts/SettingsContext.tsx` (`SmsImportSettings`)
- Test: `src/features/sms/keywordList.test.ts`, `src/features/sms/scan.test.ts`

**Interfaces:**
- Produces: `addKeyword(list, keyword): string[]`, `removeKeyword(list, keyword): string[]` (were `addSender`/`removeSender`).
- Produces: `containsKeyword(text: string, keywords: string[]): boolean` in `parser/senders.ts`. `matchesSender` delegates to it.
- Produces: `scanInbox(opts: { since: number; senders: string[]; ignore?: string[] }, deps)`, which skips texts whose body contains an ignore word.
- Produces: `clearIgnoredPending(ignore: string[], database?: BudgyDB): Promise<void>`, exported. It deletes waiting texts the parser ignores or whose body contains an ignore word.
- Produces: `SmsImportSettings.ignoreWords?: string[]`.

- [ ] Rename the helpers and update callers. Add `containsKeyword` tests: `containsKeyword('Get 20% OFF now', ['off'])` is true, `containsKeyword('عرض خاص', ['عرض'])` is true, `containsKeyword('x', ['  '])` is false.
- [ ] Add scan tests that fail before the change:
  - `run([msg(), msg({ id: '2', date: +1, body: DEBIT + ' Promo' })], ['cib'], ['PROMO'])` adds 1.
  - A waiting text whose body has an ignore word is removed by `run([], ['cib'], ['promo'])`.
  - `clearIgnoredPending(['promo'], database)` removes it directly.
- [ ] Implement. `useInboxScan` passes `ignore: latest.current.ignoreWords ?? []`.
- [ ] `npx vitest run src/features/sms` passes. Commit.

### Task 2: Settings on the Bank texts page

**Files:**
- Create: `src/features/sms/useSmsPermission.ts` (the permission state and the turn-on flow, lifted from `SmsSettingsSection`)
- Create: `src/features/sms/SmsSettingsSheet.tsx` (an `IonModal` `b-sheet-modal` like `ScanSheet`, with the section's list inside, plus ignore words)
- Delete: `src/features/sms/SmsSettingsSection.tsx`
- Modify: `SmsReviewPage.tsx`, `SettingsPage.tsx` (drop the section), `AppMenu.tsx` (show when available; badge only when enabled), `LinkedNumbersPage.tsx` (`defaultHref="/sms"`, doc comment), `ScanSheet.tsx` (the no-permission alert turns reading off and has only Close), `en.json`, `ar.json`

**Interfaces:**
- Produces: `useSmsPermission(): { permission?: PermissionState; refused: boolean; checkFailed: boolean; toggleKey: number; turnOn: () => void }`. It runs the check on mount and on resume, turns reading off when permission is gone, and is mounted once by `SmsReviewPage`, which passes it to the sheet.
- Produces: `<SmsSettingsSheet isOpen onClose perm={ReturnType<typeof useSmsPermission>} />`.

- [ ] `useSmsPermission` + sheet: the read switch, auto scan, notes, permission row, sender chips, **ignore words** chips (alert to add; adding calls `clearIgnoredPending` with the new list), hint, linked numbers row.
- [ ] Page: a gear `IonButton` (`settingsOutline`) in the toolbar end slot opens the sheet. Redirect only when `available === false`. When reading is off, show the `b-empty` state with `sms.offTitle`, `sms.offBody`, a **Turn on** button (`sms.turnOn`) calling `perm.turnOn`, and the denied/error notes.
- [ ] Strings (en/ar):
  - `sms.settingsTitle` "Bank texts settings"
  - `sms.offTitle` "Read your bank texts"
  - `sms.offBody` "Budgy can read your bank's texts and turn them into transactions for you to review."
  - `sms.turnOn` "Turn on"
  - `sms.ignoreWords` "Ignore texts with"
  - `sms.addIgnoreTitle` "Ignore texts with this word"
  - `sms.addIgnorePlaceholder` "e.g. offer or promo"
  - `sms.ignoreHint` "Texts that contain any of these words are skipped."
  - `sms.scanNoPermission`: drop the Settings path; reword to "…To allow it again, tap Turn on."
  - `sms.disclosureBody`: "the senders you list below" → "the senders you list"
- [ ] `npx tsc --noEmit` and `npx vitest run` pass. Commit.
