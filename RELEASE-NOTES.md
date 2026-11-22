# Release Notes

Play Console "What's new" text, one section per build, newest first.
Paste the release name and the block under the latest heading straight into the release form.
Play caps the release name at **50 characters** and each language at **500 characters**.
The release name is only shown in Play Console, never to users.

Before adding a section, raise `versionCode` (and `versionName` if it's a new version) in
`android/app/build.gradle`. The heading and release name use those two numbers.

---

## 1.0 (versionCode 7) — 2026-11-22

**Release name:** `7 (1.0)`

Instalments from bank texts, and the credit card minimum payment and cash withdrawal fee. Built with the same
`.env.local` as build 6 (`VITE_PRO_GATE=test`), so the notes don't mention Budgy Pro. Still has `READ_SMS`, so it
can only roll out once Play approves the Permissions Declaration Form.

Build 6 was still in review when this was written, so the testers on build 4 may go straight to build 7. That's
why these notes introduce bank texts again, more briefly, before the new parts.

```
<en-US>
• Bank texts: Budgy can turn your bank's texts into transactions for you to review. Open the menu, then Bank texts. Only the senders you choose are read, and the texts never leave your phone
• Confirm a credit card text as instalments, or start a plan at the instalment you're on
• Card minimum payment: the card page shows about how much it is, and reminders mention it
• Taking cash out on a credit card? Budgy offers to add the bank's fee
</en-US>
<ar>
• رسائل البنك: يستطيع Budgy تحويل رسائل البنك إلى معاملات تراجعها بنفسك. افتح القائمة ثم رسائل البنك. لا تُقرأ إلا رسائل الأرقام التي تختارها، والرسائل لا تغادر هاتفك
• أكّد رسالة بطاقة الائتمان كأقساط، أو ابدأ الخطة من القسط الذي وصلت إليه
• الحد الأدنى للسداد: تعرض صفحة البطاقة قيمته التقريبية، وتذكره التذكيرات
• سحبت نقودًا ببطاقة الائتمان؟ يعرض Budgy إضافة رسوم البنك
</ar>
```

---

## 1.0 (versionCode 6) — 2026-11-21

**Release name:** `6 (1.0)`

Bank texts, the first release with `READ_SMS` in the main manifest. It can only roll out once Play approves the
Permissions Declaration Form (`TODO.md` → SMS import). Built with the same `.env.local` as build 4
(`VITE_PRO_GATE=test`), so the notes don't mention Budgy Pro.

Build 5 was uploaded to Closed testing as a draft and never released: `READ_SMS` made Play require a phone
radio and drop 4,508 devices. Build 6 marks it optional and replaces it, with the same notes.

```
<en-US>
• Bank texts: Budgy can read your bank's texts and turn them into transactions for you to review. Open the menu, then Bank texts, to turn it on
• Only texts from the bank senders you choose are read, and the messages never leave your phone
• Save several texts at once, combine them into one purchase, or mark money that came back
</en-US>
<ar>
• رسائل البنك: يستطيع Budgy قراءة رسائل البنك وتحويلها إلى معاملات تراجعها بنفسك. افتح القائمة ثم رسائل البنك لتفعيلها
• لا تُقرأ إلا رسائل أرقام البنوك التي تختارها، والرسائل نفسها لا تغادر هاتفك
• احفظ عدة رسائل معًا، أو ادمجها في عملية شراء واحدة، أو سجّل المبالغ المستردة
</ar>
```

---

## Next: the release that turns on Budgy Pro (raise versionCode first)

**Draft, not for a build yet.** Use it for the release built with `VITE_PRO_GATE=on`. Raise `versionCode` (and
`versionName`) first, then put them in this heading and the release name. Existing testers get promotional Pro
from the owner (`TODO.md`), so say that sync is now part of Budgy Pro.

```
<en-US>
• Budgy Pro is here: bank texts and sync across your phones are now part of Budgy Pro
• Start with a free trial, then choose monthly, yearly or lifetime
• Everything else stays free, including credit cards
• Your data stays on your phone. Without Pro, sync pauses and bank texts stop being read
</en-US>
<ar>
• وصل Budgy Pro: الرسائل المصرفية والمزامنة بين هواتفك أصبحت الآن ضمن Budgy Pro
• جرّبه مجانًا خلال فترة تجريبية، ثم اختر الاشتراك الشهري أو السنوي أو مدى الحياة
• كل ما عدا ذلك يبقى مجانيًا، ومنه بطاقات الائتمان
• تبقى بياناتك على هاتفك. وبدون Pro تتوقف المزامنة ولا تُقرأ الرسائل المصرفية
</ar>
```

---

## 1.0 (versionCode 4) — 2026-11-21

**Release name:** `4 (1.0)`

Credit cards: the due-date rule, the card page and instalments, with reminders for the next statement. Built with
the same `.env.local` as build 3 (`VITE_PRO_GATE=test`), so the notes don't mention Budgy Pro. Bank texts are still
left out of release builds.

```
<en-US>
• Credit cards: choose when payment is due, a day of the month or a number of days after the statement
• New card page: what's left to pay, this cycle's spending, and how long a purchase has before it's due
• Pay a card purchase in instalments: one instalment a month on your statement and in your budget, with optional automatic payments
• Card reminders before each due date, even if you don't open Budgy
</en-US>
<ar>
• بطاقات الائتمان: اختر موعد السداد، يومًا من الشهر أو عدد أيام بعد كشف الحساب
• صفحة جديدة للبطاقة: المتبقي للسداد، ومصروفات الدورة الحالية، والمدة المتاحة قبل استحقاق أي شراء
• ادفع مشتريات البطاقة بالتقسيط: قسط واحد شهريًا في كشف حسابك وفي ميزانيتك، مع دفع تلقائي اختياري
• تذكيرات البطاقة قبل كل موعد استحقاق، حتى إن لم تفتح Budgy
</ar>
```

---

## 1.0 (versionCode 3) — 2026-11-20

**Release name:** `3 (1.0)`

Recurring transactions, phone reminders, app lock and the new Settings. Budgy Pro is in this build but not
switched on (`VITE_PRO_GATE` isn't `on`), so the notes don't mention it. Build 2 (2026-11-19) got no notes of its
own, so these cover everything testers see since build 1. Bank texts are still left out of release builds.

```
<en-US>
• New: recurring transactions. Rent, salary and subscriptions come back on their day, added with one tap or automatically
• Phone reminders on the day a recurring transaction is due and before a credit card's due date
• Lock Budgy in Settings asks for your fingerprint, face or phone PIN when Budgy opens
• Hold a category to see its transactions
• Welcome slides and page tips, which you can replay from Settings
• Settings rearranged, and back now leaves menu pages
</en-US>
<ar>
• جديد: المعاملات المتكررة. الإيجار والراتب والاشتراكات تعود في يومها، وتُضاف بلمسة واحدة أو تلقائيًا
• تذكيرات على الهاتف في يوم استحقاق المعاملة المتكررة وقبل موعد سداد بطاقة الائتمان
• قفل Budgy في الإعدادات يطلب بصمتك أو وجهك أو رمز الهاتف عند فتح Budgy
• اضغط مطولًا على فئة لرؤية معاملاتها
• شرائح ترحيب ونصائح للصفحات، ويمكنك إعادة عرضها من الإعدادات
• إعدادات بترتيب جديد، وزر الرجوع يخرج من صفحات القائمة الآن
</ar>
```

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
