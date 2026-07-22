const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.goto('http://localhost:8080/index.html');
  await new Promise(r => setTimeout(r, 1000));
  
  const result = await page.evaluate(() => {
      try {
          showCreateModal('startup-news');
          return { success: true, shown: document.getElementById('createModal').classList.contains('show') };
      } catch(e) {
          return { success: false, error: e.message, stack: e.stack };
      }
  });
  console.log("startup-news:", result);
  
  await browser.close();
})();
