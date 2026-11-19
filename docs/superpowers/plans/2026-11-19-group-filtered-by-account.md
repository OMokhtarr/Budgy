# Group Filtered Transactions by Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a filter is on, let the transactions list be arranged by Day, Account or To account, with each account section showing its count and subtotal.

**Architecture:** A pure helper (`sections.ts`) buckets transactions into account sections, sorts them, and totals them with a value function the page passes in. `TransactionsPage` holds the chosen arrangement, shows a `.b-pills` switch under the filter chips, and renders either today's day sections or the new account sections. It reuses the same row markup, which gains an optional date.

**Tech Stack:** React 18 + Ionic, TypeScript, Vitest, react-i18next (en + ar, RTL).

**Spec:** `docs/superpowers/specs/2026-11-19-group-filtered-by-account-design.md`

## Global Constraints

- The switch only shows while a filter is on (`filter.size > 0`). It goes back to Day when the last chip is removed, and when "To account" disappears because no transfers are left.
- "To account" only shows when the filtered list has at least one transfer.
- Section order: largest absolute subtotal first. "Not transfers" always last.
- Account views don't fold linked groups (`foldGroups` is used only for Day).
- Selection, bulk actions, the summary footer and search act on the same `filtered` list in every arrangement.
- Every new string goes into both `src/core/i18n/locales/en.json` and `ar.json`, and the switch must work in RTL.

## Review Focus

1. **The search query narrows the list while on Account.** Sections are built from `filtered` (which includes search), so an account with no matches disappears instead of showing an empty heading. This is covered by building from `filtered`; check it by hand in Task 2.
2. **Removing a chip leaves no transfers while on "To account".** The arrangement falls back to Day, with no empty or stuck view. Checked by hand in Task 2, step 4.
3. **Accounts with equal subtotals (often 0 for plain transfers on Account) keep a stable order.** They stay in the order they first appear (newest transaction first), so the list doesn't reshuffle. Test: `keeps first-seen order for equal totals`.
4. **Long-press and tap in an account section.** These select and toggle rows the same way as in Day, and the "select all" count matches. The same `bind(x)` is used, so check by hand.
5. **A transfer saved without `toAccountId`.** On "To account" it goes into "Not transfers" rather than crashing. Test: `puts a transfer without a destination with the non-transfers`.

---

### Task 1: Account sections helper

**Files:**
- Create: `src/features/transactions/sections.ts`
- Test: `src/features/transactions/sections.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Arrangement = 'day' | 'account' | 'toAccount';
  export interface AccountSection {
    /** null: the "Not transfers" section of the To account view. */
    accountId: string | null;
    /** Newest first. */
    rows: Transaction[];
    /** In the main currency, from `valueOf`; null for "Not transfers". */
    total: number | null;
  }
  export function accountSections(
    txs: Transaction[],
    by: 'account' | 'toAccount',
    valueOf: (t: Transaction) => number,
  ): AccountSection[];
  ```
  - `by: 'account'` keys on `t.accountId`.
  - `by: 'toAccount'` keys on `t.toAccountId` for `type === 'transfer'` with a `toAccountId`. Every other row goes into the `accountId: null` section.
  - `total` is the sum of `valueOf` over the section's rows.

- [ ] **Step 1: Write the failing tests** in `sections.test.ts`, using the `tx()` factory pattern from `groups.test.ts` and `valueOf = (t) => (t.type === 'income' ? t.amount : -t.amount)`:
  - `groups by account with totals, largest absolute total first`: card expenses 100 + 50 and bank expense 300 → `[['bank', -300], ['card', -150]]` as `[accountId, total]`.
  - `lists rows newest first`: three card rows dated 05, 07, 06 Nov → row ids in date order 07, 06, 05.
  - `keeps first-seen order for equal totals`: input order a, b, both totals 0 → `['a', 'b']`.
  - `groups transfers by destination and puts the rest last`: transfers card→savings 200 and card→wallet 500 plus one expense, `by: 'toAccount'`, `valueOf = (t) => t.amount` → `[['wallet', 500], ['savings', 200], [null, null]]`.
  - `puts a transfer without a destination with the non-transfers`: a transfer with `toAccountId: undefined` → a single section `{ accountId: null, total: null }`.
  - `has no "Not transfers" section when every row is a transfer`: → no entry with `accountId: null`.

- [ ] **Step 2: Run them to make sure they fail**
  Run: `npx vitest run src/features/transactions/sections.test.ts`
  Expected: FAIL (cannot resolve `./sections`).

- [ ] **Step 3: Implement `accountSections` in `sections.ts`.** Build a `Map` in input order, sort each section's rows by `date` descending, then stable-sort the sections by `Math.abs(total)` descending with the null section forced last. Doc comments follow the file's plain-sentence style (see `groups.ts`).

- [ ] **Step 4: Run them to make sure they pass**
  Run: `npx vitest run src/features/transactions/sections.test.ts`
  Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**
  ```bash
  git add src/features/transactions/sections.ts src/features/transactions/sections.test.ts
  git commit -m "Add account sections for arranging transactions by account"
  ```

### Task 2: The Group by switch and account sections on the page

**Files:**
- Modify: `src/features/transactions/TransactionsPage.tsx` (filter block ~350-376, list rendering ~401-507)
- Modify: `src/index.css` (next to `.b-filtersum`, ~1709)
- Modify: `src/core/i18n/locales/en.json`, `src/core/i18n/locales/ar.json` (the `transactions` block)

**Interfaces:**
- Consumes: `accountSections`, `Arrangement`, `AccountSection` from Task 1.

- [ ] **Step 1: Add the strings** under `transactions`:
  - en: `"groupBy": "Group by"`, `"byDay": "Day"`, `"byAccount": "Account"`, `"byToAccount": "To account"`, `"notTransfers": "Not transfers"`
  - ar: `"groupBy": "تجميع حسب"`, `"byDay": "اليوم"`, `"byAccount": "الحساب"`, `"byToAccount": "إلى حساب"`, `"notTransfers": "غير التحويلات"`

- [ ] **Step 2: The arrangement state and switch.**
  - Add `const [arrange, setArrange] = useState<Arrangement>('day')` and `const hasTransfers = filtered.some((x) => x.type === 'transfer')`.
  - Add an effect that sets it to `'day'` when `filter.size === 0`, or when `arrange === 'toAccount' && !hasTransfers`.
  - Render a `<div className="b-pills b-groupby" role="tablist" aria-label={t('transactions.groupBy')}>` between `.b-filterchips` and `.b-filtersum`. It has buttons for day, account, and toAccount (the last only when `hasTransfers`), each with `className={arrange === k ? 'is-active' : ''}` and `aria-selected`.
  - CSS: `.b-groupby { margin: 4px 0 8px; }`.

- [ ] **Step 3: Render account sections.**
  - Pull the single-transaction row JSX (the transfer branch and the expense/income branch, ~453-503) into a local `txRow(x: Transaction, withDate = false)`. Day keeps calling it with `withDate = false`, with no visible change.
  - When `withDate` is true, append ` · {short date}` to the row's sub-line. Use `Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })`.
  - Compute `const sections = useMemo(() => (arrange === 'day' ? null : accountSections(filtered, arrange, valueOf)), …)` with:
    - Account: `valueOf` is the day heading's per-row formula (income +, expense −, transfer `-spentOnTile`). Pull it into a shared `netOf(x)` and use it for the day headings too.
    - To account: `valueOf = (x) => (x.toAmount != null && x.toCurrency ? conv.toBase(x.toAmount, x.toCurrency) : txInBase(x, conv))`.
  - When `sections` is non-null, render each as `<section className="b-daygroup">` with a `.b-dayhead`:
    - The account's `Avatar` (`iconFor(acc.icon)` style, as in row sub-lines) and `accountName(accounts.get(id))`, or `t('transactions.notTransfers')` for null.
    - `t('transactions.count', { count })`.
    - The total via `SignedMoney`. Coloured `b-income`/`b-expense` on Account, `b-transfer` on To account, and nothing for null.
    - Then `rows.map((x) => txRow(x, true))`.
  - The empty state and the Day view stay as they are.

- [ ] **Step 4: Verify**
  - Run: `npm run typecheck && npm test`. Expected: no type errors, all suites pass.
  - Run the app (`npm run dev`), then in English and in Arabic:
    1. Filter to one category, pick Account, and check the headings' counts and totals add up to the filter bar's count.
    2. Long-press a row in a section and check the selection footer.
    3. Search while on Account.
    4. Filter including a transfer, pick To account, then remove the transfer chip. Expected: back to Day, switch without "To account".
    5. Remove the last chip. Expected: switch gone.

- [ ] **Step 5: Commit**
  ```bash
  git add src/features/transactions/TransactionsPage.tsx src/index.css src/core/i18n/locales/en.json src/core/i18n/locales/ar.json
  git commit -m "Let the filtered transactions be grouped by account or by destination"
  ```
