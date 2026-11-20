package com.budgymoney.app;

import android.app.Activity;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hides Budgy's preview in the recent-apps screen while the app lock is on. Uses
 * setRecentsScreenshotEnabled (Android 13+), which doesn't block screenshots; FLAG_SECURE, the only option on
 * older versions, would, so they keep the preview.
 */
@CapacitorPlugin(name = "AppPrivacy")
public class AppPrivacyPlugin extends Plugin {

    @PluginMethod
    public void setRecentsHidden(PluginCall call) {
        boolean hidden = Boolean.TRUE.equals(call.getBoolean("hidden", false));
        Activity activity = getActivity();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && activity != null) {
            activity.runOnUiThread(() -> activity.setRecentsScreenshotEnabled(!hidden));
        }
        call.resolve();
    }
}
