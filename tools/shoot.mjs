// 自检截图 + 验收数字：1280 / 375 各出首屏与整页长图
// 用法：node tools/shoot.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe');
const ROOT = process.cwd();
const OUT = path.join(ROOT, '预览截图');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const BASE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});

for (const w of [1280, 375]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w === 1280 ? 720 : 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const m = await page.evaluate(() => {
    const sections = document.querySelectorAll('section.section').length;
    const home = document.getElementById('home');
    const btns = home ? home.querySelectorAll('a,button').length : 0;
    const marquee = [...document.querySelectorAll('.marquee-track')]
      .filter(e => getComputedStyle(e).animationName !== 'none').length;
    const carousel = document.querySelectorAll('.carousel-track').length;
    const fonts = new Set();
    document.querySelectorAll('body *').forEach(el => {
      if (!el.firstChild || !el.textContent.trim()) return;
      const s = parseFloat(getComputedStyle(el).fontSize);
      if (s) fonts.add(Math.round(s));
    });
    return {
      sections,
      homeLinksBtns: btns,
      marqueeAnimated: marquee,
      carouselTracks: carousel,
      fontSizes: [...fonts].sort((a, b) => a - b),
      pageHeight: document.documentElement.scrollHeight,
      wallImgs: document.querySelectorAll('#clientWall img').length,
      upImgs: document.querySelectorAll('#mUp img').length,
      downImgs: document.querySelectorAll('#mDown img').length
    };
  });

  console.log(`[${w}] 整页高度=${m.pageHeight}px  区块数=${m.sections}  字号级数=${m.fontSizes.length}(${m.fontSizes.join('/')})`);
  console.log(`[${w}] 首屏内链接+按钮=${m.homeLinksBtns}  动效处数=${m.marqueeAnimated + m.carouselTracks}(双向通道${m.marqueeAnimated}+跑马灯${m.carouselTracks})`);
  console.log(`[${w}] 照片墙图=${m.wallImgs}  双向通道 上排=${m.upImgs} 下排=${m.downImgs}`);

  await page.screenshot({ path: path.join(OUT, `首屏-${w}.png`) });
  await page.screenshot({ path: path.join(OUT, `整页-${w}.png`), fullPage: true });
  if (errs.length) console.log(`[${w}] JS 错误: ` + errs.slice(0, 4).join(' | '));
  await ctx.close();
}
await browser.close();
console.log('截图目录：' + OUT);
