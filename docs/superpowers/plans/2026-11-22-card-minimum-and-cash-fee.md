# Card Minimum Payment and Cash Withdrawal Fee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Credit cards show about how much the minimum payment is (card page and reminders), and recording a cash withdrawal from a credit card offers to add the bank's fee and says interest runs from that day.

**Architecture:** The minimum is worked out in `cardStatus` from new optional `CreditCard` rules, as the code removed in `47750d0` did. The cash withdrawal rules (whether a transfer counts, the fee from the rule, what fee to save) are pure functions with tests. The fee is saved as its own expense on the card, not grouped. The UI changes are thin layers over those functions.

**Tech Stack:** React 18 + Ionic + TypeScript, Dexie (IndexedDB), i18next (en, ar), Vitest with `@/test/setup-db` for database tests.

**Spec:** `docs/superpowers/specs/2026-11-22-card-minimum-and-cash-fee-design.md`

## Global Constraints

- Work in `D:\Budgy-card-costs` on branch `feat/card-costs`. Never touch `D:\Budgy`.
- Verify with `npm test` and `npm run typecheck` only. Don't run vite, Capacitor or Gradle builds (the user's standing rule).
- New `CreditCard` fields are optional, named exactly `minPercent`, `minAmount`, `cashFeePercent`, `cashFeeAmount`. A card without them behaves exactly as today.
- Floors (`minAmount`, `cashFeeAmount`) apply in the card's main currency only. In the second currency the floor is 0.
- All amounts go through `roundTo(value, currency)`.
- Every new string goes in both `src/core/i18n/locales/en.json` and `ar.json`, with the exact copy given in the tasks.
- The minimum never goes in the Pay button, and there's no "Pay the minimum" button.
- The fee is never saved without the user seeing it in the editor.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The transfer stops counting after the fee is shown:** the user switches the destination to a credit card, changes the type, or turns on Repeat. No fee is saved. (Task 2: `cashFeeToSave` with `withdrawal: false`. Task 6: `withdrawal` is worked out at save time.)
2. **The user edits the fee, then changes the amount:** the typed fee stays and isn't worked out again. (Task 2 test.)
3. **Arabic digits** in the percent and fee fields (`٥`, `٢٠`) are read like Western digits. (Task 1 and Task 2 tests.)
4. **A floor above the statement:** a 50 floor on a 30 statement gives a minimum of 30, not 50. (Task 1 test.)
5. **A bank text skipped at the duplicate check** saves neither the transfer nor the fee. (Task 6: the fee is added only after `saveTx` returns, in the same branch.)

---

## File Structure

- Modify `src/shared/models/index.ts`: the four `CreditCard` fields.
- Modify `src/core/utils/creditCard.ts` (+ test): the minimum in `cardStatus`, `hasMinimum`, `parsePercent`, `minimumLine`, `isCashWithdrawal`, `cashFeeFor`.
- Create `src/features/accounts/card/cashFee.ts` (+ test): `cashFeeToSave`, `addCashFee`.
- Modify `src/features/accounts/AccountEditModal.tsx`: the four setup fields.
- Modify `src/features/accounts/card/CardBlocks.tsx`: the minimum row and the "Minimum paid" line.
- Modify `src/features/reminders/plan.ts` (+ test) and `PhoneReminders.tsx`: the minimum in the reminder title.
- Modify `src/features/transactions/TransactionEditor.tsx`: the fee chip, the interest note and saving the fee.
- Modify `en.json` and `ar.json`.

---

### Task 1: The minimum payment rule

**Files:**
- Modify: `src/shared/models/index.ts` (`CreditCard`)
- Modify: `src/core/utils/creditCard.ts` (`CardAmounts`, `cardStatus`, new exports)
- Test: `src/core/utils/creditCard.test.ts`

**Interfaces:**
- Produces:
  - `CreditCard.minPercent?: number`, `minAmount?: number`, `cashFeePercent?: number`, `cashFeeAmount?: number`, with doc comments as in the spec's Data section.
  - `CardAmounts.minimum?: number`: what's left to pay of the minimum. Undefined when `!hasMinimum(card.credit)`.
  - `hasMinimum(credit: CreditCard): boolean`: `!!credit.minPercent || !!credit.minAmount`.
  - `parsePercent(typed: string): number | undefined`: `parseNumber(typed)` when it's above 0 and at most 100, otherwise undefined.
  - `minimumLine(status: CardStatus): 'row' | 'paid' | undefined`: undefined unless `state === 'due'` and every currency's `minimum` is defined. Then `'row'` if any `minimum > 0`, otherwise `'paid'`.

- [ ] **Step 1: Write the failing tests** in a new `describe('minimum payment', …)`, using the file's `card`, `credit`, `tx`, `spend`, `pay` and `day` helpers. Use a cycle with the statement on 25 Nov 2026, `today = day(2026, 12, 1)`, and charges dated between 26 Oct and 25 Nov:
  - `'is 5% of the statement'`: `minPercent: 5`, spend 12,000 → `minimum` 600.
  - `'is at least the floor'`: `minPercent: 5, minAmount: 1000`, spend 12,000 → 1000.
  - `'is never more than the statement'`: `minAmount: 50`, spend 30 → 30.
  - `'takes the statement’s instalments whole'`: `minPercent: 5`, a 1,000 expense with `instalment: { planId: 'p', n: 2, of: 12 }` plus a 2,000 spend → `1000 + 100` = 1100.
  - `'counts payments since the statement'`: as the first test plus `pay(400, day(2026, 11, 28))` → 200. With `pay(700, …)` → 0.
  - `'is 0 when nothing was owed at the statement'`: `minPercent: 5`, no charges → 0.
  - `'uses the floor in the main currency only'`: card with `currency2: 'USD'`, `minPercent: 5, minAmount: 1000`, spend 12,000 EGP and 100 USD → EGP 1000, USD 5.
  - `'is undefined without a rule'`: `credit()` → `minimum` undefined.
  - `parsePercent`: `'5'` → 5, `'٥'` → 5, `'2.5'` → 2.5. `''`, `'0'`, `'101'`, `'x'` → undefined.
  - `minimumLine`: `'row'` for the first test's status. `'paid'` after `pay(700, …)` while some of the statement is still due. Undefined for the same card when `today` is after the due date (`overdue`), and undefined without a rule.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/core/utils/creditCard.test.ts`
Expected: FAIL. `minimum` is undefined, and `parsePercent`/`minimumLine` aren't exported.

- [ ] **Step 3: Implement.** Restore the minimum from `git show 47750d0 -- src/core/utils/creditCard.ts` (the removed `billedInstalments`, `lastStart` and `hasMinimum` block), with the formula in the spec's Minimum section. Add `hasMinimum`, `parsePercent` (using `parseNumber` from `./number`) and `minimumLine`, then the four model fields.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/core/utils/creditCard.test.ts`
Expected: PASS, with the existing tests still passing.

- [ ] **Step 5: Commit**

```bash
git add src/shared/models/index.ts src/core/utils/creditCard.ts src/core/utils/creditCard.test.ts
git commit -m "Work out a credit card's minimum payment from its rule"
```

---

### Task 2: Cash withdrawal rules and saving the fee

**Files:**
- Modify: `src/core/utils/creditCard.ts`
- Create: `src/features/accounts/card/cashFee.ts`
- Test: `src/core/utils/creditCard.test.ts`, create `src/features/accounts/card/cashFee.test.ts`

**Interfaces:**
- Consumes: `isCreditCard`, `roundTo`, `parseNumber`, `saveTx`-style database access (`BudgyDB`, `db` from `@/core/db/db`).
- Produces:
  - `isCashWithdrawal(from: Account | undefined, to: Account | undefined): boolean` (in `creditCard.ts`): `from` is a credit card, and `to` is defined, isn't a credit card and has a different id.
  - `cashFeeFor(card: Account & { credit: CreditCard }, amount: number, currency: string): number | undefined` (in `creditCard.ts`): `max(roundTo(amount × cashFeePercent / 100, currency), floor)`, where `floor` is `cashFeeAmount` when `currency === card.currency` and 0 otherwise. Undefined when neither rule is set or `amount <= 0`.
  - `cashFeeToSave(o: { withdrawal: boolean; removed: boolean; typed?: string; fromRule?: number; currency: string }): number | undefined` (in `cashFee.ts`): undefined when `!withdrawal` or `removed`. When `typed` is set, use `roundTo(parseNumber(typed), currency)`, otherwise `fromRule`. Undefined unless the result is above 0.
  - `addCashFee(transfer: Transaction, fee: number, o: { categoryId?: string; note: string }, database?: BudgyDB): Promise<Transaction>` (in `cashFee.ts`): adds and returns an `expense` with `amount: fee`, `currency: transfer.currency`, `accountId: transfer.accountId`, `categoryId: o.categoryId`, `note: o.note`, `date: transfer.date`, no `groupId`, and `createdAt`/`updatedAt` set to now. Save it the way `saveTx` in `txRecord.ts` does (so it syncs), or call `saveTx`.

- [ ] **Step 1: Write the failing tests**
  - `isCashWithdrawal`: credit card → cash is true, credit card → bank is true. Credit card → another credit card, credit card → itself, a debit card (`type: 'card'`, no `credit`) → cash, bank → credit card, and `to` undefined are all false.
  - `cashFeeFor`: `cashFeePercent: 2`, 1000 EGP → 20. Adding `cashFeeAmount: 20` to 300 EGP → 20, since 2% would be 6. 300 USD on that card with `currency2: 'USD'` → 6. No rule → undefined. Amount 0 → undefined.
  - `cashFeeToSave` (in `cashFee.test.ts`): `{ withdrawal: true, removed: false, fromRule: 20, currency: 'EGP' }` → 20. `typed: '٢٥'` → 25, and it wins over `fromRule: 20` (the typed fee stays when the amount changes). `typed: '0'` → undefined, `typed: ''` → undefined, `removed: true` → undefined, `withdrawal: false` → undefined.
  - `addCashFee` (database test, same setup as `instalments.test.ts` with `new BudgyDB('t-cash-fee')`): given a saved transfer of 1000 EGP from `'card'` to `'cash'`, `addCashFee(transfer, 20, { categoryId: 'bills', note: 'Cash withdrawal fee' }, database)` leaves exactly two live rows. The new one has `type: 'expense'`, amount 20, `accountId: 'card'`, `categoryId: 'bills'`, the note, the transfer's `date`, and `groupId` undefined.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/core/utils/creditCard.test.ts src/features/accounts/card/cashFee.test.ts`
Expected: FAIL. The functions aren't defined.

- [ ] **Step 3: Implement** the four functions as in the Interfaces above.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/core/utils/creditCard.test.ts src/features/accounts/card/cashFee.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/utils/creditCard.ts src/core/utils/creditCard.test.ts src/features/accounts/card/cashFee.ts src/features/accounts/card/cashFee.test.ts
git commit -m "Tell a cash withdrawal from a credit card and work out its fee"
```

---

### Task 3: Card setup fields

**Files:**
- Modify: `src/features/accounts/AccountEditModal.tsx`
- Modify: `src/core/i18n/locales/en.json`, `ar.json` (`cards` section)

**Interfaces:**
- Consumes: `parsePercent` (Task 1), the existing `optional` and `cleanNumberInput`.

- [ ] **Step 1: Add the strings** to `cards`:

| key | en | ar |
|---|---|---|
| `minPercent` | Minimum payment (%) | الحد الأدنى للسداد (٪) |
| `atLeast` | At least ({{currency}}) | على الأقل ({{currency}}) |
| `minHint` | Optional: the minimum your bank asks for, as a share of the statement with a lowest amount. | اختياري: الحد الأدنى الذي يطلبه البنك، كنسبة من الكشف مع أقل مبلغ. |
| `cashFeePercent` | Cash withdrawal fee (%) | رسوم السحب النقدي (٪) |
| `cashFeeHint` | Optional: what your bank charges for taking cash out on this card. It's on the bank's fee list. | اختياري: ما يحصّله البنك على سحب النقود بهذه البطاقة. تجده في قائمة رسوم البنك. |

- [ ] **Step 2: Add the four fields.** The state is `minPercent`, `minAmount`, `cashFeePercent` and `cashFeeAmount`, all strings. They're loaded from `credit` the way `47750d0` did (`String(x)` or `''`). A **new** card starts with `minPercent` `'5'` and `cashFeePercent` `'2'`, and everything else empty. Show them after the due-rule hint, inside `{credit && …}`, as two `b-field-row b-field-row--even` pairs (percent and `atLeast`), each followed by its hint. Use the markup from `git show 47750d0 -- src/features/accounts/AccountEditModal.tsx`. Save `minPercent: parsePercent(minPercent)`, `minAmount: optional(minAmount)`, `cashFeePercent: parsePercent(cashFeePercent)` and `cashFeeAmount: optional(cashFeeAmount)` in the `credit` object.

- [ ] **Step 3: Verify**

Run: `npm run typecheck` and `npm test`
Expected: no errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/accounts/AccountEditModal.tsx src/core/i18n/locales/en.json src/core/i18n/locales/ar.json
git commit -m "Set a credit card's minimum payment and cash withdrawal fee"
```

---

### Task 4: Minimum on the card page

**Files:**
- Modify: `src/features/accounts/card/CardBlocks.tsx` (`StatementRows`)
- Modify: `en.json`, `ar.json` (`cards`)

**Interfaces:**
- Consumes: `minimumLine(status)`, `CardAmounts.minimum` (Task 1), `useDayMonth`, `CcRow`, `AmountLines`.

- [ ] **Step 1: Add the strings** to `cards`:

| key | en | ar |
|---|---|---|
| `minimumAbout` | Minimum (about) | الحد الأدنى (تقريبًا) |
| `minimumPaid` | Minimum paid · pay the rest by {{date}} to avoid interest. | تم سداد الحد الأدنى · سدّد الباقي قبل {{date}} لتجنّب الفوائد. |

- [ ] **Step 2: Render.** In `StatementRows`, between "Left to pay" and `DueLine`:
  - `minimumLine(status) === 'row'`: `<CcRow label={t('cards.minimumAbout')}>{lines((x) => x.minimum)}</CcRow>`, not strong.
  - `'paid'`: `<div className="b-muted b-cc__next">{t('cards.minimumPaid', { date: dayMonth(status.cycle.dueOn) })}</div>`.
  - undefined: nothing.

- [ ] **Step 3: Verify**

Run: `npm run typecheck` and `npm test`
Expected: no errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/accounts/card/CardBlocks.tsx src/core/i18n/locales/en.json src/core/i18n/locales/ar.json
git commit -m "Show about how much the minimum payment is on the card page"
```

---

### Task 5: Minimum in reminders

**Files:**
- Modify: `src/features/reminders/plan.ts`, `src/features/reminders/PhoneReminders.tsx`
- Modify: `en.json`, `ar.json` (`reminders`)
- Test: `src/features/reminders/plan.test.ts`

**Interfaces:**
- Consumes: `CardAmounts.minimum` (Task 1).
- Produces: `ReminderTexts.cardTitle: (card: Account, amounts: Record<string, number>, minimum?: Record<string, number>) => string`.

- [ ] **Step 1: Write the failing tests.** Change the test `texts.cardTitle` so it appends ` min EGP1350` when `minimum` is given, using the same `${c}${n}` joining. Then add:
  - `'mentions the minimum while it is below what’s due'`: state `'due'`, EGP `{ due: 12000, minimum: 1350 }` → both of that statement's reminders have the title `'C visa EGP12000 min EGP1350'`.
  - `'leaves the minimum out when it equals what’s due, or is 0, or the card has none'`: `minimum: 12000`, `minimum: 0` and `minimum` undefined each give `'C visa EGP12000'`.
  - The next statement's reminder never gets a minimum (assert on the existing ahead-of-time test's title).

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/features/reminders/plan.test.ts`
Expected: FAIL. The title has no minimum.

- [ ] **Step 3: Implement.** In `planReminders`, give `remind` an optional `minimum` argument. For `state === 'due'`, pass `pick((x) => (x.minimum != null && x.minimum < x.due ? x.minimum : 0))`, but only when it has any entries. The next statement's call passes none. In `PhoneReminders.tsx`, when `minimum` has entries, append ` (${t('reminders.minimumAbout', { amount })})` to the title, where `amount` is the minimum amounts formatted and joined as the title's amounts are. Add the string to `reminders`: en `minimum about {{amount}}`, ar `الحد الأدنى حوالي {{amount}}`.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/features/reminders/plan.test.ts`, then `npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/reminders/plan.ts src/features/reminders/plan.test.ts src/features/reminders/PhoneReminders.tsx src/core/i18n/locales/en.json src/core/i18n/locales/ar.json
git commit -m "Mention the minimum payment in card reminders"
```

---

### Task 6: Fee and interest note in the transaction editor

**Files:**
- Modify: `src/features/transactions/TransactionEditor.tsx`
- Modify: `en.json`, `ar.json` (`cards`)

**Interfaces:**
- Consumes: `isCashWithdrawal`, `cashFeeFor`, `isCreditCard` (`creditCard.ts`), `cashFeeToSave` and `addCashFee` (`cashFee.ts`), `useIonAlert`.

- [ ] **Step 1: Add the strings** to `cards`:

| key | en | ar |
|---|---|---|
| `cashFeeChip` | Fee {{amount}} | رسوم {{amount}} |
| `cashFeeAdd` | + Fee | + رسوم |
| `cashFeeNote` | Cash withdrawal fee | رسوم سحب نقدي |
| `cashInterestNote` | Interest is charged from the day you withdraw. Paying it off early costs less. | تُحسب الفوائد من يوم السحب. السداد المبكر يكلّف أقل. |

- [ ] **Step 2: Add the state and the rule.** `feeTyped: string | undefined` and `feeRemoved: boolean`. Then:
  - `withdrawal = type === 'transfer' && tx?.id == null && !ruleMode && !due && !repeat && isCashWithdrawal(account, toAccount)`.
  - `fromRule = withdrawal && account && isCreditCard(account) ? cashFeeFor(account, amount, currency) : undefined`.
  - `fee = cashFeeToSave({ withdrawal, removed: feeRemoved, typed: feeTyped, fromRule, currency })`.

- [ ] **Step 3: Render.** While `withdrawal`, show in `b-editor__when` a chip with the same classes as the instalments chip. It's `is-on` with `t('cards.cashFeeChip', { amount: money.format(fee, currency) })` when `fee` is set, and `t('cards.cashFeeAdd')` otherwise. Tapping it opens a `useIonAlert` with the header `t('cards.cashFeeNote')` and one `inputmode: 'decimal'` text input, pre-filled with the current fee. It has three buttons: remove (sets `feeRemoved`), cancel, and OK (sets `feeTyped` and clears `feeRemoved`). Reuse existing common button strings if they exist, otherwise add them to `cards` in en and ar. Under the editor's date row, while `withdrawal`, show `t('cards.cashInterestNote')` as a muted line.

- [ ] **Step 4: Save the fee.** In `save`, in the plain `else` branch right after `saved = await saveTx(record, tx?.id)`, when `fee` is set: `await addCashFee(saved, fee, { categoryId: expenseCats?.find((c) => c.key === 'bills')?.id, note: t('cards.cashFeeNote') })`. The duplicate check's `skip` and `cancel` return earlier, so neither saves a fee.

- [ ] **Step 5: Verify**

Run: `npm run typecheck` and `npm test`
Expected: no errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/TransactionEditor.tsx src/core/i18n/locales/en.json src/core/i18n/locales/ar.json
git commit -m "Offer the bank's fee when taking cash out on a credit card"
```

---

### Task 7: Whole-branch check

- [ ] **Step 1:** Run `npm test` and `npm run typecheck`. Expected: all pass, no errors.
- [ ] **Step 2:** Check that every key added to `en.json` is also in `ar.json`: `node -e` comparing the flattened key sets of the two files, which should print no differences.
- [ ] **Step 3:** If the user asks for it, try it in the real app (see the memory note on emulator WebView testing). Make a card with a 5% minimum and a 2% fee, take cash out of it to Cash, and look at the card page.
