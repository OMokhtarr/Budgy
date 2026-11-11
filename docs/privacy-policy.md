# Budgy Privacy Policy

> **Published at https://omokhtarr.github.io/Budgy/privacy.html from the `gh-pages` branch.** When this
> changes, update `privacy.html` and `privacy-ar.html` there too. Keep it in line with what the app actually
> does: it matches the code as of 2026-11-11 (optional Google/Apple sign-in, cloud sync on Supabase, optional
> SMS import on Android, no ads, no analytics).

_Last updated: November 11, 2026_

Budgy ("the app") is a personal budget and spending tracker made by Omar Mokhtar ("we"). This policy
explains what data the app handles and why.

## The short version

- Without an account, **everything stays on your device**. We never see it.
- If you choose to sign in, your Budgy data is **stored in your account as a backup**, so you can get it
  back if you change phones or reinstall the app. It is used for nothing else.
- If you turn on SMS import (Android only), your bank texts are read **on your phone only**. The
  messages themselves never leave it.
- No ads, no analytics, no selling or sharing of data.
- You can delete your account and all its data from inside the app at any time.

## Data the app handles

**Your budget data:** accounts, categories, transactions, notes, budgets, currencies and exchange
rates, and your profile name and colour.
- **Not signed in:** this is stored only on your device. Backups you make are files you control.
- **Signed in:** it is also stored in our cloud database as a backup, so you can get it back on a new
  phone or after reinstalling.

**Account information, only if you sign in:** your email address and a user ID from Google or Apple,
and your name if Apple shares it on first sign-in. These identify your account and are used for
nothing else. With Apple's "Hide My Email", we only see a relay address.

**Bank text messages, only if you turn on SMS import (Android):** Budgy can read your bank's text
messages and turn them into transactions for you to review. It's off until you turn it on in
Settings → Import from SMS, and Android asks for your permission first.
- Budgy reads only texts from the bank senders you list, and only on your phone. It reads them when you
  tap "Scan inbox", or, if you turn on "Scan when the app opens", each time you open Budgy (looking only at
  texts that arrived since the last scan). It doesn't read texts in the background or when a text arrives.
- While a text waits for your review, its message is kept on your phone. It's deleted as soon as you
  confirm or dismiss it. Message text is never uploaded, backed up or shared.
- A text you confirm becomes an ordinary transaction: its amount, date and merchant. To suggest the
  right account and category next time, Budgy remembers which bank sender and last card or account
  digits belong to which of your accounts, and which category you chose for each merchant.
- **Signed in:** those learned card digits and merchant names are stored in your account with the rest
  of your Budgy data, so your other phones can use them. Each imported transaction also carries a code
  so the same text is never added twice. The code is made from the sender and the time the text
  arrived, not from what it says.
- You can review and remove learned card numbers in Settings → Import from SMS → Linked numbers.
  Turning SMS import off stops Budgy reading texts.

**Things we don't collect:** location, contacts, photos, advertising IDs, or usage analytics.

## Where the data is stored and who processes it

- **Supabase** ([supabase.com](https://supabase.com)) hosts our database and sign-in service, in the
  EU (Ireland) region. Supabase processes the data only to provide this service.
- **Google and Apple** handle the sign-in itself when you choose "Continue with Google" or
  "Continue with Apple", under their own privacy policies.
- The data is encrypted in transit (HTTPS). In the database, access rules limit each account's
  data to that account.

## Keeping and deleting your data

- **Not signed in:** data stays until you delete it in the app (Menu → Data → Erase all data) or
  uninstall the app.
- **Signed in:** cloud data is kept while your account exists.
- **Profile → Account & sync → Delete account** permanently deletes your account and all its cloud
  data. You can choose whether to keep a copy on the device.
- **Signing out** leaves your data in your account. You choose whether to keep a copy on the device.
- **Can't open the app?** See [Delete your Budgy account](https://omokhtarr.github.io/Budgy/delete-account.html).

## Children

Budgy is not directed at children under 13, and we don't knowingly collect their data.

## Changes

If this policy changes, the new version will be posted here with a new date. Significant changes
will also be announced in the app.

## Contact

Questions or requests about your data: or.mokhtar@gmail.com.
