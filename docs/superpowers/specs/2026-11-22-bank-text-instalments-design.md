# Instalments from bank texts — design

Date: 2026-11-22 · Status: draft for review · Builds on `2026-11-21-card-instalments-design.md`

## Why

The bank texts once, at purchase. On a credit card, the purchase is often paid in instalments: the bank takes the
full price off the limit at once, and the user pays one instalment a month until it's paid off. Today the
instalment option only appears in the editor (tapping a text), not on the text's own card, and it always treats
the amount as the full price. The user wants to pick instalments straight from the bank text, say what the amount
stands for, and have the rest of the months recorded until the plan is done.

## Goals

1. A bank text on a credit card can be confirmed **as instalments** from its card on the Bank texts screen.
2. The sheet asks what the amount is: **the full price** (default, the usual case) or **one monthly instalment**
   ("3 of 12", for a plan that started before Budgy).
3. A later text that matches an instalment already recorded is **caught before it's saved twice**. The user's
   bank doesn't send these, but other banks do.

## Non-goals

- Interest calculation (unchanged: enter the total you'll pay).
- Reading "instalment 3/12" from the text itself to pre-fill the sheet.
- Instalments on debit cards or other accounts.

## Anti-goals

- Counting a month twice: a matched text must never add a second charge unless the user says "Add anyway".
- A second, separate way of handling duplicates.

## Approaches (the user picked A / A)

**Where the choice is made**
- **A (chosen): an Instalments button on the bank-text card**, only when the picked account is a credit card and
  the text is money out. It opens the existing sheet; Confirm then saves the plan in one step.
- B: no button, only a hint sending the user to the editor. Less work, but one more step and easy to miss.

**Full price vs one instalment:** one sensible way, a switch at the top of the sheet.

**Catching an already-recorded instalment**
- **A (chosen): extend the existing duplicate check** that Confirm, the editor and batch confirm already run, so it
  also matches a plan instalment and names it.
- B: flag it on the card before tapping. More visible, but a second duplicate mechanism.

## Design

### Sheet (`InstalmentSheet.tsx`, shared by the editor and the bank-text card)

- New switch at the top: **This amount is** · *The full price* (default) · *One monthly instalment*.
- Full price: unchanged (months, "= X a month", fee, automatic payment).
- One monthly instalment: **Instalment [n] of [N]**, N 2–60, n 1..N (default 1 of 12). Hint:
  "= X total · Y still to come" (Y = amount × (N − n)).
- The fee field shows only for full price, or for instalment 1 (a fee on a plan started months ago was charged
  then, not now). *My call.*
- `InstalmentChoice` gains `first?: number` (the n of the text's instalment; set only in "one instalment" mode).
- Since the sheet is shared, the editor gets the switch too, for typed purchases and for converting one.

### Saving (`instalments.ts`)

- `PlanOptions` gains `first?: number`. When set, `parts` is the amount repeated `N − first + 1` times (no
  splitting); the entry saved is instalment `first` of N, dated on the text's day, and `first + 1..N` follow monthly
  from it (`instalmentDates`). Earlier instalments are not added: they were before Budgy.
- Converting an existing purchase in this mode: it keeps its amount and becomes instalment `first`; the rest are
  added.
- Fee and automatic payment work as today, over the parts actually added.
- `createPlan` keeps its fingerprint check (a text is saved once).

### Card page fix (`creditCard.ts`, `instalmentPlans`)

- `charged` = `(first.instalment.n − 1)` + instalments dated up to today, so a plan from "3 of 12" shows
  "3 of 12", not "1 of 12". Monthly amount, still to come, Pay off and Delete are unchanged (they act on the
  entries that exist).

### Bank-text card (`SmsItemCard.tsx`)

- When the picked account is a credit card and the text is money out with a category (not a person), a third chip
  **Instalments** sits in the chips row; once set it reads "12 instalments" (or "3 of 12"). Changing the account to
  a non-credit-card drops the choice.
- Confirm with a plan: the same duplicate check, then `createPlan` with the draft and options (Bills fee category,
  fee note, card's credit settings, as the editor does), then `resolveImported` with instalment 1's entry.
- Pro gate as today for Confirm. Tapping the card still opens the editor, which already offers the chip.
- The plan is one of the card's picks (`CardPick.instalments`): picking another account or a person drops it, the
  editor opens with it, and batch confirm ("Same category") saves a text that has one as its plan.

### Matching an instalment already recorded (`duplicate.ts`, `useDuplicatePrompt.ts`, `batch.ts`)

- The duplicate lookup also returns an **instalment match**: a live expense with `instalment` set and no linked
  month's text yet (`instalment.sms`), not claimed by another text being confirmed with it, on the same account, same amount and currency, dated in the same statement cycle as the text
  (`statementFor` on the card). If several match, the one dated nearest the text. *My call: the bank posts on
  statement day, which can be weeks from the purchase day, so "same day" isn't enough.*
- The hand-entered same-day match stays as it is (instalments left out) and is checked first.
- For an instalment match the alert says: "Looks like *Phone*, instalment 4 of 12, already on this card." Buttons
  **Already recorded** / **Add anyway**.
- **Already recorded** links the text to that instalment: `instalment.sms` is set to the text's fingerprint (so no
  other text matches it), and the instalment takes it as `smsFingerprint` too, unless it already holds its purchase
  text's (instalment 1 of a full-price plan), when the text is recorded as seen. The sender's card is learned, not a
  merchant rule. A plan made from a one-instalment text has that text linked from the start. If the instalment was
  claimed meanwhile, the text is just a duplicate.
- With no note and no category name, the alert leaves the name out.
- Batch confirm: `duplicatesOf` includes instalment matches, handled the way it already handles duplicates, with
  linking for instalment matches.

### Copy

English and Arabic for the switch, the "n of N" fields and hints, the chip, and the alert.

## Tests

Pure logic, in the existing test files: `splitAmount`/parts in "one instalment" mode, `createPlan` and
`convertToPlan` with `first`, `instalmentPlans` `charged` with a late start, the instalment match (same cycle,
amount, currency and account; not matched after linking; nearest wins; hand-entered still first), and the batch
duplicate set.

## Left to the builder

Exact layout of the switch and fields, the chip's place in the row, and copy wording.
