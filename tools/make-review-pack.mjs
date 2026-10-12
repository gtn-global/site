/*
 * make-review-pack.mjs — 生成「审阅包」（供创始人/审阅人在 GitHub 缓存之外本地核对）
 *
 * 用法（在仓库根目录执行）：node tools/make-review-pack.mjs
 *
 * 行为：
 *  - 在项目父目录「26.10迭代」下生成/清空并重写文件夹「审阅包」；
 *  - 拷入：index.html / style.css / script.js / data/*.js / 4 个矩阵页 / calendar.html / club.html /
 *          ceo-tour.html / reports/index.html / faq.html；
 *  - 拷入最新预览截图：首屏-1280.png、整页-1280.png、首屏-375.png、整页-375.png，以及决策台三种状态截图；
 *  - 写 REVIEW.txt（分支、最新提交号、生成时间）；
 *  - 打包前扫描所有待拷文件，若含 token / 密钥 / webhook 地址则排除并汇报；
 *  - 严禁拷入：functions/、.env、node_modules、_img_backup、素材原图、webp 图库。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const BASE = path.resolve(ROOT, '..', '26.10迭代'); // 项目父目录（gtn-global-site-3.0 的上一级）
const OUT = path.join(BASE, '审阅包');

// 严禁进入/拷入的目录与文件
const FORBID_DIRS = new Set(['functions', 'node_modules', '.git', '.codebuddy', '_demo', '_img_backup', 'backup', 'clients', 'carousel', 'flags', 'logo', 'assets', 'webp', '素材', 'raw', '原图']);
const FORBID_FILE = /(\.env|secrets?|credentials|\.pem|\.key)$/i;
// 密钥/ webhook 扫描（命中则排除该文件）
const SECRET_RE = [
  /sk-[A-Za-z0-9]{20,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /xox[baprs]-[0-9A-Za-z-]{10,}/,
  /webhook\s*[:=]\s*https?:\/\/\S+/i,
  /\b(api[_-]?key|secret|token|password)\b["'\s:=]+\S{16,}/i,
];

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const a = path.join(p, e.name);
    if (e.isDirectory()) rmrf(a); else fs.rmSync(a, { force: true });
  }
  fs.rmdirSync(p, { recursive: true, force: true });
}

function copyFile(src, rel) {
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return dst;
}

function secretScan(abs) {
  let c = '';
  try { c = fs.readFileSync(abs, 'utf8'); } catch { return false; }
  return SECRET_RE.some(re => re.test(c));
}

// ---- 待拷页面/资源清单 ----
const pages = [
  'index.html', 'style.css', 'script.js',
  'calendar.html', 'club.html', 'ceo-tour.html', 'reports/index.html', 'faq.html',
  'matrix/auto-tech-europe/index.html',
  'matrix/new-energy-europe/index.html',
  'matrix/ai-southeast-asia/index.html',
  'matrix/new-energy-middle-east/index.html',
];
// data/*.js
for (const f of fs.readdirSync(path.join(ROOT, 'data'))) {
  if (/^[\w-]+\.js$/.test(f)) pages.push('data/' + f);
}

// ---- 预览截图 ----
const SHOT_NAMES = ['首屏-1280.png', '整页-1280.png', '首屏-375.png', '整页-375.png'];
const shots = [];
function findShots() {
  const found = new Set();
  (function walk(dir) {
    let es;
    try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const a = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (FORBID_DIRS.has(e.name)) continue;
        // 不递归进资源/备份目录找截图
        if (['assets', 'webp', '素材', '原图', '_img_backup', 'node_modules', '.git'].includes(e.name)) continue;
        walk(a);
      } else if (e.name.toLowerCase().endsWith('.png')) {
        found.add(a);
      }
    }
  })(ROOT);
  return found;
}
const allShots = findShots();
for (const name of SHOT_NAMES) {
  const hit = [...allShots].find(a => path.basename(a) === name || path.basename(a).startsWith(name.replace(/\.png$/, '')));
  if (hit) shots.push(hit);
}
// 决策台三种状态截图：匹配 决策台/desk/verify/state 且不在已选 4 张内
const deskShots = [...allShots].filter(a => /决策台|desk|verify|state/i.test(path.basename(a)) && !shots.includes(a)).slice(0, 3);
deskShots.forEach(s => shots.push(s));

// ---- 执行 ----
rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

const copied = [];
const excluded = [];
for (const rel of pages) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) { excluded.push(rel + '（源文件不存在）'); continue; }
  if (FORBID_FILE.test(rel)) { excluded.push(rel + '（ forbidden 文件名）'); continue; }
  if (secretScan(src)) { excluded.push(rel + '（命中密钥/ webhook，已排除）'); continue; }
  copyFile(src, rel);
  copied.push(rel);
}
for (const s of shots) {
  if (secretScan(s)) { excluded.push(path.basename(s) + '（命中密钥/ webhook，已排除）'); continue; }
  copyFile(s, 'shots/' + path.basename(s));
  copied.push('shots/' + path.basename(s));
}

// ---- REVIEW.txt ----
let branch = '', head = '';
try { branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch {}
try { head = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch {}
const review = [
  '# 审阅包 REVIEW',
  '',
  '分支: ' + (branch || '(无法获取)'),
  '最新提交号: ' + (head || '(无法获取)'),
  '生成时间: ' + new Date().toISOString(),
  '',
  '## 已拷入文件',
  ...copied.map(f => '- ' + f),
  '',
  '## 已排除/缺失',
  ...(excluded.length ? excluded.map(f => '- ' + f) : ['(无)']),
].join('\n');
fs.writeFileSync(path.join(OUT, 'REVIEW.txt'), review, 'utf8');

console.log('审阅包已生成：' + OUT);
console.log('拷入文件数：' + copied.length);
copied.forEach(f => console.log('  + ' + f));
if (excluded.length) { console.log('排除/缺失：'); excluded.forEach(f => console.log('  - ' + f)); }
