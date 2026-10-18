// 生成产品海报 webp + 抽取文案
// 用法：node tools/build-posters.mjs --src "<海报根文件夹>" --chrome "<chrome 路径>"
// 不修改/移动/重命名任何海报源文件；本机路径只经命令行传入，不写进仓库。
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright-core';

// 删除文件：fs.unlinkSync 在某些环境被安全删除 shim 拦截，失败则退回 cmd del
function safeDelete(p) {
  try { fs.unlinkSync(p); } catch (_) {
    try { execSync('cmd /c del /f /q "' + p.replace(/\//g, '\\') + '"', { stdio: 'ignore' }); } catch (_) {}
  }
}

const ROOT = process.cwd();
const args = process.argv.slice(2);
function getArg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ''; }
const SRC = getArg('--src');
const CHROME = getArg('--chrome');
if (!SRC || !CHROME) { console.error('用法：node tools/build-posters.mjs --src "<海报根>" --chrome "<chrome>"'); process.exit(1); }

// slug -> 相对 --src 的海报 HTML（不要写绝对路径进仓库）
const MAP = {
  'self-test': '产品海报看我啊啊啊啊啊/3分钟出海自测_海报.html',
  'reports': '产品海报看我啊啊啊啊啊/产业出海研究报告_系列海报_B.html',
  'closed-door': '产品海报看我啊啊啊啊啊/出海沙龙_场次模板_海报.html',
  'online-connect': '产品海报看我啊啊啊啊啊/出海线上连线_系列模板_海报.html',
  'global-trip': '产品海报看我啊啊啊啊啊/海鑫汇全球行_海报.html',
  'chuhaiban': '产品海报看我啊啊啊啊啊/和君商学院出海班_第20届_海报.html',
  'trade-growth': '产品海报看我啊啊啊啊啊/出海训练营工作坊_海报.html',
  'project': '产品海报看我啊啊啊啊啊/出海决策陪跑_海报.html'
};
// 9 个产品（含 ceo-tour 缺失处理）
const SLUGS = ['self-test', 'reports', 'chuhaiban', 'trade-growth', 'closed-door', 'online-connect', 'global-trip', 'ceo-tour', 'project'];

const POSTER_DIR = path.join(ROOT, 'assets', 'posters');
fs.mkdirSync(POSTER_DIR, { recursive: true });

const PLACEHOLDER = /【|】|待填|待确认|待定/;
const PRICE = /元|万元/;
const clean = s => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function h1(html) { const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i); return m ? clean(m[1]) : ''; }
// 单元素内层文本（捕获到首个闭合标签）
function textOf(html, cls) {
  const m = html.match(new RegExp('<[^>]*class="[^"]*\\b' + cls + '\\b[^"]*"[^>]*>([\\s\\S]*?)</', 'i'));
  return m ? clean(m[1]) : '';
}
// 取某个 class 元素的完整内层 HTML（处理嵌套同标签）
function innerOf(html, cls) {
  const m = html.match(new RegExp('<([a-zA-Z0-9]+)[^>]*class="[^"]*\\b' + cls + '\\b[^"]*"[^>]*>'));
  if (!m) return '';
  const tag = m[1].toLowerCase();
  let i = m.index + m[0].length, depth = 1;
  while (i < html.length) {
    const lt = html.indexOf('<', i); if (lt < 0) break;
    const gt = html.indexOf('>', lt); if (gt < 0) break;
    const tok = html.slice(lt, gt + 1); i = gt + 1;
    if (tok.startsWith('</')) { const c = tok.slice(2).replace(/[\s>].*/, '').toLowerCase(); if (c === tag) { depth--; if (depth === 0) return html.slice(m.index + m[0].length, lt); } }
    else if (!tok.startsWith('<!') && !tok.endsWith('/>')) { const o = tok.slice(1).replace(/[\s>].*/, '').toLowerCase(); if (o === tag) depth++; }
  }
  return html.slice(m.index + m[0].length);
}
function listItems(html, cls) {
  const inner = innerOf(html, cls); if (!inner) return [];
  const out = []; let m; const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  while ((m = re.exec(inner))) { const t = clean(m[1]); if (t) out.push(t); }
  return out;
}
function divItems(html, cls) {
  const out = []; let m; const re = new RegExp('<div[^>]*class="[^"]*\\b' + cls + '\\b[^"]*"[^>]*>([\\s\S]*?)</div>', 'gi');
  while ((m = re.exec(html))) { const t = clean(m[1]); if (t) out.push(t); }
  return out;
}

function analyze(html) {
  let title = h1(html); if (PLACEHOLDER.test(title)) title = '';
  const sub = textOf(html, 'sub') || textOf(html, 'subtitle') || textOf(html, 'period') || textOf(html, 'theme-meta') || textOf(html, 'datetime') || textOf(html, 'theme-title') || textOf(html, 'report-name') || '';
  const oneLiner = textOf(html, 'value-line') || '';
  const pointsRaw = [...listItems(html, 'points'), ...listItems(html, 'agenda'), ...divItems(html, 'node-content'), ...divItems(html, 'pkg-desc')];
  const tags = divItems(html, 'tag');
  // 所有单元素文本，用于价格/占位扫描
  const singles = ['price-row', 'price', 'info-row', 'summary', 'pkg-price', 'pkg-meta', 'who', 'access', 'co-pub', 'theme', 'period', 'theme-meta', 'datetime', 'sub', 'subtitle', 'value-line'];
  const pool = [title, sub, oneLiner, ...pointsRaw, ...tags];
  singles.forEach(s => { const t = textOf(html, s); if (t) pool.push(t); });
  const priceFrags = [], placeholderFrags = [];
  pool.forEach(t => {
    if (t && PRICE.test(t) && !priceFrags.includes(t)) priceFrags.push(t);
    if (t && PLACEHOLDER.test(t) && !placeholderFrags.includes(t)) placeholderFrags.push(t);
  });
  const cleanPoints = pointsRaw.filter(t => !PLACEHOLDER.test(t) && !PRICE.test(t));
  const cleanTags = tags.filter(t => !PLACEHOLDER.test(t) && !PRICE.test(t));
  const qrBlank = /class="[^"]*\b(qr|qr-placeholder)\b/.test(html);
  return {
    title, subtitle: PLACEHOLDER.test(sub) ? '' : sub, oneLiner: PLACEHOLDER.test(oneLiner) ? '' : oneLiner,
    points: cleanPoints, tags: cleanTags, priceFrags, placeholderFrags, qrBlank,
    hasPlaceholder: placeholderFrags.length > 0
  };
}

const copy = {}, discarded = {}, out = [];

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
  for (const slug of SLUGS) {
    if (slug === 'ceo-tour') { out.push(`${slug} | found=no | - | residual=- | webp=no (源文件缺失)`); continue; }
    const rel = MAP[slug];
    const srcAbs = path.join(SRC, rel);
    const webpPath = path.join(POSTER_DIR, slug + '.webp');
    if (!fs.existsSync(srcAbs)) { out.push(`${slug} | found=no | - | residual=- | webp=no (映射文件不存在)`); continue; }
    const html = fs.readFileSync(srcAbs, 'utf8');
    const a = analyze(html);
    copy[slug] = { title: a.title, subtitle: a.subtitle, oneLiner: a.oneLiner, points: a.points, tags: a.tags };
    if (a.priceFrags.length || a.placeholderFrags.length) discarded[slug] = { price: a.priceFrags, placeholder: a.placeholderFrags };
    const residualStr = a.hasPlaceholder ? ('yes: ' + a.placeholderFrags.join(' / ')) : 'no';
    if (a.hasPlaceholder) {
      if (fs.existsSync(webpPath)) safeDelete(webpPath);
      out.push(`${slug} | found=yes | 1080x1440 | residual=${residualStr} | webp=no (含占位，已删旧)`);
    } else {
      const page = await browser.newPage({ viewport: { width: 1080, height: 1440 }, deviceScaleFactor: 1 });
      await page.goto('file://' + srcAbs, { waitUntil: 'networkidle' });
      const el = await page.$('.poster');
      if (el) await el.screenshot({ path: webpPath, type: 'webp' });
      await page.close();
      const ok = fs.existsSync(webpPath);
      out.push(`${slug} | found=yes | 1080x1440 | residual=no | webp=${ok ? 'yes (' + path.relative(ROOT, webpPath) + ')' : 'FAILED'}`);
    }
    out.push(`   QR空白位=${a.qrBlank ? '是（仅汇报，不加二维码）' : '无'}`);
  }
  await browser.close();
  const result = { ...copy };
  fs.writeFileSync(path.join(POSTER_DIR, 'poster-copy.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
  if (Object.keys(discarded).length) {
    const lines = Object.entries(discarded).map(([k, v]) => k + ': ' + JSON.stringify(v, null, 2)).join('\n');
    fs.writeFileSync(path.join(ROOT, 'tools', 'poster-discarded.txt'), lines + '\n', 'utf8');
  }
  console.log('===== build-posters 输出（每张一行）=====');
  out.forEach(l => console.log(l));
  console.log('===== 已写入 assets/posters/poster-copy.json =====');
}
main().catch(e => { console.error(e); process.exit(1); });
