package com.budgymoney.app;

import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.os.LocaleListCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Budgy's language as Android's per-app language. Native screens, such as RevenueCat's paywall, take their
 * language and direction from the app's locale; the web app's dir="rtl" doesn't reach them. On Android 13+ the
 * whole app follows it and it shows in the system's App languages setting (res/xml/locales_config.xml); on older
 * versions AppCompat applies it to AppCompat activities only.
 */
@CapacitorPlugin(name = "AppLocale")
public class AppLocalePlugin extends Plugin {

    /** tag: a language tag such as "ar" or "en"; "" follows the phone's language. */
    @PluginMethod
    public void setLanguage(PluginCall call) {
        LocaleListCompat locales = LocaleListCompat.forLanguageTags(call.getString("tag", ""));
        getBridge().executeOnMainThread(() -> {
            // An unchanged language would still put the activities through a configuration change.
            if (!AppCompatDelegate.getApplicationLocales().equals(locales)) {
                AppCompatDelegate.setApplicationLocales(locales);
            }
            call.resolve();
        });
    }

    /** The per-app language as language tags ("ar", "en-US,ar"), or "" while the app follows the phone. */
    @PluginMethod
    public void getLanguage(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            JSObject ret = new JSObject();
            ret.put("tag", AppCompatDelegate.getApplicationLocales().toLanguageTags());
            call.resolve(ret);
        });
    }
}
