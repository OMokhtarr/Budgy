package com.budgy.smsinbox;

import android.Manifest;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.Telephony;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.Arrays;

/**
 * Reads bank texts from the SMS inbox for Budgy's SMS import. The permission is declared by the app,
 * not here, so builds without it (release, until Play approval) report isAvailable = false.
 */
@CapacitorPlugin(name = "SmsInbox", permissions = @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS }))
public class SmsInboxPlugin extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", declaresReadSms());
        call.resolve(ret);
    }

    /** Inbox texts received at or after `since` (ms since epoch), newest first. */
    @PluginMethod
    public void list(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("SMS permission not granted", "PERMISSION");
            return;
        }
        // optLong: an epoch in ms arrives as a Long, which getDouble() returns as null.
        long sinceMs = call.getData().optLong("since", 0);
        getBridge().execute(() -> {
            String[] projection = { Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.DATE, Telephony.Sms.BODY };
            JSArray messages = new JSArray();
            try (
                Cursor c = getContext()
                    .getContentResolver()
                    .query(
                        Telephony.Sms.Inbox.CONTENT_URI,
                        projection,
                        Telephony.Sms.DATE + " >= ?",
                        new String[] { String.valueOf(sinceMs) },
                        Telephony.Sms.DATE + " DESC"
                    )
            ) {
                if (c != null) {
                    while (c.moveToNext()) {
                        JSObject m = new JSObject();
                        m.put("id", String.valueOf(c.getLong(0)));
                        m.put("address", c.getString(1));
                        m.put("date", c.getLong(2));
                        m.put("body", c.getString(3));
                        messages.put(m);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("messages", messages);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Could not read SMS", "READ_FAILED", e);
            }
        });
    }

    private boolean declaresReadSms() {
        try {
            PackageInfo info = getContext()
                .getPackageManager()
                .getPackageInfo(getContext().getPackageName(), PackageManager.GET_PERMISSIONS);
            return info.requestedPermissions != null && Arrays.asList(info.requestedPermissions).contains(Manifest.permission.READ_SMS);
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }
}
