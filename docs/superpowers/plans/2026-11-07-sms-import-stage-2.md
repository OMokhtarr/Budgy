# SMS Import — Stage 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users scan their bank texts, review them, and confirm them into transactions. Budgy learns
which account and category each text belongs to; those learned links and rules sync, and the messages
never leave the phone. Also fix stage 1's deferred issues.

**Architecture:** Four new Dexie tables in `budgy2` version 2. `smsLinks` and `merchantRules` are synced
records: they join `SYNCED_TABLES`, get two Supabase tables, and go in backups. `smsPending` and `smsSeen`
are plain local tables keyed by the text's fingerprint. Pure modules in `src/features/sms/` (learning,
scan, resolve) take the database as a parameter so Vitest can run them on fake-indexeddb. A shared
record builder is used by both the editor's ✓ and the card's Confirm.

**Tech Stack:** Ionic React 8, Capacitor 8.5, Dexie 4 (+ dexie-react-hooks), TypeScript, Vitest with
fake-indexeddb, PGlite for the migration tests, Supabase.

**Spec:** `docs/superpowers/specs/2026-11-07-sms-import-stage-2-design.md`, which builds on
`docs/superpowers/specs/2026-11-03-sms-import-design.md`. Read both.

## Global Constraints

- Branch: `feature/sms-import-stage-2` (already created; the spec is committed there).
- Android debug builds only: every new screen, row and menu item renders only when `useSmsAvailable()` is true (and, for the menu item and review screen, `smsImport.enabled`).
- Message text (`body`) is stored only in `smsPending`. It is never synced, never backed up and never copied into a transaction. Only `smsFingerprint` travels.
- Synced tables follow `src/core/db/db.ts`: UUID `id`, `updatedAt`, `deletedAt`, `dirty` via `stampWrites`; reads filter with `alive`; deletes use `softDelete`. `put()` of a whole record sets `updatedAt` itself (as `TransactionEditor.save` does).
- An amount is never relabelled into another currency: USD 20 is never saved as EGP 20.
- All user-facing text goes through i18n, in both `en.json` and `ar.json`, written in each language.
- Code style: match the surrounding code (2-space indent, single quotes, short JSDoc on exports, `@/` imports).
- Run `npm test && npm run typecheck` before every commit; both must pass.
- Commit messages are plain sentences in the repo's style (e.g. "Sync learned SMS links and merchant rules"), ending with the `Co-Authored-By` line from the session's attribution rules.

## Review Focus

1. **Scan tapped twice, or two overlapping scans.** The same text must never become two pending items. → Task 5, `adds each text once even when two scans overlap`.
2. **Editing an imported transaction later** (the user's "update it later" path, e.g. switching USD to EGP). The editor's `put()` replaces the whole record, so `smsFingerprint` must survive, or the text comes back on the next scan. → Task 6, `keeps smsFingerprint and createdAt when editing`.
3. **A learned account or category is gone.** The account was deleted or archived, or the category was archived or no longer fits the flow. It must never be suggested, and the chip falls back to "Pick…". → Task 4, `skips links and rules whose target is gone`.
4. **Texts near midnight.** The "already added" check compares *local* days: a manual entry at 23:50 and a text at 00:10 the next day are not duplicates. → Task 6, `matches on the local day only`.
5. **Type changed in the editor to a transfer.** Resolving must still learn the account link, learn no merchant rule, and not crash on the missing `categoryId`. → Task 4, `learns no rule from a transfer`.

---

### Task 1: Parser fixes (stage 1 deferred)

**Files:**
- Modify: `src/features/sms/parser/parseSms.ts`, `src/features/sms/parser/text.ts`
- Test: `src/features/sms/parser/parseSms.test.ts`, `src/features/sms/parser/text.test.ts`

**Interfaces:**
- Produces: `findDigits(body: string, direction?: SmsDirection): string | undefined`. The new optional second parameter is the only signature change; `parseSms` passes its direction.

- [ ] **Step 1: Write the failing tests** (synthetic fixtures, labelled as such like the existing ones):

```ts
it('stops the merchant before trailing words', () => {
  expect(t('Card **4821 debited EGP 85.00 at UBER using card **4821')).toMatchObject({ merchant: 'UBER' });
  expect(t('Purchase of EGP 85.00 at UBER is pending')).toMatchObject({ merchant: 'UBER' });
  expect(t('EGP 120.00 paid at TALABAT via Apple Pay')).toMatchObject({ merchant: 'TALABAT' });
  expect(t('تم خصم ١٢٠ ج.م لدى طلبات باستخدام بطاقتك ****4821')).toMatchObject({ merchant: 'طلبات' });
});
it('picks the masked digits on the right side of a transfer', () => {
  expect(t('EGP 500.00 transferred from **9999 to **1234, debited')).toMatchObject({ direction: 'out', digits: '9999' });
  expect(t('EGP 500.00 credited from **9999 to **1234')).toMatchObject({ direction: 'in', digits: '1234' });
});
it('falls back to the currency next to a template amount', () => {
  const tpl: BankTemplate = { id: 'x', sender: /^TB$/i, formats: [{ match: /^POS/, direction: 'out', amount: /AMT:([\d.,]+)/ }] };
  expect(parseSms('TB', 'POS AMT:99.5 EGP', [tpl])).toMatchObject({ amount: 99.5, currency: 'EGP' });
});
```

In `text.test.ts`, add `expect(findDigits('from **9999 to **1234', 'in')).toBe('1234')` and `expect(findDigits('from **9999 to **1234', 'out')).toBe('9999')`.

- [ ] **Step 2: Run** `npx vitest run src/features/sms/parser`. Expected: the new tests FAIL; the old ones pass.
- [ ] **Step 3: Implement.**
  - **Merchant:** extend the lookahead of `MERCHANT` and `MERCHANT_IN` so the name also stops before ` using `, ` with `, ` via `, ` is `, ` was `, ` for `, ` card`, ` pending`, a masked number (`[*xX•#]{2,}`), and before ` باستخدام`, ` بواسطة`, ` بطاق`, ` عبر`.
  - **Digits:** when `direction` is `'out'`, first try a masked number right after `from`/`من`; when `'in'`, right after `to`/`إلى`/`الى`; otherwise the current patterns.
  - **Template currency:** when `f.currency` is missing or doesn't match, use the `currency` of the `findAmounts(text)` entry whose `index` equals the template amount's position in the text.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** "Read merchants, transfer digits and template currencies more carefully in bank texts"

---

### Task 2: Settings section fixes and disclosure wording

**Files:**
- Modify: `src/features/sms/SmsSettingsSection.tsx`
- Modify: `src/core/i18n/locales/en.json`, `src/core/i18n/locales/ar.json` (`sms.disclosureBody`, new `sms.permissionError`)

- [ ] **Step 1: Failures.** Wrap `SmsInbox.requestPermissions()` and `checkPermissions()` in `try/catch`. On failure, the switch remounts off (`setToggleKey`), `enabled` isn't set, and an `IonNote` shows `sms.permissionError` ("Budgy couldn't check the SMS permission. Try again.").
- [ ] **Step 2: One resume listener.** Register `CapApp.addListener('resume', …)` once (effect with `[]` deps). It reads the current `smsImport` and `set` through a `useRef` that's updated every render. Run the same `refresh` on mount.
- [ ] **Step 3: Disclosure wording.** Replace `sms.disclosureBody` in both languages with this meaning: texts are read on this phone only, and only from the senders you list. While a text waits for your review, its message is kept on this phone, and it's deleted once you confirm or dismiss it. Budgy keeps the amount, date, merchant and last digits. When you're signed in, the card digits and merchant names Budgy learns are saved to your account, so your other phones can use them.
- [ ] **Step 4: Verify.** Run `npm test && npm run typecheck`. Expected: pass. On a debug build, add and remove three keywords, then background and resume the app. The permission row still updates, and no duplicate listener builds up: add a temporary `console.count('resume')` and remove it afterwards.
- [ ] **Step 5: Commit:** "Handle SMS permission errors and say how long texts are kept"

---

### Task 3: Data model, sync and backups

**Files:**
- Modify: `src/shared/models/index.ts`, `src/core/utils/id.ts`, `src/core/db/db.ts`, `src/core/cloud/sync.ts`, `src/core/cloud/client.ts`
- Create: `supabase/migrations/20261107120000_sms_learning_tables.sql`
- Test: `src/core/utils/id.test.ts` (new), `src/core/db/db.test.ts`, `src/core/cloud/sync.test.ts`, `src/test/supabase-schema.test.ts`

**Interfaces:**
- Produces (models):

```ts
// Transaction gains:
/** Fingerprint of the bank text it was imported from (see SMS import). Syncs; the text itself never does. */
smsFingerprint?: string;

/** Learned: texts from this sender with these masked digits belong to this account. Synced. */
export interface SmsLink extends Synced { address: string; digits?: string; accountId: string }
/** Learned: this merchant's texts of this flow go in this category. Synced. */
export interface MerchantRule extends Synced { merchant: string; flow: Flow; categoryId: string; subcategoryId?: string }

/** A bank text waiting for review. Local only. `fingerprint` is the key. */
export interface SmsPending {
  fingerprint: string; smsId: string; address: string;
  /** When the text arrived (ISO). */
  date: string;
  body: string;
  status: 'understood' | 'unreadable';
  amount?: number; currency?: string; direction?: SmsDirection; merchant?: string; digits?: string;
}
/** A text the user dismissed or skipped as already added. Local only. */
export interface SmsSeen { fingerprint: string; outcome: 'dismissed' | 'duplicate'; at: string }
```

(Import `SmsDirection` from `@/features/sms/parser/types`.)

- Produces (ids): `sha256Hex(text: string): Promise<string>` and `idFromKey(key: string): Promise<string>`, in `id.ts`. `idFromKey` returns a UUID-shaped string from the first 16 bytes of SHA-256(key), with the version nibble set to 5 and the variant bits to `10`, so Postgres accepts it as `uuid`. Use `crypto.subtle`.
- Produces (db): `BudgyDB.smsLinks: EntityTable<SmsLink,'id'>`, `merchantRules: EntityTable<MerchantRule,'id'>`, `smsPending: Table<SmsPending,string>`, `smsSeen: Table<SmsSeen,string>`. `SYNCED_TABLES = ['accounts','categories','transactions','smsLinks','merchantRules']`. `BackupFile.version` adds `6`, plus optional `smsLinks?: SmsLink[]` and `merchantRules?: MerchantRule[]`. `clearSmsLocal(database: BudgyDB): Promise<void>` empties `smsPending` and `smsSeen`.

- [ ] **Step 1: Write the failing tests.**
  - `id.test.ts`: `idFromKey('a')` equals `idFromKey('a')`, differs from `idFromKey('b')`, and matches `/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`. `sha256Hex('abc')` equals `'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'`.
  - `db.test.ts` (backups): `'version 6 backs up links and rules, never pending or seen texts'`. Add one link, one rule, one pending item and one seen record. `exportBackup` has `version: 6`, one `smsLinks`, one `merchantRules`, and no key mentioning `pending`, `seen` or `body` (check `JSON.stringify`). After `importBackup` of that file, the link and rule are back with the same ids. A version 5 file restores with zero links and rules.
  - `db.test.ts`: `'eraseAll empties the SMS tables'`.
  - `sync.test.ts`: add `smsLinks` and `merchantRules` to `fakeServer`'s `tables`. New test `'learned links sync between phones under the same id'`: phone A puts a link, both phones sync, and phone B has it with the same `id`. Then both put the same link (same `idFromKey`) with different accounts; after syncing, both hold the later edit. Also `'clearLocal removes pending and seen texts'`.
  - `supabase-schema.test.ts`: `it.each(['sms_links', 'merchant_rules'])('%s keeps rows private and the newest edit', …)`. As user A, upsert a row; B sees 0 rows; an older `updated_at` doesn't overwrite.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - **Dexie `version(2)`:** keep version 1's three tables, add `smsFingerprint` to the `transactions` index list, and add `smsLinks: 'id, updatedAt, dirty'`, `merchantRules: 'id, updatedAt, dirty'`, `smsPending: 'fingerprint, date'`, `smsSeen: 'fingerprint'`. The `stampWrites` loop already covers the new synced tables.
  - **`writeFromCloud`:** pass `SYNCED_TABLES.map((t) => database.table(t))` instead of the three named tables.
  - **Backups:** `exportBackup` writes version 6 with `smsLinks` and `merchantRules` (alive, no `dirty`). `importBackup` clears and restores them in the same transaction (missing arrays → empty). It leaves `smsPending` and `smsSeen` alone: imported texts are known by their transaction fingerprints, per the spec.
  - **`eraseAll`:** also clears the two synced SMS tables and calls `clearSmsLocal`.
  - **`clearLocal`** (`sync.ts`): after its `writeFromCloud` block, `await clearSmsLocal(database)`.
  - **`client.ts`:** add `const CLOUD_TABLE: Record<SyncedTable, string> = { accounts: 'accounts', categories: 'categories', transactions: 'transactions', smsLinks: 'sms_links', merchantRules: 'merchant_rules' }` and use it in `push`, `pull` and `allStamps`.
  - **Migration:** create `public.sms_links` and `public.merchant_rules` the way `categories` is created (`like public.accounts including defaults including constraints`, primary key, foreign key with cascade). Then run the same per-table setup as the first migration's `do $$` loop over these two tables: trigger, `_user_changes_idx` index, RLS on with the three policies, revoke/grant. Header comment: these hold only learned links (sender, last digits, account id) and merchant rules, never message text.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** "Add tables for bank texts and sync learned links and merchant rules"

---

### Task 4: Learning: keys, suggestions, resolve

**Files:**
- Create: `src/features/sms/learning.ts`
- Test: `src/features/sms/learning.test.ts` (import `@/test/setup-db` first; use a `new BudgyDB('t-learning')`)

**Interfaces:**
- Consumes: Task 3 models, tables and `idFromKey`; `categoryFits` from `@/core/db/hooks`; `alive` and `softDelete` from `@/core/db/db`.
- Produces:

```ts
/** Case-folded sender address; links and lookups use it. */
export function addressKey(address: string): string;
/** Upper case, spaces collapsed, trailing branch/terminal numbers dropped: "Carrefour  Maadi 0231" → "CARREFOUR MAADI". */
export function merchantKey(merchant: string): string;
export function linkIdOf(address: string, digits?: string): Promise<string>;   // idFromKey(`sms-link|${addressKey}|${digits ?? ''}`)
export function ruleIdOf(merchant: string, flow: Flow): Promise<string>;       // idFromKey(`merchant-rule|${flow}|${merchantKey}`)

export interface Suggestion { accountId?: string; categoryId?: string; subcategoryId?: string }
/** What to pre-fill for a pending text, from links and rules whose account / category still exist, aren't archived and fit. */
export function suggestFor(item: SmsPending, links: SmsLink[], rules: MerchantRule[], accounts: Account[], categories: Category[]): Suggestion;

/** After a text's transaction is saved: learn its link (and rule, for expense/income with a category), then drop the pending item. */
export function resolveImported(item: SmsPending, tx: Transaction, database?: BudgyDB): Promise<void>;
/** Dismissed, or skipped as already added: remember it and drop the pending item (and its body). */
export function resolveSkipped(item: SmsPending, outcome: SmsSeen['outcome'], database?: BudgyDB): Promise<void>;
```

`suggestFor` rules: a text with `digits` looks up its sender + digits link only; a text without digits looks up the sender-only link only. The flow is `direction === 'in' ? 'income' : 'expense'`. Learned links and rules are written with `put()` and an explicit `updatedAt` (as in the editor), so re-learning a soft-deleted link brings it back.

- [ ] **Step 1: Write the failing tests.**
  - `merchantKey('Carrefour  Maadi 0231')` → `'CARREFOUR MAADI'`; `merchantKey('UBER #12-34')` → `'UBER'`; `addressKey(' CIB ')` → `'cib'`.
  - `linkIdOf('CIB', '4821')` equals `linkIdOf('cib', '4821')` and differs from `linkIdOf('CIB')`.
  - `'suggests the linked account and the learned category'`.
  - `'skips links and rules whose target is gone'`: link to a soft-deleted account, link to an archived account, rule to an archived category, and an expense rule whose category is income-only. Each gives `undefined` for that field.
  - `'uses the sender-only link only for texts without digits'`.
  - `'learns a link and a rule, then removes the pending item'`: after `resolveImported`, `smsPending.get(fp)` is undefined, the link has `accountId` of the tx, and the rule has its `categoryId` and `subcategoryId`.
  - `'learns no rule from a transfer'`: tx `type: 'transfer'` with no `categoryId`. The link is learned, there are 0 rules, and nothing throws.
  - `'re-learning a link points it at the new account'`: the same id, `accountId` updated, `deletedAt` cleared.
  - `'resolveSkipped remembers the text and deletes its body'`.
- [ ] **Step 2: Run** `npx vitest run src/features/sms/learning.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `learning.ts` per the Interfaces block.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** "Learn which account and category bank texts belong to"

---

### Task 5: Scan

**Files:**
- Create: `src/features/sms/scan.ts`
- Test: `src/features/sms/scan.test.ts`

**Interfaces:**
- Consumes: `SmsInbox.list` type from `src/features/sms/native.ts`, `matchesSender`, `parseSms`, `sha256Hex`, Task 3 tables.
- Produces:

```ts
/** SHA-256 hex of sender, received time and body. */
export function fingerprintOf(msg: SmsMessage): Promise<string>;  // sha256Hex(`${address}\n${date}\n${body}`)

export type ScanPeriod = 'sinceLast' | '3d' | '1w' | '2w' | '1m' | '3m' | '6m';
/** Start of the period in ms; 'sinceLast' uses lastScanAt (falls back to '1w' when there's none). */
export function sinceOf(period: ScanPeriod, now: Date, lastScanAt?: string): number;

export interface ScanDeps { list: (o: { since: number }) => Promise<{ messages: SmsMessage[] }>; database?: BudgyDB }
/** Reads matching texts since `since` into smsPending; returns how many are new. */
export function scanInbox(opts: { since: number; senders: string[] }, deps: ScanDeps): Promise<{ added: number }>;
```

Months in `sinceOf` are calendar months (`setMonth`). Skip by fingerprint only (spec): a text whose fingerprint is in `smsPending` or `smsSeen`, or on any transaction (`where('smsFingerprint').anyOf(...)`, deleted ones included), is skipped. Look these up in bulk, not one text at a time; a 6-month scan can return thousands of texts. `ignored` results are dropped without a record. Writes use `bulkPut` keyed by fingerprint.

- [ ] **Step 1: Write the failing tests** with a fake `list`:
  - `'keeps matching senders and drops ignored texts'`: three texts (a CIB debit, a CIB OTP, a Vodafone text) with senders `['cib']` give `added: 1`.
  - `'skips texts already pending, dismissed or imported, even when deleted'`: one in `smsSeen`, one on a soft-deleted transaction's `smsFingerprint`, one already pending, and one new give `added: 1`.
  - `'skips by fingerprint, not by SMS id'`: a new text that reuses an old `id` with a different body is added.
  - `'adds each text once even when two scans overlap'`: `await Promise.all([scanInbox(a), scanInbox(a)])` leaves `smsPending.count()` at 1.
  - `'stores unreadable texts with what was found'`.
  - `const now = new Date(2026, 4, 15, 10, 0)`: `sinceOf('1m', now)` equals `new Date(2026, 3, 15, 10, 0).getTime()`; `sinceOf('3d', now)` equals `new Date(2026, 4, 12, 10, 0).getTime()`; `sinceOf('sinceLast', now, '2026-05-14T08:00:00.000Z')` equals `Date.parse('2026-05-14T08:00:00.000Z')`; `sinceOf('sinceLast', now, undefined)` equals `sinceOf('1w', now)`.
- [ ] **Step 2: Run** `npx vitest run src/features/sms/scan.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `scan.ts`. The caller sets `lastScanAt`, not `scanInbox`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** "Scan the inbox for new bank texts"

---

### Task 6: Shared transaction record, duplicate check, editor pre-fill

**Files:**
- Create: `src/features/transactions/txRecord.ts`, `src/features/sms/duplicate.ts`, `src/features/sms/useDuplicatePrompt.ts`
- Modify: `src/core/contexts/TxEditorContext.tsx`, `src/features/transactions/TransactionEditor.tsx`, `src/index.css` (header and hint styles)
- Modify: locales (`editor.currencyNotHeld`, `sms.duplicateTitle`, `sms.duplicateBody`, `sms.keepBoth`, `sms.skip`)
- Test: `src/features/transactions/txRecord.test.ts`, `src/features/sms/duplicate.test.ts` (both import `@/test/setup-db` first and use their own `new BudgyDB('t-…')`)

**Interfaces:**
- Produces:

```ts
// txRecord.ts
export interface TxDraft {
  type: TxType; amount: number; currency: string; accountId: string;
  toAccountId?: string; toAmount?: number; toCurrency?: string;
  categoryId?: string; subcategoryId?: string;
  date: string; note?: string; smsFingerprint?: string;
  rate?: Pick<Transaction, 'rate' | 'rateCurrency'>;
  /** Kept from the transaction being edited. */
  createdAt?: string;
}
/** The record to store: transfer-only fields only on transfers, category and rate only on expense/income, note trimmed to 120 chars (undefined when empty), createdAt kept or now, updatedAt now. */
export function buildTxRecord(d: TxDraft): Omit<Transaction, 'id'>;
/** add() or, with an id, put(); returns the stored transaction with its id. */
export function saveTx(record: Omit<Transaction, 'id'>, id?: string, database?: BudgyDB): Promise<Transaction>;

// duplicate.ts
/** A live hand-entered transaction (no smsFingerprint) with the same type, amount, currency and account on the same local day. */
export function findManualDuplicate(d: Pick<TxDraft, 'type' | 'amount' | 'currency' | 'accountId' | 'date'>, database?: BudgyDB): Promise<Transaction | undefined>;

// useDuplicatePrompt.ts
/** Resolves 'keep' when there's no duplicate or the user keeps both, 'skip' when they skip. */
export function useDuplicatePrompt(): (d: Parameters<typeof findManualDuplicate>[0]) => Promise<'keep' | 'skip'>;

// EditorInit gains:
amount?: number; currency?: string;
/** Full ISO time; kept when the user doesn't change the day. */
date?: string;
note?: string;
/** Shown above the sheet, e.g. the bank text. */
header?: ReactNode;
/** Set when the editor opens from a bank text: saved on the transaction, offers all three types, runs the duplicate check. */
smsFingerprint?: string;
onSaved?: (tx: Transaction) => void;
/** The duplicate check's "Skip". */
onSkipped?: () => void;
```

- [ ] **Step 1: Write the failing tests.**
  - `txRecord.test.ts`:
    - `'drops transfer fields from an expense and category/rate from a transfer'`.
    - `'trims the note to 120 characters and drops an empty one'`.
    - `'keeps smsFingerprint and createdAt when editing'`: a draft with both passes them through, and `saveTx(record, id)` stores them.
    - `'keeps a currency the account does not hold'`: a USD draft on an EGP account is stored as `currency: 'USD'`, amount unchanged.
  - `duplicate.test.ts`:
    - `'finds a hand-entered match'`.
    - `'ignores imported, deleted and different-account transactions'`.
    - `'matches on the local day only'`: a manual entry at local 23:50 doesn't match a text at 00:10 the next day; one at 00:05 the same day does. Build dates with `new Date(y, m, d, h, min)`.
- [ ] **Step 2: Run** `npx vitest run src/features/transactions/txRecord.test.ts src/features/sms/duplicate.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `txRecord.ts` and `duplicate.ts`. Use `dayKey` from `@/core/utils/period` for the local day, and query `where('date').between(start, end)` for that day.
- [ ] **Step 4: Editor uses the shared record.** In `TransactionEditor.save`, build the record with `buildTxRecord` and store it with `saveTx`. Pass `smsFingerprint: tx?.smsFingerprint ?? init.smsFingerprint` and `createdAt: tx?.createdAt`. Behaviour for ordinary adds and edits must not change.
- [ ] **Step 5: Editor pre-fill.**
  - Initial state: `expr` from `init.amount`, `curPick` from `init.currency`, `note` from `init.note`, `date` from `init.date`.
  - On save, keep `tx?.date ?? init.date` when its day is unchanged.
  - `accountChosen` is true when `init.accountId` is set.
  - When `init.smsFingerprint` is set (and no `tx`), `types` is all three.
  - `keep(...)` also keeps `init.currency` on whichever account is picked, so the currency key offers it alongside the account's own.
  - Render `init.header` above `.b-editor__sheet`.
  - When `type !== 'transfer'` and the account doesn't hold `currency`, show one hint line: `editor.currencyNotHeld` = "{{account}} holds {{held}}. To match your statement, switch to {{held}} and enter the amount charged."
  - With `init.smsFingerprint`, run `useDuplicatePrompt` before saving. On `'skip'`, call `init.onSkipped?.()` and close. After a successful save, call `init.onSaved?.(saved)`.
- [ ] **Step 6: Run** `npm test && npm run typecheck`. Expected: PASS. Then `npm run dev`: add, edit and delete an ordinary expense, a transfer and a cross-currency transfer. All three save as before.
- [ ] **Step 7: Commit:** "Share how transactions are saved and let the editor open pre-filled from a bank text"

---

### Task 7: "Bank texts" review screen, scan sheet and menu item

**Files:**
- Create: `src/features/sms/SmsReviewPage.tsx`, `src/features/sms/SmsItemCard.tsx`, `src/features/sms/ScanSheet.tsx`, `src/features/sms/PickerSheet.tsx`, `src/features/sms/hooks.ts`
- Modify: `src/App.tsx` (route `/sms`), `src/features/menu/AppMenu.tsx`, `src/index.css`, locales

**Interfaces:**
- Consumes: Tasks 4–6 (`suggestFor`, `resolveImported`, `resolveSkipped`, `scanInbox`, `sinceOf`, `buildTxRecord`, `saveTx`, `useDuplicatePrompt`, `useTxEditor`), `rateToSave`, `useConverter`, `Bubble`.
- Produces: `usePendingSms(): SmsPending[] | undefined` (newest first), `usePendingCount(): number`, `useLearned(): { links: SmsLink[]; rules: MerchantRule[] } | undefined` in `hooks.ts`. `PickerSheet` props: `{ isOpen; items: { id: string; name: string; icon: string; color: string }[]; selectedId?: string; onPick(id: string): void; onClose(): void }`.

- [ ] **Step 1: Route and menu.**
  - Add `<Route exact path="/sms" component={SmsReviewPage} />`.
  - In `AppMenu`, between Data and Rate, show a "Bank texts" item (`menu.bankTexts`) with an `IonBadge` holding `usePendingCount()` when it's above 0. Show it only when `useSmsAvailable() && smsImport.enabled`.
  - `SmsReviewPage` redirects to `/categories` when that isn't true.
- [ ] **Step 2: Scan sheet.**
  - The "Scan inbox" button opens `ScanSheet`, following `.superpowers/brainstorm/1874-1793678344/content/settings-and-scan.html`.
  - It offers the seven `ScanPeriod`s (`sinceLast` only once `lastScanAt` exists, and then it's the default; otherwise `1w`), with the hint that texts already imported or dismissed are skipped.
  - On Scan:
    1. Check the permission. If it isn't granted, show `sms.scanNoPermission` pointing to Settings.
    2. Show a spinner and run `scanInbox`.
    3. Set `smsImport.lastScanAt` to the scan's start time.
    4. Toast `sms.scanFound` (count) or `sms.scanNothing`.
- [ ] **Step 3: Cards.** Follow `.superpowers/brainstorm/1874-1793678344/content/review-screen.html` ("A+B").
  - **Understood:** sender, `••digits`, date and time, the amount in red or green, the merchant, and account and category chips from `suggestFor`. A chip with no suggestion reads `sms.pickAccount` / `sms.pickCategory`, and tapping a chip opens `PickerSheet`. Chip choices are per card and kept in page state.
    - **Confirm** is enabled once both are chosen. It builds a `TxDraft`: type from the direction, the text's `date` and currency, `note: merchant`, `smsFingerprint`, and `rate` from `rateToSave({ saved: conv.rate(currency), currency, base })`. Then it runs `useDuplicatePrompt`. On `'skip'` → `resolveSkipped(item, 'duplicate')`; otherwise `saveTx(buildTxRecord(d))` → `resolveImported(item, tx)`.
    - When the account doesn't hold the currency, a line shows `sms.savedInCurrency` ("Saved in {{currency}}. {{account}} holds {{held}}; you can change it later.").
  - **Unreadable:** `sms.couldntRead`, the message text (`dir="auto"`), **Dismiss** and **Fill in…**.
  - **Dismiss** → `resolveSkipped(item, 'dismissed')`.
  - **Tap a card** (outside the buttons) or **Fill in…** → `useTxEditor()` with:
    - `type` (`in` → income, else expense), `amount`, `currency`, `date`, `note: merchant`
    - the chosen or suggested `accountId` / `categoryId` / `subcategoryId`
    - `smsFingerprint`
    - `header`: the sender, the date and the message text
    - `onSaved: (tx) => resolveImported(item, tx)`
    - `onSkipped: () => resolveSkipped(item, 'duplicate')`
  - An empty list shows `sms.emptyTitle` / `sms.emptyBody` with the Scan button.
- [ ] **Step 4: i18n.** Add, in both languages:
  - `menu.bankTexts`
  - `sms.bankTexts`, `sms.scan`, `sms.scanFrom`, `sms.period.{sinceLast,3d,1w,2w,1m,3m,6m}`, `sms.scanHint`, `sms.scanFound`, `sms.scanNothing`, `sms.scanNoPermission`
  - `sms.pickAccount`, `sms.pickCategory`, `sms.confirm`, `sms.dismiss`, `sms.fillIn`, `sms.couldntRead`, `sms.savedInCurrency`
  - `sms.emptyTitle`, `sms.emptyBody`, `sms.lastScan`
- [ ] **Step 5: Verify** on a debug build with a few test texts on the emulator (`adb emu sms send CIB "…"`):
  - A CIB debit shows as understood. The first Confirm asks for the account and category; a second text from the same card and merchant shows both chips filled, and one tap confirms.
  - A USD text on an EGP account confirms in USD, shows the note, and the account then shows a USD line.
  - A hand-entered expense with the same amount, account and day triggers the prompt. Skip creates nothing, and that text doesn't come back on rescan.
  - Dismiss, then rescan: the text doesn't come back.
  - Fill in… on an unreadable text opens the editor with the message above it. Saving resolves it; closing leaves it pending.
  - The menu count matches the list.
  - On `npm run dev` (web), neither the menu item nor `/sms` shows.
  - Then run `npm test && npm run typecheck`.
- [ ] **Step 6: Commit:** "Add the Bank texts screen to scan, review and confirm bank texts"

---

### Task 8: Linked numbers in Settings

**Files:**
- Create: `src/features/sms/LinkedNumbersPage.tsx`
- Modify: `src/features/sms/SmsSettingsSection.tsx`, `src/App.tsx` (route `/sms/links`), locales

**Interfaces:**
- Consumes: `useLearned`, `PickerSheet` (Task 7), `softDelete`, `useAccounts`, `useNames`.

- [ ] **Step 1: Settings row.** In `SmsSettingsSection`, after Bank senders, add a "Linked numbers" item (`sms.linkedNumbers`), with the count of live links in an end-slot note, that routes to `/sms/links`.
- [ ] **Step 2: The page.**
  - Each row reads `CIB ••4821 → CIB Card`, or `CIB · no number` (`sms.noNumber`) for a sender-only link. A link whose account is deleted or archived reads `sms.accountRemoved`.
  - Tapping a row opens `PickerSheet` over the live, unarchived accounts. Picking one `put`s the link with the new `accountId` and an explicit `updatedAt`.
  - A delete button (or swipe) calls `softDelete(db.smsLinks, [id])`.
  - An empty state shows `sms.noLinks` ("Budgy learns these when you confirm bank texts.").
  - The page redirects away when `useSmsAvailable()` is false.
- [ ] **Step 3: Verify** on a debug build:
  - Changing a link's account changes the suggestion on the next pending card from that card number.
  - After deleting a link, the next card from that number shows "Pick account" again.
  - While signed in, a change made on one emulator appears on a second one after sync.
  - Then run `npm test && npm run typecheck`.
- [ ] **Step 4: Commit:** "Let people fix or remove the card numbers Budgy learned"

---

### Task 9: TODO and handover

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Update `TODO.md`.**
  - Tick off the stage 1 fixes and the stage 2 items that are done.
  - Under stage 3, add: "Privacy policy: the last card digits and merchant names Budgy learns are saved to the signed-in account (not the messages)".
  - Under "Your work", add: "Deploy `supabase/migrations/20261107120000_sms_learning_tables.sql` to the Supabase project **before** any build with stage 2 reaches users. Release builds sync the new tables too, and sync fails without them."
- [ ] **Step 2: Run** `npm test && npm run typecheck && npm run build`. Expected: all pass.
- [ ] **Step 3: Commit:** "Update the TODO for SMS import stage 2"
