// Generates the app icons in public/ from an inline SVG.
// Usage: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = resolve(root, 'public');
mkdirSync(resolve(pub, 'icons'), { recursive: true });

// Emerald tile with a segmented "budget ring" mark.
const r = 300;
const C = 2 * Math.PI * r;
const seg = (frac, offset, color) =>
  `<circle cx="512" cy="512" r="${r}" fill="none" stroke="${color}" stroke-width="120"
     stroke-dasharray="${C * frac - 28} ${C}" stroke-dashoffset="${-C * offset}"
     transform="rotate(-90 512 512)" stroke-linecap="butt"/>`;

const svg = (rounded) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#34d399"/>
      <stop offset="1" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="${rounded ? 230 : 0}" fill="url(#g)"/>
  ${seg(0.5, 0, '#ffffff')}
  ${seg(0.3, 0.5, 'rgba(255,255,255,0.72)')}
  ${seg(0.2, 0.8, 'rgba(255,255,255,0.42)')}
  <circle cx="512" cy="512" r="92" fill="#ffffff"/>
</svg>`;

const square = Buffer.from(svg(false));
const rounded = Buffer.from(svg(true));

await sharp(rounded).resize(1024, 1024).png().toFile(resolve(pub, 'icon.png'));
await sharp(square).resize(512, 512).png().toFile(resolve(pub, 'icons/icon-512.png'));
await sharp(square).resize(192, 192).png().toFile(resolve(pub, 'icons/icon-192.png'));
await sharp(square).resize(180, 180).png().toFile(resolve(pub, 'apple-touch-icon.png'));
await sharp(rounded).resize(32, 32).png().toFile(resolve(pub, 'favicon-32.png'));
console.log('Icons written to public/');
