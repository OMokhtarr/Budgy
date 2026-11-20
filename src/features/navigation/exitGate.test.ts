import { describe, expect, it, vi } from 'vitest';
import { EXIT_WINDOW_MS, backFallback, createBackToExit } from './exitGate';

function setup() {
  let time = 1_000;
  const onFirst = vi.fn();
  const onExit = vi.fn();
  const press = createBackToExit(onFirst, onExit, () => time);
  return { press, onFirst, onExit, advance: (ms: number) => (time += ms) };
}

describe('createBackToExit', () => {
  it('asks for a second press the first time instead of exiting', () => {
    const { press, onFirst, onExit } = setup();
    press();
    expect(onFirst).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('exits on a second press within the window', () => {
    const { press, onExit, advance } = setup();
    press();
    advance(EXIT_WINDOW_MS);
    press();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('asks again when the second press comes after the window', () => {
    const { press, onFirst, onExit, advance } = setup();
    press();
    advance(EXIT_WINDOW_MS + 1);
    press();
    expect(onFirst).toHaveBeenCalledTimes(2);
    expect(onExit).not.toHaveBeenCalled();
  });
});

describe('backFallback', () => {
  it('asks to exit on the tabs', () => {
    for (const tab of ['/accounts', '/categories', '/transactions', '/overview', '/', '/overview/']) {
      expect(backFallback(tab)).toBeNull();
    }
  });

  it('sends the pages opened on top of the tabs back to the main page', () => {
    for (const page of ['/profile', '/settings', '/data', '/sms', '/settings/']) {
      expect(backFallback(page)).toBe('/categories');
    }
  });

  it('sends linked numbers back to bank texts, like its back arrow', () => {
    expect(backFallback('/sms/links')).toBe('/sms');
  });

  it('goes back to Accounts from a credit card page, like its back arrow', () => {
    expect(backFallback('/cards/341b4450-b5ec')).toBe('/accounts');
    expect(backFallback('/cards/abc/')).toBe('/accounts');
  });
});
