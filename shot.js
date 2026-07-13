const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  // desktop
  let page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 1400 });
  await page.goto('https://milk-and-honey-music.vercel.app/?client=oak-felder', { waitUntil: 'networkidle0', timeout: 45000 });
  await new Promise(r => setTimeout(r, 3500));
  await page.screenshot({ path: 'detail-desktop.png', fullPage: true });
  // mobile
  let m = await browser.newPage();
  await m.setViewport({ width: 390, height: 1600, isMobile: true });
  await m.goto('https://milk-and-honey-music.vercel.app/?client=oak-felder', { waitUntil: 'networkidle0', timeout: 45000 });
  await new Promise(r => setTimeout(r, 3500));
  await m.screenshot({ path: 'detail-mobile.png', fullPage: true });
  await browser.close();
  console.log('done');
})();
