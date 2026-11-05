# Budgy

Budget & spending tracker for Android, iOS and the web. Tap a category, type the amount, done.

**Stack:** React 19 · TypeScript · Ionic React 8 · Vite · Capacitor 8 · Dexie (IndexedDB) · Supabase (optional sync)
**Languages:** English and Arabic (RTL)

Budgy is **local-first**. All data lives on the device in IndexedDB and the app works fully offline.
Signing in (Google or Apple) is optional. It syncs the data to the user's Supabase account, so they get
an automatic backup and the same data on several devices. A build without Supabase settings is
offline-only and shows no sign-in at all.

## Features

| Where | What it does |
|---|---|
| **Accounts** | Three tabs:<br>• **Accounts:** everyday and Savings groups, live balances, transfers, and a Sum / Split view for multi-currency accounts.<br>• **Debts:** who owes you and whom you owe.<br>• **My finances:** assets and debts per currency, plus net worth.<br>Accounts can hold a second currency, exchange between the two at the rate you actually got, and be archived. Each has its own *Include in total balance* and *Display in expenses* switches. New installs start with *Cash In* and *Cash Out*: income goes to the first and spending comes out of the second by default, and any account can take over either role. |
| **Categories** (home) | Category bubbles around a donut of the period's spending. Tap one to add a transaction. Debts and savings with *Display in expenses* on follow as square tiles: tap one to send it money. Money sent to a tile, minus what comes back, counts as spending in Categories, Transactions and Overview. In *Edit* mode you can add, rename, recolour or change the icon, choose expense / income / both, set a monthly budget, add subcategories, and archive. |
| **Transactions** | History grouped by day, with each day's net and search. Long-press to select several, then change their date, account or category, delete them, or filter by them. |
| **Overview** | Income, expenses, net, average spend per day, trend bars, budget progress, and a breakdown by category and subcategory. |
| **Header** | Total balance of the accounts in the accounts filter (tap it to change the filter). A warning appears when some currency has no exchange rate. |
| **Side menu** | Profile (name, colour, account & sync), Settings, Data, Rate us, Support, About. |
| **Settings** | Main currency (rates and budgets are converted when it changes), exchange rates, language, theme, first day of the week. |
| **Data** | CSV export, backup / restore (a JSON file, version 5), erase all. |

The add-transaction sheet has a calculator keypad (`250+120` → 370), From → To pickers, cross-currency
transfers, a note and a date. The period bar (Day / Week / Month / Year / All / a custom range) is shared by
Categories, Transactions and Overview: tap it to choose a period, or swipe the page to move to the
previous or next one. Swiping on Accounts changes its tabs. A fresh install asks for the user's currency.

## Setup

```bash
npm install
npm run dev          # http://localhost:5175
npm test             # unit tests: database, sync, Supabase schema (on PGlite), SMS parser
npm run typecheck
```

To turn on sign-in and sync, copy `.env.example` to `.env` and fill it in. See the Supabase
section below.

## Build for Android

Needs Node 22+, Android Studio Otter (2025.2.1) or newer, and JDK 21.

```bash
npm run build
npx cap add android        # first time only (android/ is committed to git)
npx cap sync android
npx cap open android       # Android Studio → Run / build
# or, after the first `cap add`:
npm run android:apk:debug
npm run android:aab:release
```

## Build for iOS (macOS + Xcode 26+)

```bash
npm run build
npx cap add ios            # first time only; uses Swift Package Manager by default
npx cap sync ios
npx cap open ios           # Xcode → Run / Archive
```

## Icons

The `public/` icons are generated from an SVG in `scripts/generate-icons.mjs`
(`node scripts/generate-icons.mjs`). For native launcher icons and splash screens, run
`npx @capacitor/assets generate` after `cap add`. It reads from an `assets/` folder, so copy
`public/icon.png` to `assets/icon.png` first.

## Cloud sync (Supabase)

- **Schema:** `supabase/migrations/`.
  - Tables: `accounts`, `categories`, `transactions` and `settings`.
  - Each record's fields are stored in a JSON `data` column.
  - Row-level security: each user can only read and write their own rows.
  - "Last edit wins" is enforced on the server.
  - `server_updated_at` tracks what changed, for pulls.
- **Account deletion:** the `delete-account` Edge Function in `supabase/functions/delete-account`.
- **Sync engine:** `src/core/cloud/sync.ts`.
  - It pushes records marked `dirty` and pulls rows changed since this device's cursor.
  - Records carry UUID ids, `updatedAt` and soft deletes (`deletedAt`), all set by Dexie hooks in
    `src/core/db/db.ts`.
  - The starting accounts and categories use fixed ids and a 1970 stamp, so two devices' defaults
    merge into one.
- **Sign-in:** `src/core/cloud/auth.ts`.
  - Native Google and Apple sign-in through `@capgo/capacitor-social-login`, then
    `signInWithIdToken` with a nonce.
  - On the web it uses the redirect flow.
- **State:** `src/core/cloud/CloudContext.tsx` holds the session and status, and decides when sync
  runs.

Supabase CLI (as a pinned dev tool):

```bash
npx supabase@2.121.0 link --project-ref <ref>
npx supabase@2.121.0 db push                      # apply migrations
npx supabase@2.121.0 functions deploy delete-account
```

## Project structure

```
src/
  core/
    cloud/      client.ts (Supabase client + remote), auth.ts (sign-in), sync.ts (sync engine), CloudContext
    config/     links.ts (store / support links)
    contexts/   SettingsContext, PeriodContext, AccountFilterContext, TxEditorContext
    db/         db.ts (Dexie schema, write hooks, migration from the old database, seed, backup/restore),
                hooks.ts (live queries, balances, totals)
    i18n/       en.json, ar.json
    utils/      period, calc (keypad), currency (decimals, rounding), number (typed numbers), files, id
  features/
    accounts/      AccountsPage, AccountEditModal, AccountsFilterSheet
    categories/    CategoriesPage, CategoryEditModal, SubcategoriesField
    transactions/  TransactionsPage, TransactionEditor (keypad sheet), bulk.ts
    overview/      OverviewPage
    settings/      SettingsPage
    profile/       ProfilePage, AccountSyncSection
    data/          DataPage, useDataActions, BackupReminder
    menu/          AppMenu
    onboarding/    FirstRunCurrency
    sms/           SMS import (in progress; see docs/superpowers)
  shared/
    components/ AppHeader, PeriodBar, Donut, Bubble, Avatar, MoneyText, RateInput, IconColorPicker, …
    hooks/      useLongPress
    models/     Account, Category, Transaction types
  test/         test setup and the Supabase schema test
supabase/       config.toml, migrations/, functions/
docs/           privacy policy draft, design specs and plans
```

## Ideas

- Passcode / biometric lock
- Recurring transactions and reminders (`@capacitor/local-notifications`)
