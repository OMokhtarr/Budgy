# Credit card minimum payment and cash withdrawal fee — design

Date: 2026-11-22 · Status: draft for review · Builds on `2026-11-21-credit-card-page-design.md` and
`2026-11-21-card-instalments-design.md`

## Why

The user wants Budgy to help them **not miss a card payment** and **not pay the bank more than they have to**.
Two things the banks do aren't in the app:

1. **Minimum payment.** Paying less than the minimum by the due date costs a late fee (NBE: EGP 75 a month).
   Paying the minimum but not the full statement avoids the fee, but interest is charged on purchases. The user
   has months when the full statement can't be paid, and wants to know the least that avoids the fee.
2. **Cash withdrawals.** At CIB and NBE a cash withdrawal on a credit card gets no interest-free days: interest
   runs from the day of the withdrawal, and there's a fee (NBE: 2%, at least EGP 10–20). If the fee isn't
   recorded, "Left to pay" is lower than what the bank asks, and paying that amount leaves part of the statement
   unpaid, so interest is charged without the user knowing.

The bank rules come from the user's research: NBE's card page and fee list, and CIB's FAQ, fee list and guide.
CIB's minimum is **5% of what's owed plus the month's instalments in full**.

### History

A minimum payment existed before and was removed on 2026-11-21 (commit `47750d0`), because the user didn't
think it was needed. It came back now because of the months when the statement can't be paid in full. The old
version had a "Minimum to pay" row and a "Pay the minimum" button. This one is quieter (see Anti-goals).

## Goals

1. Each credit card can have a **minimum payment rule**: a percent and an optional lowest amount.
2. The card page shows **about how much the minimum is** for the last statement, and what's left of it after
   payments.
3. **Card reminders** mention the minimum while it isn't paid.
4. Once the minimum is paid but the statement isn't, the card page says **the rest still has to be paid by the
   due date to avoid interest**.
5. When the user records a **cash withdrawal** from a credit card, the editor **offers to add the bank's fee**,
   worked out from a fee rule on the card, and says that **interest is charged from the day of the withdrawal,
   so paying it off early costs less**.

## Non-goals

- Working out interest. The app has no interest rates and won't get them here.
- A "Pay the minimum" button. Paying the card stays one button, filled in with the full amount left.
- Minimum amounts on the Accounts and Overview due-soon lines (`CardReminders.tsx`). Those stay as they are.
- A minimum for the next statement before it's made. Reminders scheduled ahead for it show the full amount only.
- Offering the fee on bank texts saved in bulk, without opening the editor. A bank text opened in the editor
  gets the offer like any other transfer.
- Offering the fee when editing a transfer saved earlier.
- Late fees: the user adds them with the existing **Add interest or fee** button.

## Anti-goals

- **The minimum must not look like the amount to pay.** The full amount left stays the strong line and the
  amount the Pay button fills in. The minimum is a plain row marked "about", and it never goes in the Pay button.
- **The fee must never be added silently.** The user sees it in the editor before saving, and can change it or
  remove it.

## Constraints

- **Saved data stays compatible.** The new settings are optional fields on `CreditCard`. A card without them
  works exactly as today.
- Builds before this one drop unknown `CreditCard` fields when they save a card (that's how `47750d0` removed
  the old minimum). If a card is edited on an older build, its minimum and fee rules are lost. This is
  acceptable.
- The old minimum was saved as `minPercent` and `minAmount`. Cards saved before 2026-11-21 and not saved since
  may still have them. Using the **same field names** brings those values back. That's wanted.
- Every new text in English and Arabic (`en.json`, `ar.json`).
- Amounts use the existing `roundTo` per currency. Two-currency cards are handled per currency, as the rest of the
  card page does.

## Approaches

How the cash withdrawal fee is stored:

1. **Its own expense, next to the withdrawal** *(chosen)*. An expense on the card in Bills, noted "Cash
   withdrawal fee", on the same date and time. It's the same kind of record the card page's **Add interest or
   fee** makes (`useCardActions.ts`), so totals, "Left to pay", statements and the Bills budget count it with no
   changes.
   - The user first chose to link it to the withdrawal with a shared `groupId`, so the list shows one entry.
     That doesn't work: in a group with an expense, `groupEntry` (`groups.ts`) counts every non-expense row as
     money back, so a 1,000 withdrawal with a 20 fee would show as −980. **So the fee is not grouped. It's a
     separate row.**
2. **The fee inside the transfer** (the card loses 1,020, the cash account gets 1,000). Transfers only allow two
   amounts for currency exchanges, and the fee wouldn't count as spending. Dropped.
3. **A new `fee` field on transactions.** Changes synced data, and every total would have to learn it. Dropped.

The minimum has no real alternative. It's worked out in `cardStatus` from the statement, as before, so nothing
new is saved per transaction.

## Design

### Data (`src/shared/models/index.ts`)

```ts
export interface CreditCard {
  // ...existing fields
  /** Minimum payment, % of the statement balance not counting its instalments. Undefined = no minimum shown. */
  minPercent?: number;
  /** The minimum is at least this much, in the main currency. */
  minAmount?: number;
  /** Cash withdrawal fee, % of the amount withdrawn. */
  cashFeePercent?: number;
  /** The cash withdrawal fee is at least this much, in the main currency. */
  cashFeeAmount?: number;
}
```

### Minimum (`src/core/utils/creditCard.ts`)

`CardAmounts` gets `minimum?: number`: what's left to pay of the minimum. It's undefined when the card has no
`minPercent` and no `minAmount`.

Per currency, for the last statement:

- `inst` = instalment charges on this card dated in (`previousStatementOn`, `statementOn`], at most `statement`.
- `rest` = `statement − inst`.
- `ofRest` = `max(roundTo(rest × minPercent / 100), floor)` when `rest > 0`, otherwise 0. `floor` is `minAmount`
  in the main currency and 0 in the second currency.
- `full` = `min(statement, roundTo(inst + ofRest))`, or 0 when nothing was owed at the statement.
- `minimum` = `min(due, max(0, full − paid))`.

This is the rule removed in `47750d0`. Restore it from there.

### Card setup (`AccountEditModal.tsx`)

Under the payment due fields, for credit cards only:

- **Minimum payment (%)** and **At least (EGP)**, both optional, as before `47750d0`. A **new** card starts with
  5% (CIB). An existing card without a rule starts empty.
- **Cash withdrawal fee (%)** and **At least (EGP)**, both optional. A new card starts with 2% (NBE). An existing
  card without a rule starts empty.
- One hint line under each pair, saying the numbers are on the bank's fee list.

An empty field saves as undefined. The percent fields take 0–100. The amount fields take what the existing
`limit` field takes.

### Card page (`CardBlocks.tsx`, `StatementRows`)

While the card has a minimum rule and the state is `due` (not `overdue`: by then the due date has passed and the
late fee is charged, so neither the minimum nor "pay the rest by" is true any more; the overdue line stays as
today) *(designer's call)*:

```
Statement balance      EGP 12,000
Paid since             EGP      0
Left to pay            EGP 12,000      ← strong, as today
Minimum (about)        EGP  1,350      ← new, plain row
Due 25 Dec · in 3 days
```

- The row shows while `minimum > 0` in any currency, using `AmountLines` like the rows above it.
- When the minimum is paid (`minimum` is 0 in every currency) but some of the statement isn't, the row is replaced
  by a muted line: **"Minimum paid · pay the rest by 25 Dec to avoid interest."**
- Nothing changes in the `paid` and `clear` states.

### Reminders (`src/features/reminders/plan.ts` and where its texts are built)

For the last statement's reminders only (`status.state === 'due'`): when some currency has `minimum > 0` and
`minimum < due`, the reminder includes it. For example: **"CIB Visa: EGP 12,000 due in 3 days (minimum about EGP
1,350)"**. `ReminderTexts.cardTitle` takes the minimum amounts as an optional third argument. The next statement's
reminder, scheduled ahead, doesn't change.

### Cash withdrawal fee (`TransactionEditor.tsx`)

A transfer counts as a **cash withdrawal** when it's new (not editing, not a recurring rule, not a due
occurrence), comes **from a credit card**, and goes **to an account that isn't a credit card** (and isn't the
same card).

While it counts:

- A **fee chip** shows where the instalments chip shows for purchases. With a fee rule it reads **"Fee EGP 20"**,
  pre-filled and re-worked out as the amount changes until the user edits it. Without a rule it reads **"+ Fee"**.
  Tapping it lets the user type the fee. The chip has a way to remove the fee.
- Under it, a muted line: **"Interest is charged from the day you withdraw. Paying it off early costs less."** It
  shows with or without a fee rule. The wording holds for a withdrawal dated earlier too (a bank text from a few
  days ago), so it's one text whatever the date *(designer's call)*.

Fee from the rule, in the transfer's currency: `max(roundTo(amount × cashFeePercent / 100), floor)`, where `floor`
is `cashFeeAmount` in the main currency and 0 in the second. With neither field set there's no pre-filled fee.

On save, when there's a fee above 0, a second record is saved after the transfer: an `expense` of the fee, same
`currency`, on the card (`accountId` = the card), category Bills (the `bills` key, as `addFee` finds it), note
"Cash withdrawal fee", the same `date` as the transfer, no `groupId`.

Put the pure parts (whether a transfer counts, the fee from the rule) in `creditCard.ts` with tests, next to the
other card rules.

### Text (en and ar)

New: "Minimum (about)", "Minimum paid · pay the rest by {{date}} to avoid interest.", the reminder's
"(minimum about {{amount}})", "Minimum payment (%)", "Cash withdrawal fee (%)", "At least ({{currency}})", the two
setup hints, "Fee {{amount}}", "+ Fee", "Cash withdrawal fee" (the record's note), "Interest is charged from the day you
withdraw. Paying it off early costs less." The old minimum keys were deleted in `47750d0`, so where wording matches, reuse
their old Arabic.

## Tests

- `creditCard.test.ts`: the minimum with a percent only, with the floor, with instalments on the statement, with
  part paid, paid in full, nothing owed at the statement, two currencies (floor only in the main one), and no
  rule (undefined). Whether a transfer counts as a cash withdrawal, and the fee from the rule, floor included.
- `plan.test.ts`: the reminder text gets the minimum when it's below what's due, and not when it equals it or is 0.
- The editor's save path: saving a cash withdrawal with a fee adds the fee expense. Without a fee it adds only the
  transfer.

## Left to the builder

- The fee chip's look and how the fee amount is typed (a small sheet like `InstalmentSheet`, or an inline field).
- Exact wording of the two setup hints.
- Where in `AccountEditModal` the four fields sit, as long as they're under the payment due fields.
