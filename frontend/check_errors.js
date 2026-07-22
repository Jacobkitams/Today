const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => {
      console.log('PAGE LOG:', msg.text());
  });
  
  page.on('pageerror', error => {
      console.log('PAGE ERROR:', error.message);
  });

  await page.goto('http://localhost:8080/index.html');
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log("Clicking Manage Content button");
  await page.evaluate(() => {
      const btn = document.querySelector('.ia-nav-btn[data-ia-tab="content"]');
      if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 500));
  
  console.log("Clicking Add Innovation button");
  await page.evaluate(() => {
      const btn = document.querySelector('button[onclick*="innovation"]');
      if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 500));
  
  console.log("Done checking.");
  await browser.close();
})();
