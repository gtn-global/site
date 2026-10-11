// 生成统一内容索引 data/index.json（再经 node tools/build-data.mjs 产出 index.js）
// 用法：node tools/build-index.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const D = (...p) => path.join(ROOT, ...p);
const read = p => fs.readFileSync(p, 'utf8');
const readJson = p => JSON.parse(read(p));
const exists = p => fs.existsSync(p);

const filters = readJson(D('data', 'filters.json'));

// 国家 → 大区（沿用 filters.json 已定分组）
const REGION_OF = {};
(filters.countries || []).forEach(c => { REGION_OF[c.name] = c.region; });

// slug → 国家名
const SLUG_COUNTRY = {};
(filters.countries || []).forEach(c => { SLUG_COUNTRY[c.slug] = c.name; });

// ---------- 关键词推断（无法判断的不猜，进待核对） ----------
const COUNTRY_KEYS = {
  马尔代夫: ['maldives'], 墨西哥: ['mexico'], 哈萨克斯坦: ['kazakhstan'], 匈牙利: ['hungary'],
  越南: ['vietnam', 'hcmc', 'ho-chi-minh'], 巴基斯坦: ['pakistan'], 泰国: ['thailand'],
  法国: ['france'], 芬兰: ['finland'], 伊拉克: ['iraq'], 菲律宾: ['philippines'],
  塞尔维亚: ['serbia'], 马来西亚: ['malaysia'], 印度尼西亚: ['indonesia'], 新加坡: ['singapore'],
  吉布提: ['djibouti'], 肯尼亚: ['kenya'], 德国: ['germany'], 卢森堡: ['luxembourg'],
  日本: ['japan'], 比利时: ['belgium'], 荷兰: ['netherlands'], 奥地利: ['austria'],
  捷克: ['czech'], 斯洛伐克: ['slovakia'], 韩国: ['korea'], 中国: ['beijing', 'hangzhou', 'ningbo', 'shenzhen', 'suzhou', 'shanghai', 'guangzhou']
};

const IND_KEYS = {
  新能源: ['新能源', '锂电', '光伏', '储能', '充电', '电力', '电气', '清洁能源', 'cleantech'],
  汽车智能科技: ['汽车', '汽配', '主机厂', '智慧交通', '智能制', '机器人', '低空', '新能源车'],
  AI产业: ['AI', '人工智能', '大模型', '算力', '空间智能', '半导体', '芯片', '算法'],
  消费品牌: ['消费', '品牌', '零售', '美妆', '家居', '食品', '跨境电', '新消费'],
  跨国资本: ['资本', '投资', '并购', '基金', '融资'],
  国际人才: ['人才', '教育', '留学', '招聘', '组织']
};

// 链主优先标产业（首页产业手风琴已定）
const LEADS = {
  'zhang-guo': '新能源',
  'wang-gaoge': '汽车智能科技',
  'zhang-le': 'AI产业',
  'tang-zhaobo': '消费品牌'
};

const pending = []; // 待核对条目
function toPending(kind, entry, reason, suggest) {
  pending.push({ kind, entry, reason, suggest });
}

// 页面里的图片可能是相对该页目录的路径，索引要按根目录可用为准做规范化
function normPhoto(src, baseDir) {
  if (!src) return '';
  if (/^(https?:)?\/\//.test(src) || src.startsWith('/') || src.startsWith('data:')) return src;
  if (src.startsWith(baseDir + '/')) return src;
  return baseDir + '/' + src;
}

function guessCountries(text) {
  const hits = [];
  const low = String(text || '').toLowerCase();
  for (const [name, keys] of Object.entries(COUNTRY_KEYS)) {
    if (keys.some(k => low.includes(k))) hits.push(name);
  }
  return hits;
}
function guessIndustries(text) {
  const hits = [];
  for (const [name, keys] of Object.entries(IND_KEYS)) {
    if (keys.some(k => String(text || '').includes(k))) hits.push(name);
  }
  return hits;
}
function regionsOf(countries) {
  const out = [];
  (countries || []).forEach(c => { const r = REGION_OF[c]; if (r && out.indexOf(r) < 0) out.push(r); });
  return out;
}

// ---------- 1. event：解析 events-index.html ----------
const CAT_LABEL = {
  tour: '企业游学', exchange: '国际交流', forum: '出海论坛', interview: '出海访谈',
  visit: '海外考察', salon: '出海沙龙', review: '出海读书会'
};

const events = [];
if (exists(D('events-index.html'))) {
  const lines = read(D('events-index.html')).split('\n');
  let cat = null;
  for (const line of lines) {
    const cb = line.match(/<div class="category-block[^"]*" id="([^"]+)"/);
    if (cb) { cat = cb[1]; continue; }
    const tr = line.match(/<tr data-fill="([^"]+)"([^>]*)>/);
    if (!tr) continue;
    const id = tr[1];
    const attrs = tr[2];
    const tds = [...line.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    const title = String(tds[1] || '').replace(/<[^>]+>/g, '').trim();
    const date = String(tds[2] || '').replace(/<[^>]+>/g, '').trim();
    const urlM = String(tds[3] || '').match(/href="([^"]+)"/);
    const url = urlM ? urlM[1] : '';

    const indAttr = (attrs.match(/data-industry="([^"]*)"/) || [])[1];
    const ctyAttr = (attrs.match(/data-country="([^"]*)"/) || [])[1];

    let industries = indAttr ? [indAttr] : guessIndustries(title);
    let countries = ctyAttr ? [ctyAttr] : guessCountries(url + ' ' + title);
    // data-industry 可能是「新能源 · 电力电气」形式，取主名
    industries = industries.map(s => String(s).split('·')[0].trim()).filter(Boolean);
    countries = countries.map(s => String(s).trim()).filter(Boolean);

    const ev = {
      id, type: cat || 'other', typeLabel: CAT_LABEL[cat] || cat || '其他',
      year: (date.match(/(\d{4})/) || [])[1] || '',
      date, title, url,
      industries: [...new Set(industries)],
      countries: [...new Set(countries)],
      regions: []
    };
    ev.regions = regionsOf(ev.countries);
    events.push(ev);

    if (!indAttr && ev.industries.length === 0) {
      toPending('event', { id, title, url }, '无法从标题/链接判断产业', guessIndustries(title).join('/') || '—');
    }
    if (!ctyAttr && ev.countries.length === 0) {
      toPending('event', { id, title, url }, '无法从标题/链接判断国家', '—');
    }
  }
}

// ---------- 2. report ----------
const reports = [
  { id: 'report-new-energy', industry: '新能源', title: '新能源电力电气出海研究报告', status: '已上线', version: '2026 版', url: 'reports/cleantech/index.html', action: '留资获取' },
  { id: 'report-auto-tech-2024', industry: '汽车智能科技', title: '汽车智能科技出海研究报告（2024 版）', status: '2024 版已上线', version: '2024 版', url: 'reports/EV/index.html', action: '留资获取' },
  { id: 'report-auto-tech-2026', industry: '汽车智能科技', title: '汽车智能科技出海研究报告（2026 新版）', status: '预计 11 月发布', version: '2026 版', url: '', action: '登记意向' },
  { id: 'report-ai', industry: 'AI产业', title: 'AI 产业出海研究报告', status: '研究进行中', version: '', url: '', action: '登记意向' }
].map(r => ({ ...r, countries: [], regions: [] }));

// ---------- 3. advisor ----------
const advisors = [];
const expRoot = D('experts');
if (exists(expRoot)) {
  fs.readdirSync(expRoot).filter(d => d !== '_demo' && fs.statSync(path.join(expRoot, d)).isDirectory()).forEach(dir => {
    const file = path.join(expRoot, dir, 'index.html');
    if (!exists(file)) return;
    const html = read(file);
    const nameM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const name = nameM ? nameM[1].replace(/<[^>]+>/g, '').split('｜')[0].trim() : dir;
    const photoM = html.match(/<img[^>]+src="([^"]*(?:avatar|portrait|adv-|zhanguo|wanggao)[^"]*)"/i)
      || html.match(/<img[^>]+class="[^"]*avatar[^"]*"[^>]+src="([^"]+)"/i)
      || html.match(/<img[^>]+src="([^"]+)"/);
    const photo = photoM ? normPhoto(photoM[1], 'experts/' + dir) : '';
    let industries = LEADS[dir] ? [LEADS[dir]] : guessIndustries(html);
    industries = [...new Set(industries)];
    const descM = html.match(/<p class="[^"]*(?:lede|subline)[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const one = descM ? descM[1].replace(/<[^>]+>/g, '').trim().slice(0, 60) : '';
    advisors.push({
      id: dir, name, url: 'experts/' + dir + '/index.html', photo, one,
      industries, countries: [], regions: [], isLead: !!LEADS[dir]
    });
    if (!LEADS[dir] && industries.length === 0) {
      toPending('advisor', { name, url: 'experts/' + dir + '/index.html' }, '页面内容未命中产业关键词', '—');
    }
  });
}

// ---------- 4. ops_center ----------
const OPS_COUNTRY = {
  singapore: '新加坡', japan: '日本', kazakhstan: '哈萨克斯坦', pakistan: '巴基斯坦',
  mena: null, beijing: '中国', hangzhou: '中国', ningbo: '中国', shenzhen: '中国', suzhou: '中国'
};
const ops = [];
const memRoot = D('member');
if (exists(memRoot)) {
  fs.readdirSync(memRoot).filter(d => d.startsWith('ops-') && fs.statSync(path.join(memRoot, d)).isDirectory()).forEach(dir => {
    const file = path.join(memRoot, dir, 'index.html');
    const slug = dir.replace(/^ops-/, '');
    let country = OPS_COUNTRY[slug];
    let region = '';
    if (slug === 'mena') { region = '中东'; }
    if (country) region = region || REGION_OF[country] || '';
    if (!exists(file)) {
      toPending('ops_center', { dir }, '无 index.html', country || region || '—');
      return;
    }
    const html = read(file);
    const nameM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
      || html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)
      || html.match(/<h4[^>]*>([\s\S]*?)<\/h4>/)
      || html.match(/<title>([\s\S]*?)<\/title>/);
    let name = nameM ? nameM[1].replace(/<[^>]+>/g, '').split('｜')[0].trim() : '';
    if (!name || /^ops-/i.test(name)) {
      name = dir;
      toPending('ops_center', { name: dir, url: 'member/' + dir + '/index.html' }, '页面未取到真实姓名，暂用目录名', '—');
    }
    const photoM = html.match(/<img[^>]+class="[^"]*avatar[^"]*"[^>]+src="([^"]+)"/i) || html.match(/<img[^>]+src="([^"]+)"/);
    const photo = photoM ? normPhoto(photoM[1], 'member/' + dir) : '';
    ops.push({
      id: dir, name, url: 'member/' + dir + '/index.html', photo,
      country: country || '', region, city: slug
    });
    if (!country && !region) {
      toPending('ops_center', { name, url: 'member/' + dir + '/index.html' }, '未识别国家/大区', '—');
    }
  });
}

// ---------- 5. calendar ----------
let calendar = [];
if (exists(D('data', 'calendar.json'))) calendar = readJson(D('data', 'calendar.json'));

const index = { generated: new Date().toISOString(), event: events, report: reports, advisor: advisors, ops_center: ops, calendar };
fs.writeFileSync(D('data', 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');

// ---------- 6. 待核对清单 ----------
let md = '# 标签待核对\n\n';
md += '> 由 `node tools/build-index.mjs` 自动生成。以下条目无法自动判断标签，请创始人只核对这一份。\n';
md += '> 核对后请把结论告诉我，我会把标签写进脚本的映射表（不猜标签）。\n\n';
md += '共 ' + pending.length + ' 条待核对。\n\n';
const byKind = {};
pending.forEach(p => { (byKind[p.kind] = byKind[p.kind] || []).push(p); });
for (const [kind, list] of Object.entries(byKind)) {
  md += '## ' + kind + '（' + list.length + ' 条）\n\n';
  md += '| 条目 | 页面链接 | 建议标签 | 理由 |\n|---|---|---|---|\n';
  list.forEach(p => {
    const title = p.entry.title || p.entry.name || p.entry.id || p.entry.dir || '';
    md += '| ' + title + ' | ' + (p.entry.url || '—') + ' | ' + (p.suggest || '—') + ' | ' + p.reason + ' |\n';
  });
  md += '\n';
}
fs.writeFileSync(D('标签待核对.md'), md, 'utf8');

console.log('index.json 生成完成');
console.log('  event=' + events.length + '  report=' + reports.length + '  advisor=' + advisors.length + '  ops_center=' + ops.length + '  calendar=' + calendar.length);
console.log('标签待核对：' + pending.length + ' 条 → 标签待核对.md');
