export default async function run(page, ui) {
  await page.waitForSelector('.journal-card', { timeout: 10000 });
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => {
    const track = document.getElementById('journalsGrid');
    return {
      cards: track.children.length,
      initFlag: track.dataset.carouselInit || null,
      trackTransform: getComputedStyle(track).transform,
      overlayDisplay: getComputedStyle(document.getElementById('jcOverlay')).display,
    };
  });

  const t1 = state.trackTransform;
  await page.waitForTimeout(700);
  const t2 = await page.evaluate(() => getComputedStyle(document.getElementById('journalsGrid')).transform);

  const first = page.locator('.journal-card').first();
  await first.click();
  await page.waitForTimeout(400);

  const detail = await page.evaluate(() => {
    const ov = document.getElementById('jcOverlay');
    return {
      open: ov.classList.contains('is-open'),
      title: (document.getElementById('jcDetailTitle') || {}).textContent,
      issn: (document.getElementById('jcDetailIssn') || {}).textContent,
    };
  });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => !document.getElementById('jcOverlay').classList.contains('is-open'));

  return { ...state, marqueeMoving: t1 !== t2, detail, closedOnEscape: closed };
}
