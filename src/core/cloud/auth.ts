import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { cloudConfig, supabase } from './client';

/**
 * Sign-in with Supabase Auth.
 * - Android / iOS: the native Google / Apple sheet returns an ID token, exchanged with
 *   `signInWithIdToken`. The provider gets a SHA-256 hash of a random nonce and Supabase the raw value,
 *   so a stolen token can't be replayed.
 * - Web: Supabase's redirect flow (`signInWithOAuth`), coming back to the Profile page.
 */

export type Provider = 'google' | 'apple';

/** Why sign-in didn't work, so the UI can say something useful (or nothing, when cancelled). */
export type SignInFailure = 'cancelled' | 'not-configured' | 'network' | 'failed';

export class SignInError extends Error {
  constructor(
    public kind: SignInFailure,
    /** The plugin's or Supabase's own error, for logs. */
    public original?: unknown,
  ) {
    super(`sign-in ${kind}`);
  }
}

/** Sorts an error from the plugin or Supabase into a SignInFailure. */
export function classifySignInError(err: unknown): SignInFailure {
  if (err instanceof SignInError) return err.kind;
  const e = err as { code?: string; name?: string; message?: string; status?: number } | undefined;
  const message = (e?.message ?? String(err)).toLowerCase();
  if (e?.code === 'USER_CANCELLED' || /cancel/.test(message)) return 'cancelled';
  // The provider isn't switched on in Supabase, or the client IDs don't match (wrong "audience").
  if (/provider is not enabled|unsupported provider|audience|client.?id/.test(message)) return 'not-configured';
  if (e?.name === 'AuthRetryableFetchError' || /failed to fetch|network|timeout|offline/.test(message)) return 'network';
  return 'failed';
}

const isNative = () => Capacitor.isNativePlatform();

/** Which sign-in buttons to show on this platform. */
export function availableProviders(): Provider[] {
  const apple = Capacitor.getPlatform() === 'ios' || (!isNative() && cloudConfig.appleOnWeb);
  return apple ? ['google', 'apple'] : ['google'];
}

let initialized: Promise<void> | null = null;
function initSocialLogin(): Promise<void> {
  initialized ??= SocialLogin.initialize({
    google: {
      webClientId: cloudConfig.googleWebClientId,
      iOSClientId: cloudConfig.googleIosClientId || undefined,
      iOSServerClientId: cloudConfig.googleWebClientId,
      mode: 'online',
    },
    // iOS only: Android's plugin rejects the whole setup, Google included, without an Apple client ID.
    apple: Capacitor.getPlatform() === 'ios' ? {} : undefined,
  }).catch((err) => {
    initialized = null; // let a later attempt try again
    throw err;
  });
  return initialized;
}

export async function sha256Hex(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomNonce(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Whether an ID token carries a nonce claim (Android's Google sign-in may not include one). */
export function tokenHasNonce(idToken: string): boolean {
  try {
    const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return 'nonce' in JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
  } catch {
    return false;
  }
}

export interface SignInResult {
  /** Apple sends the user's name only on the very first sign-in; kept for the profile. */
  fullName?: string;
}

/** Signs in; throws a SignInError. On the web the page navigates away to the provider and back. */
export async function signIn(provider: Provider): Promise<SignInResult> {
  try {
    return await doSignIn(provider);
  } catch (err) {
    throw err instanceof SignInError ? err : new SignInError(classifySignInError(err), err);
  }
}

async function doSignIn(provider: Provider): Promise<SignInResult> {
  if (!supabase) throw new SignInError('not-configured');

  if (!isNative()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/profile` },
    });
    if (error) throw error;
    return {};
  }

  if (provider === 'google' && !cloudConfig.googleWebClientId) throw new SignInError('not-configured');
  await initSocialLogin();
  const nonce = randomNonce();
  const hashed = await sha256Hex(nonce);
  const res =
    provider === 'google'
      ? // No scopes: the plugin already asks for email and profile, and Android rejects any list unless MainActivity is changed.
        await SocialLogin.login({ provider: 'google', options: { nonce: hashed } })
      : await SocialLogin.login({ provider: 'apple', options: { scopes: ['name', 'email'], nonce: hashed } });

  const result = res.result as { idToken?: string | null; profile?: { givenName?: string | null; familyName?: string | null } };
  const idToken = result.idToken;
  if (!idToken) throw new SignInError('failed');

  const { error } = await supabase.auth.signInWithIdToken({
    provider,
    token: idToken,
    nonce: tokenHasNonce(idToken) ? nonce : undefined,
  });
  if (error) throw error;

  const fullName = [result.profile?.givenName, result.profile?.familyName].filter(Boolean).join(' ');
  if (provider === 'apple' && fullName) {
    await supabase.auth.updateUser({ data: { full_name: fullName } }).catch(() => {});
  }
  return { fullName: fullName || undefined };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  // If the server can't be reached the session is still dropped on this device.
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: 'local' });
  if (isNative()) await SocialLogin.logout({ provider: 'google' }).catch(() => {});
}

/** Deletes the account and its cloud data (Edge Function `delete-account`), then signs out here. */
export async function deleteAccount(): Promise<void> {
  if (!supabase) throw new Error('cloud-disabled');
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
  // The server session is gone; just forget it on this device.
  await supabase.auth.signOut({ scope: 'local' });
  if (isNative()) await SocialLogin.logout({ provider: 'google' }).catch(() => {});
}

/**
 * After the web redirect flow, a failed sign-in comes back as ?error=…&error_description=… (or in the
 * hash). Returns the description and removes it from the address bar.
 */
export function takeRedirectError(): string | undefined {
  if (isNative()) return undefined;
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const error = params.get('error_description') ?? hash.get('error_description') ?? params.get('error') ?? hash.get('error');
  if (!error) return undefined;
  window.history.replaceState(null, '', window.location.pathname);
  return error;
}
