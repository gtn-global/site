// 生成「产业 × 区域」矩阵静态页：/matrix/{industry-slug}-{region-slug}/index.html
// 数据直接写进 HTML（不靠前端 JS 注入），逻辑与首页决策台保持一致。
// 页面位于第 2 层（matrix/{slug}/index.html），故所有根相对路径用 ../../ 前缀。
// 用法：node tools/build-matrix-pages.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const D = (...p) => path.join(ROOT, ...p);
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const P = '../../'; // 第 2 层页 → 根相对前缀

// 区域名 → slug
const REGION_SLUG = {
  '东南亚': 'southeast-asia', '东亚': 'east-asia', '南亚': 'south-asia', '中亚': 'central-asia',
  '中东': 'middle-east', '欧洲': 'europe', '非洲': 'africa', '美洲': 'americas'
};

// 用户选定的 4 个格子（已确认：报告/顾问 + ≥2 项区域特定内容）
const CELLS = [
  { industry: 'auto-tech',  region: '欧洲' },
  { industry: 'new-energy', region: '欧洲' },
  { industry: 'ai',         region: '东南亚' },
  { industry: 'new-energy', region: '中东' }
];

const index = JSON.parse(fs.readFileSync(D('data', 'index.json'), 'utf8'));
const filters = JSON.parse(fs.readFileSync(D('data', 'filters.json'), 'utf8'));
const industries = filters.industries;
const indBySlug = (s) => industries.find(i => i.slug === s);

const VARIANTS = {
  'new-energy': ['新能源电力电气', '绿色能源', '新能源'],
  'auto-tech': ['新能源车与智慧交通', '新能源车', '智慧交通', '汽车智能科技'],
  'ai': ['人工智能', 'AI产业', 'AI'],
  'consumer': ['消费品牌', '消费品牌出海'],
  'capital': ['跨国资本与并购', '跨国资本', '并购'],
  'talent': ['国际人才与职教', '国际人才', '职教']
};
function indAccept(slug) {
  const s = new Set([slug]);
  (VARIANTS[slug] || []).forEach(x => s.add(x));
  const ind = indBySlug(slug);
  if (ind) { s.add(ind.name); (ind.aliases || []).forEach(a => s.add(a)); }
  return s;
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 条目日期只显示「年月」，不显示日；date_start 仅用于排序
const monthOnly = (t) => { if (!t) return ''; const m = String(t).match(/(\d{4})\s*年\s*(\d{1,2})\s*月/); return m ? (m[1] + ' 年 ' + parseInt(m[2], 10) + ' 月') : t; };

function computeCell(slug, region) {
  const acc = indAccept(slug);
  const ind = indBySlug(slug);
  const indName = ind ? (ind.display || ind.name) : slug;
  const reports = (index.report || []).filter(r => !slug || acc.has(r.industry));
  const events = (index.event || []).filter(e => {
    const okI = !slug || (e.industries || []).some(x => acc.has(x));
    const okR = (e.regions || []).indexOf(region) >= 0 || (e.countries || []).indexOf(region) >= 0;
    return okI && okR;
  }).sort((a, b) => {
    if ((b.year || '') !== (a.year || '')) return String(b.year || '').localeCompare(String(a.year || ''));
    return String(b.date || b.date_start || '').localeCompare(String(a.date || a.date_start || ''));
  });
  const advisors = (index.advisor || []).filter(a => a.id !== 'donglixin' && (!slug || (a.industries || []).some(x => acc.has(x))))
    .slice().sort((a, b) => (b.isLead ? 1 : 0) - (a.isLead ? 1 : 0)).slice(0, 4);
  const ops = (index.ops_center || []).filter(o => region && (o.region === region || o.country === region));
  const now = new Date().toISOString().slice(0, 10);
  const cal = (index.calendar || []).filter(c => {
    if (c.visible === false || c.status === 'closed') return false;
    if (slug && (c.industries || []).length && (c.industries || []).indexOf(slug) < 0 && !(region && (c.regions || []).indexOf(region) >= 0)) return false;
    if (region && (c.regions || []).length && (c.regions || []).indexOf(region) < 0) return false;
    return (!c.date_start || c.date_start >= now);
  }).sort((a, b) => String(a.date_start || '9999').localeCompare(String(b.date_start || '9999'))).slice(0, 1);
  return { indName, reports, events, advisors, ops, cal };
}

const cellUrl = (slug, region) => `matrix/${slug}-${REGION_SLUG[region]}/index.html`;

function mod(no, label, inner) {
  if (inner === undefined) inner = '<p class="desk-empty">这一块正在筹备。</p>';
  return `<div class="desk-mod"><div class="desk-mod-title"><span class="desk-mod-no">${no}</span> — ${esc(label)}</div>${inner}</div>`;
}

function buildPage(slug, region) {
  const c = computeCell(slug, region);
  const ind = indBySlug(slug);
  const indName = c.indName;
  const slugDir = `${slug}-${REGION_SLUG[region]}`;
  const url = `https://gatewaytonew.com/matrix/${slugDir}/`;

  const reportsHtml = c.reports.length
    ? `<ul class="desk-list">` + c.reports.map(r => {
        const acts = (r.url ? `<a class="desk-link" href="${P}${esc(r.url)}">${esc(r.action || '查看')}</a>` : `<span class="desk-status">发布时通知我</span>`)
          + (r.prev_url ? `<a class="desk-link" href="${P}${esc(r.prev_url)}">${esc(r.prev_label || '阅读往期版')}</a>` : '');
        return `<li><span class="desk-status">${esc(r.status || '')}</span><span class="desk-t">${esc(r.title)}</span>${acts}</li>`;
      }).join('') + `</ul>`
    : `<p class="desk-empty">这一块正在筹备。</p>`;

  const eventsHtml = c.events.length
    ? `<ul class="desk-list">` + c.events.map(e => {
        const country = (e.countries && e.countries[0]) || '';
        const txt = `${esc(e.year || '')}｜${esc(country)}｜${esc(e.title)}`;
        const link = e.url ? `<a class="desk-link" href="${P}${esc(e.url)}">查看</a>` : '';
        return `<li><span class="desk-t">${txt}</span>${link}</li>`;
      }).join('') + `</ul><a class="desk-more" href="${P}events-index.html">查看全部考察 →</a>`
    : `<p class="desk-empty">这一块正在筹备。</p>`;

  const advisorsHtml = c.advisors.length
    ? `<div class="desk-adv">` + c.advisors.map(a => {
        const im = a.photo ? `<img src="${P}${esc(a.photo)}" alt="${esc(a.name)}">` : `<span class="desk-adv-ph">${esc(String(a.name).slice(0, 1))}</span>`;
        const one = a.role ? esc(a.role) : esc(a.one || '');
        return `<a class="desk-adv-item" href="${P}${esc(a.url)}">${im}<span><span class="desk-adv-name">${esc(a.name)}</span>${one ? `<span class="desk-adv-one">${one}</span>` : ''}</span></a>`;
      }).join('') + `</div>`
    : `<p class="desk-empty">这一块正在筹备。</p>`;

  const opsHtml = c.ops.length
    ? `<div class="desk-ops">` + c.ops.map(o => {
        const im = o.photo ? `<img src="${P}${esc(o.photo)}" alt="${esc(o.name)}">` : `<span class="desk-adv-ph">${esc(String(o.name).slice(0, 1))}</span>`;
        const sub = o.region || o.country || '';
        return `<a class="desk-ops-item" href="${P}${esc(o.url)}">${im}<span><span class="desk-ops-name">${esc(o.name)}</span>${sub ? `<span class="desk-adv-one">${esc(sub)}</span>` : ''}</span></a>`;
      }).join('') + `</div>`
    : `<p class="desk-empty">这一块正在筹备。</p>`;

  const calHtml = c.cal.length
    ? `<ul class="desk-list">` + c.cal.map(cc => `<li><span class="desk-t">${esc(monthOnly(cc.date_text) || '')}　${esc(cc.product)}</span><span class="desk-status">${esc(cc.status === 'planning' ? '筹备中 · 登记意向' : (cc.status || ''))}</span></li>`).join('') + `</ul><a class="desk-more" href="${P}calendar.html">查看完整日程 →</a>`
    : `<p class="desk-empty">这一块正在筹备。</p>`;

  const repStatus = c.reports.length ? c.reports.map(r => r.status || '').filter(Boolean).join('、') : '筹备中';
  // 数量为 0 的项直接省略，避免描述里出现「0 个当地运营中心」等零值
  const descParts = [];
  if (c.reports.length) descParts.push(`共 ${c.reports.length} 份研究报告（${repStatus}）`);
  if (c.events.length) descParts.push(`${c.events.length} 场往期考察`);
  if (c.advisors.length) descParts.push(`${c.advisors.length} 位对口顾问`);
  if (c.ops.length) descParts.push(`${c.ops.length} 个当地运营中心`);
  const descBody = descParts.length ? descParts.join('，') : '正在筹备中';
  const description = `海鑫汇（Gateway To New）在${indName} × ${region}方向：${descBody}。`;

  const breadcrumbLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': '首页', 'item': 'https://gatewaytonew.com/' },
      { '@type': 'ListItem', 'position': 2, 'name': `${indName} × ${region}`, 'item': url }
    ]
  });

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(indName)} × ${esc(region)} 出海｜海鑫汇 Gateway To New</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(indName)} × ${esc(region)} 出海｜海鑫汇 Gateway To New">
  <meta property="og:description" content="${esc(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <link rel="stylesheet" href="${P}style.css">
  <script type="application/ld+json">
${breadcrumbLd}
</script>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a href="${P}index.html" class="wordmark"><img src="${P}assets/img/logo-primary.svg" alt="海鑫汇" class="logo-wordmark" fetchpriority="high"><span class="wm-text"><span class="sub">GATEWAY TO NEW</span><span class="slogan">连接中国优势，走向全球</span></span></a>
      <div class="desk-clock"></div>
      <a href="${P}index.html" class="subpage-back">&larr; 返回首页<span class="en">BACK TO HOME</span></a>
    </div>
  </header>

  <section class="section">
    <nav class="breadcrumb"><a href="${P}index.html">首页</a> › ${esc(indName)} × ${esc(region)}</nav>
    <div class="eyebrow">产业 × 区域 / INDUSTRY × REGION</div>
    <h1 class="headline">${esc(indName)} × ${esc(region)}</h1>
    <p class="subline">本页汇总海鑫汇在${esc(indName)}×${esc(region)}方向的研究报告、往期考察、对口顾问与当地运营中心。</p>

    <div class="desk">
      <div class="desk-modules">
        ${mod('01', '研究报告', reportsHtml)}
        ${mod('02', '往期考察与调研', eventsHtml)}
        ${mod('03', '对口顾问', advisorsHtml)}
        ${mod('04', '当地运营中心', opsHtml)}
        ${mod('05', '下一次相关活动', calHtml)}
      </div>
      <div class="desk-foot">
        <a class="btn-submit btn-seal" href="${P}p/project/index.html">提交出海项目</a>
      </div>
    </div>
  </section>

  <footer class="footer" data-depth="2"></footer>
  <script src="${P}script.js"></script>
</body>
</html>
`;
  const outDir = D('matrix', slugDir);
  mkdir(outDir);
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
  return { slugDir, indName, reports: c.reports.length, events: c.events.length, advisors: c.advisors.length, ops: c.ops.length, cal: c.cal.length };
}

const summary = [];
const pages = [];
for (const cell of CELLS) {
  const r = buildPage(cell.industry, cell.region);
  pages.push({ industry: cell.industry, region: cell.region, url: cellUrl(cell.industry, cell.region) });
  summary.push(r);
}
// 写回 data/matrix.json（供首页决策台「本格独立页」按 industry+region 匹配）
fs.writeFileSync(D('data', 'matrix.json'), JSON.stringify({ pages }, null, 2) + '\n', 'utf8');

console.log('已生成矩阵页：');
summary.forEach(s => console.log(`  matrix/${s.slugDir}/  ${s.indName} × 区域  报告${s.reports} 考察${s.events} 顾问${s.advisors} 运营${s.ops} 下次${s.cal}`));
console.log('data/matrix.json 已更新，pages 数量=' + pages.length);
