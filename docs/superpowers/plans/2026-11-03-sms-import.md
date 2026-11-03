# SMS Import — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the parts of SMS import that don't depend on sync: the Android project, a local
native plugin that reads the SMS inbox, the bank-text parser, and the Settings section (switch,
disclosure, permission, sender keywords). Release builds ship without the feature.

**Architecture:** A local Capacitor plugin (`plugins/sms-inbox`) exposes the permission and an
inbox query and declares no permission itself. `READ_SMS` is declared only in
`android/app/src/debug/AndroidManifest.xml` until Play approves it, and the plugin reports whether
the running build declares it. The JS side shows the feature only on Android builds that declare
it, so release builds hide it with no extra flag. The parser is pure TypeScript: optional per-bank
templates first, then a generic Arabic/English fallback. Unit tests cover it.

**Tech Stack:** Ionic React 8, Capacitor 8.5, TypeScript, Vite 5, Vitest (new), Java for the plugin.

**Spec:** `docs/superpowers/specs/2026-11-03-sms-import-design.md`

## Global Constraints

- Android only. On iOS and web/PWA nothing SMS-related renders.
- Release builds must not contain `READ_SMS` in the merged manifest. The plugin's own manifest declares no permissions.
- Only `READ_SMS` is used. No `RECEIVE_SMS`, `SEND_SMS` or background reading.
- Sender match: case-insensitive "sender name contains keyword"; keywords are trimmed; empty keywords are ignored.
- Raw message text is never written to storage in this stage. Nothing here persists messages.
- SMS settings (`enabled`, `senders`, `lastScanAt`) are per-device and are **not** added to `BACKUP_KEYS`.
- All user-facing text goes through i18n, in both `en.json` and `ar.json`.
- Code style: match the surrounding code (2-space indent, single quotes, short JSDoc on exports, `@/` imports).

## Review Focus

1. **Balance mixed into the amount.** A debit text that also says "Available balance EGP 5,000.00" must yield the debit amount, never the balance. → Task 4, `ignores the balance amount`.
2. **Arabic digits and separators.** `٣٢٠٫٥٠` and `١٢٬٠٠٠` must parse as 320.5 and 12000. → Task 3, `normalizes Arabic-Indic amounts`.
3. **Thousands vs decimals.** `12,000` is twelve thousand and `450.00` is 450. → Task 3, `reads thousands separators`.
4. **Messy keywords.** ` cib `, `CIB`, `` (empty) and duplicates. Matching is trimmed and case-insensitive, empty keywords never match everything, and adding a duplicate is a no-op. → Task 2 tests, plus `addSender` in Task 7.
5. **Permission denied permanently, then granted in Android settings.** The switch stays off with instructions. When the user returns to the app, the permission is checked again, so the switch can then be turned on. → Task 7, manual check.

---

### Task 0: Git and test runner

**Files:**
- Modify: `.gitignore`
- Modify: `package.json` (devDependency `vitest`, script `test`)
- Modify: `vite.config.ts` (add `test` block)
- Test: `src/core/utils/number.test.ts`

- [ ] **Step 1: Initialize git.** The project isn't a repo yet (this is also a `TODO.md` item). Confirm with the user before running it, because they're working on sign-in in the same folder. Then run `git init`. In `.gitignore`, remove `android/` and `ios/` (Capacitor recommends committing the native folders) and add `.superpowers/`. Make an initial commit of the current tree: `git add -A && git commit -m "chore: initial commit"`.
- [ ] **Step 2: Add Vitest.** Run `npm i -D vitest@^3.2.4`. Add the script `"test": "vitest run"`. In `vite.config.ts`, add `/// <reference types="vitest/config" />` at the top and `test: { include: ['src/**/*.test.ts'], environment: 'node' }`.
- [ ] **Step 3: Add a smoke test of the existing `parseNumber`** in `src/core/utils/number.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseNumber } from './number';

describe('parseNumber', () => {
  it('reads Arabic digits and decimal comma', () => {
    expect(parseNumber('٣٢٠٫٥')).toBe(320.5);
    expect(parseNumber('12,000')).toBe(12000);
    expect(parseNumber('48,5')).toBe(48.5);
  });
});
```

- [ ] **Step 4: Run** `npm test`. Expected: 1 file, 1 test passed. Also run `npm run typecheck`. Expected: no errors.
- [ ] **Step 5: Commit:** `git add -A && git commit -m "chore: add vitest"`

---

### Task 1: Parser types and templates registry

**Files:**
- Create: `src/features/sms/parser/types.ts`
- Create: `src/features/sms/parser/templates.ts`

**Interfaces:**
- Produces:

```ts
// types.ts
export type SmsDirection = 'out' | 'in';
export type IgnoreReason = 'otp' | 'promo' | 'balance';

/** A text as read from the inbox (the native plugin returns this shape). */
export interface SmsMessage { id: string; address: string; date: number; body: string }

/** What Budgy could read from one bank text. */
export type ParsedSms =
  | { status: 'ignored'; reason: IgnoreReason }
  | {
      /** 'understood' only when amount AND direction were read with confidence. */
      status: 'understood' | 'unreadable';
      amount?: number;
      /** ISO code from CURRENCIES, e.g. 'EGP'. */
      currency?: string;
      direction?: SmsDirection;
      merchant?: string;
      /** Masked card or account digits, e.g. '4821'. */
      digits?: string;
    };

/** One bank's message formats, kept as data. Each regex's first capture group is the value. */
export interface BankTemplate {
  id: string;
  /** Tested against the sender name. */
  sender: RegExp;
  /** Tried in order; the first whose `match` hits the body is used. */
  formats: {
    match: RegExp;
    direction: SmsDirection;
    amount: RegExp;
    currency?: RegExp;
    merchant?: RegExp;
    digits?: RegExp;
  }[];
}
```

```ts
// templates.ts
/** Known bank formats. Add one per bank once real (masked) sample texts are available. */
export const BANK_TEMPLATES: BankTemplate[] = [];
```

- [ ] **Step 1: Create both files as above.** Add a short comment in `templates.ts` pointing to `parseSms.test.ts` as the place to add each bank's fixture texts.
- [ ] **Step 2: Run** `npm run typecheck`. Expected: no errors.
- [ ] **Step 3: Commit:** `git commit -am "feat(sms): parser types and template registry"` (use `git add` first for the new files).

---

### Task 2: Sender matching

**Files:**
- Create: `src/features/sms/parser/senders.ts`
- Test: `src/features/sms/parser/senders.test.ts`

**Interfaces:**
- Produces: `matchesSender(sender: string, keywords: string[]): boolean`, `normalizeKeyword(k: string): string` (trim + collapse inner whitespace; case is kept for display).

- [ ] **Step 1: Write the failing tests**

```ts
describe('matchesSender', () => {
  it('matches partial names ignoring case', () => {
    expect(matchesSender('CIB', ['cib'])).toBe(true);
    expect(matchesSender('Bank-AlAhly', ['bank'])).toBe(true);
    expect(matchesSender('NBE-Alerts', ['Bank-AlAhly'])).toBe(false);
  });
  it('ignores blank keywords and trims', () => {
    expect(matchesSender('Vodafone', ['', '  '])).toBe(false);
    expect(matchesSender('CIB', ['  cib '])).toBe(true);
  });
});
describe('normalizeKeyword', () => {
  it('trims and collapses spaces', () => expect(normalizeKeyword('  Bank   Misr ')).toBe('Bank Misr'));
});
```

- [ ] **Step 2: Run** `npx vitest run src/features/sms/parser/senders.test.ts`. Expected: FAIL, the module isn't found.
- [ ] **Step 3: Implement** both functions in `senders.ts`. Compare with `toLocaleLowerCase('en')` on both sides.
- [ ] **Step 4: Run the test again.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(sms): sender keyword matching`

---

### Task 3: Amount, currency and digits helpers

**Files:**
- Create: `src/features/sms/parser/text.ts`
- Test: `src/features/sms/parser/text.test.ts`

**Interfaces:**
- Consumes: `parseNumber` from `@/core/utils/number`, `CURRENCIES` from `@/core/contexts/SettingsContext`.
- Produces:
  - `toLatinDigits(s: string): string`: Arabic-Indic and Persian digits → 0-9, `٫` → `.`, `٬` → `,`.
  - `findAmounts(body: string): { amount: number; currency?: string; index: number }[]`: every money amount in the text, in order, with the currency written next to it (before or after) and its position.
  - `currencyOf(token: string): string | undefined`: maps aliases to ISO codes, or `undefined`.
  - `findDigits(body: string): string | undefined`: masked digits such as `**4821`, `xx4821`, `XXXX4821`, `ending 4821`, `ending with 4821`, `المنتهي ب 4821`, `رقم ****4821`. Returns the last 3–4 digits.

Currency aliases (case-insensitive): `EGP`, `LE`, `L.E`, `L.E.`, `ج.م`, `جم`, `جنيه` → `EGP`; `USD`, `$`, `دولار` → `USD`; `EUR`, `€`, `يورو` → `EUR`; `SAR`, `ريال` → `SAR`; `AED`, `درهم` → `AED`. Any other 3-letter code in `CURRENCIES` maps to itself.

- [ ] **Step 1: Write the failing tests**

```ts
it('normalizes Arabic-Indic amounts', () => {
  expect(findAmounts('تم خصم مبلغ ٣٢٠٫٥٠ ج.م')[0]).toMatchObject({ amount: 320.5, currency: 'EGP' });
  expect(findAmounts('بمبلغ ١٢٬٠٠٠ جنيه')[0]).toMatchObject({ amount: 12000, currency: 'EGP' });
});
it('reads thousands separators', () => {
  expect(findAmounts('credited with 12,000.00 EGP')[0]).toMatchObject({ amount: 12000, currency: 'EGP' });
  expect(findAmounts('EGP 450.00 at X')[0]).toMatchObject({ amount: 450, currency: 'EGP' });
  expect(findAmounts('USD20.5')[0]).toMatchObject({ amount: 20.5, currency: 'USD' });
});
it('lists every amount in order', () => {
  expect(findAmounts('debited EGP 450.00. Available balance EGP 5,000.00').map((a) => a.amount)).toEqual([450, 5000]);
});
it('does not read masked digits or dates as amounts', () => {
  expect(findAmounts('card **4821 on 03/11/2026')).toEqual([]);
});
it('finds masked digits', () => {
  expect(findDigits('Your card **4821 was')).toBe('4821');
  expect(findDigits('account xx1234 credited')).toBe('1234');
  expect(findDigits('card ending with 7781')).toBe('7781');
  expect(findDigits('من حسابكم رقم ****٧٧٨١')).toBe('7781');
  expect(findDigits('no digits here')).toBeUndefined();
});
it('maps currency aliases', () => {
  expect(currencyOf('L.E')).toBe('EGP');
  expect(currencyOf('ج.م')).toBe('EGP');
  expect(currencyOf('usd')).toBe('USD');
  expect(currencyOf('XYZ')).toBeUndefined();
});
```

- [ ] **Step 2: Run** `npx vitest run src/features/sms/parser/text.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `text.ts`. Run `toLatinDigits` first, then match one regex for "currency? number currency?". Only count a number as an amount when a currency is attached on one side; a bare number never counts. That rule keeps masked digits, dates and OTP codes out. Convert the number with `parseNumber`.
- [ ] **Step 4: Run the test again.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(sms): amount, currency and masked-digit helpers`

---

### Task 4: `parseSms`: filters, generic fallback, templates

**Files:**
- Create: `src/features/sms/parser/parseSms.ts`
- Test: `src/features/sms/parser/parseSms.test.ts`

**Interfaces:**
- Consumes: Task 1 types and `BANK_TEMPLATES`; Task 3 helpers.
- Produces: `parseSms(sender: string, body: string, templates: BankTemplate[] = BANK_TEMPLATES): ParsedSms`

Order: (1) ignore filters, (2) the first template whose `sender` matches **and** one of whose `formats[].match` matches, (3) the generic fallback.

- **Ignore filters:**
  - `otp`: OTP, one-time, verification code, `رمز`, `كود التحقق`, `كلمة المرور`, `لا تشارك`.
  - `promo`: a URL, `%`, offer, cashback, win, `عرض`, `خصم %` (a discount percentage, not `تم خصم`), `اربح`.
  - `balance`: balance or `رصيد` appears, but no direction word.
- **Generic direction words:**
  - out: debited, deducted, purchase, spent, withdrawn, payment, paid, `خصم`, `سحب`, `شراء`, `دفع`.
  - in: credited, deposited, received, refund, `إضافة`, `اضافة`, `ايداع`, `إيداع`, `استلام`, `تحويل وارد`.
  - Exactly one side must match for `direction`. If both or neither match, `direction` is undefined.
- **Amount:** the first entry of `findAmounts` that isn't preceded within ~20 characters by `balance` / `رصيد` / `available` / `المتاح`.
- **Merchant:** the text after `at ` / `from ` (in credits) / `لدى ` / `عند `, up to ` on `, a date, `.`, `,` or the end of the text, trimmed, max 40 characters.
- **`status`:** `'understood'` iff `amount` and `direction` are both set; otherwise `'unreadable'`, carrying any fields it found.

- [ ] **Step 1: Write the failing tests.** The fixtures are **synthetic** and must be labeled that way in the file. Replace or add real masked samples later.

```ts
const t = (body: string, sender = 'CIB') => parseSms(sender, body, []);

it('reads an English debit', () => {
  expect(t('Your card **4821 was debited with EGP 450.00 at CARREFOUR MAADI on 03/11/2026 10:15'))
    .toEqual({ status: 'understood', amount: 450, currency: 'EGP', direction: 'out', merchant: 'CARREFOUR MAADI', digits: '4821' });
});
it('reads an Arabic debit', () => {
  expect(t('تم خصم مبلغ ٣٢٠٫٥٠ ج.م من حسابكم رقم ****7781 لدى سوبر ماركت المعادي', 'Bank-AlAhly'))
    .toMatchObject({ status: 'understood', amount: 320.5, currency: 'EGP', direction: 'out', digits: '7781' });
});
it('reads a credit', () => {
  expect(t('Your account xx1234 has been credited with 12,000.00 EGP')).toMatchObject({ status: 'understood', direction: 'in', amount: 12000 });
});
it('ignores the balance amount', () => {
  expect(t('Card **4821 debited EGP 450.00 at UBER. Available balance EGP 5,000.00')).toMatchObject({ amount: 450 });
});
it('filters OTPs, promos and balance notices', () => {
  expect(t('Your OTP is 482913. Do not share it with anyone')).toEqual({ status: 'ignored', reason: 'otp' });
  expect(t('كود التحقق الخاص بك 4521')).toEqual({ status: 'ignored', reason: 'otp' });
  expect(t('Get 10% cashback on all purchases! Visit https://x.example')).toEqual({ status: 'ignored', reason: 'promo' });
  expect(t('Your available balance is EGP 5,000.00')).toEqual({ status: 'ignored', reason: 'balance' });
});
it('marks unclear texts unreadable but keeps what it found', () => {
  expect(t('Transaction of EGP 200.00 on card **4821')).toEqual({ status: 'unreadable', amount: 200, currency: 'EGP', digits: '4821' });
});
it('prefers a matching template over the generic reader', () => {
  const tpl: BankTemplate = {
    id: 'test-bank', sender: /^TESTBANK$/i,
    formats: [{ match: /^POS/, direction: 'out', amount: /AMT:([\d.,]+)/, currency: /CUR:(\w+)/, merchant: /MER:(.+?);/, digits: /C:(\d{4})/ }],
  };
  expect(parseSms('TestBank', 'POS AMT:99.5 CUR:EGP MER:KIOSK; C:1111', [tpl]))
    .toEqual({ status: 'understood', amount: 99.5, currency: 'EGP', direction: 'out', merchant: 'KIOSK', digits: '1111' });
});
```

- [ ] **Step 2: Run** `npx vitest run src/features/sms/parser/parseSms.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `parseSms`.** Pass template captures through `toLatinDigits` + `parseNumber` (amount) and `currencyOf` (currency).
- [ ] **Step 4: Run** `npm test`. Expected: all parser tests PASS.
- [ ] **Step 5: Commit:** `feat(sms): parse bank texts with templates and a generic fallback`

---

### Task 5: Android project and the release gate

**Files:**
- Create (generated): `android/` via `npx cap add android`
- Create: `android/app/src/debug/AndroidManifest.xml`

- [ ] **Step 1: Generate the project.** Run `npm run build && npx cap add android`. Expected: an `android/` folder. If the JDK or Android SDK is missing on this machine, stop and tell the user. Don't install toolchains without asking.
- [ ] **Step 2: Gate the permission.** Create `android/app/src/debug/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- READ_SMS for SMS import. Debug builds only until Google Play approves the Permissions
     Declaration; then move this line to src/main/AndroidManifest.xml (see the SMS import spec). -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.READ_SMS" />
</manifest>
```

- [ ] **Step 3: Verify.** Run `npm run android:apk:debug`, then `npm run android:apk:release` (if release signing isn't set up yet, use `cd android && gradlew assembleRelease` and accept an unsigned APK). Check both merged manifests with `aapt dump permissions <apk>` or Android Studio's *Merged Manifest* tab. Expected: debug lists `READ_SMS`; release does not.
- [ ] **Step 4: Commit:** `chore(android): add Android project; READ_SMS in debug builds only`

---

### Task 6: Native `SmsInbox` plugin

**Files:**
- Create: `plugins/sms-inbox/package.json`
- Create: `plugins/sms-inbox/android/build.gradle`
- Create: `plugins/sms-inbox/android/src/main/AndroidManifest.xml` (no permissions)
- Create: `plugins/sms-inbox/android/src/main/java/com/budgy/smsinbox/SmsInboxPlugin.java`
- Create: `src/features/sms/native.ts`
- Modify: `package.json` (dependency `"@budgy/sms-inbox": "file:plugins/sms-inbox"`)

**Interfaces:**
- Produces (`src/features/sms/native.ts`):

```ts
export interface SmsInboxPlugin {
  /** Whether this build declares READ_SMS (false on release builds until Play approval). */
  isAvailable(): Promise<{ available: boolean }>;
  checkPermissions(): Promise<{ sms: PermissionState }>;
  requestPermissions(): Promise<{ sms: PermissionState }>;
  /** Inbox texts received at or after `since` (ms epoch), newest first. */
  list(options: { since: number }): Promise<{ messages: SmsMessage[] }>;
}
export const SmsInbox = registerPlugin<SmsInboxPlugin>('SmsInbox');
```

(`SmsMessage` comes from Task 1. `PermissionState` and `registerPlugin` come from `@capacitor/core`.)

- [ ] **Step 1: Plugin package.** In `package.json`, set `"name": "@budgy/sms-inbox"`, `"private": true` and `"capacitor": { "android": { "src": "android" } }`. Base `build.gradle` on Capacitor 8's plugin template, reading `compileSdkVersion`, `minSdkVersion` and `targetSdkVersion` from `rootProject.ext` (defined in `android/variables.gradle`), with `namespace "com.budgy.smsinbox"` and `implementation project(':capacitor-android')`.
- [ ] **Step 2: `SmsInboxPlugin.java`.** Annotate with `@CapacitorPlugin(name = "SmsInbox", permissions = @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS }))`.
  - `isAvailable`: `getPackageManager().getPackageInfo(pkg, GET_PERMISSIONS).requestedPermissions` contains `READ_SMS`.
  - `list`: reject with code `"PERMISSION"` unless `getPermissionState("sms") == GRANTED`. Query `Telephony.Sms.Inbox.CONTENT_URI` with projection `_id, address, date, body`, selection `date >= ?`, sort `date DESC`. Return `{ messages: [{ id, address, date, body }] }`, with `id` as a string. Run the query off the main thread (`getBridge().execute(...)`).
  - `checkPermissions` and `requestPermissions` come from the base `Plugin` class.
- [ ] **Step 3: Install and sync.** Run `npm i ./plugins/sms-inbox && npx cap sync android`. Expected: the sync output lists `@budgy/sms-inbox` under Android plugins. Create `src/features/sms/native.ts` as above.
- [ ] **Step 4: Verify on a device or emulator** (debug build). Temporarily call `SmsInbox.isAvailable()` and, after granting the permission, `SmsInbox.list({ since: Date.now() - 7 * 864e5 })` from the Chrome DevTools console (`chrome://inspect`). Expected: `available: true` and an array of recent texts. On a release build, `available: false`. Don't leave the temporary calls in the code.
- [ ] **Step 5: Commit:** `feat(sms): local Capacitor plugin to read the SMS inbox`

---

### Task 7: Settings section

**Files:**
- Modify: `src/core/contexts/SettingsContext.tsx` (`Settings` + `DEFAULTS`)
- Create: `src/features/sms/useSmsAvailable.ts`
- Create: `src/features/sms/SmsSettingsSection.tsx`
- Create: `src/features/sms/senderList.ts` + `src/features/sms/senderList.test.ts`
- Modify: `src/features/settings/SettingsPage.tsx` (render the section after the General list)
- Modify: `src/core/i18n/locales/en.json`, `src/core/i18n/locales/ar.json` (new `sms` block)

**Interfaces:**
- Consumes: `SmsInbox` (Task 6), `normalizeKeyword` (Task 2).
- Produces:
  - `Settings.smsImport: { enabled: boolean; senders: string[]; lastScanAt?: string }`, default `{ enabled: false, senders: [] }`. It is **not** in `BACKUP_KEYS`.
  - `useSmsAvailable(): boolean`: true only when `Capacitor.getPlatform() === 'android'` and `SmsInbox.isAvailable()` resolves `true`. Starts `false`.
  - `addSender(list: string[], keyword: string): string[]` and `removeSender(list: string[], keyword: string): string[]` in `senderList.ts`. `addSender` normalizes the keyword and returns the list unchanged when it's blank or already present (case-insensitive).

- [ ] **Step 1: Write the failing tests** for `senderList.ts`:

```ts
it('adds normalized keywords once', () => {
  expect(addSender(['CIB'], '  Bank  AlAhly ')).toEqual(['CIB', 'Bank AlAhly']);
  expect(addSender(['CIB'], 'cib')).toEqual(['CIB']);
  expect(addSender(['CIB'], '   ')).toEqual(['CIB']);
});
it('removes a keyword', () => expect(removeSender(['CIB', 'Bank'], 'Bank')).toEqual(['CIB']));
```

- [ ] **Step 2: Run** `npx vitest run src/features/sms/senderList.test.ts`. Expected: FAIL. Implement it, then run again. Expected: PASS.
- [ ] **Step 3: Settings field.** Add `smsImport` to `Settings` and `DEFAULTS`. `load()` merges shallowly, so the default object fills it in for existing users.
- [ ] **Step 4: `SmsSettingsSection`.** It's an `IonList inset` with header `t('sms.title')`. Follow the layout in `.superpowers/brainstorm/*/content/settings-and-scan.html`. `SettingsPage` renders it only when `useSmsAvailable()` is true.
  - **Switch on:** show an `useIonAlert` disclosure (`sms.disclosureTitle` / `sms.disclosureBody`, with buttons Cancel / Continue). On Continue, call `SmsInbox.requestPermissions()`. If `granted`, set `enabled: true`. Otherwise keep it off and show `sms.permissionDenied` as an `IonNote` under the switch.
  - **Switch off:** set `enabled: false`. Keep `senders`.
  - **Permission row:** shows `sms.permissionAllowed` or `sms.permissionNotAllowed`, from `checkPermissions()`. Check again on mount and whenever the app resumes (`App.addListener('resume', …)` from `@capacitor/app`). If the permission was revoked while `enabled`, set `enabled: false`.
  - **Bank senders:** chips with a remove ✕, plus a "+ Add" chip that opens an alert with a text input and goes through `addSender`. Below them, the hint `sms.sendersHint`.
  - No "Linked numbers" row yet. It arrives in stage 2.
- [ ] **Step 5: i18n.** Add these `sms` keys to both locales, written in each language:
  - `title`: "Import from SMS"
  - `readTexts`: "Read bank texts"
  - `permission`, `permissionAllowed`, `permissionNotAllowed`
  - `permissionDenied`: how to allow SMS in Android Settings → Apps → Budgy → Permissions
  - `disclosureTitle`
  - `disclosureBody`: texts are read on this phone only; Budgy reads only texts from the senders you list and keeps the amount, date, merchant and last digits, never the full message
  - `continue`
  - `senders`: "Bank senders"
  - `addSender`, `addSenderPlaceholder`
  - `sendersHint`: only texts whose sender name contains one of these words are read
- [ ] **Step 6: Verify.**
  - Run `npm test && npm run typecheck`. Expected: pass.
  - On a debug build on a device: the section appears; turning it on shows the disclosure, then the Android prompt. Denying keeps it off and shows the note.
  - Choose "Don't allow" twice, allow SMS in Android settings, return to the app. The permission row now reads Allowed and the switch can be turned on.
  - Keywords add, dedupe and remove, and survive an app restart.
  - On `npm run dev` (web) and on a release build, the section doesn't appear.
  - Back up from Menu → Data and open the JSON. It has no `smsImport`.
- [ ] **Step 7: Commit:** `feat(sms): Settings section with disclosure, permission and sender keywords`

---

## Stage 2 (outline — plan in detail after sync Phase 1 lands)

These depend on sync's data-model conventions: UUID ids, `updatedAt`, soft delete, and the next Dexie version.

1. **Tables:** pending items (parsed fields + body while pending), seen records (SMS `_id` + fingerprint + outcome), identifier links (sender keyword + digits → account, with deterministic ids), merchant rules (normalized merchant → category). Add `smsFingerprint?: string` on `Transaction`. Backups include links and rules; they leave out pending and seen.
2. **Scan:** the sheet with "Since last scan" / 3 days / 1 week / 2 weeks / 1 month / 3 months / 6 months; `SmsInbox.list` → `matchesSender` → skip seen and any fingerprint present on a transaction → `parseSms` → pending; update `lastScanAt`.
3. **Review screen** ("Bank texts", side-menu item with a pending count, Android + enabled only): cards with Confirm / Dismiss, tap to open the editor, the "Couldn't read this one" state, quick confirm only when `understood` and the currency belongs to the account.
4. **Editor pre-fill:** extend `EditorInit` with amount, currency, date, note, a message header and an `onSaved` callback; card confirm uses the same save path.
5. **Learning + Linked numbers** screen in Settings; same-amount/same-account/same-day duplicate prompt.
6. **Before the SMS update:** move `READ_SMS` to the main manifest, then the Play Permissions Declaration, Data safety, privacy policy and demo video.
