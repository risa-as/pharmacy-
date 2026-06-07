/**
 * Generates a circular app icon from logo.png
 * Outputs:
 *   public/icon.png  — 512×512 PNG (Electron window/taskbar on Linux/Mac)
 *   public/icon.ico  — multi-size ICO (electron-builder Windows installer)
 * Run: node scripts/make-icon.js
 */

const sharp  = require('sharp');
const toIco  = require('to-ico');
const path   = require('path');
const fs     = require('fs');

const SRC  = path.join(__dirname, '../public/logo.png');
const DEST_PNG = path.join(__dirname, '../public/icon.png');
const DEST_ICO = path.join(__dirname, '../public/icon.ico');
const SIZE = 512;

const BRAND_COLOR = '#0F7575'; // primary teal

async function makeCircle(size) {
    const PAD  = Math.round(size * 0.04);
    const LOGO = size - PAD * 2;

    const circleMask = Buffer.from(
        `<svg width="${size}" height="${size}">
           <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
         </svg>`
    );

    const logoCircle = await sharp(SRC)
        .resize(LOGO, LOGO, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD,
                  background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .composite([{ input: circleMask, blend: 'dest-in' }])
        .png()
        .toBuffer();

    const bg = await sharp({
        create: { width: size, height: size, channels: 4,
                  background: { r: 255, g: 255, b: 255, alpha: 1 } },
    }).png().toBuffer();

    const bgCircle = await sharp(bg)
        .composite([{ input: circleMask, blend: 'dest-in' }])
        .png()
        .toBuffer();

    return sharp(bgCircle)
        .composite([{ input: logoCircle, blend: 'over' }])
        .png()
        .toBuffer();
}

async function main() {
    // 1. Full-size PNG
    const png512 = await makeCircle(512);
    fs.writeFileSync(DEST_PNG, png512);
    console.log(`✓ PNG saved → ${DEST_PNG}  (512×512)`);

    // 2. ICO: 256, 128, 64, 48, 32, 16
    const sizes = [256, 128, 64, 48, 32, 16];
    const pngBuffers = await Promise.all(sizes.map(s =>
        s === 512 ? png512 : makeCircle(s)
    ));
    const icoBuffer = await toIco(pngBuffers);
    fs.writeFileSync(DEST_ICO, icoBuffer);
    console.log(`✓ ICO saved → ${DEST_ICO}  (${sizes.join(', ')}px)`);
}

main().catch(err => { console.error(err); process.exit(1); });
