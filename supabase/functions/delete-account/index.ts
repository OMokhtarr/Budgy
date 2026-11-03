// Deletes the signed-in user's Budgy account. The App Store and Google Play both require in-app deletion.
// Deleting the auth user removes all their synced rows too (`on delete cascade` in the sync migration).
// It needs the secret key (ctx.supabaseAdmin), which is why this runs here and never in the app.
//
// The app calls it with the user's session, then signs out locally. Deleting a user doesn't revoke an
// access token that was already issued (it stays valid until it expires), but every row is gone by then.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// The app runs on its own origin (https://localhost in the Capacitor WebView, or the web build's
// domain), so the browser sends a CORS preflight first.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const deleteAccount = withSupabase({ auth: "user" }, async (req, ctx) => {
  if (req.method !== "POST") return Response.json({ error: "method-not-allowed" }, { status: 405 });
  // Only ever the caller's own id, taken from their verified JWT, never from the request body.
  const userId = ctx.jwtClaims?.sub;
  if (!userId) return Response.json({ error: "not-signed-in" }, { status: 401 });

  const { error } = await ctx.supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("delete-account failed", error);
    return Response.json({ error: "delete-failed" }, { status: 500 });
  }
  return Response.json({ deleted: true });
});

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    const res = await deleteAccount(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};
