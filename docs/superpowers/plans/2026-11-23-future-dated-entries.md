# Future-dated entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Future-dated entries stop changing non-card balances until their day; future card charges stay in the
card's balance but leave the Transactions list and totals until their day, and show on the card page per statement.

**Architecture:** One "dated after today" helper. `balancesOf` and `cardStatus` skip what must wait. One pure
filter applied inside `useTransactionsInRange` hides future card charges from every period screen at once.
`upcomingStatements` also returns each statement's charges, which a new sheet on the card page lists.

**Tech Stack:** TypeScript, React, Ionic, Dexie (`useLiveQuery`), i18next, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-future-dated-entries-design.md`

## Global Constraints

- "Dated after today" = `new Date(t.date).getTime() >= startOfTomorrow(today)`, local time, as `cardStatus` already does.
- A credit card is `isCreditCard(a)` (`src/core/utils/creditCard.ts`). Debts, savings, wallets and cash are "not a credit card".
- Every new text in English and Arabic (`src/core/i18n/locales/en.json`, `ar.json`).
- Amounts are rounded with `roundTo(n, cur)` (`src/core/utils/currency.ts`).
- Don't run `vite build`, `cap sync` or Gradle (user rule). Verify with `npm test` and `npm run typecheck`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch: `feat/future-dated-entries`.

## Review Focus

1. **A future cash withdrawal (card → bank).** The card side counts at once, and the bank side waits. It's hidden from the list because its `accountId` is the card. Test in Task 1.
2. **An exchange inside one card dated ahead** (two currencies, `accountId === toAccountId`). Both halves count at once, so the card never shows half an exchange. Tests in Tasks 1 and 2.
3. **An entry dated today at 23:59 vs tomorrow at 00:00.** Today's counts and shows; tomorrow's waits. Tests in Tasks 1 and 3.
4. **A future refund (income) on a card.** It waits like a payment: not in owed or paid until its day. Test in Task 2.
5. **The next statement's sheet with an overpaid last statement.** No "Left from the last statement" row when what's carried is 0 or below. Test in Task 4.

---

### Task 1: "After today" helper and the balance rule

**Files:**
- Create: `src/core/utils/future.ts`, `src/core/utils/future.test.ts`
- Modify: `src/core/db/hooks.ts:50-75` (`useBalances`, `balancesOf`)
- Test: `src/core/db/hooks.test.ts` (new `describe('balancesOf with future entries')`)

**Interfaces:**
- Produces: `startOfTomorrow(today: Date): number` (ms). `isAfterToday(date: string, today: Date): boolean`.
- Produces: `balancesOf(accounts: Account[], txs: Transaction[], today = new Date()): Map<string, Amounts>`.

Rule per movement (each side of a transfer on its own):
- on an account that isn't a credit card: skipped while `isAfterToday`;
- on a credit card: money off the card counts always; money onto it (income, a transfer in) is skipped while `isAfterToday`, **except** an exchange inside the card (`accountId === toAccountId`), whose two halves always count.

- [ ] **Step 1: Write the failing tests**

`future.test.ts`: `isAfterToday` is false for today 12:00 and today 23:59, and true for tomorrow 00:00 and 3 Dec.

`hooks.test.ts`, today = 23 Nov 2026 12:00, accounts `bank` (type `bank`, opening 10,000), `cash`, and `card` (credit card, opening 0):
- `it('leaves a future bank expense out until its day')`: an expense of 250 on `bank` dated 1 Dec gives bank 10,000. The same entry with today = 1 Dec 12:00 gives 9,750.
- `it('leaves future income and both sides of a future transfer between own accounts out')`: income of 500 on 1 Dec gives bank 10,000. A transfer of 1,000 bank→cash on 1 Dec gives bank 10,000 and cash 0.
- `it('counts a future card charge at once')`: an instalment expense of 1,000 on `card` dated 21 Jan 2027 gives card −1,000.
- `it('waits on both sides for a future payment to the card')`: a transfer of 500 bank→card on 1 Dec gives bank 10,000 and card 0.
- `it('takes cash out on the card at once and adds it to the bank on its day')`: a transfer of 300 card→bank on 1 Dec gives card −300 and bank 10,000.
- `it('counts a future exchange inside the card whole')`: a transfer card→card on 1 Dec, 100 EGP to 2 USD, gives the card EGP −100 and USD 2.
- `it('counts an entry dated late today')`: an expense on `bank` at today 23:59 is counted.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/core/utils/future.test.ts src/core/db/hooks.test.ts`
Expected: FAIL. `future.ts` doesn't exist, and the future bank and payment cases count too early.

- [ ] **Step 3: Implement `future.ts` and the rule in `balancesOf`**

Build a set of credit card ids from `accounts`. `useBalances` keeps calling `balancesOf(accounts, txs)`, so it uses the default `today`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS. Fix any older test that relied on a future entry counting early only if the spec says it should now wait.

- [ ] **Step 5: Commit**

`git add src/core/utils/future.ts src/core/utils/future.test.ts src/core/db/hooks.ts src/core/db/hooks.test.ts` → `git commit -m "Leave future entries out of balances until their day"`

---

### Task 2: Future money onto a card waits in `cardStatus`

**Files:**
- Modify: `src/core/utils/creditCard.ts:173-246` (`cardStatus`)
- Test: `src/core/utils/creditCard.test.ts` (`describe('cardStatus')`)

**Interfaces:**
- Consumes: `isAfterToday` (Task 1).
- Produces: no new names. `cardStatus` ignores a positive delta dated after `today` (in `balance`, `atStatement` and `paid`), except for exchanges inside the card.

- [ ] **Step 1: Write the failing tests** (the file's helpers `card`, `spend`, `pay`, `tx`, `day`; today = 28 Nov 2026, statement 25 Nov)

- `it('waits for a payment dated ahead')`: `spend(500, 20 Nov)` and `pay(500, 3 Dec)` give `owed` 500, `paid` 0, `due` 500, state `'due'`. With today = 3 Dec they give `owed` 0, `paid` 500, state `'paid'`.
- `it('waits for a refund dated ahead')`: an `income` of 100 on the card dated 3 Dec leaves `owed` at the earlier spend.
- `it('still owes future instalments at once')`: an `inst(1000, 26 Jan 2027, 3, 12)` is in `owed` and in `toCome`.
- `it('counts a future exchange inside the card whole')`: the same exchange as in Task 1, dated 3 Dec, changes `owed` in both currencies.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/core/utils/creditCard.test.ts`
Expected: FAIL on the payment and refund cases.

- [ ] **Step 3: Skip future money onto the card in `cardStatus`'s loop**

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "Count a card payment dated ahead on its day"`

---

### Task 3: Hide future card charges from period screens

**Files:**
- Modify: `src/core/utils/future.ts`, `src/core/utils/future.test.ts`
- Modify: `src/core/db/hooks.ts:33-45` (`useTransactionsInRange`)

**Interfaces:**
- Consumes: `isAfterToday` (Task 1).
- Produces: `hiddenUntilItsDay(t: Transaction, cardIds: Set<string>, today: Date): boolean`. It's true when `cardIds.has(t.accountId)` and `isAfterToday(t.date, today)`.

- [ ] **Step 1: Write the failing tests** (`describe('hiddenUntilItsDay')`, card id `card`, today = 23 Nov 2026 12:00)

- True: a card instalment dated 21 Jan 2027. A card expense dated tomorrow at 00:00. A card→bank transfer dated 1 Dec.
- False: a card expense dated today at 23:59. A bank expense dated 1 Dec. A bank→card transfer dated 1 Dec.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/core/utils/future.test.ts`
Expected: FAIL (`hiddenUntilItsDay` isn't exported yet).

- [ ] **Step 3: Implement `hiddenUntilItsDay` and filter `useTransactionsInRange` with it**

In the live query, read the alive accounts and build the card-id set with `isCreditCard`. Filter with `new Date()` taken inside the query. Update the function's comment to say future card charges are left out. Leave `useCardTransactions` and other card readers alone.

- [ ] **Step 4: Run the suite and typecheck**

Run: `npm test` and then `npm run typecheck`
Expected: PASS with no type errors.

- [ ] **Step 5: Commit**

`git commit -m "Keep future card charges out of the list and totals until their day"`

---

### Task 4: Each upcoming statement's charges

**Files:**
- Modify: `src/core/utils/creditCard.ts:290-345` (`UpcomingStatement`, `upcomingStatements`)
- Test: `src/core/utils/creditCard.test.ts` (`describe('upcomingStatements')`)

**Interfaces:**
- Produces:
  ```ts
  export interface UpcomingStatement {
    statementOn: Date;
    dueOn: Date;
    byCurrency: Amounts;
    /** Money off the card dated in this statement's cycle, oldest first. Exchanges and money in left out. */
    charges: Transaction[];
    /** The next statement only: what's left of the last statement after payments, per currency (only those above 0). */
    carried?: Amounts;
  }
  ```
- For the next statement (index 0), `charges` = charges dated after the last statement up to the end of the next statement day. Each currency of `carried` = `roundTo(byCurrency[cur] − sum of its charges in cur)`, kept only when above 0. For later statements, `charges` are exactly the transactions their `byCurrency` already adds up.

- [ ] **Step 1: Write the failing tests** (today 28 Nov 2026, statement 25 Nov, next 25 Dec)

- `it('lists the charges on each later statement, adding up to its amount')`: the 3-instalment plan from the first existing test. `list[1].charges` is the 26 Dec instalment only, and the sum of each later statement's `charges` equals its `byCurrency.EGP`.
- `it('lists this cycle's charges on the next statement and carries the unpaid rest')`: `spend(500, 10 Nov)`, `spend(80, 27 Nov)` and `inst(300, 3 Dec, 1, 2)`. `list[0].charges` are the 27 Nov and 3 Dec ones, oldest first. `list[0].carried` is `{ EGP: 500 }`.
- `it('carries nothing once the last statement is paid or overpaid')`: `spend(500, 10 Nov)`, `pay(600, 26 Nov)` and `spend(80, 27 Nov)`. `list[0].carried` is `undefined` or `{}`, and `charges` has the 80 only.
- `it('leaves payments and exchanges out of the charges')`: the existing payments-and-exchanges fixture. `list[1].charges` has the 40 spend only.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/core/utils/creditCard.test.ts`
Expected: FAIL (`charges` is undefined).

- [ ] **Step 3: Collect the charge transactions per statement index alongside the sums**

The sums stay computed exactly as now. The existing `upcomingStatements` tests must pass unchanged.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "List the charges on each upcoming card statement"`

---

### Task 5: Statement sheet on the card page

**Files:**
- Create: `src/features/accounts/card/CardTxRow.tsx` (moved out of `CreditCardPage.tsx:140-175`, unchanged apart from the instalment tag)
- Create: `src/features/accounts/card/StatementSheet.tsx`
- Modify: `src/features/accounts/CreditCardPage.tsx` (import `CardTxRow` from its new file)
- Modify: `src/features/accounts/card/UpcomingBlock.tsx` (each statement row becomes a `<button className="b-row">` that opens the sheet)
- Modify: `src/core/i18n/locales/en.json`, `ar.json` (`cards` section)

**Interfaces:**
- Consumes: `UpcomingStatement.charges` and `.carried` (Task 4). `useDayMonth` (`CardBlocks.tsx`). `useTxEditor`. The `instalments.tag` text.
- Produces: `CardTxRow({ tx, cardId }: { tx: Transaction; cardId: string })`, which now shows `<span className="b-row__tag">{t('instalments.tag', tx.instalment)}</span>` after the title when `tx.instalment` is set, as `TransactionsPage.tsx:390` does.
- Produces: `StatementSheet({ account, statement, onClose }: { account: Account & { credit: CreditCard }; statement: UpcomingStatement | null; onClose(): void })`. It's an `IonModal` sheet (as `GroupSheet.tsx` uses) and stays closed while `statement` is null.

The sheet shows:
- Its title: `t('cards.statementSheetTitle', { date: dayMonth(statementOn), due: dayMonth(dueOn) })`.
- When `carried` has a currency, a first plain row labelled `t('cards.statementCarried')` with those amounts, in `AmountLines` style: the main currency first, the second one small.
- Then each charge as a `CardTxRow`. Tapping it opens the editor and closes the sheet.
- With no carried amount and no charges, a muted `t('cards.statementEmpty')` line.

Texts:

| key | en | ar |
|---|---|---|
| `cards.statementSheetTitle` | `Statement {{date}} · due {{due}}` | `كشف {{date}} · يستحق {{due}}` |
| `cards.statementCarried` | `Left from the last statement` | `المتبقي من الكشف السابق` |
| `cards.statementEmpty` | `Nothing on this statement yet` | `لا شيء على هذا الكشف بعد` |

- [ ] **Step 1: Move `CardTxRow` and add the tag; open the page's imports**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Build `StatementSheet`, wire `UpcomingBlock`, add the texts**

`UpcomingBlock` keeps `const [open, setOpen] = useState<UpcomingStatement | null>(null)`. The "Show all" button and the note are unchanged.

- [ ] **Step 3: Run the suite and typecheck**

Run: `npm test` and then `npm run typecheck`
Expected: PASS with no type errors. The i18n key checks, if any, pass for both locales.

- [ ] **Step 4: Commit**

`git commit -m "Show what's on each upcoming statement from the card page"`

---

### Finish

- [ ] Ask the user before any device or emulator check: it needs a build (user rule).
- [ ] Integrate through a GitHub PR to `master` (user rule). Don't merge locally.
