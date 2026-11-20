# Recurring Transactions and Reminders — Design

## Why

Rent, salary, subscriptions and bills come back on a schedule, and typing them every time is the chore that makes
people stop tracking. Budgy should remember them and remind the user on the day, also with a phone notification.

The owner asked for recurring transactions with phone notifications and left the how to Claude ("dive in and tell me
what is better").

## Decisions

1. **Budgy asks, the user confirms (the default).** On its day a recurring transaction becomes *due*: a reminder line
   in the app and a phone notification. One tap opens the editor already filled in; ✓ adds it (the amount can be
   changed first, e.g. this month's electricity), and **Skip** drops this one.
   - Why not add everything automatically: bills change, months get skipped, and a payment can also arrive as a
     bank text, so it would be counted twice. Silent wrong balances are the worst thing a budget app can do. The app
     also can't run in the background, so "automatic" would still only happen when the app opens.
2. **"Add automatically" switch per recurring transaction**, for fixed amounts (salary, rent, Netflix). Those are
   added when the app opens or comes back, for every day that has come since, and the notification says so.
3. **Phone notifications** (`@capacitor/local-notifications`) on Android and iOS, scheduled on the phone, never via
   a server. One switch and a time of day in Settings → Reminders. They cover recurring transactions and
   credit-card due dates (the TODO item "Phone notifications for card due dates").
4. **Free.** Budgy Pro covers exactly bank texts and sync (Pro design §1).

## Goals

- Make any new or existing transaction repeat from the editor: daily, weekly, every 2 weeks, monthly, every
  3 months or yearly.
- See, change and stop recurring transactions in one place (Menu → Recurring).
- Due ones show at the top of Overview and Transactions and notify on the phone.
- Two synced phones never add the same occurrence twice.

## Non-goals

- End dates and "repeat N times". Stopping it is one tap; can come later.
- Custom intervals beyond the six above, and "the last Friday of the month" style rules.
- Matching a due recurring transaction to a bank text that already recorded it. The bank-text duplicate check
  already catches a text that matches a transaction that was added.
- Exact-time alarms. Android's inexact alarms are fine for a daily reminder, and the exact-alarm permission is
  restricted by Play policy.

## Anti-goals

- Adding money nobody spent. Nothing is added unless the user confirms or turned on "Add automatically".
- Losing past transactions when a recurring one is changed or stopped. They stay as they are.
- Notifications that leak amounts on a locked screen when the user wouldn't expect it: the notification shows the
  name and amount, like the in-app line. (Android shows notification content on the lock screen by the phone's
  own setting; that's the user's choice.)

## Data

A new synced table `recurring` (Dexie version 3, Supabase migration `recurring` with the same shape and RLS as the
other sync tables, and added to `LATER_TABLES` so sync goes on before the migration is deployed).

```ts
type RepeatUnit = 'day' | 'week' | 'month' | 'year';

interface Recurring extends Synced {
  /** What each occurrence adds: a transaction without its id, date and stamps. */
  tx: RecurringTx;           // type, amount, currency, accountId, toAccountId?, toAmount?, toCurrency?,
                             // categoryId?, subcategoryId?, note?, moneyBack?
  unit: RepeatUnit;
  every: number;             // 1 or 2 (weeks) or 3 (months)
  /** The first occurrence's day (YYYY-MM-DD). Its day of the month anchors monthly and yearly ones. */
  start: string;
  /** The first occurrence not yet added or skipped (YYYY-MM-DD). */
  next: string;
  auto?: true;
  createdAt: string;
}
```

- Transactions get `recurringId?: string`.
- Occurrences are counted from `start` (occurrence *n* = start + n × every units), never from the previous one, so a
  monthly one on the 31st is on the 30th in April and back on the 31st in May (as `creditCard.ts`'s `dayIn`).
- **Same id on every phone:** an occurrence's transaction id is `idFromKey('recurring:<id>:<day>')`. If two phones
  add the same day, they write the same record and "last edit wins" settles it.
- Adding or skipping an occurrence moves `next` to the one after it. Due = every occurrence from `next` up to today.
- An added occurrence is dated its day at 12:00 local time. Foreign currencies take today's saved rate, as a new
  transaction does.
- Backup files go to version 7 and carry `recurring`.

## Screens

- **Editor:** a **Repeat** button beside the date opens a small sheet: Doesn't repeat / the six choices, and the
  "Add automatically" switch. Saving a transaction with a repeat makes the recurring record (start = the
  transaction's day, next = the one after) and links the transaction to it.
  - Editing a transaction that is part of one shows its repeat on the button; tapping it opens the recurring one
    instead (below).
- **Editor, recurring mode** (from Menu → Recurring, or the button above): the same editor edits the recurring one:
  amount, accounts, category, note, the repeat and the date of the next one. Its delete button stops it
  ("Stop repeating?"; past transactions stay).
- **Editor, due mode** (from a reminder line or a notification): filled from the recurring one, dated the due day.
  ✓ adds it and moves `next`; the delete button is **Skip** for this one.
- **Menu → Recurring:** due ones first (with Add and Skip), then every recurring transaction with its amount, how
  often, and the next day; an "auto" mark on those added automatically; + adds a new one (editor with Monthly
  picked).
- **Reminder lines** at the top of Overview and Transactions, one per recurring transaction that has any due:
  "Rent · EGP 5,000 is due today" / "… was due on 3 Nov" / "… 3 due". Tapping opens the oldest in due mode.
- **Settings → Reminders** (native only): "Phone reminders" switch (turning it on asks for the permission) and the
  time of day (default 09:00).

## Notifications

- Scheduled again whenever the app opens or comes back, and whenever recurring ones, card details or the
  settings change: Budgy cancels its pending ones and schedules the next few (at most 50 in all, within the next
  60 days), so it stays inside iOS's limit of 64.
- Recurring, at the chosen time on each occurrence's day: "Rent · EGP 5,000" / "Due today. Tap to add it." or, with
  Add automatically, "Budgy adds it when you open the app." Tapping opens Budgy at Menu → Recurring.
- Credit cards with something left to pay on the statement: 3 days before the due date and on the day, at the
  chosen time. "Visa · EGP 3,200 due in 3 days" / "… due today". Tapping opens Accounts.
- The plugin restores scheduled notifications after a reboot (its boot receiver).
- Android 13+ needs the POST_NOTIFICATIONS permission (asked when the switch is turned on). If it's refused, the
  switch goes back off and says how to allow it in the phone's settings.
- Privacy: notifications are made on the phone from data already on it; nothing new leaves the phone. The privacy
  policy gets one sentence saying so. Play's Data safety form doesn't change.

## Left to the builder

- Exact wording, icons and styling, following the existing reminder lines and sheets.
- Where code lives (`src/core/utils/recurring.ts` for the date rules, `src/features/recurring/` for screens and the
  scheduler), following the project's layout.

## Owner's steps after merge

- Deploy the `recurring` Supabase migration before or with the release.
- Copy the privacy-policy sentence to the `gh-pages` pages.
- Add a `RELEASE-NOTES.md` section with the next `versionCode`.
- Check on a phone: notification permission prompt, a notification at the chosen time, tapping it, reboot.
