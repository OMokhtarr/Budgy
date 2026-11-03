import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stand-ins for the platform, the native sign-in plugin and the Supabase client.
const mocks = vi.hoisted(() => ({
  platform: 'android' as 'android' | 'ios' | 'web',
  cloudConfig: { url: 'x', key: 'x', googleWebClientId: 'web-client', googleIosClientId: 'ios-client', appleOnWeb: false },
  login: vi.fn(),
  signInWithIdToken: vi.fn(),
  signInWithOAuth: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.platform !== 'web', getPlatform: () => mocks.platform },
}));
vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: { initialize: vi.fn(async () => {}), login: mocks.login, logout: vi.fn(async () => {}) },
}));
vi.mock('./client', () => ({
  cloudConfig: mocks.cloudConfig,
  supabase: {
    auth: {
      signInWithIdToken: mocks.signInWithIdToken,
      signInWithOAuth: mocks.signInWithOAuth,
      updateUser: mocks.updateUser,
    },
  },
}));

const { SignInError, availableProviders, classifySignInError, sha256Hex, signIn, takeRedirectError, tokenHasNonce } = await import('./auth');

/** An unsigned JWT-shaped token with the given claims (base64url, no padding). */
const token = (claims: object) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.sig`;

beforeEach(() => {
  mocks.platform = 'android';
  mocks.cloudConfig.googleWebClientId = 'web-client';
  mocks.cloudConfig.appleOnWeb = false;
  for (const fn of [mocks.login, mocks.signInWithIdToken, mocks.signInWithOAuth, mocks.updateUser]) fn.mockReset();
  mocks.signInWithIdToken.mockResolvedValue({ error: null });
  mocks.signInWithOAuth.mockResolvedValue({ error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
});

describe('native sign-in', () => {
  it('sends the provider the SHA-256 of the nonce, and Supabase the raw nonce', async () => {
    mocks.login.mockImplementation(async ({ options }) => ({ result: { idToken: token({ nonce: options.nonce }) } }));
    await signIn('google');
    const sentToGoogle = mocks.login.mock.calls[0][0].options.nonce;
    const { nonce: sentToSupabase, provider, token: idToken } = mocks.signInWithIdToken.mock.calls[0][0];
    expect(provider).toBe('google');
    expect(idToken).toContain('.');
    expect(await sha256Hex(sentToSupabase)).toBe(sentToGoogle);
  });

  it("leaves the nonce out when the ID token doesn't carry one (Android's Google sign-in)", async () => {
    mocks.login.mockResolvedValue({ result: { idToken: token({ sub: '1' }) } });
    await signIn('google');
    expect(mocks.signInWithIdToken.mock.calls[0][0].nonce).toBeUndefined();
  });

  it("keeps the name Apple sends on the first sign-in", async () => {
    mocks.platform = 'ios';
    mocks.login.mockImplementation(async ({ options }) => ({
      result: { idToken: token({ nonce: options.nonce }), profile: { givenName: 'Mona', familyName: 'Ali' } },
    }));
    expect(await signIn('apple')).toEqual({ fullName: 'Mona Ali' });
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { full_name: 'Mona Ali' } });
  });

  it('reports a closed sign-in sheet as cancelled', async () => {
    mocks.login.mockRejectedValue(Object.assign(new Error('The user canceled the sign-in flow.'), { code: 'USER_CANCELLED' }));
    await expect(signIn('google')).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('reports a provider that is not switched on in Supabase as not configured', async () => {
    mocks.login.mockResolvedValue({ result: { idToken: token({}) } });
    mocks.signInWithIdToken.mockResolvedValue({ error: { message: 'Provider is not enabled' } });
    await expect(signIn('google')).rejects.toMatchObject({ kind: 'not-configured' });
  });

  it("doesn't open Google sign-in without a web client ID in the build", async () => {
    mocks.cloudConfig.googleWebClientId = '';
    await expect(signIn('google')).rejects.toBeInstanceOf(SignInError);
    expect(mocks.login).not.toHaveBeenCalled();
  });
});

describe('web sign-in', () => {
  it('uses the redirect flow, coming back to the Profile page', async () => {
    mocks.platform = 'web';
    vi.stubGlobal('window', { location: { origin: 'https://budgy.example', search: '', hash: '', pathname: '/profile' } });
    await signIn('google');
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://budgy.example/profile' } });
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('reads a failed sign-in from the URL once and cleans the address bar', () => {
    mocks.platform = 'web';
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { search: '?error=access_denied&error_description=User+denied', hash: '', pathname: '/profile' },
      history: { replaceState },
    });
    expect(takeRedirectError()).toBe('User denied');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/profile');
  });
});

describe('helpers', () => {
  it('offers Apple on iOS (and on the web only when enabled), Google everywhere', () => {
    mocks.platform = 'android';
    expect(availableProviders()).toEqual(['google']);
    mocks.platform = 'ios';
    expect(availableProviders()).toEqual(['google', 'apple']);
    mocks.platform = 'web';
    expect(availableProviders()).toEqual(['google']);
    mocks.cloudConfig.appleOnWeb = true;
    expect(availableProviders()).toEqual(['google', 'apple']);
  });

  it('classifies errors', () => {
    expect(classifySignInError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toBe('network');
    expect(classifySignInError({ message: 'Unacceptable audience in id_token' })).toBe('not-configured');
    expect(classifySignInError(new Error('something else'))).toBe('failed');
  });

  it('reads the nonce claim from base64url tokens of any length', () => {
    expect(tokenHasNonce(token({ nonce: 'a' }))).toBe(true);
    expect(tokenHasNonce(token({ sub: 'abc' }))).toBe(false);
    expect(tokenHasNonce('not-a-token')).toBe(false);
  });
});
