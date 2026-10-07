// Turns the logo and the raw screenshots into web-ready assets for apps/landing/public.
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const RAW = path.join(__dirname, 'raw');
const OUT = path.join(__dirname, '..', '..', 'public');
fs.mkdirSync(path.join(OUT, 'brand'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

async function logo() {
  const { data, info } = await sharp(path.join(__dirname, '..', '..', '..', 'web', 'public', 'logo.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const colour = Buffer.alloc(data.length);
  const white = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    // Background is white: opacity from how far the darkest channel is from white.
    const a = Math.max(0, Math.min(1, (255 - Math.min(r, g, b) - 12) / 90));
    const unblend = (c) => (a > 0 ? Math.max(0, Math.min(255, Math.round((c - 255 * (1 - a)) / a))) : 0);
    colour[i] = unblend(r); colour[i + 1] = unblend(g); colour[i + 2] = unblend(b); colour[i + 3] = Math.round(a * 255);
    white[i] = white[i + 1] = white[i + 2] = 255; white[i + 3] = Math.round(a * 255);
  }
  const opts = { raw: { width: info.width, height: info.height, channels: 4 } };
  const trimmed = await sharp(colour, opts).png().trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const { left, top } = { left: -trimmed.info.trimOffsetLeft, top: -trimmed.info.trimOffsetTop };
  const box = { left, top, width: trimmed.info.width, height: trimmed.info.height };
  await sharp(trimmed.data).resize({ height: 256 }).png().toFile(path.join(OUT, 'brand/logo-mark.png'));
  await sharp(white, opts).extract(box).resize({ height: 256 }).png().toFile(path.join(OUT, 'brand/logo-mark-white.png'));
  console.log('logo', box);
}

async function shot(name, out, { crop, width = 1600 } = {}) {
  let img = sharp(path.join(RAW, `${name}.png`));
  if (crop) img = img.extract(crop);
  await img.resize({ width, withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(OUT, 'shots', `${out}.webp`));
  console.log('shot', out);
}

(async () => {
  await logo();
  await shot('dashboard', 'web-dashboard', { width: 1800 });
  // Batches without the sidebar, and a zoom on the header and first three rows (near-expiry and expired lead the table)
  await shot('batches', 'web-batches', { crop: { left: 0, top: 0, width: 2365, height: 1800 }, width: 1600 });
  await shot('batches', 'web-batches-detail', { crop: { left: 216, top: 742, width: 2055, height: 518 }, width: 1400 });
  // Phones: the web app at 390px (captured with @390x844). The dashboard keeps its header and title;
  // the expiry alerts show drug, status and days left in one card each (the search box and menu button cropped off).
  await shot('m-web-dashboard', 'phone-web-dashboard', { crop: { left: 0, top: 0, width: 780, height: 1060 }, width: 780 });
  await shot('m-alerts-expiry', 'phone-web-expiry-alerts', { crop: { left: 0, top: 108, width: 780, height: 808 }, width: 780 });
  await shot('worders', 'web-warehouse-orders', { width: 1800 });
  await shot('wh-orders', 'portal-orders', { width: 1800 });
  await shot('pos', 'web-pos', { width: 1800 });
})().catch((e) => { console.error(e); process.exit(1); });
