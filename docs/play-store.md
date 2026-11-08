# Budgy on Google Play

> Everything entered in Play Console, kept here so it can be checked and updated. Matches the app as of
> 2026-11-07: optional Google/Apple sign-in, cloud sync on Supabase, no ads, no analytics, no SMS
> access in release builds. **When the app changes, go through [When the app changes](#when-the-app-changes)
> first.**

## Release status

| # | Step | Status |
|---|---|---|
| 1 | Play Console developer account | Done |
| 2 | Google sign-in for Play builds: Android OAuth clients for the **app signing** and **upload** key SHA-1s | Done |
| 3 | Signed release bundle (`npm run android:aab:release`) | Done |
| 4 | Keystore and passwords backed up off this machine | Done |
| 5 | Store listing: text and graphics | Ready below, not entered yet |
| 6 | App content forms: Data safety and declarations | Ready below, not entered yet |
| 7 | Internal test → closed test (12+ testers, 14 days in a row) → apply for production | Testers group ready; publish a build to the closed track for it |

Before every upload:
- Raise `versionCode` in `android/app/build.gradle`, because Play refuses a number it has already seen.
- Make sure `.env` has the production Supabase and Google values.

The bundle is written to `android/app/build/outputs/bundle/release/app-release.aab`.

## Links

| What | URL |
|---|---|
| Privacy policy | https://omokhtarr.github.io/Budgy/privacy.html |
| Account deletion | https://omokhtarr.github.io/Budgy/delete-account.html |
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
Budgy makes tracking your money quick: tap a category, type the amount, done.

EVERYTHING IN ONE PLACE
• Categories around a spending donut for the current period, with monthly budgets and subcategories
• Accounts with live balances, transfers, savings groups and archived accounts
• Debts: keep track of who owes you and whom you owe
• My finances: assets, debts and net worth per currency
• Overview: income, expenses, net, daily average, trends and budget progress

BUILT FOR REAL LIFE
• Multiple currencies, with exchanges at the rate you actually got
• A calculator keypad when adding transactions (250+120 → 370)
• Day, week, month, year or custom periods. Swipe to move between them
• Search, plus bulk edits to change the date, account or category of several transactions at once
• English and Arabic, light and dark themes

YOUR DATA, YOUR CHOICE
• Works fully offline. Without an account, your data never leaves your phone
• Optional Google or Apple sign-in backs up your data and keeps it the same across your devices
• CSV export and import, plus backup and restore files
• No ads, no analytics, and your data is never sold or shared
• Delete your account and all its data from inside the app at any time
```

### Full description (Arabic)

```
مع Budgy يصبح تتبّع أموالك سريعًا: اختر الفئة، اكتب المبلغ، وانتهى.

كل شيء في مكان واحد
• فئات حول مخطط دائري لمصروفات الفترة، مع ميزانيات شهرية وفئات فرعية
• حسابات بأرصدة مباشرة وتحويلات ومجموعات للادخار وأرشفة للحسابات
• الديون: تابع من يدين لك ولمن تدين
• أموالي: الأصول والديون وصافي الثروة لكل عملة
• نظرة عامة: الدخل والمصروفات والصافي والمتوسط اليومي والاتجاهات وتقدّم الميزانية

مصمَّم للحياة اليومية
• عملات متعددة، مع التحويل بالسعر الذي حصلت عليه فعلًا
• لوحة أرقام بآلة حاسبة عند إضافة المعاملات (250+120 ← 370)
• يوم أو أسبوع أو شهر أو سنة أو فترة مخصّصة، واسحب للتنقل بينها
• بحث، وتعديل عدة معاملات معًا لتغيير التاريخ أو الحساب أو الفئة
• العربية والإنجليزية، والوضعان الفاتح والداكن

بياناتك، واختيارك
• يعمل بالكامل دون إنترنت. بدون حساب، لا تغادر بياناتك هاتفك
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
- **Not collected:** location, contacts, photos and videos, files, messages, health, web browsing, app
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
| Sensitive permissions | None in the release build (`READ_SMS` is debug-only, in `android/app/src/debug/AndroidManifest.xml`) |

## When the app changes

Check these before releasing a change of the kind listed:

| If you… | Update |
|---|---|
| Sync a new kind of data, or add a field to what's uploaded | Data safety types and purposes, `docs/privacy-policy.md`, and the `gh-pages` privacy pages |
| Add an SDK (analytics, crash reporting, ads, push, payments) | Data safety (crash logs, device IDs, etc.), the Ads declaration, the privacy policy, and "No ads, no analytics" in both descriptions |
| Add a sign-in method | The account creation methods question, the privacy policy, and the descriptions |
| Change how deletion works | The delete account URL page, the partial deletion question, and the privacy policy |
| Add a permission, e.g. `READ_SMS` for SMS import | Permissions Declaration Form, Data safety (SMS → Messages), the privacy policy, a demo video, and the descriptions. See the SMS stage 3 items in `TODO.md` |
| Add or remove a visible feature | Full descriptions (both languages) and the screenshots (re-run `scripts/store-assets`) |
| Change the look of a screen that's in a screenshot | Re-run `scripts/store-assets` |
| Fix the Arabic "$US" amounts | Add the Arabic Overview, Budgets and Transactions shots back (see `scripts/store-assets/README.md`) |
| Change the app name, icon or brand colour | App name rows, `store/icon-512.png`, and the feature graphics |

After an update, change the date in the note at the top of this file.
