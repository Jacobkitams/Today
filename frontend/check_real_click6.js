const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();

  page.on('console', msg => console.log('LOG:', msg.text()));

  await page.goto('https://today.iuea.ac.ug/index.html');
  await new Promise(r => setTimeout(r, 2000));
  
  try {
      await page.evaluate(() => {
          document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
          document.getElementById('innovation-admin-dashboard').style.display = 'block';
          showIaTab('content', document.querySelector('.ia-nav-btn[data-ia-tab="content"]'));
      });
      await new Promise(r => setTimeout(r, 1000));
      
      // FIX THE Z-INDEX!
      await page.evaluate(() => {
          document.getElementById('ia-content-actions').style.position = 'relative';
          document.getElementById('ia-content-actions').style.zIndex = '10';
      });
      
      const btn = await page.$('#ia-content-actions button:nth-child(2)');
      console.log("Hovering and clicking with fixed z-index...");
      await btn.hover();
      await btn.click();
      
      await new Promise(r => setTimeout(r, 1000));
      const shown = await page.evaluate(() => document.getElementById('createModal').classList.contains('show'));
      console.log("Modal shown after real mouse click (FIXED Z-INDEX):", shown);
  } catch (e) {
      console.log("Error:", e.message);
  }
  
  await browser.close();
})();
