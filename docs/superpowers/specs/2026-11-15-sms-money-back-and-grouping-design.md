# Bank texts: money back, doing several at once, and combining — design

Date: 2026-11-15. Builds on the SMS import specs (`2026-11-03-sms-import-design.md`,
`2026-11-07-sms-import-stage-2-design.md`) and the lending-from-a-text change (PR #18).

## Why

The user often pays for something shared, such as a dinner, and friends send their share back straight away.
Today each bank text becomes its own transaction. The friends' transfers show up as income, or as lending if a
person is picked, so the dinner counts as 600 of spending when the real cost was 200. The user also gets several
texts that all belong to one thing:

- several friends paying back for the same dinner
- one purchase paid from two cards
- one purchase paid by sending money to more than one account

They want to handle these **once**, not text by text, and see the result as **one entry with the net amount**.

## Goals

1. Money that comes back on a purchase **reduces spending in that purchase's category**. It never counts as
   income.
2. On the bank texts screen, **select several texts and act on them in one go**:
   - **Same category:** give all of them one category and confirm them together. Each stays its own entry.
   - **Combine into one:** they become one entry, for example two cards plus friends paying back.
   - **Take off a purchase:** incoming texts reduce a transaction that's already saved.
3. A combined entry shows in the transactions list as **one row with the net amount**, and its texts are listed
   under it.
4. Every account's balance and every credit card statement stays exactly right. Each account moves by exactly
   what its own text says.

## Non-goals

- **Grouping hand-entered transactions from the transactions list.** The user was asked about this and didn't
  answer, so it's left out of this round. "Take off a purchase" can still target any saved expense, including a
  hand-entered one.
- Tracking who still owes what. Money that comes back "right away" is just netted out. Real lending stays the
  existing "person" flow (debt accounts) and isn't changed.
- Splitting one text across several categories.

## Anti-goals (it would be a failure if…)

- An account balance, card statement, minimum payment or lending figure changes because of grouping.
- Paid-back money shows up anywhere as income: the income tile, the income categories, or the monthly bars.
- An ordinary edit in the transaction editor silently drops a row's money-back mark or its group.
- Grouping makes confirming a single text slower or different from today.

## Approaches considered

1. **Linked rows, shown as one (chosen).** Each text stays its own `Transaction` on its own account, so
   balances, card cycles, lending shares, sync, backups and the duplicate check keep working on single rows.
   Rows that belong together share a `groupId`. Only the totals, the list, the editor and the bank texts screen
   learn about groups. Trade-off: "one transaction" exists in the list and the editor, not in storage, so a CSV
   export shows the rows separately with a group column.
2. **One transaction made of parts.** A single record holds parts (account, amount, direction, text). It's truly
   one record, but balances, credit card statements, lending, CSV, sync conflict handling, the fingerprint
   dedupe index and the editor would all have to learn about parts. It's a much bigger change, and it touches the
   code most likely to get a balance wrong. Rejected.
3. **Save only the net as a single expense.** It's wrong at the source: the card was charged 600, not 200.
   Rejected.

The user picked the single-row display (A) and the three batch actions. The storage approach (1) is my call.
The user was told it looks the same to them either way.

## Data model

Two optional fields on `Transaction`. Both sync for free, because the cloud stores the app's fields in `data`
jsonb, so no migration is needed. No new Dexie index is needed unless the builder wants `groupId` indexed for the
group sheet. If they do, add Dexie version 3 with `groupId` added to the transactions index list.

```ts
/** Money back on a purchase: an `income` row whose category is an expense category. It lowers that category's spending. */
moneyBack?: true;
/** Rows with the same id show as one entry: a purchase, the cards or accounts it was paid from, and money that came back. */
groupId?: string;
```

Rules:

- **A money-back row** has `type: 'income'` (so balances, card statements and lending are right with no change:
  money arrives on the account) plus `moneyBack: true`. Its `categoryId` is an **expense** (or `both`) category.
  Its rate is saved like any foreign expense or income row. It's valid on its own, with no group.
- **A group** is two or more live rows sharing `groupId`. Every row in a group has the same `categoryId` and
  `subcategoryId`. A group is either:
  - **an expense group:** expense rows plus money-back rows, or
  - **an income group:** income rows only, with no money-back rows.
- `groupId` is a new random id (`newId()`).
- `TxDraft` and `buildTxRecord` carry `moneyBack` and `groupId` through. `buildTxRecord` writes an explicit field
  list and `saveTx` `put()`s the whole record, so without this any edit would ungroup the row. Both fields are
  dropped on transfers.

### What "flow" a row counts in

Add one helper, for example `flowOfTx(t): Flow | undefined`, where `moneyBack` counts as `'expense'` and a
transfer has no flow. Use it everywhere code currently branches on `type` to sum spending or income, or to check
a category against a row:

- `totalsOf` (`core/db/hooks.ts`): a money-back row **subtracts** its value from `expense`,
  `byCategory.expense`, `byCategoryCur.expense` and `bySubcategory.expense`. It adds nothing to income.
- `OverviewPage` monthly bars (lines ~69–70): money back subtracts from `exp`.
- `TransactionsPage` day subtotals and the period total row.
- `bulk.ts` `moveToCategory`: a money-back row fits expense categories, not income ones.
- `categoryFits` callers in the editor (see below).
- CSV export and import (below).

**Negative totals.** Money back can land in a different period from its purchase, for example a dinner on
31 Oct paid back on 1 Nov. Each row counts on its own date (the same rule as balances), so a category can be
**below zero** in a period. The donut, the category grid and the budget bars treat a category below zero as
zero (it's left off the donut and the budget bar shows nothing spent). The category's own figure still shows the
real, negative number. The `expense` total for the period is never clamped.

## Stage 1: select several texts, "Same category"

No model change.

**Selecting.** On the bank texts screen, a long-press on an understood card starts selection, using the same
pattern as the transactions list (`useLongPress`, haptic, a bar in place of the tab bar, and back leaves
selection). While selecting, a tap toggles a card. Unreadable cards can't be selected. A single text without
selection works exactly as today.

```
Bank texts                        3 selected   ✕
☑ InstaPay  +200  Ali
☑ InstaPay  +200  Sara
☑ InstaPay  +200  Omar
☐ CIB card  −600  Pizza Place
─────────────────────────────────────────────
[ Same category ]   [ Combine into one ]   [ Take off a purchase ]
```

**Same category** needs every selected text to go the same way (all money out, or all money in). Otherwise the
button is disabled, with a short hint. It opens the existing `PickerSheet`:

- money out: expense categories
- money in: income categories, **plus a section "Money back on" listing expense categories**. This is the user's
  case: friends' transfers for a shared dinner should lower Food, not count as income. Picking from that section
  saves money-back rows (Stage 2's flag). Until Stage 2 ships, the section is hidden.

After the pick, every selected text gets that category as its card pick, and every **complete** one is confirmed
in a single action:

- **Complete** means it has an account (suggested or picked) and the draft builds.
- **Duplicates:** run `findManualDuplicate` for each. If any match, show **one** prompt ("N of these look
  already added"): Skip those, Keep all, or close the prompt (nothing is saved).
- Each text is saved with `importText`, so links are learned per text. A failure on one doesn't undo the others,
  and the toast says how many failed.
- Texts with no account stay on the screen with the category filled in and stay selected. The toast says
  "N need an account".

People (debt accounts) are not offered in "Same category". Lending stays a single-card action.

## Stage 2: money back

- The `moneyBack` field, `flowOfTx`, and every totals and display change listed above.
- **On a single incoming card**, the category picker gets the same "Money back on" section. This covers the
  user's first request without any selection. The card's chip shows the category with a small "money back"
  note, like the existing lent / paid-back note.
- **Take off a purchase** (selection action, and also an item at the top of a single incoming card's category
  picker):
  - Needs every selected text to be money in.
  - Opens a sheet of recent expenses: the last 30 days, newest first, with search. Groups show as one item
    (Stage 3), and before Stage 3 they show as their rows. Hand-entered expenses are included.
  - Picking one saves each text as a money-back row with the target's category and subcategory, on the text's
    own account. Those rows and the target share a `groupId`: the target's existing one, or a new one written onto
    the target too.
  - It all happens in one Dexie transaction, with each text's link learned and its pending item dropped.
  - A text with no account blocks the save. The sheet lists the texts with their account chips, like a card, so
    they can be filled in there.
- **Learning:** money-back rows teach the sender link (which account) and **no merchant rule**. In
  `lessonIdsOf`, skip the rule when `moneyBack`, otherwise an income-flow rule would point at an expense category.
- **Editor:** a money-back row opens as "money back". It shows expense categories, keeps its category, and has a
  "Money back" label on the type line. The `switchType` category reset (`TransactionEditor` ~line 151) must not
  wipe it on open. Switching such a row to Expense or Transfer drops `moneyBack`. A plain income row has no way
  to become money back in the editor: that's done from bank texts only (builder may add it if it's cheap).
- Before Stage 3, a money-back row in the list shows as its own row: "+400 · Food · money back", in the expense
  colour and counted against spending.

## Stage 3: combine into one, and the folded row

**Combine into one** needs two or more selected texts. It opens a combine sheet:

```
Combine 4 texts                          Net −200 EGP
CIB ••1234      −600   Pizza Place
InstaPay        +200   Ali        [ Bank account ▾ ]
InstaPay        +200   Sara       [ Bank account ▾ ]
Category  [ Restaurant ▾ ]    Note [ Pizza Place ]
                                         [ Save ]
```

- Each text has an account chip, pre-filled from its suggestion.
- **Category:**
  - Any money out: expense categories. Money-out texts become expense rows, money-in texts become money-back
    rows.
  - All money in: income categories, and every text becomes an income row. "Money back on" is offered here too,
    which makes all of them money-back rows. That's the "three friends paid me back" case, with no purchase
    saved yet.
- **Note:** defaults to the merchant of the largest money-out text (otherwise the first merchant). Every row gets
  it.
- **Save:** one Dexie transaction creates all rows with one `groupId`. It learns each link, learns the merchant
  rule only from expense rows that have a merchant, and drops the pending items. It runs one combined duplicate
  prompt, as in Stage 1. Save stays disabled while any text has no account.

**The folded row in the transactions list.** Rows sharing a `groupId` among the **rows the list is showing**
fold into one row:

- It shows on the day of the group's earliest visible row.
- It shows the category and the note.
- The amount is the **net** in the main currency: expense rows minus money-back rows. If every row is in one
  currency, it shows that currency instead.
- A small line underneath lists each row's account and signed amount.
- A row on its own (a group of one visible row) shows as a normal row with a small "linked" mark.

Partial groups are expected and must render without errors:

- **Rows in another period:** they're not in the range query, so the folded row nets only what's visible. A
  "+1 more in another period" hint is enough.
- **Account filter:** same as above. Only the filtered account's rows show.
- **A deleted row:** it isn't alive, so it's left out. A group down to one row is simply a linked row.
- **Two devices editing different rows:** last edit wins per row. If rows end up with different categories, the
  folded row shows the category of the largest expense row. The next save from the group sheet makes them match
  again.

**Tapping the folded row** opens a group sheet:

- The net, the category (changing it changes every row's category and subcategory), the note, and the list of
  rows.
- Tapping a row opens the normal editor for that row. Its category picker is hidden there, because the category
  belongs to the group.
- "Remove from group" on a row clears its `groupId`. A money-back row stays money back on its own.
- "Delete" deletes every row in the group, after confirmation.

**Bulk actions on the transactions list:** selecting a folded row selects all its visible rows. Change category
applies to all of them, which keeps the group consistent. Change account and change day apply as today, row by
row. Delete deletes all of them, and the confirmation counts rows.

**CSV:**

- Export adds two columns: `group` (the `groupId`) and `money back` (yes/blank).
- Import reads them when present. An imported money-back row needs an expense or `both` category, otherwise it's
  imported as a plain income row and reported.
- Old files without the columns import as today.

## Copy

New strings go in both `en.json` and `ar.json`: the selection bar, the three actions, "Money back on", the
money-back note on a card and on a list row, the combine sheet, the group sheet, the partial-group hint, and the
batch toasts and duplicate prompt. The Arabic layout is right-to-left and must be checked on the new sheets.

## Testing

Unit tests, following the existing `*.test.ts` files:

- `totalsOf` with money-back rows: same period, other period, a negative category, mixed currencies with rates.
- `flowOfTx`.
- `buildTxRecord` round-tripping `moneyBack` and `groupId`.
- `lessonIdsOf` learning no rule for money back.
- The batch confirm: complete and incomplete texts, the combined duplicate prompt.
- Combine and take-off: rows, `groupId` written onto the target, links learned, pending items dropped, all or
  nothing.
- The list folding: the net, partial groups, a group of one.
- `moveToCategory` with a group and with money-back rows.
- A CSV round trip with the new columns, and an old file.
- `useBalances` and card statements unchanged for a group: a regression test.

Device checks (debug build), added to `TODO.md` like the earlier stages: select, act and toast on a phone,
right-to-left layout, dark mode.

## Left to the builder

- Exact component split (a new `CombineSheet`, `PurchasePickerSheet`, `GroupSheet` is the expected shape).
- Whether `groupId` gets an index (Dexie v3) or the group sheet filters a date window.
- Icons, wording and the look of the folded row's sub-line, within the existing card and row styles.
- Whether a plain income row can be turned into money back from the editor.
- Release notes entry in `RELEASE-NOTES.md` when each stage ships.
