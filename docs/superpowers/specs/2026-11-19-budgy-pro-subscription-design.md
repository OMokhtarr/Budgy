# Budgy Pro Subscription — Design

Date: 2026-11-19
Branch: `feature/budgy-pro` (from `master`)
Status: design — awaiting approval
Prior art: Rafeeq's Pro subscription (`Rafeeq Cross Platform/docs/superpowers/specs/2026-10-20-subscription-pro-design.md`,
`src/app/core/services/subscription/revenuecat.service.ts`, `src/app/core/context/SubscriptionContext.tsx`). This
design reuses Rafeeq's app side and leaves out its server side.

## Why

The owner wants Budgy to earn money. Budgy already offers a complete free budget app (quick add, accounts,
currencies, debts, credit cards, budgets, Overview, CSV and file backup). Two features cost the owner money or set
the app apart, and those become **Budgy Pro**:

- **Bank texts** (SMS import, Android only): saves typing every day, and few budget apps have it.
- **Sign-in and sync** (Google and Apple): backup to the account and the same data on several phones, on the owner's
  Supabase project.

## Goals

1. **Pro covers exactly two things:** bank texts, and sign-in with sync (both Google and Apple). Everything else stays
   free, **credit cards included**.
2. **Plans:** monthly **$1**, yearly **$5**, lifetime **$15** (a one-time purchase). No weekly plan. Monthly and
   yearly get a **free trial**, set up in the stores. Lifetime can't have one, because stores only allow trials on
   subscriptions.
3. **Free users know before they tap.** The sign-in buttons and the bank texts switch show a small **PRO** badge.
   Tapping one opens RevenueCat's paywall. After a purchase, the action they tapped carries on.
4. **When Pro ends, nothing is lost.** All data stays on the phone. Sync pauses and bank texts stop scanning (§5, §6).
5. **Pro follows the account.** A purchase made before sign-in belongs to the phone's store account. Once they sign
   in, it moves onto their Budgy account and follows them to other phones, including from Android to iPhone.
6. **Both platforms in code.** Android is built and tested first. iPhone works once an `ios/` project exists
   (owner steps, §11).

## Non-goals

- **Checking Pro on the server** (the owner picked approach A, below). The Supabase tables and RLS don't change.
- Paying on the web. The web build can't sell Pro (§8).
- Gating anything other than the two features. The gate helper can be reused later (card due notifications, passcode
  lock and recurring transactions are candidates), but nothing else uses it now.
- Trial lengths and intro prices in code. Those are set in Play Console and App Store Connect.
- Usage limits or counting.

## Anti-goals

- **A subscriber seeing a PRO badge or the paywall,** including a flash on startup while RevenueCat answers.
- **Losing or hiding data when Pro ends.** Records, balances, credit cards, transactions added from texts and texts
  still waiting all stay.
- **Locking someone out of Pro they paid for.** If sign-in were fully locked, someone with Pro on their account
  couldn't sign in on a new phone to get it back.
- **Blocking development.** On the Vite dev server everything stays unlocked.
- **Shipping the gate before the products are live.** It stays behind a build switch (§3).

## Approaches considered

- **A. Gate in the app only (chosen by the owner).** RevenueCat SDK, its paywall and Customer Center, a
  `useSubscription` hook, and checks where sync starts and where bank texts scan or confirm. *Trade-off:* the
  Supabase server doesn't check Pro, so a modified app could sync for free. At $1 a month, with little server cost
  per user, that isn't worth guarding yet.
- **B. A plus a server check.** A RevenueCat webhook goes to a Supabase Edge Function, which keeps a `pro_until`
  date per user, and RLS refuses sync writes without Pro. It's bypass-proof and lets the web build sync for Pro
  users, but it adds a function, a migration, RLS changes and edge cases around purchases made before sign-in. Not
  chosen. It can be added on top of A later without undoing anything.

## The design

### 1. Billing: RevenueCat

- **Packages:** `@revenuecat/purchases-capacitor` and `@revenuecat/purchases-capacitor-ui`, at the same major version
  Rafeeq runs on Capacitor 8 (13.x). Pin exact versions, as Budgy does for its newer dependencies.
- **Entitlement:** `budgy_pro`. It's one constant in one place, and it must match the dashboard.
- **Store products** (owner creates them, §11):
  - a Play subscription with two base plans, monthly and yearly, each with a free-trial offer;
  - a one-time product, lifetime.
  - All three are attached to `budgy_pro`.
- **Offering** `default` has three packages (monthly, annual, lifetime). The paywall shows whatever the offering
  holds, so plans and prices change without an app release.
- **Prices** always come from the store, already in the user's currency. Nothing in the app hard-codes `$1`, `$5` or
  `$15`.
- **Keys:** `VITE_REVENUECAT_ANDROID_KEY` and `VITE_REVENUECAT_IOS_KEY`, added to `.env.example` with a comment. These
  public SDK keys are meant to ship inside apps.
  - A build without a key never starts RevenueCat.
  - A RevenueCat Test Store key (`test_…`) is refused outside debug builds, as Rafeeq does. The SDK would otherwise
    crash a release build at launch.

### 2. The service and the hook

- **`src/core/pro/revenuecat.ts`** is a thin wrapper over the SDK, ported from Rafeeq's `revenuecat.service.ts`:
  configure once, customer info, the update listener, logIn/logOut, restore, app-user id, `isPro`, plan details, the
  paywall, the Customer Center, and the paywall language.
- **`src/core/pro/ProContext.tsx`** holds the `ProProvider` and the `usePro()` hook. It's ported from Rafeeq's
  `SubscriptionContext`, keeping its identity queue and its rule against flashing Pro from one account to another.
  The hook returns:
  ```ts
  usePro(): {
    gateOn: boolean;        // §3; false → every Pro check passes
    isPro: boolean;         // what the UI gates on (true whenever gateOn is false)
    ready: boolean;         // RevenueCat has answered for the current identity
    plan: ProPlan | null;   // monthly | yearly | lifetime | other, trial, renews/ends, billing issue
    appUserId: string | null;
    showPaywall(): Promise<'subscribed' | 'dismissed' | 'failed' | 'unavailable'>;
    showCustomerCenter(): Promise<void>;
    restore(): Promise<boolean>;
  }
  ```
- **The provider's place:** inside `CloudProvider`, which gives it the signed-in user, and wrapping the router. The
  builder may also restructure so `CloudProvider` can read `usePro()` (§5). For example, `ProProvider` can take the
  user id as a prop and sit above `CloudProvider`, or the cloud session can move into a small provider of its own.
  That shape is the builder's call.
- **No flash:** the last answer is cached in localStorage (`budgy-pro`) and used as the starting value. As in Rafeeq,
  the cache only counts for the account it was written under, and a signed-out start counts only a signed-out cache.
- **Language:** the paywall and Customer Center follow the app's language setting (Arabic or English), not the
  phone's, and update when it changes in Settings.

### 3. The build switch

`src/core/pro/gate.ts` is the one place that reads `VITE_PRO_GATE`. It has three values (my call):

- **`off`, or unset** (the default). This is how Budgy behaves today:
  - RevenueCat never starts, even when a key is set, so nothing goes to RevenueCat before the privacy updates;
  - no Budgy Pro section and no PRO badges;
  - sign-in and bank texts work for everyone.

  This keeps a public release made before launch from selling Pro that unlocks nothing.
- **`test`:** RevenueCat starts and the Profile → Budgy Pro section (§7) shows, but nothing is gated. The owner uses
  it on debug builds and on Play testing-track builds to make test purchases and try Restore and Manage. Licensed
  test purchases need a testing-track upload, so this can't be limited to debug builds.
- **`on`:** the full gate.

Both `test` and `on` also need a native platform and that platform's RevenueCat key; without them, the build behaves
as `off`. `isProGateOn()` is true only for `on` under those conditions, and `proAvailable()` for `test` or `on`.

**Release order:**
1. Create the products and offering.
2. Test with `test`.
3. Update the privacy policy and Data safety form.
4. Set `VITE_PRO_GATE=on` in the production env, then build.

Unit tests cover each value and condition.

### 4. Who owns Pro (identity)

- **Signed out:** RevenueCat's anonymous id. "Restore purchases" re-attaches a store purchase to it after a reinstall.
- **Signed in:** `Purchases.logIn(user.id)`, using the Supabase user id. A purchase made anonymously just before
  sign-in moves onto the account (RevenueCat's default behaviour), so the account owns Pro from then on.
- **Restore behaviour** (my call): RevenueCat's default, **"Transfer to new App User ID"**, as Rafeeq uses it. A store
  purchase moves to whichever id last restored or synced it. So:
  - **After sign-in,** if RevenueCat reports no Pro for the account, the app calls `Purchases.syncPurchases()` once
    (silent, no UI) and checks again before deciding sync is paused. That covers buying while anonymous and then
    signing into an account RevenueCat already knows, where `logIn` doesn't carry the purchase across.
  - **"Restore purchases" while signed out** moves Pro from the account to this phone. That's acceptable: the person
    owns the store purchase, and signing in moves it back.
- **Signing out** goes back to an anonymous id. Pro bought on the account stays with the account, so the phone is
  free until they sign in again. That matches Rafeeq. A signed-out phone can't see an account's Pro, so the Budgy Pro
  section doesn't guess. For free users it shows Get Pro, Restore purchases, and "Already have Pro? Sign in" (in
  builds with sign-in).
- **Signing in or out** follows the account the same way (logIn/logOut), queued so two switches never overlap. This
  is Rafeeq's `syncIdentity` queue.
- **Deleting the account** goes back to anonymous too. The RevenueCat customer stays, and the store subscription keeps
  running until the user cancels it in the store. The delete-account confirmation gets one line telling subscribers to
  cancel in the store first. That's my call.

### 5. Sign-in and sync

**Signed out, free user (gate on, not Pro).** In Profile → Account & sync (`AccountSyncSection.tsx`):
- The Google and Apple buttons show a **PRO** badge.
- Tapping one opens the paywall. If they end up subscribed, sign-in with that provider starts straight away. If they
  dismiss it, nothing happens.
- Below the buttons, a small link **"Already have Pro? Sign in"** runs the plain sign-in. Once signed in, RevenueCat
  moves to the account:
  - **The account has Pro:** sync starts as usual.
  - **It doesn't:** they stay signed in with sync paused (below), and the paywall opens once.
- The section's hint text says that sign-in and sync are part of Pro.

**Signed in, not Pro** (Pro ended, or the account never had it):
- **Sync pauses.** `CloudProvider`'s `sync()` returns early without Pro, and there is a new status, `'paused'`. Every
  trigger goes through `sync()`: after sign-in, after local changes, and on resume, online and the timer.
- **Waiting for the answer.** Sync doesn't start until `ready` is true for this account. Otherwise a fresh sign-in
  would pause for a moment before RevenueCat answers.
- **The account card** shows:
  - "Sync is paused: Budgy Pro has ended" (or "is part of Budgy Pro" if the account never had it), with a **Renew**
    button that opens the paywall;
  - sign out and delete account, which still work;
  - no **Sync now** button.
- **The side menu's backup line** reads "Sync paused", not "Synced …".
- **`BackupReminder`** counts a paused account as not backed up, so the reminder to save a backup file comes back.
  Data → About uses the not-synced wording.
- **Local edits** still mark records dirty. When Pro returns, the next sync uploads them. That follows from the
  existing dirty-record design, with no new code.
- **Signing out while paused:** "Keep on this device" works. "Remove from this device" normally uploads first, which
  can't happen while paused. It warns that changes made since sync paused aren't in the account, and lets them
  cancel. That's my call.

**Gate off, or Pro active:** behaves exactly as today.

### 6. Bank texts

Bank texts only exist on Android builds that have `READ_SMS`. Release builds don't have it yet (Play approval is
pending), so this gate only matters once SMS import ships. The code still goes in now.

- **Turning it on.** In Settings → Bank texts (`SmsSettingsSection.tsx`), the switch shows a **PRO** badge for free
  users. Turning it on opens the paywall first. If they end up subscribed, the switch turns on and goes through the
  usual permission steps. If not, it stays off. Turning it off is never gated.
- **Scanning needs Pro.** That covers `AutoScan` on launch and resume, and the scan buttons on the Bank texts page.
  A tap from a free user opens the paywall. When Pro has ended, `AutoScan` simply doesn't run.
- **Confirming needs Pro.** That covers Confirm, Same category, Combine and Fill in…: each opens the paywall
  instead. Dismiss and Skip stay free, because removing a text costs nothing.
- **When Pro has ended:**
  - the page stays reachable from the menu and still shows the texts waiting;
  - a one-line banner at the top says bank texts are part of Budgy Pro, with **Renew**;
  - the header's "texts waiting" indicator still shows;
  - Linked numbers and ignore words stay editable.
- **Already-added transactions** are ordinary transactions and are never touched.
- The checks go where actions start (UI handlers, `AutoScan`). The SMS parser, scan and review modules don't change.

### 7. Profile → Budgy Pro section

A new section on the Profile page, shown when `proAvailable()` is true (§3), above Account & sync:

- **Free:** "Budgy Pro: bank texts and sync across your phones", a **Get Pro** button (opens the paywall) and
  **Restore purchases**. A restore that finds nothing says so.
- **Pro:**
  - the plan: Monthly, Yearly or Lifetime, with "free trial" while it's in a trial;
  - "Renews on …" or "Ends on …" (no date for lifetime);
  - a billing-issue line when the store reports one;
  - **Manage**, which opens RevenueCat's Customer Center (cancel, change plan, restore).
- **Support ID:** the RevenueCat app-user id, shortened, with a copy button. The owner needs it to grant free Pro
  through RevenueCat (to testers, family or a store reviewer) and to answer "I paid but it's still locked". This is
  Rafeeq's idea, reused.

### 8. Web

- **Vite dev server** (`import.meta.env.DEV`): the gate is off, so development isn't blocked.
- **Production web build:** there's no store billing on the web, and RevenueCat isn't started there. `isProGateOn()`
  is false on web (§3), so the web build behaves as today, with free sign-in and sync. This is the only way a web
  user could ever use sync, and gating it would also lock out a Pro user who signs in on the web. The owner confirmed
  (2026-11-19) that the web build is only for their own development, so free sync there is acceptable.

### 9. Results and errors

- **Paywall cancelled:** nothing happens and no message shows.
- **A purchase or restore that errors:** a toast.
- **The paywall can't be shown** (offline, no offering, no key): a toast saying Pro isn't available right now.
- **A purchase that succeeds but whose customer info is late:** treated as subscribed. The listener confirms it when
  RevenueCat answers.
- **Renewals, expiries and refunds** arrive through RevenueCat's update listener while the app is open, and from the
  next customer-info read on launch or resume.

### 10. Words, tours and store text

- All new strings go in `en.json` and `ar.json`.
- **Welcome slide "private"** (`onboarding.slides.private.body`): "No ads, and it works offline. Sign in to sync and
  back up." changes to say sync is part of Budgy Pro. The builder writes the exact wording in both languages.
- **Tours:** if a tour step on Profile or Settings describes sign-in or bank texts as free, update its copy. The tour
  target check (`tourAttr` test) must still pass.
- **Store and privacy text** are owner steps (§11). The `RELEASE-NOTES.md` section for the release that turns the gate
  on is part of this build, as notes only. That build also raises `versionCode`.

### 11. Owner setup steps (not part of the build)

1. **RevenueCat:** project, Android app (and iOS later), entitlement `budgy_pro`, offering `default` with monthly,
   annual and lifetime packages, paywall designed in the dashboard (Arabic and English), Customer Center turned on.
   Public keys go in `.env.local`.
2. **Play Console:**
   - a subscription with monthly ($1) and yearly ($5) base plans, each with a free-trial offer (length is the owner's
     choice; 7 days is common);
   - a one-time product, lifetime ($15);
   - link the Play service account in RevenueCat;
   - add a license tester.
3. **Test** with `VITE_PRO_GATE=test` on a testing-track build:
   - buy, then reinstall and restore;
   - sign in and check that Pro follows to a second phone;
   - cancel, and check that sync pauses after expiry.

   Then set `VITE_PRO_GATE=on` for the release.
4. **Testers:** grant the closed testers promotional Pro in RevenueCat before the gated release reaches them. Their
   Support IDs are on their Profile pages.
5. **Privacy policy and Data safety:** purchase history goes to RevenueCat and Google. Update `docs/privacy-policy.md`,
   the `gh-pages` pages and `docs/play-store.md`. The store listing line "Optional Google or Apple sign-in backs up and
   syncs your data" changes to mention Pro, and the listing names the Pro features.
6. **iPhone (later, `TODO-apple.md`):** `npx cap add ios`, App Store Connect products linked in RevenueCat, the iOS
   key. Apple requires a Restore button (it's in §7) and the subscription terms on the paywall (RevenueCat's paywall
   shows them).

## Testing

- **Unit (Vitest, SDK mocked)**, adapted from Rafeeq's tests:
  - the build switch's conditions;
  - the starting value from the cache and its per-account rule;
  - logIn/logOut following the account;
  - live updates;
  - plan details from customer info (monthly, yearly, lifetime, trial, promotional).
- **Sync:** without Pro (gate on), no sync runs from any trigger and the status is `'paused'`. When Pro arrives, the
  dirty records upload. With the gate off, it behaves as today.
- **Sign-in:** the badge opens the paywall. "subscribed" carries on into sign-in, "dismissed" doesn't. "Already have
  Pro? Sign in" signs in without the paywall.
- **Bank texts:** the switch, scan and confirm open the paywall without Pro. Dismiss works. `AutoScan` doesn't run
  without Pro.
- **The real test is the owner's** (§11.3) on an Android debug build with a license tester, in both languages and in
  dark mode.

## Existing testers (owner decision, 2026-11-19)

Build 1 went to internal and closed testing with free sign-in and sync. When the gate turns on, the owner will grant
those testers free Pro by hand, as a RevenueCat promotional entitlement looked up by their Support ID (§7). There's no
grandfathering in code. The release notes for the release that turns the gate on say that sync is now part of Budgy
Pro.

## Left to the builder

- Where `ProProvider` sits relative to `CloudProvider` (§2).
- What the PRO badge looks like. It follows the app's existing badge and chip styles, in both themes and RTL.
- The exact wording of new strings.
- Module and file names beyond those given here.
