const KEY = 'budgy-pro';

/**
 * The last known Pro answer, so a cold start or being offline doesn't lock a paying user out.
 * Tagged with the account so another user's (or a signed-out) entitlement is never reused.
 */
export function readProCache(accountId: string | null): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const v = JSON.parse(raw) as { account?: unknown; pro?: unknown } | null;
    return v?.account === accountId && v?.pro === true;
  } catch {
    return false;
  }
}

export function writeProCache(accountId: string | null, pro: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ account: accountId, pro }));
  } catch {
    /* storage unavailable: the next start just asks RevenueCat again (safe, only slower) */
  }
}
