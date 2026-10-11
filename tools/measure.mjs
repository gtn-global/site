// 测量各区块高度与关键指标，1280 / 375 各一份
// 用法：node tools/measure.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe');
const BASE = 'file:///' + path.join(process.cwd(), 'index.html').replace(/\\/g, '/');
const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});

for (const w of [1280, 375]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const m = await page.evaluate(() => {
    const secs = [];
    document.querySelectorAll('section.section').forEach(s => {
      secs.push({ id: s.id || '-', h: Math.round(s.getBoundingClientRect().height) });
    });
    secs.sort((a, b) => b.h - a.h);
    const home = document.getElementById('home');
    const fonts = new Set();
    document.querySelectorAll('body *').forEach(el => {
      if (!el.firstChild || !el.textContent.trim()) return;
      const s = parseFloat(getComputedStyle(el).fontSize);
      if (s) fonts.add(Math.round(s));
    });
    const marquee = [...document.querySelectorAll('.marquee-track')]
      .filter(e => getComputedStyle(e).animationName !== 'none').length;
    return {
      secs,
      pageHeight: document.documentElement.scrollHeight,
      blockCount: secs.length,
      fontSizes: [...fonts].sort((a, b) => a - b),
      homeBtns: home ? home.querySelectorAll('a,button').length : 0,
      anim: marquee + document.querySelectorAll('.carousel-track').length
    };
  });
  console.log(`\n===== ${w} =====`);
  console.log('整页高度=' + m.pageHeight + 'px  区块数=' + m.blockCount + '  字号种类=' + m.fontSizes.length + '  首屏链接按钮=' + m.homeBtns + '  动效轨道=' + m.anim);
  console.log('字号: ' + m.fontSizes.join('/'));
  console.log('--- 区块高度（高→低）---');
  m.secs.forEach(s => console.log('  ' + String(s.h).padStart(6) + 'px  #' + s.id));
  await ctx.close();
}
await browser.close();
