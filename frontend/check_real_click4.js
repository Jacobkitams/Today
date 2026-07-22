const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();

  page.on('console', msg => console.log('LOG:', msg.text()));
  page.on('pageerror', error => console.log('ERROR:', error.message));

  await page.goto('https://today.iuea.ac.ug/index.html');
  await new Promise(r => setTimeout(r, 2000));
  
  try {
      await page.evaluate(() => {
          document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
          document.getElementById('innovation-admin-dashboard').style.display = 'block';
          showIaTab('content', document.querySelector('.ia-nav-btn[data-ia-tab="content"]'));
      });
      await new Promise(r => setTimeout(r, 1000));
      
      const btnSelector = '#ia-content-actions button:nth-child(2)';
      const html = await page.evaluate((sel) => document.querySelector(sel).outerHTML, btnSelector);
      console.log("Button HTML:", html);
      
      await page.evaluate((sel) => document.querySelector(sel).click(), btnSelector);
      
      await new Promise(r => setTimeout(r, 1000));
      const shown = await page.evaluate(() => document.getElementById('createModal').classList.contains('show'));
      console.log("Modal shown after evaluate.click():", shown);
  } catch (e) {
      console.log("Error:", e.message);
  }
  
  await browser.close();
})();
