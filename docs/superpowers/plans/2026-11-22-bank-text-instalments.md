# Instalments from Bank Texts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirm a credit card bank text as instalments from its card (full price or one monthly instalment), and catch a later text that matches an instalment already recorded.

**Architecture:** Extend the existing plan logic (`instalments.ts`) with a "starts at instalment n" mode, add a switch to the shared `InstalmentSheet`, put an Instalments chip on `SmsItemCard`, and extend the existing duplicate lookup/prompt with an instalment match that links the text to that instalment.

**Tech Stack:** React + Ionic, Dexie (IndexedDB), i18next (en/ar), Vitest with fake-indexeddb (`@/test/setup-db`).

**Spec:** `docs/superpowers/specs/2026-11-22-bank-text-instalments-design.md` (builds on `2026-11-21-card-instalments-design.md`).

## Global Constraints

- Months stay 2–60 (`MIN_MONTHS`/`MAX_MONTHS`); in "one instalment" mode n is 1..N.
- Every new string in both `src/core/i18n/locales/en.json` and `ar.json`.
- Verify with `npm test` and `npm run typecheck` only. Never run `npm run build`, vite, `cap`, or Gradle unless the user asks.
- Instalment entries are expenses on a credit card; earlier instalments of a plan started before Budgy are never added.
- Matching never adds a second charge unless the user taps "Add anyway".
- Commit on branch `feat/bank-text-instalments`; integration is by PR.

## Review Focus

1. A second text for the same month after "Already recorded" → must not match the now-linked instalment again (Task 4 test).
2. Instalment 1 of a plan made from a bank text carries the purchase's fingerprint → never matched (Task 4 test).
3. "One instalment" mode on the last one (12 of 12) → saves exactly one entry, nothing still to come, no error (Task 1 test).
4. Typing n greater than N in the sheet → Done disabled (Task 1 `parseFirst` test).
5. Switching the text card's account from a credit card to a bank account after choosing instalments → Confirm saves a single purchase (Task 6 `canInstalText` test).

---

### Task 1: Plans that start at instalment n

**Files:**
- Modify: `src/features/accounts/card/instalments.ts`
- Test: `src/features/accounts/card/instalments.test.ts`

**Interfaces:**
- Produces:
  - `PlanOptions.first?: number`: the n of the saved entry. Unset means split the full price.
  - `planParts(amount: number, months: number, currency: string, first?: number): number[]`: `splitAmount(amount, months, currency)` when `first` is unset, otherwise `amount` repeated `months - first + 1` times.
  - `parseFirst(typed: string, months: number | undefined): number | undefined`: a whole number from 1 to `months`, in any digits. Undefined when `months` is undefined.
  - `toPlanOptions(choice: { months: number; first?: number; fee?: number; autoPayFrom?: string }, card: Account, categories: Category[], feeNote: string): PlanOptions`: spreads `choice`, sets `feeCategoryId` to the live category with `key === 'bills'`, and sets `credit: card.credit!`.

- [ ] **Step 1: Write the failing tests** in `instalments.test.ts`:
  - `planParts repeats the amount from instalment n`: `planParts(1000, 12, 'EGP', 3)` has length 10 and every element is 1000. `planParts(1000, 3, 'EGP')` equals `[333.33, 333.33, 333.34]`.
  - `parseFirst takes 1..months`: `parseFirst('3', 12)` is 3, `parseFirst('٣', 12)` is 3, and `parseFirst` returns undefined for `['', '0', '13', '2.5']` with 12, and for `'3'` with undefined.
  - `createPlan from instalment 3 of 12 adds 3..12 at the amount`: `createPlan(purchase, { months: 12, first: 3, feeNote: '', credit }, database)`. There are 10 live rows, every amount is 1000, the `n` values are `[3..12]`, every `of` is 12, the first date is the purchase date, and the second date falls in the next month.
  - `createPlan on the last instalment saves just that one`: `first: 12` gives 1 row with n 12 and no recurring rows.
  - `automatic payment covers only the instalments added`: with `first: 3, months: 12, autoPayFrom: 'bank'`, the recurring rules cover 10 payments. Sum the months from `start` to `until` per rule.
  - `convertToPlan from instalment 3 keeps its amount`: a saved 1000 purchase converted with `first: 3` keeps its id and amount 1000, gets `n: 3`, and there are 10 rows in all.
  - `toPlanOptions picks Bills and the card's settings`: with categories `[{ id: 'b', key: 'bills', kind: 'expense' }, …]` it returns `feeCategoryId: 'b'` and `credit` equal to the card's.

- [ ] **Step 2: Run and see them fail**
  Run: `npx vitest run src/features/accounts/card/instalments.test.ts`
  Expected: FAIL (`planParts`/`parseFirst`/`toPlanOptions` not exported, and the `first` rows are wrong).

- [ ] **Step 3: Implement.** In `createPlan`/`convertToPlan`, use `planParts(amount, o.months, currency, o.first)` and save the first entry as `n: o.first ?? 1`. In `addRest`, date the entries with `instalmentDates(first.date, parts.length)` (not `o.months`), and number the rest `start + i + 1`, where `start = o.first ?? 1`. `paymentRules` already works over `parts`/`dates`, so pass it the same arrays. Add the fee only when `(o.first ?? 1) === 1`.

- [ ] **Step 4: Run and see them pass**
  Run: `npx vitest run src/features/accounts/card/instalments.test.ts`
  Expected: PASS, including the existing tests.

- [ ] **Step 5: Commit**: `git commit -am "Let an instalment plan start at instalment n"`

### Task 2: Card page counts instalments from before Budgy

**Files:**
- Modify: `src/core/utils/creditCard.ts` (`instalmentPlans`, and the doc comments on `InstalmentPlan.first`/`charged`)
- Test: `src/core/utils/creditCard.test.ts`

**Interfaces:** `InstalmentPlan` shape unchanged. `first` is now "the earliest entry the plan has".

- [ ] **Step 1: Failing test** `instalmentPlans counts instalments before the first entry as charged`: entries n 3, 4 and 5 of 5, using the existing `inst(1000, date, n, 5)` helper, dated 26 Nov 2026, 26 Dec 2026 and 26 Jan 2027, with today 28 Nov 2026. Expect `charged: 3` and `toCome: 2000`.
- [ ] **Step 2:** `npx vitest run src/core/utils/creditCard.test.ts`. Expected: FAIL (`charged` is 1).
- [ ] **Step 3:** `charged = first.instalment.n - 1 + (list.length - future.length)`.
- [ ] **Step 4:** Run again. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -am "Count instalments from before Budgy on the card page"`

### Task 3: The sheet's "full price / one instalment" switch, and the editor

**Files:**
- Modify: `src/features/transactions/InstalmentSheet.tsx`, `src/features/transactions/TransactionEditor.tsx:334-343` and the chip at `:696-701`, plus `src/core/i18n/locales/en.json` and `ar.json` (the `instalments` block)

**Interfaces:**
- Consumes: `planParts`, `parseFirst`, `toPlanOptions` (Task 1).
- Produces:
  - `InstalmentChoice.first?: number`, set only in "one instalment" mode.
  - `instalmentChipLabel(t: TFunction, c: InstalmentChoice): string`, exported from `InstalmentSheet.tsx`. It returns `instalments.chipFrom` (`"{{n}} of {{of}}"`) when `first` is set, otherwise the existing `instalments.chipOn`.

- [ ] **Step 1: Sheet.** Put a segmented switch first (`instalments.amountIs`: "This amount is", `instalments.fullPrice`: "The full price", `instalments.oneInstalment`: "One monthly instalment"), defaulting to full price, or to the `value`'s mode when reopened. Full price mode is unchanged. Instalment mode shows two number inputs, "Instalment [n] of [N]" (`instalments.which`), defaulting to 1 of 12. `N` uses `parseMonths` and `n` uses `parseFirst`. The hint is `instalments.totalLeft`: "= {{total}} total · {{left}} still to come", where total = amount × N and left = amount × (N − n), each `roundTo`'d. Show the fee field only in full price mode or when n is 1, and send `fee` only then. Done is disabled unless both numbers parse.
- [ ] **Step 2: Editor.** Replace the inline `options` object with `toPlanOptions(instalPlan, account, expenseCats ?? [], t('instalments.feeNote', …))` and the chip text with `instalmentChipLabel`.
- [ ] **Step 3: Copy.** Add the five keys above to `en.json` and `ar.json`. The Arabic should read naturally, in the same tone as the existing `instalments` entries.
- [ ] **Step 4: Verify**
  Run: `npm run typecheck && npm test`
  Expected: no type errors; all tests pass.
- [ ] **Step 5: Commit**: `git commit -am "Ask whether the amount is the full price or one instalment"`

### Task 4: Find and link an instalment a text matches

**Files:**
- Modify: `src/features/sms/duplicate.ts`, `src/features/sms/learning.ts`, `src/features/sms/batch.ts`
- Test: `src/features/sms/duplicate.test.ts`, `src/features/sms/learning.test.ts`, `src/features/sms/batch.test.ts`

**Interfaces:**
- Produces (in `duplicate.ts`):
  - `type Duplicate = { kind: 'manual' | 'instalment'; tx: Transaction }`
  - `findInstalmentMatch(d: DupeQuery, database?): Promise<Transaction | undefined>`, where `DupeQuery = Pick<TxDraft, 'type' | 'amount' | 'currency' | 'accountId' | 'date'>`. It matches a live `type: 'expense'` row that has `instalment` set and no `smsFingerprint`, with the same accountId, amount and currency, where the account is a credit card (`isCreditCard`) and `statementFor(card.credit, rowDate).statementOn` is the same day as `statementFor(card.credit, textDate).statementOn`. When several match, it returns the one dated nearest the text. Only expense drafts are checked.
  - `findDuplicate(d: DupeQuery, database?): Promise<Duplicate | undefined>`: tries `findManualDuplicate` first, then `findInstalmentMatch`.
- Produces (in `learning.ts`): `skipDuplicate(item: SmsPending, match: Duplicate | undefined, database?): Promise<void>`. For an instalment match, it sets `smsFingerprint: item.fingerprint` on that row and calls `resolveImported(item, updatedRow)`, both in one Dexie transaction. Anything else gets `resolveSkipped(item, 'duplicate')`.
- Changes (in `batch.ts`): `duplicatesOf(...)` now returns `Promise<Map<string, Duplicate>>`, keyed by fingerprint and using `findDuplicate`.

- [ ] **Step 1: Failing tests** in `duplicate.test.ts`. Add a credit card account `card` with `{ statementDay: 25, dueDay: 20 }`; the existing tests stay. A text is dated 25 Nov 2026 for 1000 EGP on `card`.
  - `matches an instalment in the same statement cycle`: an instalment row dated 3 Nov returns `{ kind: 'instalment' }` with that id.
  - `not one in another cycle`: a row dated 27 Nov (next cycle) gives undefined.
  - `not instalment 1 of a bank-text plan, nor one already linked, nor a deleted one`: rows with `smsFingerprint` or `deletedAt` give undefined.
  - `nearest wins`: rows dated 1 Nov and 20 Nov (the cycle runs 26 Oct–25 Nov, since `cycleOf` counts the statement day in its own cycle, so both are in it) return the 20 Nov one.
  - `a hand-entered same-day match comes first`: a manual row on 25 Nov plus an instalment on 3 Nov returns `kind: 'manual'`.
  - `income is never matched to an instalment`.
- [ ] **Step 2: Failing tests** in `learning.test.ts`: `skipDuplicate links the text to the instalment`. Afterwards the instalment's `smsFingerprint` is the text's, the pending item is gone, and `findInstalmentMatch` for the same text gives undefined. `skipDuplicate without a match records it as a duplicate` (an `smsSeen` row with outcome `'duplicate'`). In `batch.test.ts`, update the `duplicatesOf` assertions from Set to Map and add one instalment match whose value has `kind: 'instalment'`.
- [ ] **Step 3:** `npx vitest run src/features/sms`. Expected: the new tests FAIL.
- [ ] **Step 4:** Implement the interfaces above. Keep `findManualDuplicate` as it is.
- [ ] **Step 5:** `npx vitest run src/features/sms`. Expected: PASS.
- [ ] **Step 6: Commit**: `git commit -am "Match a bank text to an instalment already recorded"`

### Task 5: Prompts use the instalment match

**Files:**
- Modify: `src/features/sms/useDuplicatePrompt.ts`, `src/core/contexts/TxEditorContext.tsx:41`, `src/features/transactions/TransactionEditor.tsx:296-304`, `src/features/sms/SmsItemCard.tsx` (`confirm`, `onSkipped`), `src/features/sms/SmsReviewPage.tsx:204-212` and `:333-346`, plus the `sms` block of `en.json`/`ar.json`

**Interfaces:**
- Consumes: `findDuplicate`, `Duplicate`, `skipDuplicate`, and the Map from `duplicatesOf` (Task 4).
- Produces: the `useDuplicatePrompt()` callback returns `Promise<{ choice: DuplicateChoice; match?: Duplicate }>`, and `TxEditorInit.onSkipped?: (match?: Duplicate) => void`.

- [ ] **Step 1: Prompt.** For `kind: 'instalment'`, show header `sms.instalmentMatchTitle` ("Already recorded?"), message `sms.instalmentMatchBody` ("Looks like {{name}}, instalment {{n}} of {{of}}, already on this card.", where name is the row's note or else its category name, via `useNames`), and buttons `sms.alreadyRecorded` (role `skip`) and `sms.addAnyway` (role `keep`). Manual matches keep today's alert.
- [ ] **Step 2: Callers.** In SmsItemCard confirm, editor `onSkipped`, and the batch "skip those" path, replace `resolveSkipped(item, 'duplicate')` with `skipDuplicate(item, match)`. The editor passes `match` to `init.onSkipped`. In the combine path, `dupes.has` keeps working on the Map; leave its skip handling as it is.
- [ ] **Step 3: Copy** in `en.json` and `ar.json`.
- [ ] **Step 4:** `npm run typecheck && npm test`. Expected: clean, all pass.
- [ ] **Step 5: Commit**: `git commit -am "Ask before saving a text that matches an instalment"`

### Task 6: Instalments chip on the bank-text card

**Files:**
- Modify: `src/features/sms/review.ts`, `src/features/sms/SmsItemCard.tsx`, `src/features/sms/SmsReviewPage.tsx:462` (pass `accounts` and `categories`), plus `en.json`/`ar.json` if a new label is needed (reuse `instalments.chip` otherwise)
- Test: `src/features/sms/review.test.ts`

**Interfaces:**
- Consumes: `InstalmentSheet`, `InstalmentChoice`, `instalmentChipLabel` (Task 3); `toPlanOptions` and `createPlan` (Task 1); the prompt's `{ choice, match }` and `skipDuplicate` (Task 5); `resolveImported`.
- Produces:
  - `canInstalText(item: SmsPending, choice: CardChoice, account: Account | undefined): boolean` in `review.ts`. It's true when the text is understood, `flowOf(item) === 'expense'`, there's no `personId`, there is a `categoryId`, and `account` is a credit card.
  - New `SmsItemCard` props: `accounts: Account[]` and `categories: Category[]`.

- [ ] **Step 1: Failing test** `canInstalText only for money out on a credit card with a category`. It is true for an out text on a credit card account with a category, and false when any of these holds: the text is money in, `personId` is set, there's no category, the account is a bank account, or the account is undefined.
- [ ] **Step 2:** `npx vitest run src/features/sms/review.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `canInstalText`, then make the card changes. Add `useState<InstalmentChoice>()` with `const instal = canInstalText(...) ? plan : undefined`. When allowed, add a third chip in `.b-smscard__chips` labelled `instalmentChipLabel` or `instalments.chip`, which opens `InstalmentSheet` with the text's amount, currency, card and `accounts`. In `confirm`, when `instal` is set and the prompt answers `keep`, run `createPlan(buildTxRecord(draft), toPlanOptions(instal, account, categories, t('instalments.feeNote', { name: item.merchant || categoryName(category) })))` and then `resolveImported(item, saved)`. Without `instal`, keep `importText` as today.
- [ ] **Step 4:** `npm run typecheck && npm test`. Expected: clean, all pass.
- [ ] **Step 5: Commit**: `git commit -am "Confirm a credit card bank text as instalments from its card"`

### Task 7: Final check

- [ ] Run `npm run typecheck && npm test`. Expected: clean, all pass.
- [ ] Ask the user whether to make a build for a check on the emulator (memory rule: no builds unasked). Don't run one otherwise.
