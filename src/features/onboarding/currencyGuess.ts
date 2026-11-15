/** Countries whose currency is in the list, for guessing from the device language ("ar-SA" → SAR). */
const REGION_CURRENCY: Record<string, string> = {
  EG: 'EGP', US: 'USD', GB: 'GBP', SA: 'SAR', AE: 'AED', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', JO: 'JOD',
  MA: 'MAD', TR: 'TRY', IN: 'INR', PK: 'PKR', CA: 'CAD', AU: 'AUD', JP: 'JPY', CN: 'CNY', CH: 'CHF',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', IE: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR',
};

/** The currency for a device language like "ar-SA", or `fallback` when it has no region or an unknown one. */
export function guessCurrency(language: string, fallback: string): string {
  const region = /[-_]([A-Za-z]{2})\b/.exec(language ?? '')?.[1]?.toUpperCase();
  return (region && REGION_CURRENCY[region]) || fallback;
}
