import { useSettings } from '@/core/contexts/SettingsContext';
import { moveAccountsToCurrency, unusedAccountsIn } from '@/core/db/db';

/**
 * Returns a function that switches the app to the picked currency. Nothing has been entered yet on
 * a first run, so the starting accounts simply move to the new currency along with the setting.
 * The accounts move first: if that fails the setting is left alone, so trying again redoes both.
 */
export function useApplyCurrency(): (pick: string) => Promise<void> {
  const { currency, update } = useSettings();
  return async (pick) => {
    if (pick === currency) return;
    const unused = await unusedAccountsIn(currency);
    if (unused.length) await moveAccountsToCurrency(unused, pick);
    update({ currency: pick });
  };
}
