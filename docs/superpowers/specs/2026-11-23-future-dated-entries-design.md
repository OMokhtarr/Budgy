# Future-dated entries — design

Date: 2026-11-23 · Status: approved by the user in conversation · Small change

## Why

The user added a monthly subscription on their **bank account**, starting 1 Dec, with Repeat on. Saving it saves a
real transaction dated 1 Dec (`TransactionEditor.tsx` → `saveTx` + `makeRecurring`). The balance adds up every
transaction whatever its date (`balancesOf`, `src/core/db/hooks.ts`), so the subscription came off the bank balance
in November, before it was paid.

On **credit cards** it's the other way round. The user wants a card's future instalments to come off the card's
balance at once (the bank takes the full price off the limit, as `2026-11-21-card-instalments-design.md` already
does). But those future charges aren't paid yet, so they shouldn't appear in the Transactions list or the category
totals until their day. The card's details page should be where they're seen ahead of time.

## Goals

1. On any account that **isn't a credit card**, an entry dated after today doesn't change the balance until its day.
2. On a **credit card**, future charges keep counting in the balance, "Owed now", the limit bar and statements, as
   today.
3. A credit card entry dated after today is left out of the **Transactions list, Categories, Overview and budgets**
   until its own date (instalment 3/12 dated 21 Jan shows up on 21 Jan).
4. On the card page, tapping an **upcoming statement** opens a sheet listing the charges on it.

## Non-goals

- Hiding future entries on bank, cash or wallet accounts from the list or categories. They show as today; only the
  balance waits.
- A new "Coming up" block on the card page.
- Changing how recurring entries or instalment plans are saved.

## Anti-goals

- The card's balance, "Owed now" or limit bar dropping a future instalment. They must keep matching the bank.
- Two screens disagreeing on whether a future card charge counts (one hides it, another adds it).

## Approaches

Hiding future card charges:

- **A. One filter where a period's transactions are read** *(chosen by the user)*. `useTransactionsInRange`
  (`hooks.ts`) drops them. The Transactions list, Categories, Overview and budgets all read from it (through
  `useFilteredTransactionsInRange` and `totalsOf`), so they agree.
- B. Hide them screen by screen, in the list and in the totals separately. More places to change, and easy for two
  screens to drift apart.

Showing them on the card page:

- **1. Tap an upcoming statement to see what's on it** *(chosen by the user)*. Reuses the existing Upcoming block,
  grouped by the bill the user will pay.
- 2. A "See instalments" option on each plan. Per plan only, and misses card charges that aren't instalments.
- 3. A new "Coming up" block. Mostly repeats the Upcoming and Instalments blocks.

## Design

"Dated after today" means dated at or after the start of tomorrow, local time (the same `endOfToday` test
`cardStatus` and `instalmentPlans` already use). Put it in one small helper.

### Balances (`balancesOf`, `hooks.ts`)

- A movement on an account that **isn't a credit card** (`isCreditCard`) is skipped while it's dated after today.
  That covers expenses, income, and each side of a transfer separately.
- A movement on a **credit card** that takes money off the card (an expense, a transfer out) counts whatever its
  date, as today.
- A movement **into** a credit card dated after today (a payment or refund dated ahead) waits for its day, so a
  payment from the bank dated ahead lowers neither the bank balance nor what's owed on the card until then.
  *(Designer's call, proposed in conversation, not objected to.)* `cardStatus` follows the same rule: a future
  payment isn't counted in `owed` or `paid` until its day.

### The period's transactions (`useTransactionsInRange`, `hooks.ts`)

Drops every alive transaction whose `accountId` is a credit card and that's dated after today. That covers future
instalments, a future-dated purchase or cash withdrawal, and a card fee dated ahead. A transfer **from** the bank
**to** a card dated ahead stays (its `accountId` is the bank).

The card page reads its own transactions (`useCardTransactions`), so its This cycle list, Instalments and Upcoming
blocks still see the future charges.

### Upcoming statement sheet (`UpcomingBlock.tsx`)

Each statement row becomes a button. Tapping it opens a sheet titled with the statement date and its due date,
listing every charge on that statement, oldest first: money off the card dated in that statement's cycle. For later
statements these are exactly what `upcomingStatements` adds up. The next statement's amount also carries what's left
of the last statement, less payments since, so its sheet starts with a "Left from the last statement" row when that's
above 0 *(designer's call)*. Each row:
date, name (note or category), the instalment tag "2/12" when it has one, amount. A statement with nothing on it
says so. Tapping a charge opens it in the editor, as the card page's transaction rows do.

Expose the per-statement charges from `creditCard.ts` (pure, next to `upcomingStatements`) so the sheet and the
totals can't disagree.

### Text (en and ar)

The sheet's title ("Statement {{date}} · due {{due}}"), "Left from the last statement", and its empty line
("Nothing on this statement yet").

## Known limit

Balances and lists refresh when something in the app changes or the screen is opened again. If the app stays open
overnight, an entry dated that morning joins the balance and the list at the next change, not at midnight. Accepted.

## Tests

- `balancesOf`: a future expense, income and transfer between two bank accounts don't count until their day; a future
  card expense counts at once; a future payment from bank to card counts on neither side until its day.
- `cardStatus`: a future payment isn't in `owed` or `paid`; future instalments are still in `owed` and `toCome`.
- `useTransactionsInRange` filter (pure part): drops future card entries, keeps today's card entries, future bank
  entries and future bank-to-card payments.
- The per-statement charges match each later upcoming statement's total; the next statement's charges plus "left
  from the last statement" match its amount.

## Left to the builder

- The sheet's look (an `IonModal` sheet like the others, or an action-sheet-style list).
- Where the "dated after today" helper lives.
