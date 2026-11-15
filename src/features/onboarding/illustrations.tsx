/**
 * Line-art for the welcome and "What's new" slides. Strokes use currentColor, so the deck's
 * primary colour draws them in light and dark alike.
 */
import type { ReactNode } from 'react';
import type { IllustrationId } from './tourCatalog';

const ART: Record<IllustrationId, ReactNode> = {
  // Budgy's mark: the segmented ring around a dot.
  brand: (
    <>
      <path d="M84.2 32.2A48 48 0 0 1 84.2 127.8L82.6 109.9A30 30 0 0 0 82.6 50.1z" />
      <path d="M75.8 127.8A48 48 0 0 1 32.2 84.2L50.1 82.6A30 30 0 0 0 77.4 109.9z" opacity=".7" />
      <path d="M32.2 75.8A48 48 0 0 1 75.8 32.2L77.4 50.1A30 30 0 0 0 50.1 77.4z" opacity=".5" />
      <circle cx="80" cy="80" r="9" />
    </>
  ),
  // A category bubble and the amount keypad.
  log: (
    <>
      <circle cx="46" cy="58" r="22" />
      <path d="M46 49v18M37 58h18" />
      <path d="M62 76q6 6 8 12" opacity=".5" strokeDasharray="2 5" />
      <rect x="74" y="40" width="58" height="88" rx="10" />
      <path d="M86 56h34" opacity=".7" />
      <circle cx="89" cy="78" r="4.5" />
      <circle cx="103" cy="78" r="4.5" />
      <circle cx="117" cy="78" r="4.5" />
      <circle cx="89" cy="94" r="4.5" />
      <circle cx="103" cy="94" r="4.5" />
      <circle cx="117" cy="94" r="4.5" />
      <circle cx="89" cy="110" r="4.5" />
      <circle cx="103" cy="110" r="4.5" />
      <circle cx="117" cy="110" r="4.5" />
    </>
  ),
  // A wallet with a card tucked in.
  wallet: (
    <>
      <path d="M46 62V44a6 6 0 0 1 6-6h52a6 6 0 0 1 6 6v18" />
      <path d="M46 50h64" opacity=".55" />
      <rect x="30" y="62" width="100" height="62" rx="10" />
      <path d="M130 80h-22a10 10 0 0 0 0 20h22" />
      <circle cx="109" cy="90" r="2" />
    </>
  ),
  // Bars by day with the trend over them.
  chart: (
    <>
      <path d="M28 128h104" />
      <rect x="38" y="96" width="14" height="32" rx="3" />
      <rect x="62" y="74" width="14" height="54" rx="3" />
      <rect x="86" y="88" width="14" height="40" rx="3" />
      <rect x="110" y="62" width="14" height="66" rx="3" />
      <path d="M45 78L69 54L93 66L117 40" opacity=".6" />
      <circle cx="117" cy="40" r="3.5" />
    </>
  ),
  // A locked phone, synced to the cloud.
  cloud: (
    <>
      <rect x="24" y="36" width="54" height="96" rx="10" />
      <path d="M44 46h14" opacity=".55" />
      <rect x="39" y="84" width="24" height="20" rx="3" />
      <path d="M43 84v-6a8 8 0 0 1 16 0v6" />
      <path d="M100 66h32a14 14 0 0 0 1-28a20 20 0 0 0-37 2a13 13 0 0 0 4 26z" />
      <path d="M116 78v14M110 86l6 6l6-6" opacity=".55" />
    </>
  ),
  // A stack of coins and one standing coin.
  coins: (
    <>
      <ellipse cx="56" cy="72" rx="26" ry="8" />
      <path d="M30 72v36a26 8 0 0 0 52 0V72" />
      <path d="M30 84a26 8 0 0 0 52 0M30 96a26 8 0 0 0 52 0" opacity=".55" />
      <circle cx="110" cy="96" r="24" />
      <circle cx="110" cy="96" r="16" opacity=".55" />
      <path d="M110 86v20" />
    </>
  ),
};

export function Illustration({ id }: { id: IllustrationId }) {
  return (
    <svg
      viewBox="0 0 160 160"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ART[id]}
    </svg>
  );
}
