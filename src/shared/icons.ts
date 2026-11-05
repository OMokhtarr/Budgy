import {
  airplaneOutline, barbellOutline, basketOutline, beerOutline, bookOutline, briefcaseOutline,
  busOutline, cafeOutline, carOutline, cardOutline, cartOutline, cashOutline, constructOutline,
  desktopOutline, fastFoodOutline, filmOutline, fitnessOutline, flashOutline, gameControllerOutline,
  giftOutline, heartOutline, homeOutline, laptopOutline, medkitOutline, musicalNotesOutline,
  pawOutline, phonePortraitOutline, pizzaOutline, receiptOutline, restaurantOutline, schoolOutline,
  shirtOutline, sparklesOutline, trendingUpOutline, walletOutline, waterOutline, wifiOutline,
  businessOutline, happyOutline, ribbonOutline, peopleOutline, umbrellaOutline, flameOutline,
  bicycleOutline, cutOutline, diamondOutline, leafOutline, storefrontOutline, pricetagOutline,
  timeOutline, swapHorizontalOutline, ellipsisHorizontalOutline,
} from 'ionicons/icons';

/**
 * Icon registry. We persist the short name in the database (not the SVG data URL)
 * so icons survive ionicons upgrades and backups stay small.
 */
export const ICONS: Record<string, string> = {
  cart: cartOutline,
  basket: basketOutline,
  restaurant: restaurantOutline,
  fastfood: fastFoodOutline,
  pizza: pizzaOutline,
  cafe: cafeOutline,
  beer: beerOutline,
  car: carOutline,
  bus: busOutline,
  bicycle: bicycleOutline,
  airplane: airplaneOutline,
  home: homeOutline,
  flash: flashOutline,
  water: waterOutline,
  flame: flameOutline,
  wifi: wifiOutline,
  phone: phonePortraitOutline,
  medkit: medkitOutline,
  fitness: fitnessOutline,
  barbell: barbellOutline,
  heart: heartOutline,
  shirt: shirtOutline,
  cut: cutOutline,
  diamond: diamondOutline,
  film: filmOutline,
  music: musicalNotesOutline,
  game: gameControllerOutline,
  book: bookOutline,
  school: schoolOutline,
  gift: giftOutline,
  paw: pawOutline,
  people: peopleOutline,
  happy: happyOutline,
  umbrella: umbrellaOutline,
  leaf: leafOutline,
  receipt: receiptOutline,
  construct: constructOutline,
  storefront: storefrontOutline,
  pricetag: pricetagOutline,
  time: timeOutline,
  briefcase: briefcaseOutline,
  laptop: laptopOutline,
  desktop: desktopOutline,
  business: businessOutline,
  trending: trendingUpOutline,
  ribbon: ribbonOutline,
  sparkles: sparklesOutline,
  wallet: walletOutline,
  cash: cashOutline,
  card: cardOutline,
  transfer: swapHorizontalOutline,
  other: ellipsisHorizontalOutline,
};

export function iconFor(name?: string): string {
  return (name && ICONS[name]) || ellipsisHorizontalOutline;
}

export const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#78716c',
  '#64748b', '#0f766e',
];

/** Line icons ionicons doesn't have. Drawn in the current text colour, like the outline icons above. */
const lineIcon = (body: string) =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`;

export const doubleChevronBack = lineIcon("<path d='M10 4l-7 8 7 8h3l-7-8 7-8zM17 4l-7 8 7 8h3l-7-8 7-8z'/>");
export const doubleChevronForward = lineIcon("<path d='M14 4l7 8-7 8h-3l7-8-7-8zM7 4l7 8-7 8H4l7-8-7-8z'/>");
export const pencilUpright = lineIcon(
  "<path d='M5 21V10.5L12 2.5l7 8V21M9 6h6M5 12.5q3.5-3 7 0q3.5-3 7 0M8.5 11v10M15.5 11v10M12 12.5V21'/>",
);
export const receiptUpright = lineIcon(
  "<path d='M5.5 3h13v18l-2.2-1.6-2.1 1.6-2.2-1.6-2.2 1.6-2.1-1.6-2.2 1.6zM8.5 8h4.5M8.5 12h4.5M15.5 8h.01M15.5 12h.01'/>",
);
export const barsAndTrend = lineIcon(
  "<path d='M3 21h18M5.5 21v-6h3.5v6M10.5 21V11H14v10M15.5 21v-7H19v7M5 8l6-3 7 2'/><circle cx='5' cy='8' r='1.3'/><circle cx='11' cy='5' r='1.3'/><circle cx='18' cy='7' r='1.3'/>",
);
