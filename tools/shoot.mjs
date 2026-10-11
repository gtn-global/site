// 自检截图：1280 / 375 两个宽度，三条演示路径 + 首屏
// 用法：node tools/shoot.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 若 playwright 的 headless shell 未下载完，回退到已就绪的完整 chromium 二进制
const CHROME = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe');

const ROOT = process.cwd();
const OUT = path.join(ROOT, '预览截图');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// 用 file:// 打开，正好验证「双击 index.html 也能完整显示」
const BASE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

const SHOTS = [
  { name: '01-新能源x中东', hash: '#cell=industry:new-energy;region:middle-east' },
  { name: '02-AI产业x东南亚', hash: '#cell=industry:ai;region:southeast-asia' },
  { name: '03-全部x德国', hash: '#cell=industry:all;region:germany' }
];

const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});

for (const w of [1280, 375]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w === 1280 ? 720 : 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  // A：确认两排跑马灯都有图
  const counts = await page.evaluate(() => ({
    up: document.querySelectorAll('#mUp img').length,
    down: document.querySelectorAll('#mDown img').length,
    upLoaded: [...document.querySelectorAll('#mUp img')].filter(i => i.naturalWidth > 0).length,
    downLoaded: [...document.querySelectorAll('#mDown img')].filter(i => i.naturalWidth > 0).length,
    fileWarn: document.getElementById('fileWarn') && !document.getElementById('fileWarn').hidden
  }));
  console.log(`[${w}] 跑马灯 上排=${counts.up}(加载成功${counts.upLoaded}) 下排=${counts.down}(加载成功${counts.downLoaded}) file提示条=${counts.fileWarn}`);

  await page.screenshot({ path: path.join(OUT, `00-首屏-${w}.png`) });

  for (const s of SHOTS) {
    await page.goto(BASE + s.hash, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' }); // 同文档 hash 跳转不会重跑脚本，需 reload
    await page.waitForTimeout(700);
    const deskOpen = await page.evaluate(() => {
      const d = document.getElementById('decisionDesk');
      return d && !d.hidden ? (document.getElementById('deskTitle')?.textContent || '') : '(未展开)';
    });
    console.log(`[${w}] ${s.name} → ${deskOpen}`);
    await page.screenshot({ path: path.join(OUT, `${s.name}-${w}.png`), fullPage: true });
    const deskEl = await page.$('#decisionDesk');
    if (deskEl) await deskEl.screenshot({ path: path.join(OUT, `desk-${s.name}-${w}.png`) });
  }

  console.log(errors.length ? `[${w}] JS 错误 ${errors.length} 条：` + errors.slice(0, 6).join(' | ') : `[${w}] 无 JS 错误`);
  await ctx.close();
}

await browser.close();
console.log('截图输出目录：' + OUT);
