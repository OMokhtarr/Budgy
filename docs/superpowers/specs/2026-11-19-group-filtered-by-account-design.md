# Group the filtered transactions by account

## Why

After filtering the transactions list (long-press → "Show only these categories"), the user wants to answer:

- "Which account did my food spending come out of?"
- "Where did my transfers go this month?"

Today the filtered list is always split by day, so the answer means adding rows up by eye.

## Goals

- When a filter is on, the user can arrange the list by **Day** (as today), **Account**, or **To account**.
- Each account section heading shows that account's count and subtotal, so the answer can be read straight off the headings.

## Non-goals

- Filtering by account (keeping only one account's rows). That is the separate idea "B", which wasn't chosen.
- Grouping the unfiltered list. The control only shows while a filter is on.
- Remembering the choice across visits.

## Approaches

- **A. A "Group by" switch on the filtered list** — **picked**. It rearranges the list the user already has and puts the answer in the headings, reusing the day-heading style.
- B. An account summary strip above the day list, where tapping an account filters to it. Not picked: it's really two features at once, and the list itself stays arranged by day.
- Plain "sort by account". Dropped: without subtotals it doesn't answer either question.

## Design

**The control.** A three-way segmented control (Day · Account · To account) sits just under the filter chips, next to the existing count/net bar (`.b-filtersum`). "To account" only shows when the filtered list has at least one transfer. The choice goes back to Day when the last filter chip is removed, and also when "To account" disappears because the list no longer has transfers.

**Day.** Unchanged.

**Account.** One section per `accountId`. This is the account money left for expenses and transfers, and the account money arrived in for income.
- Heading: account icon and name, then the count, then the net in the main currency. The net uses the same sum as today's day heading: income +, expense −, a transfer counts as money leaving the tile (`spentOnTile`).
- Rows: newest first, and each row shows its date (day and month) in its sub-line, since there are no day headings.
- Linked groups (`foldGroups`) are **not** folded in this view. Each row appears under its own account. This is required because one group can span several accounts.

**To account.** One section per `toAccountId` for transfers, headed by the receiving account's name, the count and the total received (in the main currency, transfer colour). Everything that isn't a transfer goes into one last section, "Not transfers", with no total.

**Section order.** Largest absolute subtotal first. That puts the answer to "which account" at the top. "Not transfers" always comes last.

**Selection, bulk actions, the summary footer and search** keep working the same way in every arrangement. They act on the same filtered list.

**Strings.** New keys in `en.json` and `ar.json`: group-by label, Day, Account, To account, Not transfers. The control must look right in RTL.

## Left to the builder

- Whether to pull the bucketing into a small pure helper next to `groups.ts` (likely, so it can be unit-tested).
- How the segmented control looks, within the existing `b-` styles (Ionic `IonSegment` is fine).
