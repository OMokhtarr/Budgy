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
