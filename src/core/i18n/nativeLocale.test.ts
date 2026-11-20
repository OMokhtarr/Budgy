import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: 'android',
  plugin: { setLanguage: vi.fn(), getLanguage: vi.fn() },
  addListener: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => mocks.platform },
  registerPlugin: () => mocks.plugin,
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: mocks.addListener } }));

const load = () => import('./nativeLocale');

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.platform = 'android';
  mocks.plugin.setLanguage.mockResolvedValue(undefined);
  mocks.addListener.mockResolvedValue({ remove: vi.fn() });
});

describe('langFromTags', () => {
  it.each([
    ['ar', 'ar'],
    ['ar-EG,en', 'ar'],
    ['en-US', 'en'],
    ['', null],
    ['fr', null],
    ['arn', null],
  ])('%j → %j', async (tags, lang) => {
    const { langFromTags } = await load();
    expect(langFromTags(tags)).toBe(lang);
  });
});

describe('syncNativeLanguage', () => {
  it("gives Android Budgy's language when Android follows the phone", async () => {
    mocks.plugin.getLanguage.mockResolvedValue({ tag: '' });
    const change = vi.fn();
    await (await load()).syncNativeLanguage('ar', change);
    expect(mocks.plugin.setLanguage).toHaveBeenCalledWith({ tag: 'ar' });
    expect(change).not.toHaveBeenCalled();
  });

  it("adopts a language picked in Android's settings", async () => {
    mocks.plugin.getLanguage.mockResolvedValue({ tag: 'ar' });
    const change = vi.fn();
    await (await load()).syncNativeLanguage('en', change);
    expect(change).toHaveBeenCalledWith('ar');
    expect(mocks.plugin.setLanguage).not.toHaveBeenCalled();
  });

  it('does nothing when both already agree', async () => {
    mocks.plugin.getLanguage.mockResolvedValue({ tag: 'en' });
    const change = vi.fn();
    await (await load()).syncNativeLanguage('en', change);
    expect(change).not.toHaveBeenCalled();
    expect(mocks.plugin.setLanguage).not.toHaveBeenCalled();
  });

  it('leaves both alone when Android cannot be read', async () => {
    mocks.plugin.getLanguage.mockRejectedValue(new Error('no plugin'));
    const change = vi.fn();
    await (await load()).syncNativeLanguage('ar', change);
    expect(change).not.toHaveBeenCalled();
    expect(mocks.plugin.setLanguage).not.toHaveBeenCalled();
  });
});

describe('setNativeLanguage', () => {
  it('swallows a failing plugin', async () => {
    mocks.plugin.setLanguage.mockRejectedValue(new Error('no plugin'));
    await expect((await load()).setNativeLanguage('ar')).resolves.toBeUndefined();
  });
});

describe('off Android', () => {
  it('never calls the plugin or listens for resume', async () => {
    mocks.platform = 'web';
    const mod = await load();
    mod.followNativeLanguage(() => 'ar', vi.fn());
    await mod.setNativeLanguage('ar');
    expect(mocks.plugin.getLanguage).not.toHaveBeenCalled();
    expect(mocks.plugin.setLanguage).not.toHaveBeenCalled();
    expect(mocks.addListener).not.toHaveBeenCalled();
  });
});

describe('followNativeLanguage', () => {
  it('syncs at once and again on each resume', async () => {
    mocks.plugin.getLanguage.mockResolvedValue({ tag: '' });
    let lang: 'ar' | 'en' = 'en';
    (await load()).followNativeLanguage(() => lang, vi.fn());
    await vi.waitFor(() => expect(mocks.plugin.setLanguage).toHaveBeenCalledWith({ tag: 'en' }));

    expect(mocks.addListener).toHaveBeenCalledWith('resume', expect.any(Function));
    lang = 'ar';
    mocks.addListener.mock.calls[0][1]();
    await vi.waitFor(() => expect(mocks.plugin.setLanguage).toHaveBeenCalledWith({ tag: 'ar' }));
  });
});
