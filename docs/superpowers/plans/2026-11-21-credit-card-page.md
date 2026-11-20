# Credit card page and due-date rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a credit card's payment be due on a day of the month or N days after the statement, show the
current cycle and the interest-free window, and add a full card page opened from the card sheet.

**Architecture:** All date and money logic stays in the pure module `src/core/utils/creditCard.ts` (unit
tested with Vitest). The sheet and the new page share display blocks from one new component file. The page
is an Ionic routed page at `/cards/:id`, like `RecurringPage`.

**Tech Stack:** React 18, Ionic React, Dexie (`useLiveQuery`), react-i18next (en + ar), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-21-credit-card-page-design.md` (builds on
`2026-11-08-credit-cards-design.md`).

## Global Constraints

- No schema migration: `dueAfter` is an optional field; a card without it behaves exactly as today.
- `dueDay` stays required and is still saved when "days after" is picked (the due date's day of the month
  for the current cycle), so older builds read a close date.
- `dueAfter` is a whole number from 1 to 30. 31+ is not clamped: the editor shows the explanation and won't save.
- Every new string exists in both `src/core/i18n/locales/en.json` and `ar.json`, under `cards`.
- Two-currency cards: every amount block shows the main currency always and the second only when non-zero
  (the existing `lines()` behaviour in `CreditCardSheet.tsx`).
- Do not run `vite build`, `cap` or Gradle. `npm test` and `npm run typecheck` are fine. Starting the dev
  server to look at the screens needs the user's OK first.
- Commits go on `feature/credit-card-page`; the branch reaches master through a GitHub PR.

## Review Focus

1. A card saved before this change (no `dueAfter`) must give exactly the same dates and amounts as before:
   the existing `creditCard.test.ts` suite stays green untouched (Task 1).
2. Statement day 31 with `dueAfter` in a short month: the statement falls on the month's last day and the
   due date counts from there (Task 1 test `counts days after from the last day of a short month`).
3. Typing 55, 0, 2.5 or nothing into "days after statement": no save, and 31+ shows the explanation
   (Task 1 tests for `parseDueAfter`, Task 2 wiring).
4. Two-currency card: `spent` is tracked per currency, the second currency's line appears only when non-zero
   (Task 1 test `tracks spending in each currency`).
5. Opening `/cards/<id>` for a card that was deleted, archived, or switched back to debit: the page sends
   the user back to `/accounts` instead of rendering a broken page (Task 4).

---

### Task 1: Due-date rule, cycle, spending and interest-free window (pure logic)

**Files:**
- Modify: `src/shared/models/index.ts:57-69` (`CreditCard`)
- Modify: `src/core/utils/creditCard.ts`
- Test: `src/core/utils/creditCard.test.ts`

**Interfaces:**
- Produces (all exported from `@/core/utils/creditCard`):
  - `CreditCard.dueAfter?: number` — days after the statement; wins over `dueDay`.
  - `const MAX_DUE_AFTER = 30`
  - `dueOf(statementOn: Date, credit: CreditCard): Date`
  - `CardCycle` gains `previousStatementOn: Date` and `nextDueOn: Date`.
  - `CardAmounts` gains `spent: number`.
  - `interface InterestFree { today: { payBy: Date; days: number }; best: { buyOn: Date; payBy: Date; days: number } }`
  - `interestFree(credit: CreditCard, today: Date): InterestFree`
  - `fixedDueDay(credit: CreditCard, today: Date): number` — the day of month of the current cycle's `dueOn`.
  - `parseDueAfter(typed: string): number | undefined` — a whole number 1–`MAX_DUE_AFTER`, else undefined.
  - `cardTransactions(cardId: string, txs: Transaction[], cycle: CardCycle): { thisCycle: Transaction[]; lastCycle: Transaction[] }` — newest first.

- [ ] **Step 1: Write the failing tests** (reuse the file's `day`, `ymd`, `credit`, `card`, `tx`, `spend`, `pay` helpers)

```ts
describe('due days after the statement', () => {
  it('counts the due date from the statement', () => {
    const c = cycleOf(credit({ statementDay: 5, dueAfter: 25 }), day(2026, 11, 21));
    expect(ymd(c.previousStatementOn)).toEqual([2026, 10, 5]);
    expect(ymd(c.statementOn)).toEqual([2026, 11, 5]);
    expect(ymd(c.dueOn)).toEqual([2026, 11, 30]);
    expect(ymd(c.nextStatementOn)).toEqual([2026, 12, 5]);
    expect(ymd(c.nextDueOn)).toEqual([2026, 12, 30]);
  });
  it('wins over the due day', () => {
    expect(ymd(cycleOf(credit({ statementDay: 5, dueDay: 3, dueAfter: 25 }), day(2026, 11, 21)).dueOn)).toEqual([2026, 11, 30]);
  });
  it('crosses into the next month', () => {
    expect(ymd(cycleOf(credit({ statementDay: 25, dueAfter: 25 }), day(2026, 10, 28)).dueOn)).toEqual([2026, 11, 19]);
  });
  it('counts days after from the last day of a short month', () => {
    const c = cycleOf(credit({ statementDay: 31, dueAfter: 25 }), day(2026, 3, 5));
    expect(ymd(c.statementOn)).toEqual([2026, 2, 28]);
    expect(ymd(c.dueOn)).toEqual([2026, 3, 25]);
  });
});

it('gives the next statement’s due date for a due day too', () => {
  expect(ymd(cycleOf(credit(), day(2026, 11, 28)).nextDueOn)).toEqual([2027, 1, 20]);
});

describe('spent', () => {
  // statement 25 Nov (credit() default), today 28 Nov
  it('adds up money going out of the card since the statement, not payments or exchanges', () => {
    const txs = [
      spend(50, day(2026, 11, 20)),
      spend(100, day(2026, 11, 26)),
      tx({ type: 'transfer', amount: 20, toAccountId: 'bank', date: day(2026, 11, 27).toISOString() }),
      tx({ type: 'transfer', amount: 10, toAccountId: 'card', toCurrency: 'USD', toAmount: 0.2, date: day(2026, 11, 27).toISOString() }),
      pay(30, day(2026, 11, 27)),
    ];
    expect(cardStatus(card(), txs, day(2026, 11, 28)).byCurrency.EGP.spent).toBe(120);
  });
  it('tracks spending in each currency', () => {
    const c = card({ currency2: 'USD' });
    const s = cardStatus(c, [tx({ type: 'expense', amount: 7, currency: 'USD', date: day(2026, 11, 26).toISOString() })], day(2026, 11, 28));
    expect(s.byCurrency.USD.spent).toBe(7);
    expect(s.byCurrency.EGP.spent).toBe(0);
  });
});

describe('interestFree', () => {
  const c = credit({ statementDay: 5, dueAfter: 25 });
  it('says when something bought today is due, and the best day to buy', () => {
    const f = interestFree(c, day(2026, 11, 21));
    expect(ymd(f.today.payBy)).toEqual([2026, 12, 30]);
    expect(f.today.days).toBe(39);
    expect(ymd(f.best.buyOn)).toEqual([2026, 12, 6]);
    expect(ymd(f.best.payBy)).toEqual([2027, 1, 30]);
    expect(f.best.days).toBe(55);
  });
  it('puts a purchase on the statement day on that statement', () => {
    const f = interestFree(c, day(2026, 12, 5));
    expect(ymd(f.today.payBy)).toEqual([2026, 12, 30]);
    expect(f.today.days).toBe(25);
  });
});

it('fixedDueDay is the current due date’s day of the month', () => {
  expect(fixedDueDay(credit({ statementDay: 5, dueAfter: 25 }), day(2026, 11, 21))).toBe(30);
});

it('parseDueAfter takes whole numbers from 1 to 30 only', () => {
  expect(parseDueAfter('25')).toBe(25);
  expect(parseDueAfter('30')).toBe(30);
  for (const bad of ['', '0', '31', '55', '2.5', 'abc']) expect(parseDueAfter(bad)).toBeUndefined();
});

it('cardTransactions splits this cycle from the last one, newest first, this card only', () => {
  const cyc = cycleOf(credit(), day(2026, 11, 28)); // last 25 Oct–25 Nov, this from 26 Nov
  const a = spend(1, day(2026, 10, 20)); // before the last cycle
  const b = spend(2, day(2026, 11, 1));
  const c2 = spend(3, day(2026, 11, 25, 23));
  const d = pay(4, day(2026, 11, 26));
  const e = spend(5, day(2026, 11, 27));
  const other = tx({ type: 'expense', amount: 6, accountId: 'bank', date: day(2026, 11, 27).toISOString() });
  const r = cardTransactions('card', [a, b, c2, d, e, other], cyc);
  expect(r.thisCycle.map((t) => t.amount)).toEqual([5, 4]);
  expect(r.lastCycle.map((t) => t.amount)).toEqual([3, 2]);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/core/utils/creditCard.test.ts`
Expected: FAIL (`interestFree`, `parseDueAfter`, `cardTransactions`, `fixedDueDay` are not exported; `nextDueOn`/`spent` undefined).

- [ ] **Step 3: Implement**

- Add `dueAfter?: number` to `CreditCard` with a doc comment ("Payment is due this many days after the statement (1–30); when set, `dueDay` is ignored.").
- `dueOf`: with `dueAfter`, `new Date(y, m, d + dueAfter)` from `statementOn`; otherwise the current "first `dueDay` after the statement" logic moved out of `cycleOf`.
- `cycleOf` uses `dueOf` for `dueOn` and `nextDueOn`, and sets `previousStatementOn = dayIn(y, m - 1, statementDay)`.
- `cardStatus`: in the loop, after the cutoff, a negative delta that isn't an exchange adds `-delta` to `spent[cur]`; set `spent` on every `CardAmounts` (0 when none).
- `interestFree`: `today.payBy` = `cycle.nextDueOn` (a purchase today, up to the end of the statement day, goes on the next statement); `best.buyOn` = day after `cycle.nextStatementOn`; `best.payBy` = `dueOf(dayIn(next month of nextStatementOn, statementDay), credit)`; days via the existing `daysBetween(startOfDay(...), ...)`.
- `parseDueAfter`: `/^\d+$/` then range check.
- `cardTransactions`: keep txs with `accountId === cardId || toAccountId === cardId`; this cycle = date ≥ `nextDay(statementOn)`; last cycle = date ≥ `nextDay(previousStatementOn)` and < `nextDay(statementOn)`; sort by `date` desc, then `createdAt` desc.

- [ ] **Step 4: Run the whole file and the typecheck**

Run: `npx vitest run src/core/utils/creditCard.test.ts` then `npm run typecheck`
Expected: all tests PASS, including every pre-existing one unchanged; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/models/index.ts src/core/utils/creditCard.ts src/core/utils/creditCard.test.ts
git commit -m "Credit cards: due N days after the statement, spending this cycle, interest-free window"
```

---

### Task 2: Card setup asks how the payment is due

**Files:**
- Modify: `src/features/accounts/AccountEditModal.tsx` (state ~line 80–117, save ~line 205, credit fields ~line 346–364)
- Modify: `src/core/i18n/locales/en.json`, `ar.json` (`cards`)

**Interfaces:**
- Consumes: `MAX_DUE_AFTER`, `parseDueAfter`, `fixedDueDay`, `interestFree` from Task 1.

- [ ] **Step 1: Add the strings** (en; ar to match):
  `dueRule`: "Payment due", `dueRuleDay`: "Day of the month", `dueRuleAfter`: "Days after statement",
  `dueAfter`: "Days after the statement",
  `dueAfterTooMany`: "That sounds like the total from the day you buy. Payment is usually due 21–30 days after the statement; for 55 days in total, enter about 25.",
  `upToDays_one`/`_other`: "Up to {{count}} day interest-free." / "Up to {{count}} days interest-free."
  Keep `daysHint`.

- [ ] **Step 2: Implement the editor**

- New state: `dueMode: 'day' | 'after'` (from `credit?.dueAfter ? 'after' : 'day'`), `dueAfter: string` (from `credit?.dueAfter`, new cards `'25'`).
- Under the statement day picker: a two-option switch in the editor's existing segmented style (the Debit / Credit choice in the same file), then either the existing due-day `<select>` or a numeric `<input inputMode="numeric">`.
- Below: if mode is `after` and the typed value is a whole number > 30, show `dueAfterTooMany` in the error/hint style the form already uses; otherwise, when the setup is valid, show `upToDays` with `count = interestFree(draft, new Date()).best.days`.
- Save is blocked while mode is `after` and `parseDueAfter(dueAfter)` is undefined (follow how the form already disables Save for an invalid entry).
- Saved `credit`: mode `after` → `dueAfter: parseDueAfter(...)`, `dueDay: fixedDueDay(draft, new Date())`; mode `day` → `dueDay`, `dueAfter: undefined`.

- [ ] **Step 3: Typecheck and tests**

Run: `npm run typecheck` and `npm test`
Expected: no errors; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/accounts/AccountEditModal.tsx src/core/i18n/locales/en.json src/core/i18n/locales/ar.json
git commit -m "Card setup: payment due on a day of the month or days after the statement"
```

---

### Task 3: Shared card blocks; the sheet shows this cycle and opens the page

**Files:**
- Create: `src/features/accounts/card/CardBlocks.tsx`
- Create: `src/features/accounts/card/useCardActions.ts`
- Modify: `src/features/accounts/CreditCardSheet.tsx`
- Modify: `en.json`, `ar.json` (`cards`)

**Interfaces:**
- Consumes: `CardStatus` with `spent`, `nextDueOn` (Task 1).
- Produces:
  - `CardBlocks.tsx` exports `OwedBlock({ account, status })`, `StatementBlock({ account, status })` (statement rows + `DueLine` + nothing about next statement), `CycleBlock({ account, status, title?: boolean })`, `useDayMonth()`, `AmountLines` helper (the sheet's `lines()` as a component: `({ account, status, pick })`).
  - `useCardActions(account: Account, status: CardStatus)` returns `{ pay(amount?: number), payMinimum?: () => void, addPurchase(), addFee() }` (`payMinimum` only when the existing condition `minimum > 0 && minimum < due` holds).

- [ ] **Step 1: Add strings** (en; ar to match): `thisCycle`: "This cycle · {{from}} – {{to}}", `spentSoFar`: "Spent so far",
  `nextSoFar`: "Next statement so far", `nextStatementDue`: "Statement {{date}} · due {{due}}", `details`: "Card details".
  `nextStatement` becomes unused once `CycleBlock` replaces it; remove it from both files.

- [ ] **Step 2: Move the blocks** out of `CreditCardSheet.tsx` into `CardBlocks.tsx` unchanged in output, and the pay / purchase / fee handlers into `useCardActions.ts`.

- [ ] **Step 3: `CycleBlock`**: rows `spentSoFar` (amount lines of `spent`), `nextSoFar` (lines of `owed`, shown only when some currency's `owed !== spent`), then `nextStatementDue` with `nextStatementOn` and `nextDueOn`. With `title`, a `b-section-title` reading `thisCycle` from the day after `statementOn` to `nextStatementOn`.

- [ ] **Step 4: Sheet** renders `OwedBlock`, `StatementBlock`, then the `CycleBlock` rows inside the same statement card (no title, replacing the old "Next statement on" line), and a `cards.details` button (icon `chevronForwardOutline`, muted style) that closes the sheet and `router.push(`/cards/${account.id}`)` via `useIonRouter`.

- [ ] **Step 5: Typecheck and tests**

Run: `npm run typecheck` and `npm test` — Expected: clean, all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/accounts/card src/features/accounts/CreditCardSheet.tsx src/core/i18n/locales/en.json src/core/i18n/locales/ar.json
git commit -m "Card sheet: show this cycle and open the card page"
```

---

### Task 4: The credit card page

**Files:**
- Create: `src/features/accounts/CreditCardPage.tsx`
- Modify: `src/App.tsx` (route next to `/recurring`, ~line 59)
- Modify: `src/core/db/hooks.ts` (new hook after `useCardStatuses`)
- Modify: `en.json`, `ar.json` (`cards`)
- Modify: `README.md:17` (Accounts row: one sentence on credit cards and the card page)

**Interfaces:**
- Consumes: everything from Tasks 1 and 3; `useTxEditor()`; `AccountEditModal`.
- Produces: `useCardTransactions(cardId: string): Transaction[] | undefined` in `hooks.ts` — this card's live transactions (same query as `useCardStatuses`, one id).

- [ ] **Step 1: Add strings** (en; ar to match): `interestFreeTitle`: "Interest-free",
  `buyToday`: "Buy today → pay by {{date}}", `bestDay`: "Best day to buy: {{date}}", `days_one`/`_other`: "{{count}} day"/"{{count}} days",
  `interestFreeNote`: "Only while each statement is paid in full by its due date.",
  `txThisCycle`: "Transactions this cycle", `txEarlier`: "Earlier (statement of {{date}})", `noTx`: "Nothing yet".

- [ ] **Step 2: Route and hook.** `<Route exact path="/cards/:id" component={CreditCardPage} />`; `useCardTransactions` as above.

- [ ] **Step 3: Page.** `IonPage` with the `RecurringPage` header pattern: back button `defaultHref="/accounts"`, title = account name, Edit button opening `AccountEditModal` for this account. Body (`b-page`), in order: `OwedBlock`; section `statementOf` + `StatementBlock`; `CycleBlock` with title; Interest-free card (`interestFree(credit, new Date())`: two rows with days on the right, then `interestFreeNote` muted); `txThisCycle` list and an "Earlier" toggle row revealing the last cycle (`cardTransactions`). Footer actions as in the sheet, from `useCardActions`. Rows match the Transactions page's `b-row` markup (avatar of the category or transfer icon, title, date in sub, signed amount from the card's side); tapping one calls `openEditor({ tx })`.
- If `useAccounts()` has loaded and the id isn't a live, non-archived credit card, render `<Redirect to="/accounts" />`.

- [ ] **Step 4: Typecheck and tests**

Run: `npm run typecheck` and `npm test` — Expected: clean, all PASS.

- [ ] **Step 5: Look at it** (only with the user's OK to start the dev server): a card with statement day 5 and 25 days after shows the dates from the spec's example for today's date; the Card details button opens the page; back returns; a deleted card's URL lands on Accounts; Arabic layout reads right to left.

- [ ] **Step 6: Commit**

```bash
git add src/features/accounts/CreditCardPage.tsx src/App.tsx src/core/db/hooks.ts src/core/i18n/locales/en.json src/core/i18n/locales/ar.json README.md
git commit -m "Credit card page with this cycle, interest-free window and transactions"
```
