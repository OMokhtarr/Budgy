# Onboarding Tours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Welcome slides (language → intro → currency), first-visit spotlight tours on each main page and the transaction editor, a "What's new" deck, and a Tours & tips section in Settings — ported from Rafeeq.

**Architecture:** A self-contained `src/features/onboarding/` module. Pure units (store, catalog, logic) carry the rules and the tests; `TourProvider` (inside `IonReactRouter`) owns one launch deck and a single queue of page tours; pages opt in with `usePageTour([...ids], { ready })` and mark targets with `data-tour` attributes.

**Tech Stack:** React 19, Ionic 8 (`mode: 'ios'`), react-router 5, i18next (en/ar, RTL), Capacitor 8, Vitest 3 (Node environment, `src/**/*.test.ts` only).

**Spec:** `docs/superpowers/specs/2026-11-15-onboarding-tours-design.md`

**Rafeeq source** (copy from, then adapt): `E:\Docs sent By People\Mokhtar\Personal\Rafeeq Cross Platform\src\app\features\onboarding\` — referred to below as `RAFEEQ/`.

## Global Constraints

- Storage key: `budgy-onboarding-v1`. Old first-run flag to migrate: `budgy-pick-currency`.
- Port Rafeeq's **current** code, not its older spec: no `optional` on steps; `seenReleases` stores feature keys; features may carry `platforms`.
- All copy in `src/core/i18n/locales/en.json` and `ar.json` under `onboarding.*`; titles 2–5 words, bodies 1–2 lines. Rafeeq's `onboardingCopy.ts` is not ported.
- Colours from tokens only (`--ion-color-primary`, `--b-bg`, `--b-surface`, `--b-border`, `--b-text`, `--b-muted`); the one exception is the dim `rgba(0,0,0,.72)`. Ring: 2px `--ion-color-primary`, padded 6px.
- Card moves to the top when the target's centre is in the lower 40% of the viewport.
- Missing target: retry ~1.5s (`FIND_TIMEOUT_MS = 1500`, poll 100ms), then skip the step.
- Back button: `ionBackButton` → `detail.register(200, skip)` (page handlers use 100).
- 44px minimum touch targets; `role="dialog"`, `aria-modal="true"`, `aria-live="polite"` step counter; static glyph under `prefers-reduced-motion`.
- `RELEASES` ships empty.
- Prefer existing Budgy helpers: `swipeStep(deltaX, deltaY, ms, rtl)` from `@/core/utils/swipe` (not Rafeeq's), `useTranslation`, `i18n.changeLanguage`.
- Verification commands: `npm test` and `npm run typecheck` (run from `d:\Budgy`). No `cap sync`, no Android builds.

## Review Focus

1. **Right-to-left (Arabic):** slide swipe direction, Skip/Previous/Next placement, card text alignment and the glyph's swipe direction must mirror. → manual check steps in Task 4 and Task 5.
2. **A tour asked for while something else is open** (editor sheet, an alert, the period sheet, the side menu, selection mode) must wait, not draw over it. → `pickNext` / `isOverlayOpen` tests in Task 2.
3. **Hardware back during a tour or deck** must skip only the tour — not also leave selection mode or navigate. → manual step in Task 5.
4. **Switching language on slide 1** re-renders the deck and flips direction at once, and the currency button reads "Continue with {{currency}}" in the new language. → manual step in Task 4.
5. **Blocked or corrupt storage** must never show onboarding on every launch; corrupt state counts as an existing user. → store tests in Task 1.

---

### Task 1: Onboarding store

**Files:**
- Create: `src/features/onboarding/onboardingStore.ts` (port `RAFEEQ/onboardingStore.ts`)
- Test: `src/features/onboarding/onboardingStore.test.ts`

**Interfaces:**
- Produces:
  - `ONBOARDING_KEY = 'budgy-onboarding-v1'`, `PICK_CURRENCY_KEY = 'budgy-pick-currency'`
  - `interface OnboardingState { welcomeDone: boolean; seenTours: string[]; seenReleases: string[] }`
  - `initOnboarding(opts: { fresh: boolean; releaseKeys: string[] }): OnboardingState | null`
  - `markTourSeen(s, id: string)`, `markReleasesSeen(s, keys: string[])`, `completeWelcome(s, releaseKeys: string[])`, `resetTours(s)` — each returns the saved `OnboardingState`.

Differences from Rafeeq: no `LEGACY_KEYS`/`detectExistingUser`. New user ⇔ `fresh || localStorage.getItem(PICK_CURRENCY_KEY) === '1'`. `initOnboarding` removes `PICK_CURRENCY_KEY` whenever it creates state.

- [ ] **Step 1: Write the failing tests** (import `@/test/setup-db` first for the `localStorage` stub; `localStorage.clear()` in `beforeEach`)

```ts
it('a fresh database starts the welcome', () => {
  expect(initOnboarding({ fresh: true, releaseKeys: ['a'] })).toEqual({ welcomeDone: false, seenTours: [], seenReleases: [] });
});
it('an unpicked currency from an older build also counts as new, and the flag is removed', () => {
  localStorage.setItem('budgy-pick-currency', '1');
  expect(initOnboarding({ fresh: false, releaseKeys: [] })?.welcomeDone).toBe(false);
  expect(localStorage.getItem('budgy-pick-currency')).toBeNull();
});
it('an existing user skips the welcome and every current release', () => {
  expect(initOnboarding({ fresh: false, releaseKeys: ['a', 'b'] })).toEqual({ welcomeDone: true, seenTours: [], seenReleases: ['a', 'b'] });
});
it('stored state wins over fresh', () => {
  localStorage.setItem('budgy-onboarding-v1', JSON.stringify({ welcomeDone: true, seenTours: ['x'], seenReleases: [] }));
  expect(initOnboarding({ fresh: true, releaseKeys: [] })?.seenTours).toEqual(['x']);
});
it('corrupt state counts as an existing user', () => {
  localStorage.setItem('budgy-onboarding-v1', '{nope');
  expect(initOnboarding({ fresh: true, releaseKeys: ['a'] })).toEqual({ welcomeDone: true, seenTours: [], seenReleases: ['a'] });
});
it('blocked storage returns null', () => {
  vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(initOnboarding({ fresh: true, releaseKeys: [] })).toBeNull();
});
it('marking is idempotent and persisted', () => {
  const s = initOnboarding({ fresh: true, releaseKeys: [] })!;
  const t = markTourSeen(markTourSeen(s, 'categories'), 'categories');
  expect(t.seenTours).toEqual(['categories']);
  expect(JSON.parse(localStorage.getItem('budgy-onboarding-v1')!).seenTours).toEqual(['categories']);
});
it('completeWelcome marks the welcome done and the releases seen; resetTours clears tours only', () => { /* assert both */ });
```

- [ ] **Step 2: Run** `npx vitest run src/features/onboarding/onboardingStore.test.ts` — expected FAIL (module not found).
- [ ] **Step 3: Implement** by porting `RAFEEQ/onboardingStore.ts` with the differences above.
- [ ] **Step 4: Run** the same command — expected PASS.
- [ ] **Step 5: Commit** — `Add the onboarding store`

---

### Task 2: Catalog, rules and copy

**Files:**
- Create: `src/features/onboarding/tourCatalog.ts` (port `RAFEEQ/tourCatalog.ts`, Budgy content)
- Create: `src/features/onboarding/tourLogic.ts` (port `RAFEEQ/tourLogic.ts`)
- Modify: `src/core/i18n/locales/en.json`, `ar.json` — add under the existing `onboarding` object
- Test: `src/features/onboarding/tourLogic.test.ts`, `src/features/onboarding/tourCatalog.test.ts`

**Interfaces:**
- Consumes: `OnboardingState` (Task 1)
- Produces (`tourCatalog.ts`):
  - `type Gesture = 'swipe' | 'longPress' | 'tap' | 'drag'`
  - `interface TourStep { key: string; gesture?: Gesture; union?: boolean }`
  - `type TourId = 'categories' | 'accounts' | 'transactions' | 'overview' | 'editor' | 'settings' | 'sms'`
  - `const TOURS: Record<TourId, TourStep[]>`
  - `type TourRef = \`${TourId}.${string}\``; `tourAttr(...refs: TourRef[]): { 'data-tour': string }` (space-joined)
  - `type IllustrationId = 'brand' | 'log' | 'wallet' | 'chart' | 'cloud' | 'coins'`
  - `type WelcomeSlideId = 'welcome' | 'log' | 'money' | 'insight' | 'private' | 'currency'`; `WELCOME_SLIDES: { id: WelcomeSlideId; art: IllustrationId }[]` in that order
  - `interface ReleaseFeature { key: string; art: IllustrationId; route: string; tourId: TourId; platforms?: string[] }`, `interface Release { features: ReleaseFeature[] }`
  - `ALL_RELEASES: Release[] = []`, `releasesForPlatform(releases, platform)`, `RELEASES`, `RELEASE_FEATURE_KEYS`
- Produces (`tourLogic.ts`): Rafeeq's `Deck`, `unseenReleases`, `launchDeck`, `pendingTours`, `TourRequest`, `pickNext`, `Box`, `cardPlacement`, `RING_PAD`, `ringBox`, `unionBox`, `resolveTarget`, `shouldMarkSeen`, `nextShowable`, `previousShown` — same signatures. **Drop** Rafeeq's `swipeStep`. **Add:**
  - `OVERLAY_SELECTOR = 'ion-modal:not(.overlay-hidden), ion-alert:not(.overlay-hidden), ion-popover:not(.overlay-hidden), ion-action-sheet:not(.overlay-hidden), ion-picker:not(.overlay-hidden), ion-loading:not(.overlay-hidden), ion-menu.show-menu'`
  - `isOverlayOpen(doc: Pick<Document, 'querySelector' | 'body'>): boolean` — true when `doc.querySelector(OVERLAY_SELECTOR)` finds something **or** `doc.body.classList.contains('b-selecting')`.

`TOURS` content (keys from the spec's tours table; gesture in brackets):
`categories`: bubble, center, period[swipe], balance, edit[drag], menu ·
`accounts`: tabs[swipe], transfer, add, row ·
`transactions`: add, row[longPress], search ·
`overview`: tiles, trend, budgets ·
`editor`: fromto, keypad, date, note ·
`settings`: currency, tours ·
`sms`: scan, card[longPress].

Copy keys: `onboarding.slides.<WelcomeSlideId>.{title,body}`, `onboarding.tours.<TourId>.<key>.{title,body}`, `onboarding.releases.<featureKey>.{title,body}`, `onboarding.controls.{skip,next,previous,done,getStarted,showMe,step,chooseLanguage,english,arabic,whatsNew}` (`step` = `"Step {{n}} of {{total}}"`), `onboarding.settings.{title,welcome,replay,replayToast,whatsNew}` (`replayToast` = `"Tips will show again as you visit each page."`). Keep the existing `currencyTitle`, `currencyHint`, `continue`. Slide content per the spec's welcome slides table; tour copy per the tours table.

- [ ] **Step 1: Write the failing tests**

`tourLogic.test.ts` — port `RAFEEQ/__tests__/tourLogic.test.ts` (Jest → Vitest imports; drop the swipe tests) and add:

```ts
const fakeDoc = (hit: boolean, selecting = false) => ({
  querySelector: (s: string) => (hit && s === OVERLAY_SELECTOR ? ({} as Element) : null),
  body: { classList: { contains: (c: string) => selecting && c === 'b-selecting' } },
}) as unknown as Document;
it('an open sheet, alert or menu blocks tours', () => expect(isOverlayOpen(fakeDoc(true))).toBe(true));
it('selection mode blocks tours', () => expect(isOverlayOpen(fakeDoc(false, true))).toBe(true));
it('nothing open lets tours run', () => expect(isOverlayOpen(fakeDoc(false))).toBe(false));
it('a blocked queue waits, an overOverlay request may start', () => {
  const q = [{ tourId: 'categories', overOverlay: false }, { tourId: 'editor', overOverlay: true }] as TourRequest[];
  expect(pickNext(q, true)).toBe(1);
  expect(pickNext(q.slice(0, 1), true)).toBe(-1);
});
```

`tourCatalog.test.ts`:

```ts
it('every tour step has an English and Arabic title and body', () => {
  for (const [id, steps] of Object.entries(TOURS)) for (const s of steps) for (const f of ['title', 'body'])
    for (const lang of [en, ar]) expect(get(lang, `onboarding.tours.${id}.${s.key}.${f}`), `${id}.${s.key}.${f}`).toBeTruthy();
});
it('every welcome slide and control has both languages', () => { /* same pattern over WELCOME_SLIDES and controls/settings keys */ });
it('release features have unique keys, a known tour and copy', () => { /* over ALL_RELEASES; passes vacuously while empty */ });
it('releasesForPlatform drops other platforms and empty releases', () => {
  const r = [{ features: [{ key: 'x', art: 'brand', route: '/sms', tourId: 'sms', platforms: ['android'] }] }] as Release[];
  expect(releasesForPlatform(r, 'web')).toEqual([]);
  expect(releasesForPlatform(r, 'android')[0].features).toHaveLength(1);
});
```

(`tourCatalog.ts` imports `Capacitor`; mock it with `vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web' } }))` if the import fails in Node.)

- [ ] **Step 2: Run** `npx vitest run src/features/onboarding` — expected FAIL.
- [ ] **Step 3: Implement** `tourCatalog.ts`, `tourLogic.ts` and the en/ar copy.
- [ ] **Step 4: Run** `npx vitest run src/features/onboarding` then `npm run typecheck` — expected PASS, no errors.
- [ ] **Step 5: Commit** — `Add the tour catalog, tour rules and onboarding copy`

---

### Task 3: Currency pick, reusable

**Files:**
- Create: `src/features/onboarding/currencyGuess.ts` (the `REGION_CURRENCY` table and guess from `FirstRunCurrency.tsx`)
- Create: `src/features/onboarding/CurrencyChips.tsx` (the chip grid from `FirstRunCurrency.tsx`)
- Create: `src/features/onboarding/useApplyCurrency.ts`
- Test: `src/features/onboarding/currencyGuess.test.ts`

**Interfaces:**
- Produces:
  - `guessCurrency(language: string, fallback: string): string` (pure; caller passes `navigator.language`)
  - `<CurrencyChips value: string; onChange: (c: string) => void />` — renders `[value, ...CURRENCIES without value]`, same markup and classes as today.
  - `useApplyCurrency(): (pick: string) => Promise<void>` — today's `done()` body minus the storage flag: if `pick !== currency`, `unusedAccountsIn(currency)`, `update({ currency: pick })`, `moveAccountsToCurrency(unused, pick)`.

- [ ] **Step 1: Write the failing test**

```ts
it('guesses from the region', () => expect(guessCurrency('ar-SA', 'EGP')).toBe('SAR'));
it('euro countries map to EUR', () => expect(guessCurrency('de-DE', 'EGP')).toBe('EUR'));
it('no region or unknown region keeps the fallback', () => {
  expect(guessCurrency('en', 'EGP')).toBe('EGP');
  expect(guessCurrency('xx-ZZ', 'USD')).toBe('USD');
});
```

- [ ] **Step 2: Run** `npx vitest run src/features/onboarding/currencyGuess.test.ts` — expected FAIL.
- [ ] **Step 3: Implement** the three files. `FirstRunCurrency.tsx` stays for now (removed in Task 5).
- [ ] **Step 4: Run** the test and `npm run typecheck` — expected PASS.
- [ ] **Step 5: Commit** — `Split the currency pick out of the first-run sheet`

---

### Task 4: Slide decks

**Files:**
- Create: `src/features/onboarding/useBackToSkip.ts`
- Create: `src/features/onboarding/SlideDeck.tsx`, `onboarding.css` (port `RAFEEQ/SlideDeck.tsx` and the deck part of `RAFEEQ/onboarding.css`; class prefix `ob-` kept)
- Create: `src/features/onboarding/illustrations.tsx` (new line-art SVGs for the six `IllustrationId`s; `stroke="currentColor"`, drawn in `--ion-color-primary`)
- Create: `src/features/onboarding/WelcomeSlides.tsx`, `WhatsNew.tsx`

**Interfaces:**
- Consumes: `WELCOME_SLIDES`, `IllustrationId`, `Release` (Task 2); `CurrencyChips`, `guessCurrency`, `useApplyCurrency` (Task 3)
- Produces:
  - `useBackToSkip(onSkip: () => void, enabled = true): void` — while enabled, listens on `document` for `ionBackButton` and calls `e.detail.register(200, () => latest onSkip())`.
  - `SlideDeck` props: Rafeeq's `{ slides: DeckSlide[]; eyebrow?: string; finishLabel: string; onFinish: () => void; onSkip: () => void }` **plus** `skipTo?: number` (Skip and back jump to that slide instead of calling `onSkip`; Skip is hidden on that slide, back does nothing there) and `finishDisabled?: boolean`.
  - `WelcomeSlides` props: `{ withCurrency: boolean; onDone: () => void }`. With currency: all six slides, `skipTo` = last, the last slide's `extra` is `<CurrencyChips>` (initial pick `guessCurrency(navigator.language, currency)`), `finishLabel` = `t('onboarding.continue', { currency: pick })`, `onFinish` awaits `applyCurrency(pick)` then `onDone()`. Without currency (Settings replay): the first five slides, `finishLabel` = `getStarted`, Skip = `onDone`.
  - `WhatsNew` props: Rafeeq's `{ releases: Release[]; onDone: () => void; onShowMe: (route: string) => void }`.

Adaptations: `useLang` → `useTranslation()` (`i18n.language`, RTL = `i18n.dir() === 'rtl'`); `ONBOARDING_COPY` → `t('onboarding.…')`; `registerOverlay` → `useBackToSkip`; swipe → `swipeStep(dx, dy, ms, rtl)` from `@/core/utils/swipe`; language buttons call `i18n.changeLanguage(l)`; insets via `env(safe-area-inset-*)`; z-index above Ionic overlays (≥ 30000).

- [ ] **Step 1: Implement** the files.
- [ ] **Step 2: Run** `npm run typecheck` — expected no errors.
- [ ] **Step 3: Temporary manual check:** render `<WelcomeSlides withCurrency onDone={() => {}} />` from `App.tsx` and check with `npm run dev` (do **not** commit the temporary render):
  - en: six slides, Skip jumps to the currency slide, Skip is hidden there, the button reads "Continue with <guess>".
  - Tap العربية on slide 1: text turns Arabic and the layout flips at once; swiping to the next slide now goes rightward; the currency button reads in Arabic.
  - Light and dark themes both legible.
- [ ] **Step 4: Remove** the temporary render, then **commit** — `Add the welcome and What's new slide decks`

---

### Task 5: Spotlight, tour provider and wiring

**Files:**
- Create: `src/features/onboarding/SpotlightOverlay.tsx` (port `RAFEEQ/SpotlightOverlay.tsx`; spotlight part of `onboarding.css`)
- Create: `src/features/onboarding/TourProvider.tsx` (port `RAFEEQ/TourProvider.tsx`)
- Create: `src/features/onboarding/usePageTour.ts` (copy `RAFEEQ/usePageTour.ts` as is)
- Modify: `src/main.tsx` (replace `markFirstRun`), `src/App.tsx` (provider order)
- Modify: `src/features/data/BackupReminder.tsx`, `src/features/sms/AutoScan.tsx` (wait for the welcome)
- Delete: `src/features/onboarding/FirstRunCurrency.tsx`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `TourProvider` props `{ initial: OnboardingState | null; children: ReactNode }`
  - `useTours(): TourApi` — Rafeeq's `{ requestTours, cancelTours, showWelcome, showWhatsNew, resetTours, hasReleases }` **plus** `welcomeOpen: boolean`.
  - `usePageTour(tourIds: TourId[], opts?: { ready?: boolean; overOverlay?: boolean; onBeforeStart?: () => void }): void`
  - `App` gains a prop `onboarding: OnboardingState | null`.

Adaptations:
- `hasOpenOverlay()` → `isOverlayOpen(document)`. Note the editor tour is itself shown over an open `ion-modal`, which is why it uses `overOverlay`.
- Rafeeq's welcome deck (launch) → `<WelcomeSlides withCurrency onDone={finishWelcome} />`; `showWelcome()` (replay) → `withCurrency={false}` and does not call `completeWelcome`. Track which with the deck state, e.g. `{ kind: 'welcome'; replay: boolean }`.
- `registerOverlay` → `useBackToSkip(onSkip)`, enabled only once the step's card is shown (Rafeeq enables it after `onShown`).
- `GestureHint`: keep `swipe` and `longPress`; replace `doubleTap` with `tap` (one ripple) and add `drag` (the dot holds, then slides with its trail, slower than swipe). Swipe trail direction mirrors in RTL.
- Overlay colours from tokens per Global Constraints; card bottom offset clears the tab bar (`--ion-tab-bar-height`, fallback 56px, plus `env(safe-area-inset-bottom)`).

Wiring:
- `main.tsx`: `const onboarding = initOnboarding({ fresh, releaseKeys: RELEASE_FEATURE_KEYS })` inside the existing `openData().then(...)`; pass it to `<App onboarding={onboarding} />` (null when the database failed).
- `App.tsx` order: `IonApp > CloudProvider > IonReactRouter > TourProvider > TxEditorProvider > { AppMenu, tabs, BackupReminder, AutoScan }`. `TxEditorProvider` moves inside the router so the editor can use `useTours`. Remove `<FirstRunCurrency />`.
- `BackupReminder` and `AutoScan`: read `welcomeOpen` from `useTours()`; return early from the effect while it's true, and add it to the effect's dependencies.

- [ ] **Step 1: Implement** the files and wiring.
- [ ] **Step 2: Run** `npm test` and `npm run typecheck` — expected all PASS, no errors, and no remaining import of `FirstRunCurrency` (`git grep FirstRunCurrency` prints nothing).
- [ ] **Step 3: Manual check** with `npm run dev`, before any page has targets:
  - Clear site data → welcome slides show; picking a currency and finishing lands on Categories in that currency; reload → no slides.
  - Set `budgy-pick-currency=1` and remove `budgy-onboarding-v1` in devtools → slides show again.
  - Keep data, remove only `budgy-onboarding-v1` → no slides.
- [ ] **Step 4: Commit** — `Run welcome slides and page tours from a tour provider`

---

### Task 6: Tour targets on every page

**Files (modify):**
- `src/shared/components/AppHeader.tsx` — `.b-apphead__me` gets `tourAttr('categories.menu')`, `.b-apphead__balance` gets `tourAttr('categories.balance')` (resolution ignores hidden pages, so the attribute can sit on every tab's header)
- `src/features/categories/CategoriesPage.tsx` — bubble (every category `Bubble`; the first visible wins), center, period (the `IonToolbar` around `PeriodBar`), edit (the edit `IonButton`); `usePageTour(['categories'], { ready: !!categories && !!txs && !!accounts })`
- `src/features/accounts/AccountsPage.tsx` — tabs (`.b-tabs`), transfer (Transfer button), add (add `IonButton`), row (every `.b-row` in `row()`); `ready: !!accounts && !!balances`
- `src/features/transactions/TransactionsPage.tsx` — add (the `IonFabButton` when not selecting), row (every transaction and group row), search (search `IonButton`); `ready: !!txs && lookupsReady`
- `src/features/overview/OverviewPage.tsx` — tiles (`.b-tiles`), trend (trend `.b-card`), budgets (budgets `.b-card`); `ready` = the `useRevealWhen` condition
- `src/features/transactions/TransactionEditor.tsx` — fromto (`.b-fromto`), keypad (`.b-keypad`), date (the date `.b-key--op`), note (`.b-note`); `usePageTour(['editor'], { overOverlay: true })`
- `src/features/settings/SettingsPage.tsx` — currency (main currency `IonItem`); `usePageTour(['settings'])` (the `tours` target is added in Task 7)
- `src/features/sms/SmsReviewPage.tsx` — scan (`.b-scanbtn`); `src/features/sms/SmsItemCard.tsx` — card (the root `.b-smscard`); `usePageTour(['sms'])` in the page

Interfaces: Consumes `tourAttr`, `usePageTour` (Tasks 2, 5).

- [ ] **Step 1: Write the failing test** in `tourCatalog.test.ts`: every `TOURS` ref appears in source.

```ts
import { readFileSync, readdirSync } from 'node:fs';
it('every tour step has a target in the code', () => {
  const src = walk('src').filter((f) => f.endsWith('.tsx')).map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const [id, steps] of Object.entries(TOURS)) for (const s of steps)
    expect(src.includes(`'${id}.${s.key}'`), `${id}.${s.key}`).toBe(true);
});
```

(`walk` = a small recursive `readdirSync` helper in the test file. The `settings.tours` ref comes in Task 7, so allow-list it here and drop the allow-list in Task 7.)

- [ ] **Step 2: Run** `npx vitest run src/features/onboarding/tourCatalog.test.ts` — expected FAIL listing the missing refs.
- [ ] **Step 3: Add** the attributes and hooks.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` — expected PASS.
- [ ] **Step 5: Manual check** with `npm run dev` after clearing site data, in en and ar, light and dark:
  - Each tab's tour plays once on its first visit; the ring sits on the right element and the card never covers it.
  - Open the editor from a category → the editor tour plays over the sheet.
  - While the period sheet or the side menu is open, or a transaction is selected, no tour starts; it starts once that closes.
  - Mid-tour, back skips the tour only. On web, simulate it in the console with `document.dispatchEvent(new CustomEvent('ionBackButton', { detail: { register: (p, h) => h() } }))` — this calls every registered handler, so it can't check priority. The priority 200 versus 100 behaviour (the first back skips the tour, the next clears a selection) is on the user's Android check list.
  - Tapping a tab mid-tour ends it, and it plays again on the next visit.
- [ ] **Step 6: Commit** — `Add tours for the main pages, the editor, Settings and bank texts`

---

### Task 7: Tours & tips in Settings

**Files:**
- Create: `src/features/onboarding/ToursSettingsSection.tsx`
- Modify: `src/features/settings/SettingsPage.tsx` — render it just before the "Budgy" about list, wrapped so it carries `tourAttr('settings.tours')`
- Modify: `src/features/onboarding/tourCatalog.test.ts` — drop the Task 6 allow-list

**Interfaces:** Consumes `useTours()` (Task 5).

Section: `IonList inset` with an `IonListHeader` `onboarding.settings.title` and button `IonItem`s: **Show welcome slides** → `showWelcome()`; **Replay page tips** → `resetTours()` then `useIonToast` with `replayToast` (same toast style as `TransactionsPage`: `duration: 2200, position: 'top', color: 'medium'`); **What's new** → `showWhatsNew()`, rendered only when `hasReleases`.

- [ ] **Step 1: Implement** the section and remove the allow-list.
- [ ] **Step 2: Run** `npm test` and `npm run typecheck` — expected PASS.
- [ ] **Step 3: Manual check:** the Settings tour ends on this section; "Show welcome slides" replays five slides without the currency slide and doesn't change the currency; "Replay page tips" shows the toast and the Categories tour plays again on the next visit; "What's new" is absent. Add a fake feature to `ALL_RELEASES` temporarily → the deck shows on reload, "Show me" opens its page and plays its tour, and the Settings row appears; then remove the fake feature.
- [ ] **Step 4: Commit** — `Add Tours & tips to Settings`
