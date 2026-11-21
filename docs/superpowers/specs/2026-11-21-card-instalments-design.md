# Credit card instalments — design

Date: 2026-11-21 · Status: draft for review · Builds on `2026-11-21-credit-card-page-design.md`

## Why

The user buys on their credit card in instalments (for example a 12,000 EGP phone over 12 months). Today
the app can only record it as one 12,000 purchase, which:

- puts all 12,000 on the next statement, so "Left to pay" says 12,000 when the bank asks for 1,000;
- counts 12,000 as spending in one month, when the user pays it 1,000 a month.

How it works at the bank (CIB's instalment plan terms and other banks', confirmed by the user):

- The **full price comes off the available credit at once**.
- **One instalment a month is added to the statement**, from the next statement on; the rest is owed but not
  yet due.
- Each payment to the card **returns that amount to the limit**.
- Plans may be 0%, carry a one-time fee, or add interest; settling early may cost a fee (CIB: 5%).

## Goals

1. A purchase on a credit card can be made **in instalments**: a number of months, optionally a one-time fee.
   An existing single purchase on a credit card can be turned into instalments too (banks let you convert
   after buying).
2. **Budgets and spending totals count one instalment per month** (the user's choice: "I didn't pay the full
   amount from my money, I pay the instalment").
3. **The card owes the full price at once**: "Owed now", the limit bar and net worth include every
   instalment still to come.
4. **Each statement shows only the instalments billed on it**, and the minimum payment is those instalments
   plus the minimum % of the rest (CIB's rule).
5. Optional **automatic monthly payment** from a bank account, for banks that take it by direct debit.
6. On the card page, an **Instalments** block: each plan, how far along it is, the monthly amount and what's
   still to come, with **Pay off the rest now** and **Delete plan**.

## Non-goals

- Interest calculation. If the bank adds interest, the user enters the total they'll pay as the price.
- Instalments on debit cards or other accounts.
- Changing the number of months of a running plan (delete it and make a new one).

## Anti-goals

- Counting the phone twice: the monthly charge is spending, the payment to the card never is.
- A future payment lowering the bank balance today. Automatic payments are added on their day, never ahead.
- Folding the 12 entries into one row in the Transactions list (that's what `groupId` does; plans don't use it).

## Approaches considered (the user picked 1)

1. **One entry per month (chosen).** Saving a plan adds one expense per instalment on the card, dated a month
   apart, linked by a plan id. Spending totals already go by date, so each month counts its own instalment;
   a card's balance already counts every transaction, future-dated ones included, so the card owes the full
   price at once. Statements need little new logic.
2. **One purchase, spread when adding up.** Every total, budget, statement and list would have to divide it;
   the Transactions list would show 12,000 while the budget shows 1,000.
3. **A repeating expense that stops after 12 months.** Each instalment reaches the card only in its month, so
   available credit would look 11,000 higher than the bank says. Against goal 3.

## Data

```ts
interface Transaction {
  // ...
  /** One instalment of a plan: the n-th of `of`, all sharing `planId`. Only on expenses on a credit card. */
  instalment?: { planId: string; n: number; of: number };
}

interface Recurring {
  // ...
  /** The last day it happens (YYYY-MM-DD, included). Undefined = it never ends. */
  until?: string;
  /** Set on the automatic payment of an instalment plan. */
  planId?: string;
}
```

No migration: both are optional JSON fields that sync as they are.

## Making a plan (transaction editor)

- A new chip **Instalments** under the date, next to Repeat, shown only for an **expense on a credit card**
  (new, or an existing one that isn't already an instalment and isn't recurring). Repeat and Instalments
  exclude each other.
- Tapping it opens a small sheet:
  - **Months** (2–60, default 12), with "= 1,000 a month" worked out live from the typed amount.
  - **One-time fee** (optional amount in the card's currency).
  - **Pay automatically from** (off by default): when on, an account picker, defaulting to the card's usual
    "pay from" account (`payFromAccount`).
  - A hint: "If your bank adds interest, enter the total you'll pay."
- The chip then reads "12 instalments".
- **Saving** (new purchase): the typed amount is the price. Instalment *k* (1..N) is an expense with the
  purchase's category, subcategory, note and currency, dated on the purchase day plus *k−1* months (a shorter
  month uses its last day, noon local time like recurring occurrences). Each is `price / N` rounded to the
  currency; the last one takes the rounding difference so they add up to the price exactly.
- **Saving** (converting an existing purchase): the purchase becomes instalment 1 (its id and date kept, its
  amount reduced) and instalments 2..N are added.
- **Fee**: an expense on the card in Bills, dated the purchase day, noted "Instalment fee · <note or
  category>". It's spending in that month (the bank charges it at once).
- **Automatic payment**: a recurring transfer, `auto: true`, from the chosen account to the card, amount =
  the instalment, monthly, `start` = the due date of the statement instalment 1 lands on, `until` = the due
  date of the statement the last one lands on, `planId` set. The existing AutoRecurring adds each payment on
  its day; nothing is added ahead.

## Recurring with an end (`src/core/utils/recurring.ts`)

- `dueDays` and `occurrencesBetween` stop after `until`. A recurring whose `next` is past `until` is finished:
  AutoRecurring and phone reminders skip it, and the Recurring page lists it under the others with "Ended".
- Builder's call how "Ended" looks; finished ones may also simply be hidden.

## Card logic (`src/core/utils/creditCard.ts`, pure, tested)

Instalments dated in the future are already in the balance, so "Owed now" and the limit are right with no
change. What changes:

- **`spent`** counts only what's dated up to the end of today (a future instalment isn't spent yet).
- **New `later`** per currency: charges dated after the next statement day (instalments for later
  statements). **"Next statement so far" = owed − later.**
- **`cardTransactions`**: "this cycle" stops at the end of the next statement day; later instalments don't
  appear there (they're in the Instalments block).
- **Minimum**: `minimum = instalments on the statement + max(rest × %, floor)`, never more than the statement,
  minus what was paid, never below 0 and never more than due. "Instalments on the statement" = this card's
  instalment entries dated in the last statement's cycle.
- **New `instalmentPlans(cardId, txs, today)`**: one entry per `planId`: the first instalment (for the name),
  `of`, monthly amount, how many are dated up to today (`charged`), the sum still to come (dated after
  today), and the currency. Ordered by first date.

## Screens

### Card page

New **Instalments** block (only when the card has a plan with something still to come), after This cycle:

```
INSTALMENTS
📱 Phone                       1,000 / month
   3 of 12 · 9,000 still to come       ▸
🛋 Sofa                          750 / month
   1 of 6 · 3,750 still to come        ▸
```

Tapping a plan opens an action sheet:

- **Pay off the rest now**: re-dates every instalment still to come to today, so they go on the next
  statement (what banks do on early settlement), and ends its automatic payment. Asks first, saying the
  amount and that the bank may charge a fee (offer "Add interest or fee" after).
- **Delete plan**: for a plan entered by mistake. Deletes every instalment of the plan (past ones too) and
  its automatic payment, after a confirmation naming the count. The fee stays (it's its own entry). A plan the
  shop cancelled and refunded is recorded as a refund, not deleted, so past payments still add up.

Known limits (accepted):

- Converting a purchase from an already closed cycle changes that old statement's figures, since the
  purchase shrinks to one instalment. Banks convert within the cycle, so it's rare.
- A bank text for a monthly instalment ("instalment 3/12 charged") is imported as a new purchase like any
  other text; matching it to the plan is out of scope.

"Owed now" gets a muted line under it when anything is still to come: "Includes 12,750 in instalments still
to come".

### Card sheet

Unchanged except that "Owed now" gets the same muted line.

### Transactions list and editor

- An instalment row shows a small tag "3/12" after its category name (like the Money back tag).
- Opening an instalment in the editor edits that one entry; the editor shows "Instalment 3 of 12" instead of
  the Instalments chip.

## Left to the builder

Copy in English and Arabic, the sheet's layout, how a finished recurring looks, and where exactly the tag
sits in the row.
