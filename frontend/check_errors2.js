const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.goto('http://localhost:8080/index.html');
  
  await new Promise(r => setTimeout(r, 1000));
  
  await page.evaluate(() => {
      const btn = document.querySelector('.ia-nav-btn[data-ia-tab="content"]');
      if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 500));
  
  await page.evaluate(() => {
      const btn = document.querySelector('button[onclick*="innovation"]');
      if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 500));
  
  const isShown = await page.evaluate(() => {
      return document.getElementById('createModal').classList.contains('show');
  });
  console.log("Modal shown:", isShown);
  await browser.close();
})();
