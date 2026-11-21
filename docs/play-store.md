# Budgy on Google Play

> Everything entered in Play Console, kept here so it can be checked and updated. Matches the app as of
> 2026-11-21: optional Google/Apple sign-in, cloud sync on Supabase, no ads, no analytics, and bank texts
> (`READ_SMS`) in release builds from versionCode 6 (build 5 was never released). **When the app changes, go through [When the app changes](#when-the-app-changes)
> first.**

## Release status

| # | Step | Status |
|---|---|---|
| 1 | Play Console developer account | Done |
| 2 | Google sign-in for Play builds: Android OAuth clients for the **app signing** and **upload** key SHA-1s | Done |
| 3 | Signed release bundle (`npm run android:aab:release`) | Done |
| 4 | Keystore and passwords backed up off this machine | Done |
| 5 | Store listing: text and graphics | Both full descriptions as below (with bank texts, without the Budgy Pro lines) sent for review 2026-11-21 with build 6. The AI asset declaration labels the assets as made or edited with AI |
| 6 | App content forms: Data safety and declarations | Data safety and App access done; `READ_SMS` Permissions Declaration Form and app-level trader status (Terms of Service in [Links](#links)) sent for review 2026-11-21 |
| 7 | Internal test → closed test (12+ testers, 14 days in a row) → apply for production | Build 4 out to the testers group 2026-11-21; build 6 in review for the same track |

Before every upload:
- Raise `versionCode` in `android/app/build.gradle`, because Play refuses a number it has already seen.
- Make sure `.env` has the production Supabase and Google values.

The bundle is written to `android/app/build/outputs/bundle/release/app-release.aab`.

## Links

| What | URL |
|---|---|
| Privacy policy | https://omokhtarr.github.io/Budgy/privacy.html |
| Account deletion | https://omokhtarr.github.io/Budgy/delete-account.html |
| Terms of Service | https://omokhtarr.github.io/Budgy/terms.html (source: `docs/terms-of-service.md`; used in the app-level trader status declaration) |
| Contact email | or.mokhtar@gmail.com |

## Store listing

**Category:** Finance

| Field (limit) | English | Arabic |
|---|---|---|
| App name (30) | Budgy: Budget & Spending | Budgy: الميزانية والمصروفات |
| Short description (80) | Track spending, income and budgets. Works offline, with optional cloud backup. | تتبّع مصروفاتك ودخلك وميزانياتك. يعمل دون إنترنت مع نسخة احتياطية اختيارية. |

Character counts on 2026-11-07: name 24 / 27, short description 78 / 75. Recount after any edit.

### Full description (English, 4,000 max)

```
Budgy makes tracking your money quick: tap a category, type the amount, done. Or let Budgy read your bank's texts and turn them into transactions for you.

BANK TEXTS, TURNED INTO TRANSACTIONS
• Budgy reads your bank's texts on your phone, only from the bank senders you choose, and only once you turn it on
• Each text becomes a transaction to review, with the account and category Budgy learned from you
• Save several at once, combine texts into one purchase, or mark money that came back
• The messages themselves never leave your phone

EVERYTHING IN ONE PLACE
• Categories around a spending donut for the current period, with monthly budgets and subcategories
• Accounts with live balances, transfers, savings groups and archived accounts
• Debts: keep track of who owes you and whom you owe
• Recurring transactions: rent, salary and subscriptions come back on their day, added with one tap or automatically
• My finances: assets, debts and net worth per currency
• Overview: income, expenses, net, daily average, trends and budget progress

BUILT FOR REAL LIFE
• Multiple currencies, with exchanges at the rate you actually got
• A calculator keypad when adding transactions (250+120 → 370)
• Day, week, month, year or custom periods. Swipe to move between them
• Search, plus bulk edits to change the date, account or category of several transactions at once
• Phone reminders on the day a recurring transaction is due and before a credit card's due date
• English and Arabic, light and dark themes

YOUR DATA, YOUR CHOICE
• Works fully offline. Without an account, your data never leaves your phone
• Lock Budgy with your fingerprint, face or phone PIN
• Optional Google or Apple sign-in backs up your data and keeps it the same across your devices
• CSV export and import, plus backup and restore files
• No ads, no analytics, and your data is never sold or shared
• Delete your account and all its data from inside the app at any time
```

### Full description (Arabic)

```
مع Budgy يصبح تتبّع أموالك سريعًا: اختر الفئة، اكتب المبلغ، وانتهى. أو دع Budgy يقرأ رسائل البنك ويحوّلها إلى معاملات لك.

رسائل البنك تتحوّل إلى معاملات
• يقرأ Budgy رسائل البنك على هاتفك، من أرقام البنوك التي تختارها فقط، وبعد أن تفعّل الميزة بنفسك
• تتحوّل كل رسالة إلى معاملة تراجعها، بالحساب والفئة اللذين تعلّمهما Budgy منك
• احفظ عدة رسائل معًا، أو ادمجها في عملية شراء واحدة، أو سجّل المبالغ المستردة
• الرسائل نفسها لا تغادر هاتفك أبدًا

كل شيء في مكان واحد
• فئات حول مخطط دائري لمصروفات الفترة، مع ميزانيات شهرية وفئات فرعية
• حسابات بأرصدة مباشرة وتحويلات ومجموعات للادخار وأرشفة للحسابات
• الديون: تابع من يدين لك ولمن تدين
• المعاملات المتكررة: الإيجار والراتب والاشتراكات تعود في يومها، وتُضاف بلمسة واحدة أو تلقائيًا
• أموالي: الأصول والديون وصافي الثروة لكل عملة
• نظرة عامة: الدخل والمصروفات والصافي والمتوسط اليومي والاتجاهات وتقدّم الميزانية

مصمَّم للحياة اليومية
• عملات متعددة، مع التحويل بالسعر الذي حصلت عليه فعلًا
• لوحة أرقام بآلة حاسبة عند إضافة المعاملات (250+120 ← 370)
• يوم أو أسبوع أو شهر أو سنة أو فترة مخصّصة، واسحب للتنقل بينها
• بحث، وتعديل عدة معاملات معًا لتغيير التاريخ أو الحساب أو الفئة
• تذكيرات على الهاتف في يوم استحقاق المعاملة المتكررة وقبل موعد سداد بطاقة الائتمان
• العربية والإنجليزية، والوضعان الفاتح والداكن

بياناتك، واختيارك
• يعمل بالكامل دون إنترنت. بدون حساب، لا تغادر بياناتك هاتفك
• اقفل Budgy ببصمتك أو وجهك أو رمز الهاتف
• تسجيل دخول اختياري عبر Google أو Apple لنسخ بياناتك احتياطيًا ومزامنتها بين أجهزتك
• تصدير واستيراد CSV، وملفات نسخ احتياطي واستعادة
• بلا إعلانات ولا تحليلات، ولا تُباع بياناتك أو تُشارك أبدًا
• احذف حسابك وكل بياناته من داخل التطبيق في أي وقت
```

### Graphics

Files are in `store/`. To regenerate them, see [scripts/store-assets/README.md](../scripts/store-assets/README.md).

| Play field | File | Spec |
|---|---|---|
| App icon | `store/icon-512.png` | 512×512 PNG, square (Play rounds the corners) |
| Feature graphic | `store/<lang>/feature-graphic.png` | 1024×500, no alpha |
| Phone screenshots | `store/<lang>/screenshot-N.png` | 1080×1920, no alpha, 2–8 per language |

English (8), uploaded in this order:
1. See where your money goes (Categories)
2. Add a transaction in seconds
3. Income, spending and trends (Overview)
4. Stay on budget every month
5. All your accounts, any currency
6. Know who owes whom (Debts)
7. Your history, day by day (Transactions)
8. Easy on the eyes, day or night (dark mode)

Arabic (5): the English shots 1, 2, 5, 6 and 8, with Arabic captions. Overview, Budgets and Transactions
are left out until `money.format` (`src/core/contexts/SettingsContext.tsx`) stops showing "$US" in
Arabic.

## Data safety

Only data sent to Supabase when someone signs in counts as collected. Data that stays on the device
doesn't count. What's synced is defined in `supabase/migrations/20261103114647_sync_tables.sql`: the
accounts, categories, transactions and settings tables (settings include the profile name and colour).

### Data collection and security

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS to Supabase) |
| Which methods of account creation does your app support? | OAuth (Google and Apple sign-in) |
| Delete account URL | https://omokhtarr.github.io/Budgy/delete-account.html |
| Can users request deletion of some data without deleting their account? | No (optional question) |

The last answer is "No" because deleted records stay in the cloud with a deletion date, so other devices
learn about the deletion. Only deleting the account is guaranteed to remove everything.

### Data types

Tick only these. Every other type stays unticked.

| Data type | Collected or shared | Ephemeral | Required or optional | Purposes |
|---|---|---|---|---|
| Personal info → Name | Collected | No | Users can choose | App functionality, Account management |
| Personal info → Email address | Collected | No | Users can choose | Account management |
| Personal info → User IDs | Collected | No | Users can choose | App functionality, Account management |
| Financial info → Purchase history | Collected | No | Users can choose | App functionality |
| Financial info → Other financial info | Collected | No | Users can choose | App functionality |
| App activity → Other user-generated content (notes) | Collected | No | Users can choose | App functionality |

- **Not shared:** Supabase is a service provider, which Play doesn't count as sharing. Google and Apple
  only handle the sign-in itself.
- **Users can choose:** sign-in is optional, and the app works fully without it.
- **Not collected:** location, contacts, photos and videos, files, messages (bank texts are read on the
  phone only; see [Data safety for bank texts](#data-safety-for-bank-texts)), health, web browsing, app
  performance (crash logs, diagnostics), and device or other IDs.
- **Purposes never ticked:** Analytics, Advertising or marketing, Personalization, Fraud prevention,
  Developer communications.

The preview should read: no data shared with third parties, data is encrypted in transit, and you can
request that data be deleted.

## Other App content declarations

| Form | Answer |
|---|---|
| Privacy policy | https://omokhtarr.github.io/Budgy/privacy.html |
| App access | All functionality is available without special access (sign-in is optional) |
| Ads | No, the app has no ads |
| Content rating | Category "Utility, Productivity, Communication or Other"; No to every question. Expected rating: Everyone / PEGI 3 |
| Target audience | 18 and over |
| Financial features | No banking, loans, payments, crypto or investing: a personal budgeting tracker only |
| Health apps | No |
| Government apps | No |
| News apps | No |
| Sensitive permissions | `READ_SMS` (bank texts), in `android/app/src/main/AndroidManifest.xml` since 2026-11-21. Needs the Permissions Declaration Form approved before a release with it is rolled out |

### Permissions Declaration Form: READ_SMS

Play asks for this under App content → Sensitive app permissions after a build with `READ_SMS` is uploaded to
any track. Policy rechecked 2026-11-21 ("Use of SMS or Call Log permission groups"): **SMS-based money
management, e.g. apps that track and manage budget** is a listed exception for `READ_SMS`. Budgy only
requests `READ_SMS` (no `RECEIVE_SMS`, `SEND_SMS` or background reading).

| Field | Answer |
|---|---|
| Core functionality | SMS-based money management |
| Permission | `READ_SMS` |
| Demo video | Unlisted YouTube link (script below) |

How the app uses the permission:

```
Budgy is a personal budget and spending tracker. Its Bank texts feature reads the user's bank transaction texts and turns them into transactions the user reviews and saves to their budget. This is how many people in Egypt and the Middle East track card spending, since banks there send a text for every purchase.

The feature is off by default. The user turns it on in Menu → Bank texts, sees a prominent disclosure explaining what is read and kept, and then grants READ_SMS. Budgy reads only the inbox, only texts from the bank senders the user lists, and only when the user taps "Scan inbox" or, if they choose, when they open the app. It never reads in the background, never reads on receipt, and never sends texts.

Message text stays on the phone: a text waiting for review is stored locally and deleted once confirmed or dismissed. It is never uploaded, backed up or shared. Only the resulting transaction (amount, date, merchant) is kept, plus, for signed-in users, the learned sender, last card digits and merchant categories, so other phones can suggest the same account and category.
```

Why there's no alternative:

```
The SMS User Consent and SMS Retriever APIs only deliver one incoming verification message and need an app hash or a single-message prompt, so they can't read the bank transaction texts already in the inbox. Banks don't offer an API for this, so reading the inbox is the only way to bring the user's own card transactions into their budget.
```

Demo video (under a minute, screen recording on a phone or emulator with a few bank texts in the inbox):
1. Open the menu, then Bank texts. Show the "Read your bank texts" screen and tap Turn on.
2. Show the disclosure, tap Continue, then allow SMS in Android's permission prompt.
3. Add a bank sender in the gear settings, then tap Scan inbox.
4. Show the texts as transactions to review; save one and show it in Transactions.
5. Turn Bank texts off in the gear settings.

### Data safety for bank texts

No change to the [Data types](#data-types) table. Message text is only processed on the phone and never sent
anywhere, so Play doesn't count it as collected: **Messages → SMS or MMS stays unticked**. What signed-in
users sync from bank texts (the bank sender, last card digits and merchant categories in `smsLinks` and
`merchantRules`) is covered by the ticked **Financial info → Other financial info**.

## When Budgy Pro turns on

Budgy Pro (spec: `docs/superpowers/specs/2026-11-19-budgy-pro-subscription-design.md`) is in the code but
switched off (`VITE_PRO_GATE`). Everything above describes the app as it is today. **Enter these changes in
Play Console in the same release that sets `VITE_PRO_GATE=on`**, then fold them into the sections above.

### Store listing

| Field (limit) | English | Arabic |
|---|---|---|
| Short description (80) | Track spending, income and budgets. Works offline. Cloud backup with Budgy Pro. | تتبّع مصروفاتك ودخلك وميزانياتك. يعمل دون إنترنت، ونسخ سحابي مع Budgy Pro. |

Character counts on 2026-11-19: 79 / 74.

In both full descriptions, replace the sign-in line under "Your data, your choice":

```
• Budgy Pro: sign in with Google or Apple to back up your data and keep it the same across your devices. Free trial included
```

```
• Budgy Pro: سجّل الدخول عبر Google أو Apple لنسخ بياناتك احتياطيًا ومزامنتها بين أجهزتك، مع فترة تجريبية مجانية
```

In both full descriptions, replace the "No ads, no analytics" line too, because RevenueCat's purchase
analytics make it untrue:

```
• No ads, no tracking, and your data is never sold
```

```
• بلا إعلانات ولا تتبّع، ولا تُباع بياناتك أبدًا
```

Bank texts are part of Pro, so add this line at the end of the bank texts section in both descriptions:

```
• Bank texts are part of Budgy Pro, with a free trial
```

```
• رسائل البنك جزء من Budgy Pro، مع فترة تجريبية مجانية
```

### Data safety

These answers follow RevenueCat's Play Data safety guidance. Change two rows in the [Data types](#data-types)
table:

| Data type | Collected or shared | Ephemeral | Required or optional | Purposes |
|---|---|---|---|---|
| Personal info → User IDs | Collected | No | **Required** | App functionality, Account management |
| Financial info → Purchase history | Collected | No | **Required** | App functionality, **Analytics** |

- **User IDs are Required:** RevenueCat gives every install an anonymous app user ID when the app starts,
  whether or not anyone signs in or buys. Signing in swaps it for the Budgy account ID.
- **Purchase history is Required:** Pro can't be bought without the store receipt going to RevenueCat. It's
  also used for **Analytics**, because RevenueCat's dashboard charts (trials, conversions, renewals,
  cancellations) are built from it.
- **Still not shared:** RevenueCat is a service provider, like Supabase.
- **Device or other IDs:** stays unticked.
- **Notes under Data types:** "Users can choose" now covers only the sign-in rows (Name, Email address,
  Other financial info, Other user-generated content). Take Analytics out of "Purposes never ticked".
- No ads, so the Ads declaration stays "No".

### App access

Sign-in and bank texts need Budgy Pro, so choose **All or some functionality is restricted** and give the
reviewer a free way in:

1. In Play Console → Monetize with Play → Promo codes, create a **one-time code** for `budgy_pro_lifetime`.
   Give it an end date well after the review, and make a fresh one for each submission (codes are
   single-use).
2. Before submitting, redeem one yourself on a release build to check the steps below still work.
3. Paste these instructions, with the code, into App access:

```
Budgy Pro unlocks sign-in with cloud sync, and bank texts. To unlock it for free:
1. Open the menu, then Profile.
2. Under Budgy Pro, tap Get Pro and choose Lifetime.
3. In the Google Play purchase sheet, tap the payment method, choose "Redeem code" and enter: <CODE>
Budgy Pro unlocks right away.

If the code doesn't work: choose Monthly or Yearly instead and start the 7-day free trial. You can cancel
it in Google Play before it ends, at no charge.
```

### Other declarations and setup

| Item | Change |
|---|---|
| Monetization | Products, created 2026-11-19: subscription `budgy_pro` with base plans `monthly` (US$0.99) and `yearly` (US$4.99), each with a 7-day free trial for new customers (`free-trial-7d-monthly`, `free-trial-7d-yearly`; one trial per person across both plans); one-time product `budgy_pro_lifetime` (US$14.99, purchase option `lifetime`). Play shows "In-app purchases" on the listing once they exist |
| RevenueCat | Set up 2026-11-19: project "Budgy", app "Budgy (Android)", entitlement `budgy_pro`, offering `default` (Monthly → `budgy_pro:monthly`, Annual → `budgy_pro:yearly`, Lifetime → `budgy_pro_lifetime`), Customer Center on, Android key in `.env.local` |
| Privacy policy | Already updated for Pro, including RevenueCat's purchase analytics (`docs/privacy-policy.md`, 2026-11-20); the `gh-pages` pages must match before release |

## When the app changes

Check these before releasing a change of the kind listed:

| If you… | Update |
|---|---|
| Sync a new kind of data, or add a field to what's uploaded | Data safety types and purposes, `docs/privacy-policy.md`, and the `gh-pages` privacy pages |
| Add an SDK (analytics, crash reporting, ads, push, payments; RevenueCat is in from Budgy Pro) | Data safety (crash logs, device IDs, etc.), the Ads declaration, the privacy policy, and the "No ads, no tracking" line in both descriptions ("No ads, no analytics" until Budgy Pro turns on) |
| Add a sign-in method | The account creation methods question, the privacy policy, and the descriptions |
| Change how deletion works | The delete account URL page, the partial deletion question, and the privacy policy |
| Add a permission, e.g. `READ_SMS` for SMS import | Permissions Declaration Form, Data safety (SMS → Messages), the privacy policy, a demo video, and the descriptions. See the SMS import items in `TODO.md` |
| Add or remove a visible feature | Full descriptions (both languages) and the screenshots (re-run `scripts/store-assets`) |
| Change the look of a screen that's in a screenshot | Re-run `scripts/store-assets` |
| Fix the Arabic "$US" amounts | Add the Arabic Overview, Budgets and Transactions shots back (see `scripts/store-assets/README.md`) |
| Change the app name, icon or brand colour | App name rows, `store/icon-512.png`, and the feature graphics |

After an update, change the date in the note at the top of this file.
