// Generates src/shared/iconSet.generated.ts: the grouped icons people pick for accounts, categories and
// subcategories. Most come from Tabler Icons (MIT, devDependency @tabler/icons); the few Tabler lacks are
// drawn below in the same 24×24 line style.
// Usage: node scripts/generate-category-icons.mjs
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tablerDir = resolve(root, 'node_modules/@tabler/icons/icons/outline');
const out = resolve(root, 'src/shared/iconSet.generated.ts');

/** Icons Tabler doesn't have, drawn on its 24×24 grid. Names must not collide with Tabler's. */
const CUSTOM = {
  atm: '<rect x="3" y="3" width="18" height="6" rx="2"/><path d="M7 9v11h10v-11"/><path d="M12 14.5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0"/>',
  sushi: '<ellipse cx="12" cy="8.5" rx="8" ry="3.5"/><path d="M4 8.5v6.5c0 1.9 3.6 3.5 8 3.5s8 -1.6 8 -3.5v-6.5"/><ellipse cx="12" cy="8.5" rx="3" ry="1.2"/>',
  strawberry: '<path d="M12 8c-4 -2 -8.5 0 -7.5 4.5c.9 4.5 5 8.5 7.5 8.5s6.6 -4 7.5 -8.5c1 -4.5 -3.5 -6.5 -7.5 -4.5z"/><path d="M8.5 4l3.5 4l3.5 -4"/><path d="M12 3v5"/><path d="M9.5 12v.01"/><path d="M14.5 12v.01"/><path d="M12 15.5v.01"/>',
  donut: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M8 6.5l1 1"/><path d="M15.5 6l-.8 1.2"/><path d="M17.5 11l-1.2 .6"/><path d="M6.5 13.5l1.2 -.6"/><path d="M14 16.5l.6 1.2"/>',
  taxi: '<path d="M5 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5"/><path d="M7.5 6v-3h4v3"/>',
  broom: '<path d="M20 4l-7.5 7.5"/><path d="M9.5 10.5l4 4"/><path d="M9.5 10.5l-6.5 3.5l7 7l3.5 -6.5"/><path d="M6 17.5l2.5 -2.5"/><path d="M8.5 20l2 -2"/>',
  dress: '<path d="M9 3l1 4.5l-4 12.5h12l-4 -12.5l1 -4.5"/><path d="M10 7.5h4"/>',
  'tank-top': '<path d="M8.5 3v3a3.5 3 0 0 0 7 0v-3"/><path d="M8.5 6c-1.5 1 -2.5 2.5 -2.5 4.5v10.5h12v-10.5c0 -2 -1 -3.5 -2.5 -4.5"/>',
  skirt: '<path d="M7 4h10l3 15.5h-16z"/><path d="M7.5 7.5h9"/>',
  pants: '<path d="M6 3h12l1 18h-5l-2 -12l-2 12h-5z"/><path d="M6 6.5h12"/>',
  cap: '<path d="M3 15a7 7 0 0 1 14 0v1.5h-14z"/><path d="M17 16.5h3a1.5 1.5 0 0 0 0 -3h-3"/><path d="M10 8v-1.5"/>',
  'high-heel': '<path d="M3 9l1.5 11h1l1 -6c3 0 6.5 6 14.5 6v-2.5c-4 0 -8 -3 -10.5 -6.5l-3 -3z"/>',
  boot: '<path d="M7 3h6v10l5.5 2.5a2.5 2.5 0 0 1 1.5 2.3v2.2h-13z"/><path d="M7 7h6"/><path d="M7 18h13"/>',
  mitten: '<path d="M9 18v-12a3 3 0 0 1 6 0v12z"/><path d="M9 13l-2.5 -2.5a1.5 1.5 0 0 0 -2.2 2l4.7 4.5"/><path d="M8 18h8v3h-8z"/>',
  'bow-tie': '<path d="M3 7l7 4v2l-7 4z"/><path d="M21 7l-7 4v2l7 4z"/><path d="M10 10h4v4h-4z"/>',
  lipstick: '<path d="M8 21h8v-7h-8z"/><path d="M9.5 14v-5l5 -3v8"/>',
  comb: '<path d="M3 7h18v4h-18z"/><path d="M5 11v6"/><path d="M8 11v6"/><path d="M11 11v6"/><path d="M14 11v6"/><path d="M17 11v6"/><path d="M20 11v4"/>',
  necklace: '<path d="M6 3c0 6 3 10 6 10s6 -4 6 -10"/><path d="M12 13l-2 3l2 3l2 -3z"/>',
  whistle: '<circle cx="9" cy="14" r="5"/><path d="M12.5 10h8.5v4h-6.5"/><path d="M9 14v.01"/>',
};

/** The picker's sections, in display order. Labels come from i18n (`icons.groups.<key>`). */
const GROUPS = {
  money: [
    'wallet', 'credit-card', 'cash-banknote', 'cash', 'coins', 'coin', 'moneybag', 'pig-money', 'building-bank',
    'vault', 'treasure-chest', 'businessplan', 'report-money', 'database-dollar', 'gift-card', 'atm', 'cash-register',
    'receipt-2', 'brand-visa', 'brand-mastercard', 'brand-paypal', 'chart-bar', 'trending-up', 'chart-line',
    'chart-pie', 'abacus', 'calculator', 'credit-card-pay', 'cash-move', 'transfer', 'arrows-left-right',
    'heart-handshake', 'tip-jar', 'cash-banknote-heart', 'zoom-money', 'writing-sign', 'growth', 'clover',
    'horseshoe', 'percentage', 'currency-dollar', 'currency-euro', 'currency-pound', 'currency-yen',
    'currency-riyal', 'currency-dirham', 'currency-ruble', 'currency-bitcoin', 'currency-ethereum',
    'currency-litecoin',
  ],
  shopping: [
    'shopping-cart', 'basket', 'shopping-bag', 'paper-bag', 'building-store', 'tag', 'tags', 'discount',
    'barcode', 'package', 'truck-delivery', 'backpack',
  ],
  food: [
    'tools-kitchen-2', 'tools-kitchen', 'tools-kitchen-3', 'chef-hat', 'meat', 'fish', 'sushi', 'cheese', 'egg',
    'carrot', 'avocado', 'pepper', 'mushroom', 'salad', 'apple', 'banana', 'cherry', 'grape', 'lemon', 'melon',
    'strawberry', 'grill', 'candy', 'lollipop', 'cookie', 'chocolate', 'donut', 'cake-roll', 'bread', 'baguette',
    'wheat', 'ice-cream', 'ice-cream-2', 'burger', 'pizza', 'sausage', 'dumpling', 'soup', 'bowl-chopsticks',
    'bowl-spoon', 'salt', 'coffee', 'cup', 'mug', 'teapot', 'milk', 'milkshake', 'bubble-tea', 'glass-cocktail',
    'glass-full', 'beer', 'bottle', 'cooker', 'microwave',
  ],
  transport: [
    'car', 'car-suv', 'taxi', 'bus', 'bus-stop', 'train', 'plane', 'helicopter', 'bike', 'motorbike', 'moped',
    'scooter', 'scooter-electric', 'gas-station', 'charging-pile', 'parking', 'road', 'traffic-lights', 'road-sign',
    'steering-wheel', 'wheel', 'battery-automotive', 'engine', 'car-crash', 'car-crane', 'ship', 'ferry',
    'sailboat', 'jetski', 'caravan', 'camper', 'truck', 'forklift', 'tractor', 'drone',
  ],
  entertainment: [
    'ticket', 'movie', 'device-tv', 'music', 'microphone-2', 'headphones', 'guitar-pick', 'piano', 'masks-theater',
    'mask', 'mood-crazy-happy', 'hand-love-you', 'palette', 'presentation', 'aperture', 'sleigh', 'device-gamepad-2',
    'pacman', 'chess', 'cards', 'joker', 'dice', 'poker-chip', 'roulette', 'puzzle',
  ],
  home: [
    'home', 'home-2', 'smart-home', 'bolt', 'droplet', 'flame', 'wifi', 'phone', 'plug', 'lamp', 'fridge',
    'wash-machine', 'ironing', 'armchair', 'sofa', 'bed', 'bath', 'toilet-paper', 'key', 'lock', 'trash',
    'vacuum-cleaner', 'broom', 'bucket', 'tool', 'tools', 'hammer', 'hammer-drill', 'paint', 'brush', 'trowel',
    'shovel', 'fire-extinguisher', 'car-garage', 'wall',
  ],
  nature: [
    'leaf', 'plant', 'plant-2', 'seedling', 'flower', 'cactus', 'tree', 'trees', 'mountain', 'sunrise', 'sun',
    'moon', 'cloud', 'snowflake', 'rainbow', 'umbrella', 'campfire',
  ],
  clothing: [
    'shirt', 'shirt-sport', 'tank-top', 'jacket', 'dress', 'skirt', 'pants', 'sock', 'shoe', 'high-heel', 'boot',
    'flip-flops', 'cap', 'mitten', 'tie', 'bow-tie', 'sunglasses', 'eyeglass', 'hanger', 'clothes-rack',
  ],
  family: [
    'user', 'man', 'woman', 'friends', 'users-group', 'gender-male', 'gender-female', 'mood-smile', 'mood-happy',
    'heart', 'hearts', 'heart-broken', 'rings', 'baby-carriage', 'baby-bottle', 'diaper', 'mood-kid', 'horse-toy',
  ],
  education: [
    'school', 'book', 'books', 'notebook', 'pencil', 'ballpen', 'atom', 'brain', 'bulb', 'language', 'microscope',
  ],
  work: [
    'briefcase', 'building', 'buildings', 'building-skyscraper', 'building-factory', 'presentation-analytics',
    'checklist', 'clipboard-list', 'notes', 'file-text', 'inbox', 'folder', 'paperclip', 'pin', 'send', 'printer',
    'calendar', 'clock', 'scale', 'headset', 'needle-thread', 'military-rank', 'certificate',
  ],
  health: [
    'first-aid-kit', 'medical-cross', 'stethoscope', 'heartbeat', 'activity-heartbeat', 'pill', 'pills', 'vaccine',
    'bandage', 'dental', 'virus', 'face-mask', 'thermometer', 'flask', 'test-pipe', 'hospital', 'ambulance',
    'wheelchair', 'nurse', 'dna', 'sos',
  ],
  beauty: [
    'scissors', 'cut', 'razor', 'razor-electric', 'comb', 'perfume', 'lipstick', 'eye-closed', 'massage', 'yoga',
    'hand-sanitizer', 'diamond', 'necklace', 'crown',
  ],
  celebrations: [
    'gift', 'cake', 'balloon', 'confetti', 'glass-champagne', 'christmas-tree', 'christmas-ball', 'candle', 'wand',
    'sparkles', 'bell', 'award',
  ],
  sports: [
    'ball-football', 'ball-basketball', 'ball-american-football', 'ball-baseball', 'ball-tennis', 'ball-volleyball',
    'ball-bowling', 'ping-pong', 'golf', 'barbell', 'dumbbell', 'treadmill', 'stretching', 'run', 'swimming',
    'scuba-diving', 'karate', 'ice-skating', 'ski-jumping', 'snowboarding', 'skateboard', 'kayak', 'archery-arrow',
    'target-arrow', 'cricket', 'soccer-field', 'helmet', 'whistle', 'trophy', 'medal', 'laurel-wreath',
    'air-balloon', 'aerial-lift',
  ],
  tech: [
    'device-mobile', 'device-laptop', 'device-desktop', 'device-tablet', 'device-watch', 'device-airpods', 'camera',
    'device-speaker', 'keyboard', 'mouse', 'device-vision-pro', 'robot', 'cloud-computing', 'shield',
  ],
  travel: [
    'luggage', 'plane-departure', 'building-airport', 'e-passport', 'world', 'globe', 'map', 'map-pin', 'compass',
    'tent', 'beach', 'hotel-service', 'building-arch', 'building-monument', 'building-castle', 'building-mosque',
    'building-bridge', 'anchor', 'trolley',
  ],
  pets: ['dog', 'cat', 'paw', 'bone', 'dog-bowl', 'pig', 'horse', 'deer', 'canary', 'butterfly', 'spider', 'bat'],
  other: ['star', 'flag', 'receipt', 'recycle', 'smoking', 'skull', 'ghost', 'alien', 'ufo', 'radioactive', 'poo', 'dots'],
};

/**
 * Names saved before Budgy switched from ionicons, mapped to the icon that now draws them. Names that are also
 * Tabler names (home, pizza, wallet…) need no entry.
 */
const LEGACY = {
  cart: 'shopping-cart',
  restaurant: 'tools-kitchen-2',
  fastfood: 'burger',
  cafe: 'coffee',
  bicycle: 'bike',
  airplane: 'plane',
  flash: 'bolt',
  water: 'droplet',
  medkit: 'first-aid-kit',
  fitness: 'heartbeat',
  film: 'movie',
  game: 'device-gamepad-2',
  people: 'users-group',
  happy: 'mood-smile',
  construct: 'tools',
  storefront: 'building-store',
  pricetag: 'tag',
  time: 'clock',
  laptop: 'device-laptop',
  desktop: 'device-desktop',
  business: 'building-bank',
  bank: 'building-bank',
  trending: 'trending-up',
  ribbon: 'award',
  card: 'credit-card',
  other: 'dots',
};

function tablerBody(name) {
  const file = resolve(tablerDir, `${name}.svg`);
  if (!existsSync(file)) throw new Error(`Tabler has no outline icon named "${name}"`);
  const svg = readFileSync(file, 'utf8');
  const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
  return inner
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/, '')
    .replace(/\s*\n\s*/g, '')
    .replace(/\s*\/>/g, '/>');
}

const bodies = {};
const groups = [];
for (const [key, names] of Object.entries(GROUPS)) {
  for (const name of names) {
    if (bodies[name]) throw new Error(`"${name}" is listed twice`);
    if (CUSTOM[name] && existsSync(resolve(tablerDir, `${name}.svg`))) throw new Error(`Custom "${name}" collides with Tabler`);
    bodies[name] = CUSTOM[name] ?? tablerBody(name);
  }
  groups.push({ key, icons: names });
}
for (const name of Object.keys(CUSTOM)) if (!bodies[name]) throw new Error(`Custom "${name}" isn't in any group`);
for (const [from, to] of Object.entries(LEGACY)) {
  if (bodies[from]) throw new Error(`Legacy "${from}" shadows a current icon`);
  if (!bodies[to]) throw new Error(`Legacy "${from}" points at missing "${to}"`);
}

// Single quotes keep the bodies safe inside the data: URLs built in icons.ts.
const q = (s) => s.replace(/"/g, "'");
const lines = [
  '// Generated by scripts/generate-category-icons.mjs. Do not edit by hand.',
  '// Icons from Tabler Icons (https://tabler.io/icons), MIT License, Copyright (c) 2020-2026 Paweł Kuna.',
  '',
  '/** Inner SVG markup (24×24, stroked) for every pickable icon, keyed by the name stored in the database. */',
  'export const ICON_BODIES: Record<string, string> = {',
  ...Object.entries(bodies).map(([n, b]) => `  ${JSON.stringify(n)}: ${JSON.stringify(q(b))},`),
  '};',
  '',
  '/** The picker sections, in display order. */',
  'export const ICON_GROUPS: { key: string; icons: string[] }[] = [',
  ...groups.map((g) => `  { key: ${JSON.stringify(g.key)}, icons: ${JSON.stringify(g.icons)} },`),
  '];',
  '',
  '/** Icon names saved by older versions of Budgy, mapped to their current equivalent. */',
  'export const LEGACY_ICON_NAMES: Record<string, string> = {',
  ...Object.entries(LEGACY).map(([f, t]) => `  ${JSON.stringify(f)}: ${JSON.stringify(t)},`),
  '};',
  '',
];
writeFileSync(out, lines.join('\n'));
console.log(`Wrote ${Object.keys(bodies).length} icons in ${groups.length} groups to ${out}`);
