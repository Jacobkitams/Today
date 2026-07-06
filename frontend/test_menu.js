const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812 });
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle0' });
  await page.click('.mobile-menu-btn');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'mobile_menu.png' });
  await browser.close();
})();
