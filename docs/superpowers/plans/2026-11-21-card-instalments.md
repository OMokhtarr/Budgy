# Credit card instalments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a credit card purchase be split into monthly instalments that count as spending one month at
a time, keep the card owing the full price, bill one instalment per statement, and optionally add the
monthly payment from a bank account automatically.

**Architecture:** A plan is N ordinary expense transactions on the card, one per month, linked by
`instalment.planId`. Totals go by date and balances count every transaction, so most of the app needs no
change. Card maths stays in the pure `creditCard.ts`; plan writes (create, convert, pay off, delete) live in a
new `src/features/accounts/card/instalments.ts` tested against the fake IndexedDB like
`recurring/actions.ts`. The automatic payment is a recurring transfer with a new `until` end day.

**Tech Stack:** React 18, Ionic React, Dexie, react-i18next (en + ar), Vitest with `@/test/setup-db`.

**Spec:** `docs/superpowers/specs/2026-11-21-card-instalments-design.md`

## Global Constraints

- No migration: `Transaction.instalment`, `Recurring.until` and `Recurring.planId` are optional fields.
- Instalments exist only on **expenses on a credit card** (`isCreditCard`).
- Instalment amounts: `price / N` rounded with `roundTo(…, currency)`; the last one takes the difference so the
  sum equals the price exactly.
- Instalment *k* (1..N) is dated on the purchase's date-time plus *k−1* months, the day clamped to the month's
  last day, always counted from the purchase (no drift).
- Automatic payments are added on their day by the existing AutoRecurring, never ahead.
- Every new string in `en.json` and `ar.json`; Arabic plurals use zero/one/two/few/many/other as the file does.
- Do not run `vite build`, `cap` or Gradle. `npm test`, `npm run typecheck`, and looking at the already
  running dev server are fine.
- Work on `feature/card-instalments` (branched from `feature/credit-card-page`).

## Review Focus

1. Rounding: 1,000 over 3 months gives 333.33, 333.33, 333.34 (Task 3 test `splits so the parts add up`).
2. A purchase on 31 Jan gives 28 Feb, 31 Mar, 30 Apr — no drift (Task 3 test `dates each instalment from the purchase`).
3. Editing one instalment in the transaction editor must keep it in its plan (Task 3 test on `buildTxRecord` keeping `instalment`).
4. Automatic payment stops after `until` and never adds before its day (Task 1 tests on `occurrencesBetween`/`dueDays`; Task 3 test that `createPlan` adds no transfer).
5. Instalment in a two-currency card's second currency: `toCome`/`later` per currency (Task 2 test).

---

### Task 1: Recurring transactions can end

**Files:**
- Modify: `src/shared/models/index.ts` (`Recurring`: `until?: string`, `planId?: string`)
- Modify: `src/core/utils/recurring.ts` (`occurrencesBetween`, `nextAfter` types, new `isFinished`)
- Modify: `src/features/recurring/RecurringPage.tsx` (row sub-line)
- Modify: `en.json`, `ar.json` (`recurring.until`, `recurring.ended`)
- Test: `src/core/utils/recurring.test.ts`

**Interfaces:**
- Produces: `occurrencesBetween(r: Repeat & Pick<Recurring, 'start' | 'until'>, from, to, limit?)` never returns a day after `r.until`; `isFinished(r: Pick<Recurring, 'next' | 'until'>): boolean` = `until != null && next > until`.

- [ ] **Step 1: Failing tests**

```ts
describe('until', () => {
  it('stops occurrences after the last day', () => {
    expect(occurrencesBetween(rule({ start: '2026-01-15', until: '2026-03-15' }), '2026-01-01', '2026-12-31'))
      .toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });
  it('has nothing due once finished', () => {
    expect(dueDays(rule({ start: '2026-01-15', next: '2026-04-15', until: '2026-03-15' }), new Date(2026, 5, 1))).toEqual([]);
  });
  it('isFinished once next is past until', () => {
    expect(isFinished({ next: '2026-04-15', until: '2026-03-15' })).toBe(true);
    expect(isFinished({ next: '2026-03-15', until: '2026-03-15' })).toBe(false);
    expect(isFinished({ next: '2026-03-15' })).toBe(false);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/core/utils/recurring.test.ts` — Expected: FAIL (`isFinished` missing; occurrences past `until`).
- [ ] **Step 3: Implement.** In `occurrencesBetween`, use `min(to, r.until)` as the end. Add `isFinished`. RecurringPage: sub-line reads `recurring.ended` when finished, otherwise appends `· recurring.until {date}` when `until` is set. Strings: en `"until": "until {{date}}"`, `"ended": "Ended"`; ar `"until": "حتى {{date}}"`, `"ended": "انتهى"`.
- [ ] **Step 4:** `npx vitest run src/core/utils/recurring.test.ts`, `npm test`, `npm run typecheck` — Expected: all PASS, no type errors (reminders' `planReminders` gets the end for free through `occurrencesBetween`).
- [ ] **Step 5: Commit** `Recurring transactions can end on a day`.

---

### Task 2: Card maths knows about instalments

**Files:**
- Modify: `src/shared/models/index.ts` (`Transaction.instalment?: { planId: string; n: number; of: number }`)
- Modify: `src/core/utils/creditCard.ts`
- Test: `src/core/utils/creditCard.test.ts`

**Interfaces:**
- Produces:
  - `CardAmounts` gains `later: number` (charges dated after the end of the next statement day) and `toCome: number` (instalment charges dated after the end of today).
  - `spent` counts only charges dated up to the end of today.
  - `statementFor(credit: CreditCard, date: Date): { statementOn: Date; dueOn: Date }` — the statement a charge on `date` lands on (= `cycleOf(credit, date).nextStatementOn` / `.nextDueOn`).
  - `cardTransactions` "this cycle" stops at the end of `nextStatementOn`.
  - Minimum: `full = min(statement, inst + max(round((statement − inst) × %), floor))` where `inst` = this card's instalment charges dated in (`previousStatementOn`, `statementOn`] (end of day), per currency; the rest of the rule unchanged.
  - `interface InstalmentPlan { planId: string; first: Transaction; of: number; monthly: number; currency: string; charged: number; toCome: number }` and `instalmentPlans(cardId: string, txs: Transaction[], today: Date): InstalmentPlan[]` (only plans with `toCome > 0`, ordered by `first.date`). `monthly` = instalment 1's amount; `charged` = how many are dated up to the end of today.

- [ ] **Step 1: Failing tests** (helpers from the file; `inst(amount, date, n, of, planId = 'p')` = `tx({ type: 'expense', amount, date: date.toISOString(), instalment: { planId, n, of } })`; default card: statement 25th, due 20th; today 28 Nov 2026)

```ts
describe('instalments on the card', () => {
  const today = day(2026, 11, 28);
  const plan = [1, 2, 3].map((n) => inst(1000, day(2026, 10 + n, 26), n, 3)); // 26 Nov, 26 Dec, 26 Jan
  it('owes the full price at once', () => {
    expect(cardStatus(card(), plan, today).byCurrency.EGP.owed).toBe(3000);
  });
  it('counts only what is dated up to today as spent, and the rest as still to come', () => {
    const s = cardStatus(card(), plan, today).byCurrency.EGP;
    expect(s.spent).toBe(1000);
    expect(s.toCome).toBe(2000);
  });
  it('leaves later statements’ instalments out of the next statement', () => {
    expect(cardStatus(card(), plan, today).byCurrency.EGP.later).toBe(2000); // 26 Dec and 26 Jan land after the 25 Dec statement
  });
  it('bills one instalment per statement', () => {
    expect(cardStatus(card(), plan, day(2026, 12, 28)).byCurrency.EGP.due).toBe(1000); // the 25 Dec statement holds only 26 Nov's
  });
  it('asks the instalments plus the minimum % of the rest', () => {
    const c = card({ credit: credit({ minPercent: 5 }) });
    const s = cardStatus(c, [inst(1000, day(2026, 11, 10), 1, 12), spend(2000, day(2026, 11, 11))], today);
    expect(s.byCurrency.EGP.minimum).toBe(1000 + 100);
  });
  it('tracks instalments in a second currency on their own', () => {
    const s = cardStatus(card({ currency2: 'USD' }), [tx({ type: 'expense', amount: 50, currency: 'USD', date: day(2027, 1, 26).toISOString(), instalment: { planId: 'u', n: 2, of: 2 } })], today);
    expect(s.byCurrency.USD.toCome).toBe(50);
    expect(s.byCurrency.EGP.toCome).toBe(0);
  });
});

it('statementFor gives the statement a charge lands on, and its due date', () => {
  const s = statementFor(credit(), day(2026, 11, 25));
  expect(ymd(s.statementOn)).toEqual([2026, 11, 25]);
  expect(ymd(s.dueOn)).toEqual([2026, 12, 20]);
  expect(ymd(statementFor(credit(), day(2026, 11, 26)).statementOn)).toEqual([2026, 12, 25]);
});

it('instalmentPlans lists running plans with what is charged and still to come', () => {
  const txs = [1, 2, 3].map((n) => inst(1000, day(2026, 10 + n, 26), n, 3));
  const [p] = instalmentPlans('card', txs, day(2026, 11, 28));
  expect(p).toMatchObject({ planId: 'p', of: 3, monthly: 1000, charged: 1, toCome: 2000, currency: 'EGP' });
  expect(instalmentPlans('card', txs, day(2027, 2, 1))).toEqual([]);
});

it('cardTransactions leaves out charges after the next statement', () => {
  const r = cardTransactions('card', [inst(1, day(2026, 11, 27), 1, 2), inst(2, day(2027, 1, 2), 2, 2)], cycleOf(credit(), day(2026, 11, 28)));
  expect(r.thisCycle.map((t) => t.amount)).toEqual([1]);
});
```

- [ ] **Step 2:** `npx vitest run src/core/utils/creditCard.test.ts` — Expected: the new tests FAIL; existing ones PASS.
- [ ] **Step 3: Implement** the Interfaces above. `endOfToday = nextDay(startOfDay(today))`; `nextEnd = nextDay(cycle.nextStatementOn)`. In the loop, for a non-exchange negative delta after the cutoff: `spent` if date < `endOfToday`; `later` if date ≥ `nextEnd`; `toCome` if `t.instalment` and date ≥ `endOfToday`. `inst` for the minimum: instalment charges with date in [`nextDay(previousStatementOn)`, `cutoff`).
- [ ] **Step 4:** `npx vitest run src/core/utils/creditCard.test.ts`, `npm test`, `npm run typecheck` — Expected: all PASS.
- [ ] **Step 5: Commit** `Credit cards: instalments owed in full, billed one per statement`.

---

### Task 3: Making and managing a plan (data)

**Files:**
- Create: `src/features/accounts/card/instalments.ts`
- Create: `src/features/accounts/card/instalments.test.ts`
- Modify: `src/features/transactions/txRecord.ts` (`TxDraft.instalment`, kept by `buildTxRecord` on expenses only)
- Test: `src/features/transactions/txRecord.test.ts` (one new case)

**Interfaces:**
- Consumes: `statementFor` (Task 2); `Recurring.until`/`planId` (Task 1); `stopRecurring`, `templateOf` from `recurring/actions.ts`; `softDelete`, `BudgyDB`, `newId`.
- Produces:
  - `splitAmount(total: number, n: number, currency: string): number[]`
  - `instalmentDates(firstIso: string, n: number): string[]`
  - `interface PlanOptions { months: number; fee?: number; feeCategoryId?: string; feeNote: string; autoPayFrom?: string; credit: CreditCard }`
  - `createPlan(purchase: Omit<Transaction, 'id'>, o: PlanOptions, database?: BudgyDB): Promise<string>` → planId. Adds N instalments (category, subcategory, note, currency, rate copied), the fee expense when `fee > 0`, and when `autoPayFrom` a recurring: `{ tx: transfer autoPayFrom → card, amount = first instalment, currency }, unit 'month', every 1, auto: true, start = dayKey(statementFor(credit, date of 1).dueOn), next = start, until = dayKey(statementFor(credit, date of N).dueOn), planId }`. One Dexie transaction.
  - `convertToPlan(tx: Transaction, o: PlanOptions, database?): Promise<string>` — `tx` becomes instalment 1 (id and date kept, amount = first share), 2..N added; fee and auto-pay as above.
  - `payOffPlan(planId: string, now: Date, database?): Promise<number>` — re-dates every instalment dated after `now` to `now.toISOString()`, stops the plan's recurring; returns how many moved.
  - `deletePlan(planId: string, database?): Promise<number>` — soft-deletes all the plan's instalments and stops its recurring; returns how many.

- [ ] **Step 1: Failing tests** (`import '@/test/setup-db'`; `new BudgyDB('t-instalments')`, cleared in `beforeEach`; `credit = { statementDay: 25, dueDay: 20 }`; purchase: expense 1000 EGP on 'card', category 'phone', date 2026-01-31 12:00 local)

```ts
it('splits so the parts add up', () => expect(splitAmount(1000, 3, 'EGP')).toEqual([333.33, 333.33, 333.34]));
it('dates each instalment from the purchase', () => {
  expect(instalmentDates(new Date(2026, 0, 31, 12).toISOString(), 4).map((d) => ymd(new Date(d)))).toEqual([[2026, 1, 31], [2026, 2, 28], [2026, 3, 31], [2026, 4, 30]]);
});
it('createPlan adds one expense per month linked to the plan, and no payment ahead', async () => {
  const id = await createPlan(purchase, { months: 3, feeNote: 'fee', credit }, database);
  const txs = (await database.transactions.toArray()).sort((a, b) => a.date.localeCompare(b.date));
  expect(txs.map((t) => [t.amount, t.instalment?.n, t.instalment?.of, t.instalment?.planId])).toEqual([[333.33, 1, 3, id], [333.33, 2, 3, id], [333.34, 3, 3, id]]);
  expect(txs.every((t) => t.type === 'expense' && t.categoryId === 'phone')).toBe(true);
});
it('adds the fee as its own expense on the purchase day', async () => {
  await createPlan(purchase, { months: 3, fee: 50, feeCategoryId: 'bills', feeNote: 'Instalment fee · Phone', credit }, database);
  const fee = (await database.transactions.toArray()).find((t) => !t.instalment)!;
  expect(fee).toMatchObject({ amount: 50, categoryId: 'bills', note: 'Instalment fee · Phone', date: purchase.date });
});
// 31 Jan lands on the 25 Feb statement, due 20 Mar; 31 Mar lands on 25 Apr, due 20 May.
it('sets up the automatic payment from each statement’s due date to the last one’s', async () => {
  const id = await createPlan(purchase, { months: 3, autoPayFrom: 'bank', feeNote: '', credit }, database);
  const [r] = await database.recurring.toArray();
  expect(r).toMatchObject({ planId: id, auto: true, unit: 'month', every: 1, start: '2026-03-20', next: '2026-03-20', until: '2026-05-20' });
  expect(r.tx).toMatchObject({ type: 'transfer', accountId: 'bank', toAccountId: 'card', amount: 333.33 });
  expect(await database.transactions.where('type').equals('transfer').count()).toBe(0);
});
it('convertToPlan keeps the purchase as instalment 1', async () => {
  const saved = await saveTx(purchase, undefined, database);
  await convertToPlan(saved, { months: 2, feeNote: '', credit }, database);
  const first = await database.transactions.get(saved.id!);
  expect(first).toMatchObject({ amount: 500, date: purchase.date, instalment: { n: 1, of: 2 } });
  expect(await database.transactions.count()).toBe(2);
});
it('payOffPlan moves what is still to come to now and stops the payment', async () => {
  const id = await createPlan(purchase, { months: 3, autoPayFrom: 'bank', feeNote: '', credit }, database);
  const now = new Date(2026, 1, 5, 9);
  expect(await payOffPlan(id, now, database)).toBe(2);
  const dates = (await database.transactions.toArray()).map((t) => t.date).sort();
  expect(dates).toEqual([purchase.date, now.toISOString(), now.toISOString()].sort());
  expect((await database.recurring.toArray()).filter(alive)).toEqual([]);
});
it('deletePlan removes every instalment and the payment', async () => {
  const id = await createPlan(purchase, { months: 3, autoPayFrom: 'bank', feeNote: '', credit }, database);
  expect(await deletePlan(id, database)).toBe(3);
  expect((await database.transactions.toArray()).filter(alive)).toEqual([]);
  expect((await database.recurring.toArray()).filter(alive)).toEqual([]);
});
```

`txRecord.test.ts`: `buildTxRecord({ …expense, instalment: { planId: 'p', n: 3, of: 12 } }).instalment` equals that object; on a transfer it is `undefined`.

- [ ] **Step 2:** `npx vitest run src/features/accounts/card/instalments.test.ts src/features/transactions/txRecord.test.ts` — Expected: FAIL (module missing; `instalment` dropped).
- [ ] **Step 3: Implement** the Interfaces. Dates: keep the purchase's time of day, add months with the day clamped (same `dayIn` idea as `recurring.ts`). Rate: copy `rate`/`rateCurrency` from the purchase onto every instalment.
- [ ] **Step 4:** the two test files, then `npm test` and `npm run typecheck` — Expected: all PASS.
- [ ] **Step 5: Commit** `Instalment plans: create, convert, pay off and delete`.

---

### Task 4: The editor makes plans

**Files:**
- Create: `src/features/transactions/InstalmentSheet.tsx`
- Modify: `src/features/transactions/TransactionEditor.tsx` (state, chip under the date ~line 666, save path ~line 316)
- Modify: `en.json`, `ar.json` (`instalments.*`)

**Interfaces:**
- Consumes: `createPlan`, `convertToPlan`, `PlanOptions` (Task 3); `isCreditCard`, `payFromAccount`; `TxDraft.instalment`.
- Produces: `InstalmentSheet({ isOpen, amount, currency, card, accounts, value?: InstalmentChoice, onDone(v?: InstalmentChoice), onClose })` with `InstalmentChoice = { months: number; fee?: number; autoPayFrom?: string }`.

- [ ] **Step 1: Strings** (en; ar to match): `instalments.chip`: "Instalments", `instalments.chipOn_other`: "{{count}} instalments",
  `instalments.title`: "Pay in instalments", `instalments.months`: "Months", `instalments.perMonth`: "= {{amount}} a month",
  `instalments.fee`: "One-time fee (optional)", `instalments.autoPay`: "Pay automatically from", `instalments.interestHint`: "If your bank adds interest, enter the total you'll pay.",
  `instalments.feeNote`: "Instalment fee · {{name}}", `instalments.of`: "Instalment {{n}} of {{of}}", `instalments.off`: "Pay in full", `instalments.done`: "Done".
- [ ] **Step 2: Sheet.** Months: numeric field 2–60 (default 12, parsed with `parseNumber`, whole numbers only); live "= X a month" from `splitAmount`; fee field (`cleanNumberInput`); a toggle for automatic payment and, when on, a `<select>` of accounts that can pay (same filter as `payFromAccount`), defaulting to `payFromAccount(...)`. "Done" returns the choice; "Pay in full" clears it.
- [ ] **Step 3: Editor.** `const [plan, setPlan] = useState<InstalmentChoice>()`. Chip shown when `type === 'expense' && account && isCreditCard(account) && !ruleMode && !due && !tx?.instalment && !tx?.groupId && !tx?.recurringId && !repeat`; Repeat chip hidden while `plan` is set. When editing an instalment, show a static chip `instalments.of`. `buildTxRecord` gets `instalment: tx?.instalment`. On save (not rule, not due): if `plan`, new → `createPlan(record, opts)`, existing → `saveTx(record, tx.id)` then `convertToPlan(saved, opts)`; `opts.feeCategoryId` = the Bills category id, `feeNote` = `t('instalments.feeNote', { name: note || categoryName(category) })`, `credit` = the card's.
- [ ] **Step 4:** `npm run typecheck`, `npm test` — Expected: clean, all PASS.
- [ ] **Step 5: Look at it** in the running dev server: on the cib card, add an expense of 3,000 in 3 instalments with automatic payment from Cash In; the Transactions list shows three entries a month apart; editing one shows "Instalment 2 of 3". Delete the test entries afterwards with the plan's Delete action (Task 5) or by hand.
- [ ] **Step 6: Commit** `Transaction editor: pay a credit card purchase in instalments`.

---

### Task 5: Instalments on the card page, sheet and lists

**Files:**
- Create: `src/features/accounts/card/InstalmentsBlock.tsx`
- Modify: `src/features/accounts/card/CardBlocks.tsx` (`OwedBlock` line; `CycleRows` uses `owed − later` for "Next statement so far")
- Modify: `src/features/accounts/CreditCardPage.tsx` (block after This cycle)
- Modify: `src/features/transactions/TransactionsPage.tsx` (tag in the expense row, ~line 389)
- Modify: `en.json`, `ar.json`, `README.md` (one clause in the Accounts row)

**Interfaces:**
- Consumes: `instalmentPlans`, `CardAmounts.toCome/later` (Task 2); `payOffPlan`, `deletePlan` (Task 3).

- [ ] **Step 1: Strings** (en; ar to match): `instalments.blockTitle`: "Instalments", `instalments.perMonthShort`: "{{amount}} / month",
  `instalments.progress`: "{{charged}} of {{of}} · {{amount}} still to come", `instalments.includes`: "Includes {{amount}} in instalments still to come",
  `instalments.payOff`: "Pay off the rest now", `instalments.payOffConfirm`: "Move the {{amount}} still to come onto your next statement? Your bank may charge a fee for settling early.",
  `instalments.delete`: "Delete plan", `instalments.deleteConfirm_other`: "Delete all {{count}} instalments of this plan? Use this for a plan entered by mistake; a cancelled purchase is a refund.",
  `instalments.tag`: "{{n}}/{{of}}".
- [ ] **Step 2: Card maths in the UI.** `OwedBlock`: when any currency's `toCome > 0`, a muted line `instalments.includes` (amounts joined with " + "). `CycleRows`: "Next statement so far" shows `owed − later` per currency and appears when that differs from `spent`.
- [ ] **Step 3: InstalmentsBlock** (`{ account, txs }`): `instalmentPlans(account.id, txs, new Date())`; nothing when empty. Rows: category avatar, name (note or category), `perMonthShort`, sub `progress`. Tap → `useIonActionSheet` with Pay off / Delete / Cancel, each confirmed with `useIonAlert`; after Pay off, offer the existing "Add interest or fee" action in the alert's second button.
- [ ] **Step 4: Transactions row tag:** when `x.instalment`, `<span className="b-row__tag">{t('instalments.tag', x.instalment)}</span>` after the category name.
- [ ] **Step 5:** `npm run typecheck`, `npm test` — Expected: clean, all PASS.
- [ ] **Step 6: Look at it** in the running dev server with the Task 4 test plan: card page shows the block and the "Includes" line; Pay off moves the rest to today; Delete removes the plan. Leave the dev data as it was.
- [ ] **Step 7: Commit** `Card page: instalment plans with pay off and delete`.
