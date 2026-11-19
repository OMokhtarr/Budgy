import { describe, expect, it, vi } from 'vitest';
import { proAllows, requirePro, showsProLock, syncGate, type PaywallOutcome } from './rules';

describe('proAllows', () => {
  it('allows everything while the gate is off', () => {
    expect(proAllows({ gateOn: false, isPro: false })).toBe(true);
  });
  it('allows Pro when the gate is on', () => {
    expect(proAllows({ gateOn: true, isPro: true })).toBe(true);
  });
  it('blocks non-Pro when the gate is on', () => {
    expect(proAllows({ gateOn: true, isPro: false })).toBe(false);
  });
});

describe('showsProLock', () => {
  it('shows nothing locked while the gate is off', () => {
    expect(showsProLock({ gateOn: false, isPro: false, ready: true })).toBe(false);
  });
  it('shows nothing locked until RevenueCat has answered', () => {
    expect(showsProLock({ gateOn: true, isPro: false, ready: false })).toBe(false);
  });
  it('shows the lock for non-Pro once ready, never for Pro', () => {
    expect(showsProLock({ gateOn: true, isPro: false, ready: true })).toBe(true);
    expect(showsProLock({ gateOn: true, isPro: true, ready: true })).toBe(false);
  });
});

describe('syncGate', () => {
  it('goes when the gate is off, even before RevenueCat is ready', () => {
    expect(syncGate({ gateOn: false, isPro: false, ready: false })).toBe('go');
  });
  it('waits until RevenueCat has answered', () => {
    expect(syncGate({ gateOn: true, isPro: false, ready: false })).toBe('wait');
    expect(syncGate({ gateOn: true, isPro: true, ready: false })).toBe('wait');
  });
  it('goes for Pro once ready', () => {
    expect(syncGate({ gateOn: true, isPro: true, ready: true })).toBe('go');
  });
  it('is paused for non-Pro once ready', () => {
    expect(syncGate({ gateOn: true, isPro: false, ready: true })).toBe('paused');
  });
});

describe('requirePro', () => {
  it('runs the action without the paywall when the gate is off', async () => {
    const paywall = vi.fn();
    const action = vi.fn();
    expect(await requirePro({ gateOn: false, isPro: false }, paywall, action)).toBe('allowed');
    expect(action).toHaveBeenCalledTimes(1);
    expect(paywall).not.toHaveBeenCalled();
  });

  it('runs the action without the paywall for Pro', async () => {
    const paywall = vi.fn();
    const action = vi.fn();
    expect(await requirePro({ gateOn: true, isPro: true }, paywall, action)).toBe('allowed');
    expect(action).toHaveBeenCalledTimes(1);
    expect(paywall).not.toHaveBeenCalled();
  });

  it('runs the action after a paywall that ends subscribed', async () => {
    const action = vi.fn();
    const outcome = await requirePro({ gateOn: true, isPro: false }, async () => 'subscribed', action);
    expect(outcome).toBe('subscribed');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it.each<PaywallOutcome>(['dismissed', 'failed', 'unavailable'])(
    'does not run the action when the paywall ends %s',
    async (result) => {
      const action = vi.fn();
      const outcome = await requirePro({ gateOn: true, isPro: false }, async () => result, action);
      expect(outcome).toBe(result);
      expect(action).not.toHaveBeenCalled();
    },
  );
});
