// Captures screens of the web app running on the demo database (apps/web/prisma/demo).
// Usage: node capture-web.cjs <email> <name=path[@WxH][|click=text][|scroll=text][|full]> ...   (password from DEMO_PASSWORD)
//   click=text  (repeatable) clicks the first element with that exact text (or css:<selector>) before the capture
//   scroll=text scrolls the element with that exact text (or css:<selector>) to the top of the viewport
//   full        captures the whole page instead of the viewport
// Env: SHOTS_SUBDIR saves under raw/<subdir>; DEMO_THEME=dark captures the dark theme.
// Needs playwright-core (not a project dependency) and a local Chrome.
const { chromium } = require('playwright-core');
const path = require('path');
const BASE = process.env.DEMO_APP_URL || 'http://localhost:3100'; // localhost, not 127.0.0.1: Next redirects to localhost
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const RAW = path.join(__dirname, 'raw', process.env.SHOTS_SUBDIR || '');
const THEME = process.env.DEMO_THEME === 'dark' ? 'dark' : 'light'; // the app reads localStorage faramace-theme

(async () => {
  const [email, ...shots] = process.argv.slice(2);
  require('fs').mkdirSync(RAW, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'ar-IQ', colorScheme: 'light' });
  await ctx.addInitScript((theme) => { try { localStorage.setItem('faramace_onboarding_completed', 'true'); localStorage.setItem('faramace-theme', theme); } catch {} }, THEME);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"]', process.env.DEMO_PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }), page.click('button[type="submit"]')]);
  for (const spec of shots) {
    const eq = spec.indexOf('=');
    const name = spec.slice(0, eq);
    const [target, ...options] = spec.slice(eq + 1).split('|');
    const [route, size] = target.split('@');
    if (size) { const [w, h] = size.split('x').map(Number); await page.setViewportSize({ width: w, height: h }); }
    await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(3500);
    for (const click of options.filter((o) => o.startsWith('click='))) {
      const what = click.slice(6);
      await (what.startsWith('css:') ? page.locator(what.slice(4)) : page.getByText(what, { exact: true })).first().click();
      await page.waitForTimeout(1200);
    }
    // Capture actual loaded data, never a skeleton or an in-progress calculation.
    const ready = options.find((o) => o.startsWith('ready='));
    if (ready) await page.locator(ready.slice(6)).first().waitFor({ state: 'visible', timeout: 90000 });
    const gone = options.find((o) => o.startsWith('gone='));
    if (gone) await page.getByText(gone.slice(5), { exact: true }).waitFor({ state: 'hidden', timeout: 90000 });
    await page.evaluate(() => document.fonts.ready);
    // The dashboard scrolls inside its own container, so "full" cannot reach lower content: scroll it into view instead.
    const scroll = options.find((o) => o.startsWith('scroll='));
    if (scroll) {
      const what = scroll.slice(7);
      const el = what.startsWith('css:') ? page.locator(what.slice(4)) : page.getByText(what, { exact: true });
      await el.first().evaluate((node) => node.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(800);
    }
    const file = path.join(RAW, `${name}.png`);
    await page.screenshot({ path: file, fullPage: options.includes('full') });
    console.log('saved', name, page.url().replace(BASE, ''));
  }
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
