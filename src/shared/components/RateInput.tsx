import { useState } from 'react';
import { useSettings } from '@/core/contexts/SettingsContext';
import { cleanNumberInput, parseNumber } from '@/core/utils/number';

/** "1 USD = [ 48.5 ] EGP" — edits the manual exchange rate of one currency against the main one. */
export default function RateInput({ currency }: { currency: string }) {
  const { currency: base, rates, setRate } = useSettings();
  // Kept as text so partial input like "48." survives while typing.
  const [text, setText] = useState(rates[currency] ? String(rates[currency]) : '');

  return (
    <label className="b-rate" dir="ltr">
      <span>1 {currency} =</span>
      <input
        className="b-input b-num"
        inputMode="decimal"
        placeholder="0"
        value={text}
        onChange={(e) => {
          const v = cleanNumberInput(e.target.value);
          setText(v);
          setRate(currency, parseNumber(v) || undefined);
        }}
      />
      <span>{base}</span>
    </label>
  );
}
