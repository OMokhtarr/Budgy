# Budgy — Apple TODO

Everything for iOS and the App Store, left until after Android. The rest is in `TODO.md`.

1. [ ] **Register `com.budgymoney.app`** in the Apple developer portal. The id isn't reserved there until then.
2. [ ] **Decide about the store name.** Several other finance apps are called Budgy on the App Store.
3. [ ] **iOS project** (on a Mac with Xcode 26+): `npx cap add ios`, then the same checks as Android (icon and
   splash, the header and tab bar clearing the system bars, status bar icons following the theme).
4. [ ] **Google sign-in on iOS:** an **iOS** client (bundle id `com.budgymoney.app`, put it in
   `VITE_GOOGLE_IOS_CLIENT_ID`). Add it to the client IDs in Supabase, after the web client.
5. [ ] **Sign in with Apple** (needs a paid Apple Developer account):
   - [ ] **Code needed first:** `delete-account` doesn't revoke the user's Apple token. App Store review expects
     that when an account is deleted, so add it before submitting. `delete-account.html` tells users to
     remove the link themselves in the meantime; update it when this is done.
   - Turn on the "Sign in with Apple" capability for `com.budgymoney.app` in the developer portal and in Xcode.
   - **Supabase → Providers → Apple:** turn it on and add `com.budgymoney.app` to Client IDs. Do this in the
     dashboard, or in `supabase/config.toml` (Apple is off there, and its secrets go in `supabase/.env`), then
     `npx supabase@2.121.0 config diff` and `config push`. Before pushing, set your real web address in
     `site_url` / `additional_redirect_urls`.
   - Only if you also want it on the web: a Services ID, a `.p8` key, and `VITE_APPLE_SIGN_IN_WEB=true`.
     The secret must be renewed every 6 months.
6. [ ] **App Store privacy labels:** fill them in to match the privacy policy.
7. [ ] **Later, maybe:** sign in with Apple on Android. It needs Apple's web flow and a deep link back
   into the app.
