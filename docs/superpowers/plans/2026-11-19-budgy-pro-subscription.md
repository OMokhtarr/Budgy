# Budgy Pro Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell Budgy Pro (monthly, yearly and lifetime) through RevenueCat. Pro unlocks bank texts and sign-in with
sync. Everything else stays free, and nothing is lost when Pro ends.

**Architecture:**
- **`src/core/pro/`** holds four pieces:
  - the build switch (`gate.ts`);
  - a thin RevenueCat wrapper ported from Rafeeq (`revenuecat.ts`);
  - small pure rules and a per-account cache, both unit-tested;
  - `ProProvider` with the `usePro()` hook.
- **The session moves into its own hook** (`useSessionUser`), so `ProProvider` can sit above `CloudProvider`. That
  lets `CloudProvider` pause sync from `usePro()`.
- **UI gating is one helper,** `useRequirePro()`. It wraps an action: free users see the paywall first, and the
  action runs only if they end up subscribed.

**Tech Stack:** React 19, Ionic 8, Capacitor 8, Vite, Vitest (node environment, `*.test.ts` only), react-i18next
(en + ar, RTL), `@revenuecat/purchases-capacitor` and `@revenuecat/purchases-capacitor-ui` 13.7.6.

**Spec:** `docs/superpowers/specs/2026-11-19-budgy-pro-subscription-design.md`. Read it first. Section numbers (§)
below refer to it.

**Prior art to port from** (read, don't copy blindly; the paths below are relative to
`E:\Docs sent By People\Mokhtar\Personal\Rafeeq Cross Platform`):
- `src/app/core/services/subscription/revenuecat.service.ts`
- `src/app/core/context/SubscriptionContext.tsx`
- `src/app/core/services/subscription/__tests__/revenuecat.service.test.ts`

Rafeeq uses Jest and `process.env.REACT_APP_*`. Budgy uses Vitest, `vi.mock` and `vi.stubEnv`, and
`import.meta.env.VITE_*`.

## Global Constraints

- Entitlement id: `budgy_pro`. It's one exported constant, `PRO_ENTITLEMENT`, in `src/core/pro/revenuecat.ts`.
- Env vars:
  - `VITE_PRO_GATE`: `off` (or unset), `test` or `on`;
  - `VITE_REVENUECAT_ANDROID_KEY`;
  - `VITE_REVENUECAT_IOS_KEY`.
- **With `VITE_PRO_GATE` off or unset, the app behaves exactly as today.** RevenueCat never starts, there are no
  badges and no Budgy Pro section, and sync is never paused.
- **A RevenueCat Test Store key (`test_…`) is refused unless `Capacitor.DEBUG` is true.**
- **Prices are never hard-coded.** The paywall shows the store's localized prices.
- **No data is ever deleted or hidden because Pro is missing.**
- **Every new string goes in both `src/core/i18n/locales/en.json` and `ar.json`,** and every new UI works in RTL and
  dark mode.
- **Pin exact dependency versions:** `"@revenuecat/purchases-capacitor": "13.7.6"` and
  `"@revenuecat/purchases-capacitor-ui": "13.7.6"`.
- **Verification commands:** `npm test`, `npm run typecheck`, `npm run build`. All must pass at the end of every
  task.

## Review Focus

1. **Signing in, as someone who bought Pro anonymously, to an account RevenueCat already knows.** Pro must still land
   on the account, through the `syncPurchases()` retry. Test: `logInAndCheck syncs purchases when logIn finds no Pro`
   (Task 2).
2. **Switching accounts on one phone.** Account B must never start with account A's cached Pro, or sync would run
   for B. Test: `readProCache ignores a cache written for another account` (Task 1).
3. **Sync firing before RevenueCat answers after sign-in.** It must wait, not pause and not run. Test:
   `syncGate waits until RevenueCat has answered` (Task 1). Then check by hand in Task 4, step 5.
4. **Closing the paywall without buying while starting a sign-in or a bank-text action.** Nothing must happen. Test:
   `requirePro does not run the action when the paywall is dismissed` (Task 1).
5. **A release build with keys in `.env.local` but `VITE_PRO_GATE` unset.** RevenueCat must not start at all. Test:
   `proMode is off when VITE_PRO_GATE is unset even with a key` (Task 1).

---

### Task 1: The switch, the rules and the cache (pure, tested)

**Files:**
- Create: `src/core/pro/gate.ts`, `src/core/pro/rules.ts`, `src/core/pro/cache.ts`
- Test: `src/core/pro/gate.test.ts`, `src/core/pro/rules.test.ts`, `src/core/pro/cache.test.ts`
- Modify: `.env.example` (add the three vars with a comment block like the Supabase one, saying the keys are public SDK
  keys and that `VITE_PRO_GATE` is `off` | `test` | `on`)

**Interfaces:**
- Produces:
  ```ts
  // gate.ts — reads import.meta.env and Capacitor at call time (not at import), so tests can stub them.
  export type ProMode = 'off' | 'test' | 'on';
  export function revenueCatKey(): string;   // the platform's key: iOS key on 'ios', Android key otherwise; '' when unset
  export function proMode(): ProMode;        // 'test' | 'on' only on a native platform with revenueCatKey() set
  export function proAvailable(): boolean;   // proMode() !== 'off'
  export function isProGateOn(): boolean;    // proMode() === 'on'

  // rules.ts
  export interface ProState { gateOn: boolean; isPro: boolean; ready: boolean }
  export type PaywallOutcome = 'subscribed' | 'dismissed' | 'failed' | 'unavailable';
  export function proAllows(p: Pick<ProState, 'gateOn' | 'isPro'>): boolean;   // !gateOn || isPro
  export function syncGate(p: ProState): 'go' | 'wait' | 'paused';
  export function requirePro(
    p: Pick<ProState, 'gateOn' | 'isPro'>,
    showPaywall: () => Promise<PaywallOutcome>,
    action: () => void | Promise<void>,
  ): Promise<PaywallOutcome | 'allowed'>;

  // cache.ts — localStorage key 'budgy-pro', value JSON { account: string | null, pro: boolean }
  export function readProCache(accountId: string | null): boolean;
  export function writeProCache(accountId: string | null, pro: boolean): void;
  ```

- [ ] **Step 1: Write the failing tests.**
  - **`gate.test.ts`**:
    - Mock `@capacitor/core` with a mutable `platform`, as `src/core/cloud/auth.test.ts` does.
    - Use `vi.stubEnv` for the three vars, and `vi.unstubAllEnvs()` in `afterEach`.
    - The cases:
      - `proMode is off when VITE_PRO_GATE is unset even with a key`: android, key `goog_x`, gate unset → `'off'`.
      - `proMode is test with a key on android`: `'test'`, `proAvailable()` true, `isProGateOn()` false.
      - `proMode is on with a key on android`: `'on'`, `isProGateOn()` true.
      - `proMode is off on web`: web, gate `on`, key set → `'off'`.
      - `proMode is off without the platform key`: android, gate `on`, only the iOS key set → `'off'`.
      - `revenueCatKey uses the iOS key on ios`: ios, both keys set → the iOS key.
      - `an unknown VITE_PRO_GATE value is off`: `'yes'` → `'off'`.
  - **`rules.test.ts`**:
    - `proAllows`: gate off → true; gate on and Pro → true; gate on, not Pro → false.
    - `syncGate`:
      - gate off → `'go'`, even when `ready` is false;
      - `syncGate waits until RevenueCat has answered`: gate on, not ready → `'wait'`, Pro or not;
      - gate on, ready, Pro → `'go'`;
      - gate on, ready, not Pro → `'paused'`.
    - `requirePro`:
      - `runs the action without the paywall when the gate is off`: action called once, paywall not called, returns
        `'allowed'`;
      - `runs the action without the paywall for Pro`: same as above;
      - `runs the action after a paywall that ends subscribed`: returns `'subscribed'`, action called once;
      - `requirePro does not run the action when the paywall is dismissed`: returns `'dismissed'`, action not called.
        Also check `'failed'` and `'unavailable'` (action not called, outcome returned).
  - **`cache.test.ts`** (import `@/test/setup-db` first for `localStorage`; clear it in `beforeEach`):
    - nothing stored → false for `'u1'` and for `null`;
    - write `('u1', true)` → read `'u1'` true;
    - `readProCache ignores a cache written for another account`: write `('u1', true)` → read `'u2'` false and read
      `null` false;
    - write `(null, true)` → read `null` true and read `'u1'` false;
    - a corrupt value (`'1'`, `'{'`) → false.
- [ ] **Step 2: Run `npx vitest run src/core/pro`** and expect FAIL, with the modules not found.
- [ ] **Step 3: Implement the three modules.** `requirePro` awaits `action()` before returning. `writeProCache`
  swallows storage errors, as `CloudContext`'s `saveState` does.
- [ ] **Step 4: Run `npx vitest run src/core/pro` and `npm run typecheck`.** Expect PASS.
- [ ] **Step 5: Commit** with the message "Add the Pro build switch, rules and cache".

### Task 2: RevenueCat wrapper

**Files:**
- Modify: `package.json` and `package-lock.json`: `npm install --save-exact @revenuecat/purchases-capacitor@13.7.6
  @revenuecat/purchases-capacitor-ui@13.7.6`, then `npx cap sync android`. Commit any `android/` changes this
  produces, such as `capacitor.settings.gradle`, `capacitor.build.gradle` and the plugin json.
- Create: `src/core/pro/revenuecat.ts`
- Test: `src/core/pro/revenuecat.test.ts`

**Interfaces:**
- Consumes: `revenueCatKey()` (Task 1).
- Produces. These are the same names and behaviour as Rafeeq's `revenuecat.service.ts`, except where marked:
  ```ts
  export const PRO_ENTITLEMENT = 'budgy_pro';
  export type { CustomerInfo };
  export function configureRevenueCat(appUserId?: string | null): Promise<void>;  // memoised; rejects with no key, or Test Store key when !Capacitor.DEBUG
  export function resetRevenueCatForTests(): void;
  export function setRevenueCatLocale(lang: 'ar' | 'en'): Promise<void>;
  export function fetchCustomerInfo(): Promise<CustomerInfo>;
  export function logInAndCheck(id: string): Promise<CustomerInfo>;   // NEW: logIn; if !isPro → Purchases.syncPurchases() then getCustomerInfo
  export function logOutRevenueCat(): Promise<CustomerInfo>;          // no-op logOut when already anonymous
  export function onCustomerInfo(cb: (info: CustomerInfo) => void): Promise<() => void>;
  export function restore(): Promise<CustomerInfo>;
  export function fetchAppUserId(): Promise<string>;
  export function isProFromCustomerInfo(info: CustomerInfo): boolean;
  export interface ProPlan { period: 'monthly' | 'yearly' | 'lifetime' | 'other'; trial: boolean; willRenew: boolean; endsAt: string | null; billingIssue: boolean }
  export function proPlanFromCustomerInfo(info: CustomerInfo): ProPlan | null;
  export type PaywallResult = 'purchased' | 'restored' | 'cancelled' | 'error';
  export function presentPaywall(): Promise<PaywallResult>;
  export function presentCustomerCenter(): Promise<void>;
  ```

- [ ] **Step 1: Write the failing tests** in `revenuecat.test.ts`. Port Rafeeq's test file to Vitest:
  - mock `@capacitor/core` (`getPlatform`, `DEBUG`), `@revenuecat/purchases-capacitor` and
    `@revenuecat/purchases-capacitor-ui` with `vi.mock`;
  - set keys with `vi.stubEnv`;
  - get a fresh memo with `resetRevenueCatForTests()` in `beforeEach`.

  The cases:
  - `sends nothing to RevenueCat when the build has no key`;
  - `configures once with the platform key`;
  - `refuses a Test Store key in a release build`;
  - `uses a Test Store key in a debug build`;
  - `reads Pro from the budgy_pro entitlement only`: `{ budgy_pro: {} }` → true, `{ pro: {} }` → false;
  - `proPlanFromCustomerInfo`, Rafeeq's cases with `budgy_pro`:
    - monthly from `productPlanIdentifier: 'monthly'`;
    - yearly from `'yearly'`;
    - lifetime when `expirationDate` is null;
    - trial when `periodType: 'TRIAL'`;
    - `'other'` for `store: 'PROMOTIONAL'` with an expiry;
    - `billingIssue` from `billingIssueDetectedAt`;
    - null without the entitlement;
  - `presentPaywall maps PURCHASED, RESTORED, ERROR and CANCELLED/NOT_PRESENTED`;
  - `logInAndCheck returns logIn's info without syncing when it has Pro`: `syncPurchases` not called;
  - `logInAndCheck syncs purchases when logIn finds no Pro`: `logIn` resolves without the entitlement, then
    `syncPurchases` is called once and the result of the following `getCustomerInfo` (with the entitlement) is
    returned;
  - `logOutRevenueCat does not call logOut when already anonymous`.
- [ ] **Step 2: Run `npx vitest run src/core/pro/revenuecat.test.ts`** and expect FAIL.
- [ ] **Step 3: Implement `revenuecat.ts`** by porting Rafeeq's service. The key comes from `revenueCatKey()`.
- [ ] **Step 4: Run the test, then `npm run typecheck`.** Expect PASS.
- [ ] **Step 5: Commit** with the message "Add the RevenueCat wrapper for Budgy Pro".

### Task 3: Session hook, ProProvider and useRequirePro

**Files:**
- Create: `src/core/cloud/useSessionUser.ts`, `src/core/pro/ProContext.tsx`, `src/core/pro/useRequirePro.ts`
- Modify: `src/core/cloud/CloudContext.tsx` (use `useSessionUser` in place of its own session effect, lines ~117–128),
  and `src/App.tsx` (wrap `CloudProvider` in `ProProvider`).
- Strings: `pro.unavailable` ("Budgy Pro isn't available right now. Check your connection and try again.") and
  `pro.failed` ("The purchase didn't go through. You weren't charged.").

**Interfaces:**
- Consumes: Task 1 (`proMode`, `proAvailable`, `isProGateOn`, `readProCache`, `writeProCache`, `requirePro`,
  `PaywallOutcome`) and Task 2 (everything).
- Produces:
  ```ts
  // useSessionUser.ts — the Supabase session; moved out of CloudProvider so ProProvider can use it too.
  export function useSessionUser(): { user: User | null; ready: boolean };  // ready: getSession() has resolved (true at once when !supabase)

  // ProContext.tsx
  export function ProProvider({ children }: { children: React.ReactNode }): JSX.Element;
  export interface ProValue {
    gateOn: boolean; available: boolean; isPro: boolean; ready: boolean;
    plan: ProPlan | null; appUserId: string | null;
    showPaywall(): Promise<PaywallOutcome>;
    showCustomerCenter(): Promise<void>;
    restore(): Promise<boolean>;
  }
  export function usePro(): ProValue;

  // useRequirePro.ts — wraps rules.requirePro with usePro(), and toasts pro.failed / pro.unavailable.
  export function useRequirePro(): (action: () => void | Promise<void>) => Promise<void>;
  ```

**Behaviour that `ProProvider` must keep from Rafeeq's `SubscriptionContext`:**
- **Identity.**
  - The identity queue (`syncIdentity`) follows `useSessionUser().user?.id`.
  - RevenueCat is configured only after `ready`, starting with that id.
  - Rafeeq's `logInRevenueCat` is replaced by `logInAndCheck`.
- **Account switching.**
  - The render-time drop of `isPro` when the account changes stays.
  - The listener stays muted while switches are pending.
  - `identitySettled` runs before the paywall and restore.
- **Starting values** (instead of Rafeeq's `rafiq_pro_v1`):
  - `isPro` starts from `readProCache(accountId)`;
  - `apply()` calls `writeProCache(accountId, pro)` for the identity the answer belongs to.
- **When `available` is false** (mode `off`): nothing starts, `isPro` is `true` and `ready` is `true`, so every
  check passes. The paywall resolves `'unavailable'`.
- **When `available` is true but `gateOn` is false** (mode `test`): RevenueCat runs and `isPro` is the real answer.
  Callers use `gateOn` through `proAllows` and `syncGate`, so nothing is gated.
- **Language.**
  - The paywall and Customer Center locale is `i18n.language === 'ar' ? 'ar' : 'en'`, from `useTranslation()`.
  - It is re-applied when the language changes.
- **No `noteOpen` or `markNotPro`.** Budgy has no in-place note and no broker.

- [ ] **Step 1: Extract `useSessionUser`.** CloudProvider uses it, and nothing else about sync changes. Run `npm test`:
  `src/core/cloud/sync.test.ts` and `auth.test.ts` still pass.
- [ ] **Step 2: Implement `ProContext.tsx` and `useRequirePro.ts`,** and wrap `<CloudProvider>` in `<ProProvider>` in
  `App.tsx`. `ProProvider` sits outside `IonReactRouter`, because it needs no router.
- [ ] **Step 3: Run `npm run typecheck`, `npm test` and `npm run build`.** Expect PASS.
- [ ] **Step 4: Check by hand.**
  - `npm run dev`: the app runs as before, and on web `usePro()` reports `isPro: true`.
  - Android debug build with `VITE_PRO_GATE=test` and a Test Store key: no crash at launch, and logcat shows
    RevenueCat configured.
- [ ] **Step 5: Commit** with the message "Add ProProvider and move the session into useSessionUser".

### Task 4: Sync pauses without Pro

**Files:**
- Modify:
  - `src/core/cloud/CloudContext.tsx`: add `'paused'` to `SyncStatus`.
  - `src/features/profile/AccountSyncSection.tsx`
  - `src/features/menu/AppMenu.tsx` (backup label line ~29, about alert ~47)
  - `src/features/data/BackupReminder.tsx` (the `user` check, ~line 41)
  - `src/features/data/DataPage.tsx` (~line 62)
  - `src/shared/components/ProBadge.tsx` (new), and its CSS in `src/index.css`
- Strings:
  - `cloud.pausedEnded`: "Sync is paused: Budgy Pro has ended";
  - `cloud.pausedNeverPro`: "Sync is part of Budgy Pro";
  - `pro.renew`: "Renew";
  - `cloud.paused`: "Sync paused", for the menu;
  - `cloud.alreadyPro`: "Already have Pro? Sign in";
  - `cloud.hint`: reworded so it says sign-in and sync are part of Budgy Pro;
  - `cloud.signOutPausedMessage`: "Changes you made since sync paused aren't in your account. Remove them from this
    device anyway?";
  - `pro.cancelInStoreFirst`: "Your Budgy Pro subscription keeps running until you cancel it in Google Play or the App
    Store."

**Interfaces:**
- Consumes: `usePro()`, `useRequirePro()` (Task 3), and `syncGate` and `proAllows` (Task 1).
- Produces:
  ```ts
  export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error' | 'paused';
  // ProBadge.tsx
  export default function ProBadge(): JSX.Element;   // small "PRO" chip; follows .b-chip / badge styles, both themes, RTL
  ```

**CloudContext changes:**
- **The sync gate.** `const gate = syncGate(usePro())` is held in a ref, as `settingsRef` is.
  - `sync()` returns at once when `gate !== 'go'`, before setting `'syncing'`.
  - The after-sign-in effect becomes `if (user && gate === 'go') void sync()`, with `gate` in its deps, so sync
    starts the moment Pro arrives.
- **The exposed status** is `'paused'` when `user && gate === 'paused'`; otherwise it's today's status.
- **`syncNow` is a no-op while paused.**

**AccountSyncSection changes:**
- **Signed out, with `gateOn` and not Pro:**
  - each provider button shows `<ProBadge />`;
  - a click runs `requirePro(() => signIn(p))`;
  - under the buttons is a text link, `cloud.alreadyPro`, that runs the plain `signIn(p)`. With two providers, the
    link opens an action sheet to pick one. That's the builder's call.
  - After that plain sign-in, keep a local flag. Once `usePro()` is `ready` for the new user with `gateOn && !isPro`,
    call `showPaywall()` once and clear the flag.
- **Paused card:**
  - the status line is `cloud.pausedEnded` when `plan` was ever seen for this account, else `cloud.pausedNeverPro`.
    The builder may simplify this to `pausedNeverPro` when "ever had Pro" can't be known; RevenueCat's
    `entitlements.all` includes expired ones, if the builder wants it.
  - a primary **Renew** button (`showPaywall`) replaces **Sync now**;
  - sign out and delete stay.
- **Sign out while paused:** the alert's message is `cloud.signOutPausedMessage`.
- **Delete-account alert:** the message adds `pro.cancelInStoreFirst` when `isPro && plan?.willRenew`.

**Elsewhere:**
- **AppMenu:** the backup label is `cloud.paused` when `status === 'paused'`.
- **BackupReminder and DataPage:** "signed in" means `user && status !== 'paused'`.

- [ ] **Step 1: Make the CloudContext changes,** then run `npm test` (sync tests unchanged) and `npm run typecheck`.
- [ ] **Step 2: Add `ProBadge`, then make the AccountSyncSection, AppMenu, BackupReminder and DataPage changes and the
  strings (en + ar).**
- [ ] **Step 3: Run `npm test`, `npm run typecheck` and `npm run build`.** Expect PASS.
- [ ] **Step 4: Check by hand that `VITE_PRO_GATE` unset changes nothing.** Run `npm run dev`: sign-in buttons have
  no badge, and signing in syncs as before.
- [ ] **Step 5: Check by hand on an Android debug build** with `VITE_PRO_GATE=on`, a Test Store key and a fresh
  install:
  - the buttons show PRO;
  - closing the paywall does nothing;
  - buying through the Test Store paywall goes straight into Google sign-in, then sync runs with no "paused" flash
    in between;
  - granting and then revoking the entitlement in the RevenueCat dashboard flips the card to paused (after a
    restart), and the menu says "Sync paused";
  - edit a transaction while paused, then grant again: it uploads.
- [ ] **Step 6: Commit** with the message "Pause sync without Budgy Pro and badge the sign-in buttons".

### Task 5: Bank texts need Pro

**Files:**
- Modify:
  - `src/features/sms/SmsReviewPage.tsx`: the scan buttons (`setScanOpen(true)`, ~line 363), `perm.turnOn` on the
    off screen (~416), `sameCategory` (~467), `startCombine` (~470) and `startTakeOff` (~473); plus the banner.
  - `src/features/sms/SmsItemCard.tsx`: `confirm` (~193) and `edit`/Fill in (~197).
  - `src/features/sms/SmsSettingsSheet.tsx`: the read-texts toggle (~104).
  - `src/features/sms/AutoScan.tsx`: the `on` condition, ~line 34.
- Strings:
  - `sms.proBanner`: "Bank texts are part of Budgy Pro. Your texts are kept here until you renew.";
  - reuse `pro.renew`.

**Interfaces:**
- Consumes: `useRequirePro()`, `usePro()`, `proAllows`, `ProBadge`.

**Changes:**
- **Each gated handler** becomes `() => void requirePro(original)`. Dismiss, Skip, the gear, Linked numbers, ignore
  words and turning the switch off are never wrapped.
- **SmsSettingsSheet:**
  - when turning on through `requirePro` doesn't end subscribed, bump `perm.toggleKey`, so the switch shows off
    again. `useSmsPermission` doesn't expose a setter, so add `resetToggle(): void` to `SmsPermission`.
  - the toggle row shows `<ProBadge />` when `!proAllows(pro)`.
- **The off screen's Turn on button** shows the badge too.
- **The banner:** `allowed && !proAllows(pro)` shows a one-line `.b-card` banner above the list, with `sms.proBanner`
  and a **Renew** button (`showPaywall`).
- **AutoScan:** add `&& proAllows(usePro())` to `on`.

- [ ] **Step 1: Make the changes and add the strings (en + ar).**
- [ ] **Step 2: Run `npm test` (the SMS tests are unchanged), `npm run typecheck` and `npm run build`.** Expect PASS.
- [ ] **Step 3: Check by hand on an Android debug build** (it has `READ_SMS`) with `VITE_PRO_GATE=on`:
  - **Without Pro:**
    - the turn-on switch shows PRO;
    - closing the paywall leaves the switch off.
  - **With Pro:**
    - turn on, scan and confirm a text;
    - revoke Pro: the banner shows, scan, Confirm, Same category, Combine, Take off and Fill in each open the
      paywall, and Dismiss works;
    - relaunch: AutoScan doesn't run.
  - **Arabic and dark mode:** the banner and badges look right.
- [ ] **Step 4: Commit** with the message "Make bank texts part of Budgy Pro".

### Task 6: Profile → Budgy Pro section

**Files:**
- Create: `src/features/profile/ProSection.tsx`
- Modify: `src/features/profile/ProfilePage.tsx` (render it above `<AccountSyncSection />` when `proAvailable()`)
- Strings:
  - `pro.title`: "Budgy Pro";
  - `pro.pitch`: "Bank texts, and sync across your phones";
  - `pro.get`: "Get Pro";
  - `pro.restore`: "Restore purchases";
  - `pro.restoredNone`: "No Budgy Pro purchase found for this store account";
  - `pro.restored`: "Budgy Pro restored";
  - `pro.monthly`, `pro.yearly`, `pro.lifetime`: "Monthly", "Yearly", "Lifetime";
  - `pro.trial`: "Free trial";
  - `pro.renewsOn`: "Renews on {{date}}";
  - `pro.endsOn`: "Ends on {{date}}";
  - `pro.billingIssue`: "There's a problem with your payment. Check it in the store.";
  - `pro.manage`: "Manage";
  - `pro.supportId`: "Support ID";
  - `pro.copied`: "Copied".

**Interfaces:**
- Consumes: `usePro()`, `useCloud()` (for `cloud.alreadyPro` while signed out in builds with sign-in).

**What it shows (§7):**
- **Free:**
  - the pitch;
  - **Get Pro** (`showPaywall`);
  - **Restore purchases**, with toasts `pro.restored` or `pro.restoredNone`, and `cloud.actionFailed` on a throw;
  - when `cloud.enabled && !cloud.user`, a hint pointing to Account & sync below.
- **Pro:**
  - the plan name, with the trial tag;
  - the renews or ends line, using `willRenew` and `endsAt`, with no date for lifetime and dates formatted with
    `useLocale()`;
  - the billing-issue line when there is one;
  - **Manage** (`showCustomerCenter`).
- **Always:**
  - the Support ID, shown shortened (the first 8 and last 4 characters) with a copy button;
  - copying uses `navigator.clipboard.writeText` and toasts `pro.copied`.

- [ ] **Step 1: Build the section and the strings (en + ar),** using the app's `.b-section-title`, `.b-card` and
  `.b-btn` classes.
- [ ] **Step 2: Run `npm run typecheck` and `npm run build`.** Expect PASS.
- [ ] **Step 3: Check by hand on a debug build with `VITE_PRO_GATE=test`:**
  - the section shows;
  - buy monthly → the plan, trial and renews date show;
  - Manage opens the Customer Center;
  - reinstall, then Restore → back to Pro;
  - copy the Support ID;
  - with `VITE_PRO_GATE` unset, the section is gone.
- [ ] **Step 4: Commit** with the message "Add the Budgy Pro section to Profile".

### Task 7: Copy, docs and owner steps

**Files:**
- Modify:
  - `src/core/i18n/locales/en.json` and `ar.json`: `onboarding.slides.private.body` (§10). The English becomes "No
    ads, and it works offline. Budgy Pro adds bank texts and sync across your phones."; the Arabic translation is
    the builder's.
  - Any tour step in `src/features/onboarding/tourCatalog.ts` copy that calls sign-in or bank texts free. Search the
    `tours` strings for "sign in", "sync" and "texts".
  - `README.md`: the features table gets a Budgy Pro row, and the Cloud sync section says sync needs Pro when
    `VITE_PRO_GATE=on`.
  - `RELEASE-NOTES.md`: a draft section headed "Next: the release that turns on Budgy Pro (raise versionCode
    first)", with en and ar "What's new" text under 500 characters. It says that bank texts and sync are now Budgy
    Pro, with a free trial, and that everything stays on the phone.
  - `TODO.md`: under "Your work", the owner steps from spec §11 items 1–5, as checkboxes.
  - `TODO-apple.md`: §11 item 6.

- [ ] **Step 1: Make the edits.**
- [ ] **Step 2: Run `npm test`.** The `tourCatalog.test.ts` target check must still pass. Then run
  `npm run typecheck`.
- [ ] **Step 3: Commit** with the message "Describe Budgy Pro in the welcome slide, README, release notes and TODO".
