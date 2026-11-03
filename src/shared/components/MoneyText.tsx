/** "EGP 1,050": the currency code in smaller, muted type followed by the number. */
export default function MoneyText({ currency, text }: { currency: string; text: string }) {
  return (
    <span className="b-money" dir="ltr">
      <span className="b-money__cur">{currency}</span> {text}
    </span>
  );
}
