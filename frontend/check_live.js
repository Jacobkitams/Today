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

  await page.goto('https://today.iuea.ac.ug/index.html');
  await new Promise(r => setTimeout(r, 2000));
  
  const result = await page.evaluate(() => {
      try {
          if (typeof showCreateModal !== 'function') return { success: false, error: 'showCreateModal not found' };
          showCreateModal('startup-news');
          return { success: true, shown: document.getElementById('createModal').classList.contains('show') };
      } catch(e) {
          return { success: false, error: e.message, stack: e.stack };
      }
  });
  console.log("Live startup-news:", result);
  
  await browser.close();
})();
