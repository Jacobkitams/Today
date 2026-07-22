const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();

  await page.goto('https://today.iuea.ac.ug/index.html');
  await new Promise(r => setTimeout(r, 2000));
  
  try {
      // Show Innovation Admin
      await page.evaluate(() => {
          document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
          document.getElementById('innovation-admin-dashboard').style.display = 'block';
      });
      await new Promise(r => setTimeout(r, 1000));
      
      // Click Manage Content
      await page.evaluate(() => {
          document.querySelector('.ia-nav-btn[data-ia-tab="content"]').click();
      });
      await new Promise(r => setTimeout(r, 1000));
      
      const btnSelector = '#ia-content-actions button[onclick*="showCreateModal"]';
      await page.waitForSelector(btnSelector, { visible: true, timeout: 5000 });
      await page.click(btnSelector);
      
      await new Promise(r => setTimeout(r, 1000));
      const shown = await page.evaluate(() => document.getElementById('createModal').classList.contains('show'));
      console.log("Real click shown:", shown);
  } catch (e) {
      console.log("Error clicking:", e.message);
  }
  
  await browser.close();
})();
