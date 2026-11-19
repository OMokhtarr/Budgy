export interface ProState {
  gateOn: boolean;
  isPro: boolean;
  /** RevenueCat has answered at least once (or the cache stands in for it). */
  ready: boolean;
}

export type PaywallOutcome = 'subscribed' | 'dismissed' | 'failed' | 'unavailable';

/** Whether a Pro-only feature may run: always while the gate is off. */
export function proAllows(p: Pick<ProState, 'gateOn' | 'isPro'>): boolean {
  return !p.gateOn || p.isPro;
}

/** Cloud sync: wait for the first answer rather than pausing a paying user by mistake. */
export function syncGate(p: ProState): 'go' | 'wait' | 'paused' {
  if (!p.gateOn) return 'go';
  if (!p.ready) return 'wait';
  return p.isPro ? 'go' : 'paused';
}

/** Runs `action` if allowed, else after a paywall that ends subscribed; otherwise returns why it didn't run. */
export async function requirePro(
  p: Pick<ProState, 'gateOn' | 'isPro'>,
  showPaywall: () => Promise<PaywallOutcome>,
  action: () => void | Promise<void>,
): Promise<PaywallOutcome | 'allowed'> {
  if (proAllows(p)) {
    await action();
    return 'allowed';
  }
  const outcome = await showPaywall();
  if (outcome === 'subscribed') await action();
  return outcome;
}
