// Frames raw screenshots with a caption (1080x1920) and draws the 1024x500 feature graphic, per language.
// Usage (from the project root): node scripts/store-assets/frame.mjs scripts/store-assets/raw store public/icon.png
// Play wants these without an alpha channel, so every file is written as a 24-bit PNG.
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const save = async (img, file) => sharp(await img.png().toBuffer()).removeAlpha().png().toFile(file);
const sharp = createRequire(process.cwd() + '/package.json')('sharp');
const [raw, out, icon] = process.argv.slice(2);

const CAPTIONS = {
  en: {
    '01-categories': 'See where your money goes',
    '02-add': 'Add a transaction in seconds',
    '03-overview': 'Income, spending and trends',
    '04-budgets': 'Stay on budget every month',
    '05-accounts': 'All your accounts, any currency',
    '06-debts': 'Know who owes whom',
    '07-transactions': 'Your history, day by day',
    '08-dark': 'Easy on the eyes, day or night',
  },
  ar: {
    '01-categories': 'اعرف أين تذهب أموالك',
    '02-add': 'أضف معاملة في ثوانٍ',
    // 03, 04 and 07 are left out until money.format stops showing "$US" in Arabic (Overview, Transactions totals).
    '05-accounts': 'كل حساباتك، بأي عملة',
    '06-debts': 'اعرف من يدين لمن',
    '08-dark': 'مريح للعين ليلًا ونهارًا',
  },
};
const TAGLINE = { en: 'Budget & spending tracker', ar: 'تتبّع ميزانيتك ومصروفاتك' };

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const FONT = `font-family="Segoe UI" font-weight="700" fill="#ffffff"`;
const bg = (w, h) => `
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#047857"/>
  </linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>`;

/** The screenshot scaled to `height`, with rounded corners, plus a soft shadow layer of the same size. */
async function phone(file, height, radius) {
  const img = await sharp(file).resize({ height }).toBuffer();
  const { width } = await sharp(img).metadata();
  const mask = Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}"/></svg>`);
  const rounded = await sharp(img).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const pad = 40;
  const shadow = await sharp(Buffer.from(`<svg width="${width + pad * 2}" height="${height + pad * 2}">
      <rect x="${pad}" y="${pad + 12}" width="${width}" height="${height}" rx="${radius}" fill="#022c22" fill-opacity="0.35"/></svg>`))
    .blur(18).png().toBuffer();
  return { rounded, shadow, width, pad };
}

for (const [lang, caps] of Object.entries(CAPTIONS)) {
  const dir = `${out}/${lang}`;
  mkdirSync(dir, { recursive: true });
  const rtl = lang === 'ar' ? ' direction="rtl"' : '';

  let n = 0;
  for (const [name, caption] of Object.entries(caps)) {
    const W = 1080, H = 1920, PH = 1520;
    const p = await phone(`${raw}/${lang}/${name}.png`, PH, 56);
    const left = Math.round((W - p.width) / 2);
    const top = 330;
    const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${bg(W, H)}
      <text x="${W / 2}" y="210" ${FONT} font-size="66" text-anchor="middle"${rtl}>${esc(caption)}</text></svg>`);
    n += 1;
    await save(sharp(base).composite([
        { input: p.shadow, left: left - p.pad, top: top - p.pad },
        { input: p.rounded, left, top },
      ]), `${dir}/screenshot-${n}.png`);
  }

  // Feature graphic: icon, name and tagline on one side, the home screen on the other (mirrored for Arabic).
  const W = 1024, H = 500;
  const ar = lang === 'ar';
  const p = await phone(`${raw}/${lang}/01-categories.png`, 640, 36);
  const logo = await sharp(icon).resize(150, 150).png().toBuffer();
  const textX = ar ? 960 : 64;
  const anchor = ar ? 'end' : 'start';
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${bg(W, H)}
    <text x="${textX}" y="318" ${FONT} font-size="104" text-anchor="${anchor}">Budgy</text>
    <text x="${textX}" y="380" font-family="Segoe UI" font-weight="600" font-size="38" fill="#ecfdf5" text-anchor="start"${ar ? ' direction="rtl"' : ''}>${esc(TAGLINE[lang])}</text></svg>`);
  const phoneLeft = ar ? 70 : W - 70 - p.width;
  // The phone runs off the bottom edge: keep only the part inside the banner.
  const crop = (buf, h) => sharp(buf).extract({ left: 0, top: 0, width: p.width + (buf === p.shadow ? p.pad * 2 : 0), height: h }).toBuffer();
  const phoneTop = 70;
  const visible = await crop(p.rounded, H - phoneTop);
  const shade = await crop(p.shadow, H - phoneTop + p.pad);
  await save(sharp(base).composite([
      { input: logo, left: ar ? 960 - 150 : 64, top: 90 },
      { input: shade, left: phoneLeft - p.pad, top: phoneTop - p.pad },
      { input: visible, left: phoneLeft, top: phoneTop },
    ]), `${dir}/feature-graphic.png`);
  console.log(`${lang}: ${n} screenshots + feature graphic`);
}
