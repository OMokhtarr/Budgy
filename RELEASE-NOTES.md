# Release Notes

Play Console "What's new" text, one section per build, newest first.
Paste the release name and the block under the latest heading straight into the release form.
Play caps the release name at **50 characters** and each language at **500 characters**.
The release name is only shown in Play Console, never to users.

Before adding a section, raise `versionCode` (and `versionName` if it's a new version) in
`android/app/build.gradle`. The heading and release name use those two numbers.

---

## 1.0 (versionCode 1) — 2026-11-14

**Release name:** `1 (1.0)`

The first build for Play, going to internal testing and then the closed test (see
`docs/play-store.md`). There's nothing to compare it with, so the notes introduce the app instead of
listing changes. If a build 1 was already uploaded, raise `versionCode` to 2 and rename this heading.

SMS import is left out: `READ_SMS` is debug-only, so release builds don't have it. Credit cards were
added after the store listing text was written (2026-11-07), so the full descriptions in
`docs/play-store.md` don't mention them yet.

```
<en-US>
• Add a transaction in seconds: tap a category, type the amount, with a calculator keypad
• Accounts with live balances, transfers, savings and more than one currency
• Credit cards: limit, statement, what's left to pay, and due date reminders
• Debts: keep track of who owes you and whom you owe
• Overview: income, spending, trends and monthly budgets
• Works offline. Optional Google or Apple sign-in backs up and syncs your data
• English and Arabic, light and dark themes
</en-US>
<ar>
• أضف معاملة في ثوانٍ: اختر الفئة واكتب المبلغ، مع لوحة أرقام بآلة حاسبة
• حسابات بأرصدة مباشرة وتحويلات وادخار وعملات متعددة
• بطاقات الائتمان: الحد وكشف الحساب والمتبقي للسداد وتذكير بموعد الاستحقاق
• الديون: تابع من يدين لك ولمن تدين
• نظرة عامة: الدخل والمصروفات والاتجاهات والميزانيات الشهرية
• يعمل دون إنترنت، وتسجيل دخول اختياري عبر Google أو Apple لنسخ بياناتك احتياطيًا ومزامنتها
• العربية والإنجليزية، والوضعان الفاتح والداكن
</ar>
```
