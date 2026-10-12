// 生成首页圆点世界图数据 data/map.js（再经 node tools/build-data.mjs 之外单独产出，页面用 <script src> 加载）
//
// 素材：Natural Earth 陆地多边形（公有领域），构建时从 unpkg world-atlas 获取；
// 只用于在构建期栅格化成圆点，产出的 data/map.js 里只有坐标数字，不含任何边界几何。
// 取不到网络时会保留上一版 data/map.js 并在结尾提示。
//
// 用法：node tools/build-map.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const D = (...p) => path.join(ROOT, ...p);

const SRC = 'https://unpkg.com/world-atlas@2/land-110m.json';
const STEP = 4.5;          // 栅格步长（度），约 4–5° 一格
const LAT_TOP = 84;        // 不做南极与北极空白区
const LAT_BOTTOM = -58;
const W = 1000, H = 500;   // viewBox 尺寸（等距圆柱，2:1）

// 标记点中心（示意用，非精确疆域；只给 index.json 里确实有内容的国家或地区）
const CENTER = {
  中国: [104, 35], 哈萨克斯坦: [67, 48], 匈牙利: [19, 47], 越南: [106, 16], 墨西哥: [-102, 23],
  巴基斯坦: [69, 30], 泰国: [101, 15], 法国: [2.5, 46.5], 芬兰: [26, 62], 伊拉克: [44, 33],
  菲律宾: [122, 12], 塞尔维亚: [21, 44], 马来西亚: [102, 4], 印度尼西亚: [118, -2],
  新加坡: [103.8, 1.35], 马尔代夫: [73.5, 4], 吉布提: [43, 11.5], 肯尼亚: [37, 0],
  德国: [10, 51], 卢森堡: [6.2, 49.8], 日本: [138, 37], 比利时: [4.5, 50.6],
  荷兰: [5.5, 52.2], 奥地利: [14.5, 47.6], 捷克: [15.2, 49.8], 斯洛伐克: [19.5, 48.7],
  韩国: [127.8, 36.3], 英国: [-2, 54], 美国: [-98, 39], 阿联酋: [54, 24], 沙特: [45, 25],
  印度: [79, 22], 中东: [45, 27]
};

function proj(lon, lat) {
  return [ +(((lon + 180) / 360) * W).toFixed(1), +(((90 - lat) / 180) * H).toFixed(1) ];
}

// ---------- 1. 取陆地多边形 ----------
let text = '';
try {
  const r = await fetch(SRC);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  text = await r.text();
  console.log('已获取陆地掩膜：' + text.length + ' 字节（' + SRC + '）');
} catch (e) {
  console.warn('[警告] 取不到陆地掩膜（' + e.message + '），保留现有 data/map.js 不动。');
  process.exit(0);
}

const topo = JSON.parse(text);
const [sx, sy] = topo.transform.scale;
const [tx, ty] = topo.transform.translate;
const arcs = topo.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
});

function ringOf(idx) {
  const rev = idx < 0;
  const a = arcs[rev ? ~idx : idx];
  return rev ? a.slice().reverse() : a;
}
function ringPoints(arcIdxs) {
  const pts = [];
  for (const idx of arcIdxs) {
    const a = ringOf(idx);
    for (let i = (pts.length ? 1 : 0); i < a.length; i++) pts.push(a[i]);
  }
  return pts;
}

const polys = []; // 每个多边形：[[ring],[ring]...]
const obj = topo.objects && topo.objects.land;
if (obj) {
  const geoms = obj.type === 'GeometryCollection' ? obj.geometries : [obj];
  for (const g of geoms) {
    if (g.type === 'Polygon') polys.push(g.arcs.map(ringPoints));
    else if (g.type === 'MultiPolygon') g.arcs.forEach(p => polys.push(p.map(ringPoints)));
  }
}
console.log('陆地多边形：' + polys.length + ' 个');

// ---------- 2. 栅格化：命中陆地即落一个圆点（偶奇规则，自动处理内湖洞） ----------
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function isLand(lon, lat) {
  let inside = false;
  for (const poly of polys) {
    for (const ring of poly) if (inRing(lon, lat, ring)) inside = !inside;
  }
  return inside;
}

const dots = [];
for (let lat = LAT_TOP; lat >= LAT_BOTTOM; lat -= STEP) {
  const latP = Math.round(lat * 10) / 10;
  for (let lon = -180; lon <= 180; lon += STEP) {
    const lonP = Math.round(lon * 10) / 10;
    if (lonP > 180) continue;
    if (isLand(lonP, latP)) dots.push(proj(lonP, latP));
  }
}
console.log('圆点：' + dots.length + ' 个（步长 ' + STEP + '°）');

// ---------- 3. 标记点：只给 index.json 里有内容的国家或地区 ----------
const index = fs.existsSync(D('data', 'index.json'))
  ? JSON.parse(fs.readFileSync(D('data', 'index.json'), 'utf8')) : {};
const filters = fs.existsSync(D('data', 'filters.json'))
  ? JSON.parse(fs.readFileSync(D('data', 'filters.json'), 'utf8')) : { countries: [] };

const slugOfName = {};
(filters.countries || []).forEach(c => { slugOfName[c.name] = c.slug; });
const regionOfName = {};
(filters.countries || []).forEach(c => { regionOfName[c.name] = c.region; });

const stat = {};
(index.event || []).forEach(e => (e.countries || []).forEach(c => {
  stat[c] = stat[c] || { events: 0, advisors: 0, ops: 0, reports: 0 };
  stat[c].events++;
}));
(index.ops_center || []).forEach(o => {
  const key = o.country || o.region;
  if (!key) return;
  stat[key] = stat[key] || { events: 0, advisors: 0, ops: 0, reports: 0 };
  stat[key].ops++;
});
(index.advisor || []).forEach(a => (a.countries || []).forEach(c => {
  stat[c] = stat[c] || { events: 0, advisors: 0, ops: 0, reports: 0 };
  stat[c].advisors++;
}));

const markers = [];
const noCenter = [];
for (const [name, s] of Object.entries(stat)) {
  const c = CENTER[name];
  if (!c) { noCenter.push(name); continue; }
  const [x, y] = proj(c[0], c[1]);
  markers.push({
    name,
    x, y,
    slug: slugOfName[name] || '',
    region: regionOfName[name] || (name === '中东' ? '中东' : ''),
    events: s.events, advisors: s.advisors, ops: s.ops
  });
}
markers.sort((a, b) => (b.events + b.ops + b.advisors) - (a.events + a.ops + a.advisors));
console.log('标记点：' + markers.length + ' 个' + (noCenter.length ? '（无坐标已跳过：' + noCenter.join('、') + '）' : ''));

const out = 'window.GTN=window.GTN||{};window.GTN.map=' + JSON.stringify({ w: W, h: H, step: STEP, dots, markers }) + ';\n';
fs.writeFileSync(D('data', 'map.js'), out, 'utf8');
console.log('已写出 data/map.js（' + Math.round(out.length / 1024) + 'KB）');
