import { describe, expect, it } from 'vitest';
import { ICON_GROUPS, ICONS, canonicalIcon, iconFor } from './icons';

// Names written to the database by earlier versions (ionicons) and by the starter accounts and categories.
const SAVED_NAMES = [
  'cart', 'basket', 'restaurant', 'fastfood', 'pizza', 'cafe', 'beer', 'car', 'bus', 'bicycle', 'airplane', 'home',
  'flash', 'water', 'flame', 'wifi', 'phone', 'medkit', 'fitness', 'barbell', 'heart', 'shirt', 'cut', 'diamond',
  'film', 'music', 'game', 'book', 'school', 'gift', 'paw', 'people', 'happy', 'umbrella', 'leaf', 'receipt',
  'construct', 'storefront', 'pricetag', 'time', 'briefcase', 'laptop', 'desktop', 'business', 'bank', 'trending',
  'ribbon', 'sparkles', 'wallet', 'cash', 'card', 'transfer', 'other',
];

describe('icons', () => {
  it.each(SAVED_NAMES)('still draws the saved name "%s"', (name) => {
    const current = canonicalIcon(name);
    expect(current).toBeDefined();
    expect(ICON_GROUPS.some((g) => g.icons.includes(current!))).toBe(true);
  });

  it('resolves an old name to the icon the picker shows as selected', () => {
    expect(canonicalIcon('cart')).toBe('shopping-cart');
    expect(iconFor('cart')).toBe(ICONS['shopping-cart']);
  });

  it('falls back to the "more" icon for unknown or missing names', () => {
    expect(iconFor('no-such-icon')).toBe(ICONS.dots);
    expect(iconFor(undefined)).toBe(ICONS.dots);
  });

  it('lists every icon in exactly one picker section', () => {
    const listed = ICON_GROUPS.flatMap((g) => g.icons);
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.sort()).toEqual(Object.keys(ICONS).sort());
  });
});
