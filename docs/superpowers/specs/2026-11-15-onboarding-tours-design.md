# Onboarding — welcome slides, page spotlight tours, "What's new", Tours & tips

Date: 2026-11-15
Branch: `feature/onboarding-tours` (off `master`)
Status: **Reviewed by a builder; awaiting the owner's approval.**
Reference implementation: Rafeeq, `src/app/features/onboarding/` and its spec
`docs/superpowers/specs/2026-10-01-onboarding-tours-design.md`
(at `E:\Docs sent By People\Mokhtar\Personal\Rafeeq Cross Platform`).

## Why

Budgy's quickest paths are invisible: you tap a category bubble to log
spending, tap the donut's middle to switch to income, swipe the page to change
the month, long-press a transaction to select several, drag bubbles to reorder
them in edit mode, and tap the header balance to choose which accounts count.
Settings, Data and Bank texts are hidden in the side menu. A new user should
learn these on the real screens. Later, when a feature ships, existing users
should hear about **that feature only**.

This is the same system Rafeeq already has, brought over to Budgy.

## Goals

- New users get **welcome slides**: language, what Budgy does, then the
  currency pick. This replaces today's `FirstRunCurrency` sheet.
- Every main page gets a **spotlight tour** the first time it's visited: a
  dimmed screen, a ring around a real element, and a card explaining it.
- **"What's new"** slides at launch for features added since the user's last
  update, each with a "Show me" that opens the page and plays its tour.
- A **Tours & tips** section in Settings for replays.

## Non-goals

- Analytics on tour completion. Budgy has no analytics and the privacy policy
  says so.
- Tour content from a server.
- Remembering progress inside a tour (a tour is seen or not seen).
- Tours for single-purpose screens: Profile, Linked numbers, the period sheet,
  the accounts filter sheet, the category/account edit modals.

## Anti-goals (failures even if it "works")

- A tour that gets in the way of logging an expense quickly. Tours only start
  when nothing else is open, and Skip / back always ends them at once.
- Onboarding shown on every launch. If storage is blocked, everything counts as
  seen.
- A tour step pointing at nothing or at the wrong element, or a tour card
  covering its own target.
- Breaking Arabic: every slide, card and swipe must be correct in right-to-left
  layout.

## Approaches considered

| Approach | Verdict |
|---|---|
| **Port Rafeeq's in-house engine** into `src/features/onboarding/` and adapt it | **Chosen.** Same stack (Ionic 8, React, react-router 5, ar/en with RTL). Rafeeq already made it work with Ionic pages, RTL and the back button. |
| A tour library (driver.js, react-joyride) | Rejected, as in Rafeeq. They place popovers next to the target, which breaks in RTL and inside `IonContent` scrolling, and they still need manual back-button handling. |
| One shared package for Rafeeq and Budgy | Rejected for now. The apps differ in how they translate text (Rafeeq's `strings.ts` vs Budgy's i18next) and handle the back button (Rafeeq's overlay registry vs Budgy's `ionBackButton` listeners). A shared package would need an adapter layer and its own release process. Worth revisiting if a third app needs tours. |

**Port the latest Rafeeq versions**, including the later fixes: the ring stays
inside the visible screen and clear of labels and corners, steps whose target
is missing are skipped, taps pass through while a step's target is still being
looked for, the back button only skips once a step is on screen, and the
gesture glyph is a touch dot (not a hand).

## Architecture

All new code lives in `src/features/onboarding/`. `FirstRunCurrency.tsx` is
removed and its currency list and guessing logic move into the welcome slides.

| Unit | Responsibility | Port from Rafeeq |
|---|---|---|
| `onboardingStore.ts` | Read/write `budgy-onboarding-v1`; one-time init (new vs existing user); mark tours and releases seen; reset seen tours. Pure, no React. | `onboardingStore.ts` |
| `tourCatalog.ts` | Data only: welcome slide ids, every tour (`id`, `steps[]`), `RELEASES`. Copy is i18n keys. | `tourCatalog.ts` |
| `tourLogic.ts` | Pure rules: unseen releases, a page's pending tours in order, ring box and card placement, target resolution, queue/gating decisions. | `tourLogic.ts` |
| `SlideDeck.tsx` (+ CSS) | Full-screen slide shell: illustration, title, body, dots, Skip, Previous/Next, pointer swipe mirrored for RTL (reuse Budgy's `core/utils/swipe.ts`). | `SlideDeck.tsx` |
| `WelcomeSlides.tsx` | `SlideDeck` with the language slide first and the currency slide last. | `WelcomeSlides.tsx` |
| `WhatsNew.tsx` | `SlideDeck` with one slide per unseen release feature, each with **Show me**. | `WhatsNew.tsx` |
| `illustrations.tsx` | Line-art SVGs, stroke `currentColor`, drawn in `--ion-color-primary`. | `illustrations.tsx` (new drawings) |
| `TourProvider.tsx` | Context: single queue of tour requests, gating, persisting "seen", `requestTours()` / `cancelTours()` / replay functions. Renders the decks and the overlay. | `TourProvider.tsx` |
| `SpotlightOverlay.tsx` (+ CSS) | Portal overlay: dim, ring cutout around the target, card, gesture glyph. | `SpotlightOverlay.tsx` |
| `usePageTour.ts` | `usePageTour(tourIds, { ready, overOverlay })`, keyed off Ionic's enter/leave lifecycle. | `usePageTour.ts` (as is) |
| `ToursSettingsSection.tsx` | The Settings section (below). | the Settings part of Rafeeq's settings page |

Copy goes into `src/core/i18n/locales/en.json` and `ar.json` under the existing
`onboarding` key: `onboarding.slides.*`, `onboarding.tours.<tourId>.<step>.{title,body}`,
`onboarding.controls.*` (Skip, Next, Previous, Done, Get started, Show me,
"Step {{n}} of {{total}}"), `onboarding.settings.*`. Rafeeq's
`onboardingCopy.ts` is not ported.

### Wiring

- `TourProvider` goes **inside** `IonReactRouter` in `App.tsx`, wrapping the
  menu and tabs, so it can navigate for "Show me" and see the location.
- **Editor tour:** `TxEditorProvider` currently sits outside `IonReactRouter`.
  Move it inside `TourProvider` (my call) so `TransactionEditor`, which mounts
  when the editor opens, can call `usePageTour(['editor'], { overOverlay: true })`.
- **Launch popups:** `BackupReminder` (a toast) and `AutoScan` (no UI of its
  own) are held until `welcomeDone`, so nothing appears over the welcome slides.
- **Init:** `main.tsx` already learns from `openData()` whether the database was
  just seeded (`fresh`). Replace `markFirstRun()` with
  `initOnboarding({ fresh })`, which runs only when `budgy-onboarding-v1` is
  not yet stored (see Trigger rules).
- **Targets:** elements get `data-tour="<tourId>.<stepKey>"`. A target is
  resolved inside the active Ionic page only
  (`.ion-page:not(.ion-page-hidden)` within the tabs outlet), because Ionic
  keeps left pages mounted. Tours flagged `overOverlay` (the editor) resolve
  inside the topmost presented `ion-modal` instead.
- **Back button:** Budgy has no overlay registry. The overlay and the decks
  listen for `ionBackButton` and `register(<priority>, skip)` with a priority
  above the page handlers (Transactions and Bank texts use 100; use 200), as
  Budgy's pages already do. Back = Skip. Like Rafeeq, only once the step's card
  is on screen.

## Data model

```ts
// localStorage key: budgy-onboarding-v1
interface OnboardingState {
  welcomeDone: boolean;
  seenTours: string[];
  seenReleases: string[];
}

type Gesture = 'swipe' | 'longPress' | 'tap' | 'drag';

interface TourStep {
  key: string;            // data-tour="<tourId>.<key>"; copy onboarding.tours.<tourId>.<key>.{title,body}
  gesture?: Gesture;
  union?: boolean;        // ring around all elements carrying this key (Rafeeq's unionBox)
}

const TOURS: Record<TourId, TourStep[]>;
// Tours shown over a sheet (the editor) are asked for with usePageTour(..., { overOverlay: true }).

interface ReleaseFeature {
  key: string;            // unique across ALL releases; this is what seenReleases stores
  art: IllustrationId;    // copy: onboarding.releases.<key>.{title,body}
  route: string;          // "Show me" destination
  tourId: TourId;         // played on arrival
  platforms?: string[];   // Capacitor platform names; everywhere when absent (e.g. ['android'] for bank texts)
}

interface Release { features: ReleaseFeature[] }   // ALL_RELEASES, oldest first
// RELEASES = releasesForPlatform(ALL_RELEASES, Capacitor.getPlatform())
```

This is Rafeeq's **current** model, not its older spec's (my call, from the
"port the latest versions" decision): no `optional` flag (every step whose
target is missing is skipped, see Robustness), `seenReleases` stores feature
keys, and features can be limited to a platform, which Budgy needs because bank
texts exist only on Android. Nothing reads `package.json`'s version.

**`RELEASES` starts empty**: the app hasn't reached production yet, so
everything in it is covered by the welcome slides and page tours. The first
entry gets added with the first feature shipped after this.

## Trigger rules

### First launch of this build (`budgy-onboarding-v1` not stored)

- **New user**, when `fresh` is true **or** the old `budgy-pick-currency` flag
  is still set (installed on an older build but never picked a currency):
  store `{ welcomeDone: false, seenTours: [], seenReleases: [] }`, remove
  `budgy-pick-currency`, show `WelcomeSlides`.
- **Existing user** (the closed testers): store
  `{ welcomeDone: true, seenReleases: <all current ids>, seenTours: [] }`.
  No slides. Page tours play as they visit each page.
- A user who signs in on a new phone and pulls their cloud data counts as new
  (the local database was fresh), so they see the slides. That's intended.

### Welcome slides

- Finishing marks `welcomeDone: true` and all current releases seen.
- **Skip jumps to the currency slide**, not out of the deck. The currency must
  be picked before the app is used, as today. Its button is "Get started".
- If the app is closed before finishing, the slides come back next launch.

### Later launches

- `RELEASES` ids not in `seenReleases` → `WhatsNew`, oldest first. Skip or Done
  marks them seen. **Show me** marks them seen, closes the deck, navigates to the
  route, and the page's `usePageTour` plays the pending tour.

### Page tours

- `usePageTour([...ids], { ready })` requests each listed tour not in
  `seenTours`, in order, while the page is the visible one and `ready`
  (its data has loaded, e.g. the same flag passed to `useRevealWhen`).
- **Seen** when completed or skipped (including via back).
- **Not seen** when cut short by navigation, or when none of its steps found a
  target. It retries on the next visit.

### Gating: a request waits (and isn't dropped) while

- a deck or another tour is running (single queue)
- any Ionic overlay is open: a presented `ion-modal`, `ion-alert`,
  `ion-popover`, `ion-action-sheet`, `ion-picker`, or the side menu is open.
  The exception is a tour with `overOverlay` asked for by that overlay (the
  editor tour).
- the page is in selection mode (`body.b-selecting`)
- the page's `ready` is false

Requests are dropped when the user leaves the page.

### Settings → Tours & tips

A new section at the bottom of `SettingsPage`:

| Row | Action |
|---|---|
| Show welcome slides | Replays the slides **without the currency slide** (currency lives in Settings already). Changes nothing except the language, if picked again. |
| Replay page tips | Clears `seenTours`; toast "Tips will show again as you visit each page." |
| What's new | Reopens the most recent release's deck. Hidden while `RELEASES` is empty. |

### Shipping a feature later (checklist, copy into the module's top comment)

1. Add a tour with a new id to `tourCatalog.ts`, `data-tour` attributes on its
   targets, and the id to the page's `usePageTour` list.
2. Add a `Release` entry: illustration, copy key, route, tourId.
3. Add the en/ar strings.

## Content

### Welcome slides

| # | Content | Illustration |
|---|---|---|
| 1 | "Welcome to Budgy" + **English / العربية** buttons that switch at once (`i18n.changeLanguage`; direction flips) | brand mark |
| 2 | Log in two taps: tap a category, type the amount. Budgets fill as you spend | category bubble + keypad |
| 3 | All your money in one place: accounts, credit cards, debts, several currencies | wallet + card |
| 4 | See where it goes: transactions by day, the trend, budgets | bar chart |
| 5 | Yours, on your phone: no ads, works offline. Sign in to sync and back up | phone + cloud |
| 6 | Currency pick (the current chip grid, guess first) → **Get started** (`Continue with {{currency}}` stays as the button text) | coins |

The currency slide keeps today's behaviour: if the pick differs from the
default, `update({ currency })` and move the unused starting accounts with
`moveAccountsToCurrency`.

### Spotlight tours

✋ marks a gesture step. Target = the element that gets the `data-tour` attribute.

| Tour id | Trigger | Steps (key → target) |
|---|---|---|
| `categories` | first visit `/categories` (the landing tab) | `bubble` → first category bubble (tap to log spending in it); `center` → `.b-catgrid__center` (tap to switch expenses/income); ✋`period` swipe → `PeriodBar` (tap to pick a period, swipe the page to move between months); `balance` → `.b-apphead__balance` (tap to choose which accounts count); `edit` → the edit button (add, edit, and ✋drag to reorder in edit mode); `menu` → `.b-apphead__me` (Profile, Settings, Data, Bank texts) |
| `accounts` | first visit `/accounts` | ✋`tabs` swipe → `.b-tabs` (Accounts / Debts / Finances; swipe to move between them); `transfer` → the Transfer button; `add` → the add button; `row` (optional) → first account row (tap to edit; a credit card opens its statement) |
| `transactions` | first visit `/transactions` | `add` → the FAB; ✋`row` longPress (optional) → first transaction row (long-press to select several: delete, change date/account/category, filter by them, see their sum); `search` → the search toggle |
| `overview` | first visit `/overview` | `tiles` → `.b-tiles`; `trend` → the trend card; `budgets` (optional) → the budgets card |
| `editor` (`overOverlay`) | first time the transaction editor opens | `fromto` → `.b-fromto` (where the money comes from and goes to); `keypad` → `.b-keypad` (type sums like 120+35); `date` → the date key; `note` → `.b-note` |
| `settings` | first visit `/settings` | `currency` → main currency row (rates for other currencies below it); `tours` → the Tours & tips section |
| `sms` | first visit `/sms` (only reachable where bank texts exist) | `scan` → `.b-scanbtn`; ✋`card` longPress (optional) → first text card (select several to file in one category, combine, or take money off a purchase) |

Copy: a title of 2–5 words and a body of 1–2 lines, in English and Arabic.

## UI

**Slides**: full-screen layer above everything; background `--b-bg`; Skip at
the top start; dots then Previous/Next at the bottom; pointer swipe between
slides mirrored in RTL; width capped like Budgy's pages; safe-area insets
respected.

**Spotlight**: dim `rgba(0,0,0,.72)`; rounded cutout around the target padded
6px with a 2px `--ion-color-primary` ring. Taps on the dim and on the target are
swallowed; only the card acts. Off-screen targets are scrolled into view in
their `IonContent` first. Re-measures on scroll, resize and rotation.

**Card**: `--b-surface`, `--b-border` plus a primary accent, Budgy's sheet
radius. Title, body, step dots, Previous (from step 2), Next / Done, Skip. Sits
at the bottom above the tab bar; moves to the top when the target's centre is in
the lower 40% of the screen.

**Gesture glyph**: a touch dot animating the gesture over the target (swipe,
long-press pulse, tap, drag). Static under `prefers-reduced-motion`.

**Accessibility**: `role="dialog"`, `aria-modal`, focus moved to the card,
`aria-live="polite"` step counter, 44px touch targets, existing type tokens.

Light and dark themes both use tokens only, no hard-coded colours except the
dim.

## Robustness

- Missing or zero-sized target after ~1.5s of retries → step skipped
  (Rafeeq's `nextShowable`). No step shown → tour not marked seen
  (`shouldMarkSeen`), so it retries on the next visit. This applies to every
  step alike.
- Blocked localStorage → reads as everything seen (no slides, no tours).
- Navigation mid-tour (tab tap, back, menu link) ends the tour, not seen.
- Language switched on slide 1 re-renders the deck in that language and flips
  direction.
- Empty pages: steps on the first row or first card skip when there are none.
  The steps marked "(optional)" in the tours table are just the ones expected
  to be missing sometimes; there's no flag for it.

## Testing

- **Vitest** (the repo runs `src/**/*.test.ts` in a Node environment, so tests
  stay on pure functions with a stubbed `localStorage`):
  - `onboardingStore.test.ts`: new vs existing init (`fresh`, the
    `budgy-pick-currency` flag, neither), blocked storage, mark seen, reset.
  - `tourLogic.test.ts`: unseen releases, pending tours in order, card
    placement thresholds, ring kept inside the screen, gating decisions.
  - A catalog check: every tour step has en and ar title/body strings, and every
    release's tourId exists.
- `npm run typecheck` and `npm test`.
- **Manual** on `npm run dev`: light/dark × en/ar; the new-user path (clear site
  data); the existing-user path (keep data, remove `budgy-onboarding-v1`); a
  fake release in `RELEASES`; replay from Settings; back/Skip mid-tour.
- Android on-device layout is checked by the user. No `cap sync` or builds.

## Left to the builder

- The illustrations' exact drawings.
- Exact copy wording within the length limits, and the Arabic.
- File split inside `src/features/onboarding/` beyond the units above.
- How the welcome deck's currency slide reuses the chip grid (extract a small
  `CurrencyChips` component or inline it).
- What Previous does on the currency slide after a Skip (back to the slide
  Skip was pressed on is fine).
- Where the drag glyph sits on the categories `edit` step.
