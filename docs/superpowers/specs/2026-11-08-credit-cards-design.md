# Credit cards — design

Date: 2026-11-08 · Status: built on the user's go-ahead ("start yourself"), open to review

## Why

Today `'card'` is only an account type label. A credit card's debt shows only because its balance goes
negative, and nothing tells the user how much the statement was, what's still left to pay, or when it's due.
The goal is smooth tracking of card payments and their schedule.

## Goals

1. Tell credit cards apart from debit cards.
2. Credit limit and available credit.
3. Statement cycle: statement (closing) day and payment due day, both days of the month.
4. Statement balance versus current balance, what's been paid since the statement, and what's left to pay.
5. Minimum payment: a percent of the statement balance, with an optional floor amount.
6. Due-date reminders in the app.
7. Card payments from a bank account are transfers, not spending.
8. Interest and fees can be recorded in one tap.

## Non-goals

- Phone notifications. They need a new native plugin (`@capacitor/local-notifications`), a permission
  prompt and store wording. They're left in TODO.md as a follow-up; the in-app banner covers the first step.
- Calculating interest. Banks' rules vary too much, so the user records what the statement charges.
- Instalment plans, cash-advance limits, several statement cycles at once, and statement history.

## Anti-goals

- Counting a card payment as spending. Purchases already counted when they happened.
- Making debit cards or other accounts more complicated. Everything new appears only after picking
  Credit card.
- A schema migration. Records sync as JSON, so the new fields need no Supabase change.

## Data

`Account.credit?: CreditCard`, set only on a `'card'` account that is a credit card. A card without it is
a debit card.

```ts
interface CreditCard {
  limit?: number;        // in the card's main currency
  statementDay: number;  // 1–31; a shorter month uses its last day
  dueDay: number;        // 1–31; the first such day after the statement
  minPercent?: number;   // minimum payment, % of the statement balance
  minAmount?: number;    // ...but at least this much (main currency)
}
```

The balance keeps its usual sign: negative is what you owe. The editor shows a credit card's balance as
"Owed now", typed as a plain number, the same way a debt you owe is typed. A card that was overpaid falls
back to the signed balance field.

## The cycle (src/core/utils/creditCard.ts, pure)

- **Last statement:** the most recent statement day strictly before today. The statement covers everything
  dated up to the end of that day; on the statement day itself the previous statement is still current.
- **Due date:** the first due day after the statement date.
- **Next statement:** the same day one month after the last one.
- For each of the card's currencies:
  - *owed* = what you owe now (never below 0)
  - *statement* = what you owed at the end of the statement day: opening balance plus everything dated
    up to then. **The opening balance counts as before the statement** (builder's call), so a card set up
    mid-cycle treats what's owed as already on the statement. That overestimates rather than misses a payment.
  - *paid* = money that arrived on the card after the statement: transfers in, refunds and income.
    Exchanges inside the card don't count.
  - *due* = statement − paid, never below 0 and never more than owed.
  - *minimum* (only if a minimum is set) = max(statement × %, floor), at most the statement; the minimum
    still to pay is that minus paid, never below 0 and never more than due. The floor applies to the main
    currency only.
- **State:** `overdue` if anything is due and the due date has passed; `due` if anything is due; `paid` if
  there was a statement and nothing is left; `clear` if there was no statement balance.
- **Reminder:** shown when overdue or due within 5 days.

## Screens

- **Account editor:** with type Card, a Debit / Credit choice. Credit shows the limit, the statement day
  and due day pickers, and the minimum % and floor.
- **Accounts list:** a credit card's line reads "Credit card · Due 15 Nov" (or Overdue / Paid). Tapping
  it opens the card screen, not the editor.
- **Card screen (bottom sheet):** owed now; a limit bar with available credit, or how far over the limit;
  the statement block (statement balance, paid since, left to pay, minimum, due status, next statement).
  Buttons: Pay (a transfer to the card, filled in with what's left to pay), Pay the minimum, Add purchase,
  Add interest or fee (an expense on the card in Bills, noted "Interest / fees"), and Edit.
  "Pay from" picks the last-used account if it can pay; otherwise an everyday account in the card's
  currency, banks first.
- **Reminders:** a banner on Overview and on the Accounts tab for each card that needs one. Tapping it
  opens the card screen.

Available credit takes the card's second currency into account too (converted at the saved rate),
because banks share one limit across currencies.

## Left to the builder

Copy, layout details, colours (the limit bar turns red at 90% used), and Arabic wording.
