// 把 data/*.json 编译成 data/*.js（window.GTN.*），页面用 <script src> 加载，
// 这样 file:// 直接双击 index.html 也能读到数据（fetch 在 file:// 下会被浏览器拦截）。
// 用法：node tools/build-data.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const D = (...p) => path.join(ROOT, ...p);

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function listWebp(dir) {
  const abs = D(dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter(f => f.toLowerCase().endsWith('.webp')).sort();
}

// 1) 重建 marquee：上排 GTN_Global 全部图（向右），下排 CEO_tour 全部图（向左），不挑选
const upFiles = listWebp('GTN_Global/webp');
const downFiles = listWebp('CEO_tour/webp');
const marquee = {
  up:   { dir: 'up',   items: upFiles.map((f, i) => ({ img: 'GTN_Global/webp/' + f, alt: '走出去 ' + (i + 1) })) },
  down: { dir: 'down', items: downFiles.map((f, i) => ({ img: 'CEO_tour/webp/' + f, alt: '请进来 ' + (i + 1) })) }
};
fs.writeFileSync(D('data', 'marquee.json'), JSON.stringify(marquee, null, 2) + '\n', 'utf8');
console.log('marquee 重建：up(GTN_Global)=' + upFiles.length + '  down(CEO_tour)=' + downFiles.length);

// 2) 生成 data/*.js
const KEYS = ['marquee', 'filters', 'products', 'calendar', 'index'];
const loaded = {};
for (const key of KEYS) {
  const jsonPath = D('data', key + '.json');
  if (!fs.existsSync(jsonPath)) { console.log('跳过（无 json）：' + key); continue; }
  const obj = readJson(jsonPath);
  const js = 'window.GTN=window.GTN||{};window.GTN.' + key + '=' + JSON.stringify(obj) + ';\n';
  fs.writeFileSync(D('data', key + '.js'), js, 'utf8');
  loaded[key] = obj;
  console.log('生成 data/' + key + '.js');
}

// 3) 校验图片路径（相对站点根目录），缺失即报错
const missing = [];
function checkImages(arr, label) {
  (arr || []).forEach(it => {
    const img = typeof it === 'string' ? it : (it.img || it.image || it.src || it.photo);
    if (!img) return;
    if (!fs.existsSync(D(img))) missing.push(label + ' → ' + img);
  });
}
if (loaded.marquee) {
  checkImages(loaded.marquee.up && loaded.marquee.up.items, 'marquee.up');
  checkImages(loaded.marquee.down && loaded.marquee.down.items, 'marquee.down');
}
if (loaded.index) {
  ['event', 'report', 'advisor', 'ops_center', 'calendar'].forEach(t => checkImages(loaded.index[t], 'index.' + t));
}

if (missing.length) {
  console.error('\n[图片缺失] 以下引用文件不存在：');
  missing.forEach(m => console.error('  - ' + m));
  process.exitCode = 1;
} else {
  console.log('图片路径校验通过');
}
