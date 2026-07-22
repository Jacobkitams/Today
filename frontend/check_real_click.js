const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();

  await page.goto('https://today.iuea.ac.ug/index.html');
  await new Promise(r => setTimeout(r, 2000));
  
  try {
      await page.waitForSelector('button[onclick*="innovation"]', { visible: true, timeout: 5000 });
      await page.click('button[onclick*="innovation"]');
      await new Promise(r => setTimeout(r, 1000));
      const shown = await page.evaluate(() => document.getElementById('createModal').classList.contains('show'));
      console.log("Real click shown:", shown);
  } catch (e) {
      console.log("Error clicking:", e.message);
  }
  
  await browser.close();
})();
