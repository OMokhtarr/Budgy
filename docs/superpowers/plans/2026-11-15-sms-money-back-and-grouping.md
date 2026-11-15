# Bank texts: money back, several at once, combine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let bank texts be acted on several at a time (one category, combine into one entry, take off a purchase), and let money that comes back on a purchase lower that category's spending instead of counting as income.

**Architecture:** Each text stays its own `Transaction` on its own account, so balances and card statements don't change. Two new optional fields do the rest. `moneyBack` marks an income row that counts against an expense category. `groupId` links the rows that show as one entry. Totals learn `moneyBack` through one helper (`flowOfTx`). The transactions list folds rows by `groupId`. The bank texts screen gains a selection mode with three actions.

**Tech Stack:** React 18 + Ionic, Dexie (IndexedDB), i18next (en + ar), Vitest with fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-11-15-sms-money-back-and-grouping-design.md`

## Global Constraints

- Every new string goes in both `src/core/i18n/locales/en.json` and `ar.json`, under `sms.*` (bank texts screen) or `transactions.*` (list, group sheet).
- No new Dexie version unless Task 13 chooses to index `groupId`. If it does, add version 3 with `groupId` appended to the transactions index list. Nothing else changes.
- No cloud migration: new `Transaction` fields sync inside `data` jsonb as they are.
- `useBalances`, `changeOn`, `lendingShares`, `cardStatus` and `accountTiles` are **not** modified. A money-back row is `type: 'income'`, so they already handle it.
- Money-back rows teach the sender link and **never** a merchant rule.
- A category below zero in a period: the donut already skips it, budget bars clamp `spent` to 0, and the category's own figure shows the real value.
- Tests: `npx vitest run <file>`. Before each commit: `npm run typecheck` passes.
- Work on a branch, `feature/sms-money-back`, never on master.

## Review Focus

1. **An ordinary edit of a money-back or grouped row** (change only the note) must keep `moneyBack` and `groupId`, and the row must keep its expense category. This is pinned in Task 3 (`buildTxRecord`) and Task 9 (the editor carries them).
2. **Money back in another currency than the purchase** (a USD transfer back on an EGP dinner) is saved with its own rate and lowers the category by its value in the main currency. This is pinned in Task 7.
3. **Double tap or a retry on a batch action** must not save a text twice. Every path goes through `saveTx`'s fingerprint dedupe. This is pinned in Tasks 1, 7 and 11.
4. **A selection mixing money in and money out, or including an unreadable text:** the actions that can't apply are disabled. Nothing is half-saved. This is pinned in Task 1 (`actionsFor`).
5. **A group that is only partly visible** (another period, account filter, a deleted row) renders with the net of what's visible, and never throws. This is pinned in Task 13.

---

## Stage 1: select several texts, "Same category"

### Task 1: Batch logic for the bank texts screen

**Files:**
- Create: `src/features/sms/batch.ts`
- Test: `src/features/sms/batch.test.ts`

**Interfaces:**
- Consumes: `importText(item, record, database)` from `learning.ts`; `findManualDuplicate(d, database)` from `duplicate.ts`; `TxDraft`, `buildTxRecord` from `txRecord.ts`.
- Produces:
  - `export interface BatchActions { sameCategory: boolean; combine: boolean; takeOff: boolean }`
  - `export function actionsFor(items: SmsPending[]): BatchActions`
  - `export async function duplicatesOf(drafts: { fingerprint: string; draft: TxDraft }[], database?: BudgyDB): Promise<Set<string>>` returns the fingerprints whose draft matches a hand-entered transaction.
  - `export async function importMany(entries: { item: SmsPending; draft: TxDraft }[], database?: BudgyDB): Promise<{ saved: number; failed: number }>`. Each entry goes through `importText(item, buildTxRecord(draft))` on its own, and one failure doesn't stop the rest.

- [ ] **Step 1: Write the failing tests**

```ts
describe('actionsFor', () => {
  it('offers nothing for an empty selection', () => expect(actionsFor([])).toEqual({ sameCategory: false, combine: false, takeOff: false }));
  it('same category needs one direction', () => {
    expect(actionsFor([item({ direction: 'in' }), item({ fingerprint: 'b', direction: 'in' })]).sameCategory).toBe(true);
    expect(actionsFor([item({ direction: 'in' }), item({ fingerprint: 'b', direction: 'out' })]).sameCategory).toBe(false);
  });
  it('combine needs two or more', () => {
    expect(actionsFor([item()]).combine).toBe(false);
    expect(actionsFor([item(), item({ fingerprint: 'b', direction: 'in' })]).combine).toBe(true);
  });
  it('take off a purchase needs every text to be money in', () => {
    expect(actionsFor([item({ direction: 'in' })]).takeOff).toBe(true);
    expect(actionsFor([item({ direction: 'in' }), item({ fingerprint: 'b' })]).takeOff).toBe(false);
  });
  it('an unreadable text disables everything', () =>
    expect(actionsFor([item(), item({ fingerprint: 'b', status: 'unreadable', amount: undefined })])).toEqual({ sameCategory: false, combine: false, takeOff: false }));
});

describe('importMany', () => {
  it('saves each text, learns its link and drops it from pending', async () => { /* 2 entries → saved 2, 2 transactions with their fingerprints, smsPending empty */ });
  it('saves a text only once when run twice', async () => { /* run twice → 1 transaction per fingerprint */ });
  it('keeps going past a failure and counts it', async () => { /* an entry whose draft has accountId '' made to throw via a stubbed importText → { saved: 1, failed: 1 } */ });
});

describe('duplicatesOf', () => {
  it('returns the fingerprints that match a hand-entered transaction on the same day', async () => { /* one matching manual tx → Set(['a']) */ });
});
```

Use the `item`/`account` fixture style from `review.test.ts`, and `new BudgyDB('t-batch')`.

- [ ] **Step 2: Run, expect FAIL** (module not found): `npx vitest run src/features/sms/batch.test.ts`
- [ ] **Step 3: Implement the three functions in `batch.ts`.** "Understood" means `status === 'understood'` and `amount > 0`. `importMany` awaits each entry in turn, inside its own try/catch.
- [ ] **Step 4: Run, expect PASS**, then `npm run typecheck`.
- [ ] **Step 5: Commit** `git add src/features/sms/batch.ts src/features/sms/batch.test.ts && git commit -m "Work out which actions fit several bank texts, and save them together"`

### Task 2: Selection mode and "Same category" on the bank texts screen

**Files:**
- Modify: `src/features/sms/SmsReviewPage.tsx`, `src/features/sms/SmsItemCard.tsx`, `src/features/sms/PickerSheet.tsx`
- Create: `src/features/sms/useBatchDuplicatePrompt.ts`
- Modify: `src/core/i18n/locales/en.json`, `ar.json`, the stylesheet that holds `.b-smscard` (find it with `grep -rn "b-smscard" src --include=*.css`)
- Modify: `TODO.md` (device checks)

**Interfaces:**
- Consumes: Task 1 (`actionsFor`, `duplicatesOf`, `importMany`); `useLongPress` (`src/shared/hooks/useLongPress.ts`, used the same way as in `TransactionsPage`); `cardDraft`, `choiceOf`, `usablePick` from `review.ts`.
- Produces:
  - `PickerSheet` takes `sections?: PickerSection[]` instead of `section?`. In `PickerSection`, `addLabel` and `onAdd` become optional (no add bubble without them). Update the one existing caller. Task 6 adds the "Money back on" section through this.
  - `useBatchDuplicatePrompt(): (count: number) => Promise<'keep' | 'skip' | 'cancel'>` shows one alert: "{{count}} of these look already added".
  - `SmsItemCard` gets new props `selecting: boolean`, `selected: boolean`, `bind` (the long-press handlers). In selection mode a tap toggles, and the chips and buttons are hidden.

- [ ] **Step 1: Selection state in `SmsReviewPage`.** Keep `selected: Set<string>` (fingerprints). A long-press on an understood card adds it, with a haptic. While selecting, a tap toggles. Unreadable cards ignore the long-press. Toggle `body.b-selecting` and register the `ionBackButton` handler exactly as `TransactionsPage` does. Drop fingerprints that are no longer pending from the selection.
- [ ] **Step 2: The selection bar.** It shows the count and ✕ in the toolbar, as `.b-selbar` does, and a footer with three buttons: `sms.sameCategory`, `sms.combine`, `sms.takeOff`. Each is enabled per `actionsFor(selectedItems)`. In this task, Combine and Take off show a toast `sms.comingSoon`. Tasks 8 and 12 replace that.
- [ ] **Step 3: Same category.** Open `PickerSheet` with the categories that fit the selection's flow (`categoryFits`), and no people section. On pick:
  1. Set `{ categoryId, personId: undefined }` in `picks` for every selected fingerprint.
  2. Build drafts with `cardDraft`. The ones without a draft are "incomplete".
  3. Run `duplicatesOf` on the complete ones. If any match, ask `useBatchDuplicatePrompt(n)`. On `cancel` stop; on `skip` call `resolveSkipped(item, 'duplicate')` for the matches and drop them from the batch.
  4. Run `importMany` on the rest.
  5. Show a toast: `sms.batchSaved` ({{count}}), plus `sms.batchNeedAccount` ({{count}}) when any were incomplete, plus `sms.actionFailed` when `failed > 0`.
  6. Keep the incomplete ones selected and clear the rest.
- [ ] **Step 4: Strings** in en and ar: `sameCategory` "Same category", `combine` "Combine into one", `takeOff` "Take off a purchase", `comingSoon`, `batchSaved` "{{count}} saved", `batchNeedAccount` "{{count}} need an account", `batchDuplicateTitle`, `batchDuplicateBody` "{{count}} of these look already added", `skipThose` "Skip those", `keepAll` "Keep all".
- [ ] **Step 5: Verify.** `npm run typecheck && npx vitest run src/features/sms`. All pass. Then run `npm run dev`, open `/sms` with seeded pending texts, and check: long-press selects, tap toggles, back leaves, and Same category confirms the complete ones.
- [ ] **Step 6: TODO.md.** Under SMS import, add a "Grouping checks (device)" list:
  - long-press, select and deselect
  - Same category with one text missing an account
  - the batch duplicate prompt with all three choices
  - right-to-left layout
  - dark mode
- [ ] **Step 7: Commit** `git commit -m "Select several bank texts and give them one category at once"`

---

## Stage 2: money back

### Task 3: `moneyBack` / `groupId` on the record, and `flowOfTx`

**Files:**
- Modify: `src/shared/models/index.ts`, `src/features/transactions/txRecord.ts`, `src/core/db/hooks.ts` (`totalsOf`)
- Create: `src/core/utils/flow.ts`
- Test: `src/core/utils/flow.test.ts`, `src/features/transactions/txRecord.test.ts`, `src/core/db/hooks.test.ts`

**Interfaces:**
- Produces:
  - On `Transaction`: `moneyBack?: true` and `groupId?: string`, with the doc comments from the spec. The same two fields on `TxDraft`.
  - `export function flowOfTx(t: Pick<Transaction, 'type' | 'moneyBack'>): Flow | undefined` returns `'expense'` for an expense or a money-back row, `'income'` for a plain income row, and `undefined` for a transfer.
  - `export const isMoneyBack = (t: Pick<Transaction, 'type' | 'moneyBack'>) => t.type === 'income' && !!t.moneyBack`

- [ ] **Step 1: Write the failing tests**
  - `flow.test.ts`:
    - `flowOfTx({ type: 'income', moneyBack: true })` is `'expense'`
    - plain income is `'income'`
    - a transfer is `undefined`
    - `{ type: 'expense', moneyBack: true }` is `'expense'`, and `isMoneyBack` of it is `false`
  - `txRecord.test.ts`:
    - `buildTxRecord({...income, moneyBack: true, groupId: 'g'})` keeps both fields
    - a transfer draft with them set drops both
    - an expense draft keeps `groupId` and has no `moneyBack`
  - `hooks.test.ts`, new `describe('totalsOf with money back')`, with `[expense 600 food, income 400 food moneyBack]`:
    - `expense` is 200 and `income` is 0
    - `byCategory.expense.get('food')` is 200
    - `byCategory.income.has('food')` is false
    - `byCategoryCur.expense.get('food')` equals `{ EGP: 200 }`
    - money back alone gives `expense` −400 and category −400
    - a USD money-back with `rate: 48, rateCurrency: 'EGP'` subtracts 480
    - a money-back with a subcategory lowers `bySubcategory.expense`
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
  - Add the model fields.
  - In `buildTxRecord`, add `moneyBack: !transfer && d.type === 'income' && d.moneyBack ? true : undefined` and `groupId: transfer ? undefined : d.groupId`.
  - In `totalsOf`, compute `const flow = flowOfTx(t)` and `const sign = isMoneyBack(t) ? -1 : 1`. Add `sign * v` to the flow's totals, the category, the per-currency amounts and the subcategory.
- [ ] **Step 4: Run, expect PASS** for the three test files, then `npm run typecheck`.
- [ ] **Step 5: Commit** `git commit -m "Let a transaction be money back that lowers spending in its category"`

### Task 4: Every other sum and category check respects money back

**Files:**
- Modify:
  - `src/features/overview/OverviewPage.tsx` (trend lines ~69–70, budget bars ~184 and ~201)
  - `src/features/transactions/TransactionsPage.tsx` (day `net`, `sumOf`, the row for a money-back tx, `changeCategory` fits)
  - `src/features/transactions/bulk.ts` (`moveToCategory`)
  - `src/features/categories/CategoriesPage.tsx` (budget or progress, if it clamps)
- Test: `src/features/transactions/bulk.test.ts`

**Interfaces:**
- Consumes: Task 3's `flowOfTx`, `isMoneyBack`.

- [ ] **Step 1: Failing tests in `bulk.test.ts`:**
  - moving a money-back row to an expense category works and keeps `moneyBack`
  - moving it to an income-only category is skipped (returns 1)
  - moving a plain income row to an expense-only category is still skipped
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
  - `moveToCategory` uses `flowOfTx(x)` in place of `x.type`.
  - The trend: money back subtracts from `exp`.
  - Day net and `sumOf`: a money-back row counts as negative expense. `sumOf('income')` excludes it, `sumOf('expense')` subtracts it.
  - `changeCategory` fits use `flowOfTx`.
  - Budget bar widths use `Math.max(0, spent)`.
  - The list row for a money-back tx shows `+amount` in `b-expense`, with a `transactions.moneyBack` tag after the category name ("money back"). Add that string in en and ar.
- [ ] **Step 4: Run** `npx vitest run src/features/transactions src/core` and expect PASS, then `npm run typecheck`.
- [ ] **Step 5: Commit** `git commit -m "Count money back against spending everywhere totals are shown"`

### Task 5: Money back from a single card (data side)

**Files:**
- Modify: `src/features/sms/review.ts`, `src/features/sms/learning.ts`
- Test: `src/features/sms/review.test.ts`, `src/features/sms/learning.test.ts`

**Interfaces:**
- Produces:
  - `CardPick` and `CardChoice` gain `moneyBack?: boolean`. It's only meaningful with a `categoryId` on a money-in text.
  - `usablePick(pick, flow, accounts, categories)`: when `pick.moneyBack` and `flow === 'income'`, the category must fit `'expense'`. Otherwise it is dropped, along with `moneyBack`.
  - `choiceOf(s, pick)`: picking `moneyBack` carries `{ categoryId, moneyBack: true }` and drops the suggested subcategory.
  - `cardDraft`: with `choice.moneyBack` on a money-in text, it returns `{ type: 'income', moneyBack: true, categoryId, rate, ... }`.
  - In `learning.ts`, `lessonIdsOf` returns no rule when `tx.moneyBack`.

- [ ] **Step 1: Failing tests**
  - review:
    - `usablePick({ categoryId: 'food', moneyBack: true }, 'income', …)` keeps both when `food` is an expense category
    - it drops both when `food` is income-only
    - `cardDraft` for an `in` text with a moneyBack choice gives `type: 'income'`, `moneyBack: true`, `categoryId: 'food'`, and a rate for USD
    - `moneyBack` on an `out` text is ignored, giving a plain expense
  - learning: `importText` of a money-back record learns the link, writes no `merchantRules` row, and drops the pending item
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** as described in Interfaces.
- [ ] **Step 4: Run, expect PASS** with `npx vitest run src/features/sms`, then typecheck.
- [ ] **Step 5: Commit** `git commit -m "Let a bank text of money in be money back on a category"`

### Task 6: "Money back on" in the pickers, and the card's note

**Files:**
- Modify: `src/features/sms/SmsReviewPage.tsx`, `src/features/sms/SmsItemCard.tsx`, en and ar

**Interfaces:**
- Consumes: Task 2's `sections` on `PickerSheet`; Task 5's `moneyBack` on `CardPick`.

- [ ] **Step 1: Picker sections.** For a money-in card's category picker, the sections are, in order:
  1. people (existing)
  2. `sms.moneyBackOn` "Money back on", listing expense categories, with no add bubble
- [ ] **Step 2: Picks.** Picking from the money-back section sets `{ categoryId, moneyBack: true, personId: undefined }`. Picking an ordinary category sets `moneyBack: undefined`. Track which section an id came from: the same category can appear in both when its kind is `both`, so give money-back items the id `back:<categoryId>` and strip the prefix in `pick`.
- [ ] **Step 3: The money-back section in Same category.** Task 2's Same category picker also gets the money-back section when the selection is money in.
- [ ] **Step 4: The card.** With `choice.moneyBack`, the chip shows the category, and a note `sms.moneyBackNote` "Lowers {{category}} spending — not income" appears under it.
- [ ] **Step 5: Edit from the card.** The card's `edit()` passes `moneyBack: true` through to the editor init (Task 9 handles it).
- [ ] **Step 6: Verify.** Typecheck. In `npm run dev`, a money-in card can be confirmed as money back, and the Categories page shows Food lowered.
- [ ] **Step 7: Commit** `git commit -m "Offer money back on a category for texts of money in"`

### Task 7: Take off a purchase (data side)

**Files:**
- Create: `src/features/sms/grouping.ts`
- Modify: `src/features/sms/learning.ts`. Export `learn` and `lessonIdsOf` (or a new `learnAll` wrapper) so grouping can run them inside its own Dexie transaction.
- Test: `src/features/sms/grouping.test.ts`

**Interfaces:**
- Consumes: `saveTx`, `buildTxRecord`, `rateToSave`, `newId`, Task 3 and Task 5.
- Produces:
  - `export interface TextPart { item: SmsPending; accountId: string }`
  - `export async function takeOff(parts: TextPart[], target: Transaction, conv: Pick<Converter, 'base' | 'rate'>, database?: BudgyDB): Promise<Transaction[]>`
    - Every part must be `direction === 'in'` and understood, and the target must be an alive `expense`. Otherwise it throws before writing anything.
    - Each part is saved as a money-back income row: the target's `categoryId` and `subcategoryId`, the text's amount, currency, date and fingerprint, and the note `item.merchant ?? target.note`.
    - `groupId` is `target.groupId ?? newId()`. A new id is also written onto the target.
    - Each part's link is learned and its pending item dropped.
    - It's one rw Dexie transaction over transactions, smsLinks, merchantRules and smsPending: all or nothing.
  - `export async function recentExpenses(days: number, database?: BudgyDB): Promise<Transaction[]>` returns the alive expenses from the last `days` days, newest first.

- [ ] **Step 1: Failing tests**
  - two parts on an ungrouped target:
    - two money-back rows with the target's category and subcategory
    - all three share one new `groupId`
    - pending is empty, and links are learned
  - a target that already has a `groupId`: the new rows reuse it
  - run twice with the same parts: still two money-back rows (fingerprint dedupe)
  - a part with `direction: 'out'`: throws, and nothing is written (count transactions before and after)
  - a USD part with `conv.rate('USD') = 50` and base EGP is saved with its rate, and `totalsOf([target 600 EGP, part 4 USD])` has `expense` 400 *(Review Focus 2)*
  - `recentExpenses(30)` excludes transfers, income, deleted rows and rows older than 30 days
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Hash the lesson ids before opening the Dexie transaction, as `importText` does. A Dexie transaction can't wait on crypto.
- [ ] **Step 4: Run, expect PASS**, then typecheck.
- [ ] **Step 5: Commit** `git commit -m "Take money that came back off a saved purchase"`

### Task 8: Take off a purchase (screens)

**Files:**
- Create: `src/features/sms/TextsSheet.tsx` (a sheet listing texts with an account chip each, plus a footer slot; Stage 3 reuses it)
- Create: `src/features/sms/PurchasePickerSheet.tsx`
- Modify: `SmsReviewPage.tsx`, `SmsItemCard.tsx` (or the money-in category picker), en and ar, `TODO.md`

**Interfaces:**
- Consumes: Task 7.
- Produces:
  - `TextsSheet` props: `{ isOpen; title: string; parts: { item: SmsPending; accountId?: string }[]; onPickAccount(fingerprint: string): void; footer: ReactNode; onClose(): void }`
  - `PurchasePickerSheet` props: `{ isOpen; onPick(tx: Transaction): void; onClose(): void }`. It lists `recentExpenses(30)` with a search box (note, category name, amount) and the same row look as the transactions list.

- [ ] **Step 1: Wire the action.** The selection bar's Take off a purchase, and a "Take off a purchase…" item at the top of a single money-in card's category picker, both open `PurchasePickerSheet`. The picked target opens `TextsSheet`:
  - title: `sms.takeOffFrom` "Take off {{name}}"
  - parts pre-filled from each card's choice
  - footer: "Save", disabled while any part has no account
- [ ] **Step 2: Save.** Save calls `takeOff`, then clears the selection and shows the toast `sms.takenOff` ({{count}}). On failure it shows the `sms.actionFailed` toast, and the sheet stays open.
- [ ] **Step 3: Strings** in en and ar for the sheet title, the search placeholder, "no recent purchases", the save button and the toast.
- [ ] **Step 4: Verify.** Typecheck and the sms tests. In dev, take two money-in texts off a saved dinner. Food drops by their total, and the account balances move by each text.
- [ ] **Step 5: TODO.md.** Add the device checks: take off from a hand-entered purchase, and from one in another currency.
- [ ] **Step 6: Commit** `git commit -m "Pick a saved purchase and take bank texts of money in off it"`

### Task 9: The editor keeps money back and the group

**Files:**
- Modify: `src/core/contexts/TxEditorContext.tsx` (`EditorInit.moneyBack?: boolean`), `src/features/transactions/TransactionEditor.tsx`, en and ar

**Interfaces:**
- Consumes: Task 3's fields.

- [ ] **Step 1: State.** `const [moneyBack, setMoneyBack] = useState(!!(tx?.moneyBack ?? init.moneyBack))`.
  - While `moneyBack && type === 'income'`, the category grid shows `expenseCats`, not `incomeCats`.
  - The type line shows the label `editor.moneyBack` "Money back".
  - `types` for such a row is `['income']` plus `'expense'`. Switching to Expense or Transfer clears `moneyBack`.
  - In `switchType`, the category reset checks against the list that applies after the switch.
- [ ] **Step 2: Save.** `buildTxRecord` gets `moneyBack` and `groupId: tx?.groupId`. Editing a grouped row keeps the group *(Review Focus 1)*. When `tx?.groupId` is set, the category picker is hidden, and a line `editor.groupCategory` "Category is set on the group" shows in its place. Task 14 adds the group sheet that sets it.
- [ ] **Step 3: Verify.** Typecheck. In dev, change the note of a money-back row. After saving, the row still has `moneyBack`, its group and its expense category (check in DevTools → IndexedDB `budgy2.transactions`).
- [ ] **Step 4: Commit** `git commit -m "Keep money back and the group when a transaction is edited"`

### Task 10: CSV export and import carry the new fields

**Files:**
- Modify: `src/core/db/transactionsCsv.ts`
- Test: `src/core/db/transactionsCsv.test.ts`

**Interfaces:**
- Produces: `CSV_HEADER` gains `'Group'` and `'Money back'` at the end. Export writes `x.groupId ?? ''` and `x.moneyBack ? 'yes' : ''`.

- [ ] **Step 1: Failing tests**
  - the export row of a money-back grouped tx ends with `['g1', 'yes']`
  - importing that file into an empty db gives `moneyBack: true` and `groupId: 'g1'`, with the category kept as the expense category
  - a money-back row whose category name only matches an income category imports as plain income and is reported in `badRows`
  - an old file with no such columns imports as today (the existing tests stay green)
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
  - `Row` gains `group: string` and `moneyBack: boolean` (`get('money back')` is "yes", case-insensitive).
  - A money-back row looks up and creates its category with flow `'expense'`, using `flowOfTx`.
  - Add `groupId` and `moneyBack` to the duplicate `fingerprint`, so a refund doesn't match a plain income row.
- [ ] **Step 4: Run, expect PASS**, then typecheck.
- [ ] **Step 5: Commit** `git commit -m "Export and import money back and groups in CSV"`

---

## Stage 3: combine into one, and the folded row

### Task 11: Combine texts (data side)

**Files:**
- Modify: `src/features/sms/grouping.ts`
- Test: `src/features/sms/grouping.test.ts`

**Interfaces:**
- Produces:
  - `export interface CombineChoice { categoryId: string; subcategoryId?: string; moneyBack: boolean; note?: string }`
  - `export function combineFlow(parts: SmsPending[]): Flow` returns `'expense'` if any part is out, otherwise `'income'`.
  - `export async function combineTexts(parts: TextPart[], choice: CombineChoice, conv, database?): Promise<Transaction[]>`. It needs at least 2 understood parts.
    - Out texts become `expense` rows.
    - In texts become money-back rows when the flow is expense or `choice.moneyBack` is set, and plain `income` rows otherwise.
    - When the flow is `'income'` and `choice.moneyBack` is false, the category must fit income. When there are out parts, or `moneyBack` is set, it must fit expense. Otherwise it throws before writing anything.
    - All rows share one new `groupId`, the choice's note and the same category and subcategory.
    - Merchant rules are learned only from expense rows that have a merchant. Links are learned for all. Pending items are dropped.
    - It's one rw Dexie transaction, all or nothing.
  - `export function defaultNote(parts: SmsPending[]): string | undefined` returns the merchant of the largest out part, otherwise the first merchant.

- [ ] **Step 1: Failing tests**
  - one out 600 and two in 200 with Restaurant: one expense and two money-back rows, one shared `groupId`, `totalsOf` expense 200
  - an out 300 and an out 200 (two cards) with Shopping: two expense rows, the group's expense is 500, and each account's balance moved by its own amount (check `changeOn`)
  - three ins with an income category and `moneyBack: false`: three income rows in one group
  - three ins with `moneyBack: true` and an expense category: three money-back rows
  - an out part with an income-only category: throws, and nothing is written
  - run twice: no extra rows
  - `defaultNote` picks the merchant of the largest out
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS**, then typecheck.
- [ ] **Step 5: Commit** `git commit -m "Combine several bank texts into one entry"`

### Task 12: Combine sheet

**Files:**
- Create: `src/features/sms/CombineSheet.tsx` (built on `TextsSheet`)
- Modify: `SmsReviewPage.tsx`, en and ar, `TODO.md`

**Interfaces:**
- Consumes: Tasks 8 (`TextsSheet`) and 11.

- [ ] **Step 1: The sheet.** The selection bar's Combine opens `CombineSheet`. It has:
  - the parts with account chips
  - the live net (`expense − money back` in the main currency, via `txInBase` on the drafts), or in the shared currency when all parts are in one
  - a category picker: `combineFlow` categories, plus the money-back section when every part is money in
  - a note field pre-filled with `defaultNote`
  - a Save button, disabled while any account or the category is missing
- [ ] **Step 2: Save.** Save runs `duplicatesOf` on the parts, shows the batch prompt if needed, then calls `combineTexts`, clears the selection and shows the toast `sms.combined`.
- [ ] **Step 3: Strings and TODO.** Add the strings in en and ar. Add TODO device checks: combine two cards, and combine a payment with two paybacks.
- [ ] **Step 4: Verify** in dev, plus typecheck. **Step 5: Commit** `git commit -m "Combine selected bank texts from a sheet"`

### Task 13: Fold groups in the transactions list (logic)

**Files:**
- Create: `src/features/transactions/groups.ts`
- Test: `src/features/transactions/groups.test.ts`

**Interfaces:**
- Produces:
  - `export type ListEntry = { kind: 'tx'; tx: Transaction } | { kind: 'group'; groupId: string; rows: Transaction[]; categoryId?: string; net: number; currency?: string; netInCurrency?: number }`
  - `export function foldGroups(txs: Transaction[], conv: BaseConverter): ListEntry[]` keeps the input order, putting each group at its earliest row's position (by date). A group with one visible row is `kind: 'tx'`.
    - `net` = Σ expense value − Σ money-back value (via `txInBase`), positive meaning spent.
    - For an income group, `net` = Σ income, positive meaning received.
    - `currency` and `netInCurrency` are set only when every row shares one currency.
    - `categoryId` is that of the largest expense row (or the largest row overall).

- [ ] **Step 1: Failing tests**
  - an ungrouped list comes back unchanged as `tx` entries
  - a group of an expense 600 plus money back 200 + 200, mixed among others, gives one entry at the earliest row's position with `net` 200, `currency` 'EGP' and `netInCurrency` 200
  - two groups stay separate
  - a group with only one visible row is a `tx` entry *(Review Focus 5)*
  - rows disagreeing on category: the largest expense row's category wins
  - mixed currencies: `currency` undefined, `net` in the main currency
  - an empty list gives `[]`
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.** **Step 5: Commit** `git commit -m "Fold transactions that belong together into one list entry"`

### Task 14: Folded row, group sheet and bulk actions in the list

**Files:**
- Modify: `src/features/transactions/TransactionsPage.tsx`
- Create: `src/features/transactions/GroupSheet.tsx`
- Modify: `src/features/transactions/bulk.ts`
- Test: `src/features/transactions/bulk.test.ts`
- Modify: en and ar, `TODO.md`, `RELEASE-NOTES.md`

**Interfaces:**
- Consumes: Task 13 `foldGroups`; Task 9 (the editor hides the category for grouped rows).
- Produces, in `bulk.ts`:
  - `export async function setGroupCategory(groupId: string, categoryId: string, subcategoryId?: string, database?: BudgyDB): Promise<void>` sets every alive row in the group.
  - `export async function ungroup(tx: Transaction, database?): Promise<void>` clears `groupId` and keeps `moneyBack`.
  - `export async function deleteGroup(groupId: string, database?): Promise<void>` soft-deletes every alive row.
  - `export async function groupRows(groupId: string, database?): Promise<Transaction[]>` returns the alive rows in any period.

- [ ] **Step 1: Failing tests in `bulk.test.ts`**
  - `setGroupCategory` changes all three rows, including the money-back one
  - `ungroup` clears `groupId` only on that row, and a money-back row stays money back
  - `deleteGroup` soft-deletes all rows (each has `deletedAt`)
  - `groupRows` excludes deleted rows
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement the four functions.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: List rendering.** Each day's rows go through `foldGroups` before rendering. A group entry renders as one `b-row`:
  - the category's avatar
  - title: the category and the note
  - a sub-line of `account ±amount` per row
  - the amount: `netInCurrency` with `currency`, or `net` in the main currency
  - when `groupRows(groupId)` has more rows than are visible, a hint `transactions.moreInGroup` "+{{count}} more elsewhere". Compute it from a `useLiveQuery` over `groupId`s on screen.

  A row with a `groupId` that renders alone gets a small link icon. The day `net` still sums the underlying rows.
- [ ] **Step 6: Selection.** A long-press or tap on a group entry selects or toggles **all its visible rows**, and the entry shows as selected when all of them are. Delete and change date, account and category work on the rows unchanged. Change category stays consistent, because every row is selected.
- [ ] **Step 7: GroupSheet.** Tapping a group entry, outside selection, opens `GroupSheet` with `groupRows(groupId)`. It shows:
  - the net
  - a category chip, which calls `setGroupCategory`
  - a note field, saved to every row on blur
  - each row: tap opens the editor for it, and an ⋯ menu has `transactions.removeFromGroup`, which calls `ungroup`
  - Delete group, which confirms with the row count and then calls `deleteGroup`
- [ ] **Step 8: Strings, TODO, release notes.** Add the strings in en and ar. Add TODO device checks: the folded row, a partial group across months, the group sheet edits, and selecting a group. Add a `RELEASE-NOTES.md` entry for the feature, in the file's existing style.
- [ ] **Step 9: Verify.** Run `npm test`: the whole suite passes. Then `npm run typecheck` and `npm run build`. In dev:
  - a combined dinner shows as one row of −200
  - the group sheet edits apply to all rows
  - the account filter shows only that account's part
- [ ] **Step 10: Commit** `git commit -m "Show grouped transactions as one row and edit them together"`
