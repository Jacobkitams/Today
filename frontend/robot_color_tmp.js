const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:8002/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => navigateTo('innovation'));
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => document.getElementById('innovationRobotStage')?.scrollIntoView({ block: 'center' }));
  await new Promise(r => setTimeout(r, 3000));
  await page.evaluate(() => window.scrollBy(0, 150));
  await new Promise(r => setTimeout(r, 500));

  await page.screenshot({ path: 'robot_color_closeup.png' });
  await browser.close();
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(1); });
