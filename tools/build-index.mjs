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

// 链主 / 明确归属（按 experts 目录 slug；只有能一眼判断的才写，其余走关键词或进待核对）
const LEADS = {
  'zhang-guo': '新能源',
  'zhang-guosheng': '新能源',
  'wang-gaoge': '汽车智能科技',
  'chen-jiale': '汽车智能科技',
  'zhang-le': 'AI产业',
  'li-guo': 'AI产业',
  'tang-zhaobo': '消费品牌',
  'zhao-weidong': '跨国资本',
  'zhang-yali': '跨国资本',
  'zhang-guanghui': '国际人才',
  'zhang-chenggang': '国际人才'
};
// 创始人不属于单一产业，不猜标签、也不进待核对
const NO_INDustry_OK = new Set(['donglixin']);

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
  { id: 'report-auto-tech-2026', industry: '汽车智能科技', title: '汽车智能科技出海研究报告（2026 新版）', status: '预计 11 月发布', version: '2026 版', url: '', action: '登记意向' },
  { id: 'report-ai', industry: 'AI产业', title: 'AI 产业出海研究报告', status: '研究进行中', version: '', url: '', action: '登记意向' }
].map(r => ({ ...r, countries: [], regions: [] }));

// ---------- 3. advisor：以 advisors-index.html 卡片为准（全量，含未建独立页的） ----------
const advisors = [];
const seenAdvisor = new Set();
const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function pushAdvisor(o) {
  if (seenAdvisor.has(o.url)) return;
  seenAdvisor.add(o.url);
  advisors.push(o);
}

// 3.1 从 advisors-index.html 读全部真实卡片（占位卡 Coming Soon 无 href，自动跳过）
const advIndexFile = D('advisors-index.html');
let advCardTotal = 0, advCardPlaceholder = 0;
if (exists(advIndexFile)) {
  const html = read(advIndexFile);
  const chunks = html.split(/<a\s[^>]*class="[^"]*ops-card[^"]*"/i).slice(1);
  for (const chunk of chunks) {
    advCardTotal++;
    const seg = chunk.slice(0, chunk.indexOf('</a>') > 0 ? chunk.indexOf('</a>') : 2500);
    const href = (seg.match(/href="([^"]+)"/) || [])[1] || '';
    if (!href || !/experts\/[^/]+\/index\.html$/.test(href)) { advCardPlaceholder++; continue; }
    const dir = href.replace(/^experts\//, '').replace(/\/index\.html$/, '');
    const name = strip((seg.match(/class="ops-name"[^>]*>([\s\S]*?)<\/div>/) || [])[1]);
    const role = strip((seg.match(/<h4[^>]*>([\s\S]*?)<\/h4>/) || [])[1]);
    const bio = strip((seg.match(/class="ops-bio"[^>]*>([\s\S]*?)<\/div>/) || [])[1]);
    const photo = (seg.match(/<img[^>]+src="([^"]+)"/) || [])[1] || '';
    const pageFile = D('experts', dir, 'index.html');
    const pageHtml = exists(pageFile) ? read(pageFile) : '';
    // 创始人等不归入单一产业的，不猜标签；其余命中超过 2 个产业视为噪声，不猜、进待核对
    let industries = LEADS[dir] ? [LEADS[dir]]
      : (NO_INDustry_OK.has(dir) ? [] : guessIndustries(role + ' ' + bio + ' ' + pageHtml));
    if (!LEADS[dir] && industries.length > 2) industries = [];
    industries = [...new Set(industries)];
    const countries = [...new Set(guessCountries(pageHtml || bio))];
    pushAdvisor({
      id: dir,
      name: name || dir,
      role,
      url: href,
      photo: photo ? normPhoto(photo, 'experts/' + dir) : '',
      one: bio.slice(0, 60),
      industries,
      countries,
      regions: regionsOf(countries),
      isLead: !!LEADS[dir]
    });
    if (!LEADS[dir] && industries.length === 0 && !NO_INDustry_OK.has(dir)) {
      toPending('advisor', { name: name || dir, url: href }, '卡片与页面均未命中产业关键词', guessIndustries(role + ' ' + bio).join('/') || '—');
    }
  }
}

// 3.2 补漏：experts/ 下有独立页但索引页没卡片的
const expRoot = D('experts');
if (exists(expRoot)) {
  fs.readdirSync(expRoot).filter(d => d !== '_demo' && fs.statSync(path.join(expRoot, d)).isDirectory()).forEach(dir => {
    const file = path.join(expRoot, dir, 'index.html');
    if (!exists(file)) return;
    const url = 'experts/' + dir + '/index.html';
    if (seenAdvisor.has(url)) return;
    const html = read(file);
    const nameM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const name = nameM ? strip(nameM[1]).split('｜')[0].trim() : dir;
    const photoM = html.match(/<img[^>]+src="([^"]*(?:avatar|portrait|adv-|zhanguo|wanggao)[^"]*)"/i)
      || html.match(/<img[^>]+class="[^"]*avatar[^"]*"[^>]+src="([^"]+)"/i)
      || html.match(/<img[^>]+src="([^"]+)"/);
    let industries = LEADS[dir] ? [LEADS[dir]] : guessIndustries(html);
    industries = [...new Set(industries)];
    const countries = [...new Set(guessCountries(html))];
    pushAdvisor({
      id: dir, name, role: '', url, photo: photoM ? normPhoto(photoM[1], 'experts/' + dir) : '',
      one: '', industries, countries, regions: regionsOf(countries), isLead: !!LEADS[dir]
    });
    if (!LEADS[dir] && industries.length === 0 && !NO_INDustry_OK.has(dir)) {
      toPending('advisor', { name, url }, '页面内容未命中产业关键词', '—');
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
    // 先取 <title>（多数运营中心页没有 h1），再退回 h1/h2/h4
    const nameM = html.match(/<title>([\s\S]*?)<\/title>/)
      || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
      || html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)
      || html.match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
    let name = nameM ? nameM[1].replace(/<[^>]+>/g, '').split(/[｜|]/)[0].split('·')[0].split('—')[0].trim() : '';
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

// 4.1 补：非 ops- 前缀但确为运营中心负责人的页面（目前只有迟文劼，运营中心主任兼 CMO）
const OPS_EXTRA = [{ dir: 'chi-wenjie', country: '中国', region: '' }];
for (const x of OPS_EXTRA) {
  const file = D('member', x.dir, 'index.html');
  if (!exists(file)) continue;
  const url = 'member/' + x.dir + '/index.html';
  if (ops.some(o => o.url === url)) continue;
  const html = read(file);
  const nameM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
    || html.match(/<h4[^>]*>([\s\S]*?)<\/h4>/)
    || html.match(/<title>([\s\S]*?)<\/title>/);
  const raw = nameM ? nameM[1].replace(/<[^>]+>/g, '').split('｜')[0].trim() : '';
  const name = raw.replace(/\s*·\s*运营中心.*$/, '').trim() || x.dir;
  const photoM = html.match(/<img[^>]+class="[^"]*avatar[^"]*"[^>]+src="([^"]+)"/i) || html.match(/<img[^>]+src="([^"]+)"/);
  ops.push({
    id: x.dir, name, url, photo: photoM ? normPhoto(photoM[1], 'member/' + x.dir) : '',
    country: x.country, region: x.region, city: x.dir
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
console.log('  顾问索引卡片=' + advCardTotal + '（其中占位无链接=' + advCardPlaceholder + '）；入库顾问=' + advisors.length + '，有头像=' + advisors.filter(a => a.photo).length);
console.log('标签待核对：' + pending.length + ' 条 → 标签待核对.md');
