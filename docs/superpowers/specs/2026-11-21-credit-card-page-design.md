# Credit card page and due-date rule — design

Date: 2026-11-21 · Status: draft for review · Builds on `2026-11-08-credit-cards-design.md`

## Why

The user's card gives "55 days to pay", and the app can't show that. Halfway through a cycle the card
sheet can say "Nothing to pay from this statement" while purchases pile up in "Owed now". Nothing says
how much those purchases will come to, or by when they have to be paid.

What the research showed (Chase, NerdWallet, ClearScore, CIB and Banque Misr pages):

- A cycle always runs about a month (28–31 days), from one statement day to the next.
- "Up to 55 days" is counted **from the purchase**: the rest of the cycle, plus the time to pay after the
  statement. Something bought the day after a statement gets the full window; something bought the day
  before gets only the part after the statement.
- **What changes from bank to bank is the time to pay after the statement**, usually 21–30 days (CIB 55
  in total, one card 45; Banque Misr 56–57; NBE up to 55). Some banks give a fixed day of the month for
  the due date, others "N days after the statement".

## Goals

1. Card setup can say when payment is due in either form, as the user picked: **a day of the month** or
   **a number of days after the statement**.
2. Show the current cycle: what's been spent since the statement, when the next statement is made, and
   when that one will be due.
3. Show the interest-free window: "Buy today → pay by 20 Dec (29 days)", and the best day to buy.
4. A full page for each credit card with all of its details, opened from a button on the card sheet.

## Non-goals

- Statement history (past statements one by one), interest calculation, instalments: still out, as in
  the first credit card design.
- Changing how debit cards or other accounts work.

## Anti-goals

- Breaking existing cards. A card saved before this change keeps working with no migration: no
  `dueAfter` means the due day of the month, as today.
- Showing two "left to pay" figures that disagree. The statement block stays the one source of what's
  due now; the cycle block is about the *next* statement.

## Approaches considered (the user picked 1)

1. **Either rule, the user picks (chosen).** "Due on day __ of the month" or "Due __ days after the
   statement". Fits every bank's wording.
2. **Only days after the statement.** Simpler, but can't say "always the 20th" exactly, because months
   differ in length.
3. **Only the total the bank advertises (55).** Rejected: it's a maximum counted from the purchase, so
   the due date would only be a guess (55 − cycle length).

## Data

```ts
interface CreditCard {
  limit?: number;
  statementDay: number;   // 1–31, unchanged
  dueDay: number;         // 1–31, used when dueAfter isn't set (unchanged meaning)
  dueAfter?: number;      // NEW: payment due this many days after the statement (1–30); wins over dueDay
  minPercent?: number;
  minAmount?: number;
}
```

`dueDay` stays required so old records and old app versions still read a sensible value. When the user
picks "days after", the editor still saves a `dueDay` (the due date's day of the month for the current
cycle) so an older build that syncs the record keeps showing a close date.

## Logic (`src/core/utils/creditCard.ts`, pure, tested)

- **Due date of a statement** (`dueOf(statementOn, card)`): with `dueAfter`, the statement date plus that
  many days; otherwise the first `dueDay` after the statement, as today.
- `CardCycle` gains **`nextDueOn`**: the due date of the next statement.
- `CardAmounts` gains **`spent`**: purchases on the card dated after the last statement (money going out
  of the card: expenses and transfers out, not exchanges inside the card). What came back is already
  `paid`.
- **Next statement so far** = `owed` (what's owed now is what the next statement would show if nothing
  else happens). Shown only when it differs from `spent`, i.e. when part of the old statement is unpaid.
- **Interest-free window:**
  - *Buy today, pay by* = `nextDueOn`; days = `nextDueOn − today`.
  - *Best day to buy* = the day after the next statement; it's due on the statement after that, so its
    days = that due date − that day. That's where "55 days" shows up.
- Known limit, builder's note: with `dueAfter` near 30 in February, a statement's due date can fall a day
  or two after the next statement. The next statement then carries what's unpaid and the older due date
  stops showing. Accepted; the editor caps `dueAfter` at 30.

Reminders (banner and phone) keep using `dueOn` of the last statement, so they pick up the new rule
for free.

## Screens

### Card setup (Account editor, Credit card)

Replaces the "Payment due day" picker:

```
Statement day          [ 25 ▾ ]
Payment due            ( Day of the month | Days after statement )
                       [ 20 ▾ ]            or   [ 25 ]
Up to 55 days interest-free.            ← live hint
```

- *Day of the month*: the existing 1–31 picker.
- *Days after statement*: a number field, 1–30. New cards in this mode start at 25.
- The hint under it shows the longest window this setup gives ("Up to 55 days interest-free"), worked
  out for the coming cycle, so the user can check it against what their bank advertises.

- *Days after statement* above 30: the field doesn't silently clamp. It shows "That sounds like the total
  from the day you buy. Payment is usually due 21–30 days after the statement; for 55 days in total,
  enter about 25." and won't save until the number is 1–30.

### Card sheet (bottom sheet)

Opened as today: tapping a credit card in Accounts, or a reminder. (A button inside the Accounts row isn't
possible as it stands: the whole row is already one button.) Two changes:

- Adds the **This cycle** lines under the statement block: spent so far, and "Statement 5 Dec · due
  30 Dec". So the first screen no longer stops at "Nothing to pay from this statement".
- Adds a **Card details** button that opens the page.

### Card page (new, route `/cards/:id`)

A full page opened from the sheet's **Card details** button, with the back button (Accounts by default)
and Edit at the top.

Example: today is 21 Nov; statement on the 5th, due 25 days after.

```
┌ ← Visa Gold                     ✎ ┐
│ OWED NOW            12,450 EGP    │
│ ▓▓▓▓▓▓▓░░░  37,550 available      │
│                    Limit 50,000   │
│                                   │
│ STATEMENT OF 5 NOV                │
│ Statement balance      8,000      │
│ Paid since             3,000      │
│ Left to pay            5,000      │
│ Minimum to pay           400      │
│ Due 30 Nov · in 9 days            │
│                                   │
│ THIS CYCLE · 6 NOV – 5 DEC        │
│ Spent so far           7,450      │
│ Next statement so far 12,450      │
│ Statement 5 Dec · due 30 Dec      │
│                                   │
│ INTEREST-FREE                     │
│ Buy today → pay by 30 Dec  39 days│
│ Best day to buy 6 Dec  → 55 days  │
│                                   │
│ TRANSACTIONS THIS CYCLE           │
│ 🛒 Carrefour     21 Nov   −1,200  │
│ ⇄ Payment from CIB 18 Nov +3,000  │
│ …                                 │
│ Earlier (last statement)  ▸       │
│                                   │
│ [Pay the minimum] [Add fee]       │
│ [Add purchase]   [Pay 5,000]      │
└───────────────────────────────────┘
```

- The owed/limit and statement blocks are the same ones the sheet shows, moved into shared components
  so both screens use them.
- Each block shows the card's second currency on its own line when it isn't zero, as the sheet does.
- The interest-free block carries a small note: it holds only while each statement is paid in full by its
  due date (banks drop the grace period once a balance is carried).
- Transactions: this cycle's, newest first. "Earlier" expands to the last statement's cycle. Tapping one
  opens the transaction editor.

## Calls made without the user (open to change)

- "Next statement so far" is simply what's owed now.
- The February edge case under Logic is accepted rather than handled.
- The page lists the card's transactions itself (this cycle, then the last one) rather than sending the
  user to the Transactions tab, whose account filter is a saved setting.
- The 1–30 range for "days after statement" assumes the user's bank, like the ones researched, gives
  about 25 days after the statement. To be confirmed from one of the user's statements.

## Left to the builder

Copy in English and Arabic, spacing, the exact row layout of the transaction list (match the
Transactions page), and how "Earlier" expands.
