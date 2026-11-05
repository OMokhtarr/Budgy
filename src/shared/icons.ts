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

/**
 * Budgy's own icons for the header, the period bar and the tab bar: single lines in the current text
 * colour, most with one solid dot (Budgy's mark). The dot is filled with --b-dot (green by default; see
 * index.css), which reaches inside ion-icon's shadow DOM because custom properties inherit.
 */
const lineIcon = (body: string) =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`;

const dot = (cx: number, cy: number, r = 1.7) =>
  `<circle cx='${cx}' cy='${cy}' r='${r}' stroke='none' style='fill:var(--b-dot, currentColor)'/>`;

// Tab bar
export const accountsIcon = lineIcon(
  `<rect x='3' y='6.5' width='18' height='13.5' rx='3'/><path d='M6.5 6.5 15 3.5l1.2 3'/>${dot(16.5, 13.3)}`,
);
export const categoriesIcon = lineIcon(
  `<circle cx='7.5' cy='7.5' r='3.3'/><circle cx='16.5' cy='7.5' r='3.3'/><circle cx='7.5' cy='16.5' r='3.3'/>${dot(16.5, 16.5, 3.3)}`,
);
export const transactionsIcon = lineIcon(
  `<path d='M9.5 7H20M9.5 12H20M9.5 17H20'/><circle cx='5' cy='12' r='1'/><circle cx='5' cy='17' r='1'/>${dot(5, 7)}`,
);
export const overviewIcon = lineIcon(`<path d='M3.5 17l5-5 4 3 6.5-6.5M3.5 21h17'/>${dot(19.5, 8, 2)}`);

// Period bar
export const previousIcon = lineIcon(`<path d='M13 6l-6 6 6 6'/>${dot(17.5, 12)}`);
export const nextIcon = lineIcon(`<path d='M11 6l6 6-6 6'/>${dot(6.5, 12)}`);
export const chevronDownIcon = lineIcon("<path d='M7 10l5 5 5-5'/>");

// Header actions
export const editIcon = lineIcon(`<path d='M7.5 20H20M5 19l.8-4.2L15.5 5a2.5 2.5 0 0 1 3.5 3.5L9.2 18.2z'/>${dot(5, 19, 1.5)}`);
export const doneIcon = lineIcon("<path d='M5 12.5l4.5 4.5L19 7.5'/>");
export const addIcon = lineIcon("<path d='M12 5v14M5 12h14'/>");
export const searchIcon = lineIcon(`<circle cx='11' cy='11' r='6.5'/><path d='M20 20l-4.3-4.3'/>${dot(11, 11, 1.6)}`);
export const closeIcon = lineIcon("<path d='M6.5 6.5l11 11M17.5 6.5l-11 11'/>");
export const filterIcon = lineIcon(`<path d='M4 7h16M4 17h16'/>${dot(15, 7, 2.5)}${dot(9, 17, 2.5)}`);
