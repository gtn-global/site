// 实证数据层：只做函数，不产出浏览器 JS，也不写任何文件。
// 被 build-evidence.mjs（生成静态拆页）与 build-product-pages.mjs（产品页实证块）调用。
// 映射以 data/products.json 的 evidence_types 为准（程序读取，不写死）。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const EOL = '\r\n';
const crlf = (s) => s.replace(/\r\n/g, '\n').replace(/\n/g, EOL);

const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function readJson(p) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
}

let _events = null;
let _products = null;
function events() { if (!_events) _events = readJson('data/index.json').event; return _events; }
function products() { if (!_products) _products = readJson('data/products.json'); return _products; }

export function getProduct(slug) {
  return products().find((p) => p.slug === slug) || null;
}

export function typesForSlug(slug) {
  const p = getProduct(slug);
  return p && Array.isArray(p.evidence_types) ? p.evidence_types : [];
}

export function sortEvents(evs) {
  return [...evs].sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1; // 日期字符串倒序
    return a.id > b.id ? -1 : 1;                            // 同日按 id 倒序
  });
}

export function eventsForSlug(slug) {
  const types = typesForSlug(slug);
  return sortEvents(events().filter((e) => types.includes(e.type)));
}

export function yearRange(evs) {
  const ys = evs.map((e) => parseInt(e.year, 10)).filter((n) => !Number.isNaN(n));
  return [Math.min(...ys), Math.max(...ys)];
}

const STATS = {
  'global-trip': (e) => { const [lo, hi] = yearRange(e); return `海鑫汇 ${lo}–${hi} 年累计海外考察 ${e.length} 场`; },
  'closed-door': (e) => `同类线下活动 ${e.length} 场`,
  'chuhaiban': (e) => `出海论坛 ${e.length} 场`,
  'online-connect': (e) => `出海访谈 ${e.length} 期`,
  'ceo-tour': (e) => `国际交流 ${e.length} 场`,
};

export function statsText(slug) {
  const fn = STATS[slug];
  if (!fn) return '';
  return fn(eventsForSlug(slug));
}

const H1 = {
  'global-trip': '海外考察',
  'closed-door': '企业游学与产业调研 · 出海沙龙',
  'chuhaiban': '出海论坛',
  'online-connect': '出海访谈',
  'ceo-tour': '国际交流',
};

const BLOCK_TITLE = {
  'global-trip': '实证 · 海外考察',
  'closed-door': '实证 · 企业游学与产业调研 + 出海沙龙',
  'chuhaiban': '实证 · 出海论坛',
  'online-connect': '实证 · 出海访谈',
  'ceo-tour': '实证 · 国际交流',
};

const UNIT = { 'online-connect': '期' };

function tableRow(e, rel) {
  const url = rel + e.url;
  return `<tr><td class="key">${esc(e.id)}</td>` +
    `<td title="${esc((e.typeLabel || '') + '--' + e.title)}">${esc(e.title)}</td>` +
    `<td class="mono">${esc(e.date)}</td>` +
    `<td><a href="${esc(url)}" class="ext-link">查看原文 View source &#8599;</a></td></tr>`;
}

function tableWrap(rows) {
  return `<table class="index-table">\n` +
    `  <colgroup><col class="c-key"><col class="c-title"><col class="c-date"><col class="c-link"></colgroup>\n` +
    `  <thead><tr><th>KEY</th><th>活动标题 TITLE</th><th>日期 DATE</th><th>链接 LINK</th></tr></thead>\n` +
    `  <tbody>\n${rows.join('\n')}\n  </tbody>\n</table>`;
}

// 完整表格 HTML（拆页用）。global-trip 把 2012–2019 的早期条目收进默认折叠的 <details>。
export function tableHTML(slug, rel = '../../') {
  const evs = eventsForSlug(slug);
  if (slug === 'global-trip') {
    const recent = evs.filter((e) => parseInt(e.year, 10) >= 2025);
    const early = evs.filter((e) => parseInt(e.year, 10) <= 2019);
    let html = tableWrap(recent.map((e) => tableRow(e, rel)));
    if (early.length) {
      html += `\n<details class="early-notes">\n  <summary>早期海外调研笔记（2012–2019）</summary>\n` +
        tableWrap(early.map((e) => tableRow(e, rel))) + `\n</details>`;
    }
    return html;
  }
  return tableWrap(evs.map((e) => tableRow(e, rel)));
}

// 产品页实证块（标题 + 统计行 + 最近 3 条 + 按钮）。rel 为该页相对站点根的前缀。
export function blockHTML(slug, rel = '../../') {
  const evs = eventsForSlug(slug);
  const latest = evs.slice(0, 3);
  const title = BLOCK_TITLE[slug] || '实证';
  const unit = UNIT[slug] || '场';
  const lines = latest.map((e) =>
    `<li><a href="${esc(rel + e.url)}">${esc(e.title)}</a> <span class="evidence-date">${esc(e.date)}</span></li>`
  ).join('\n');
  const more = `<a class="evidence-more" href="${esc(rel + '05-brand/evidence/' + slug + '/index.html')}">全部 ${evs.length} ${unit} →</a>`;
  return crlf(
    `<section class="evidence-block">\n` +
    `  <h2 class="evidence-title">${esc(title)}</h2>\n` +
    `  <p class="evidence-stat">${esc(statsText(slug))}</p>\n` +
    `  <ul class="evidence-recent">\n${lines}\n  </ul>\n` +
    `  ${more}\n</section>`
  );
}

// closed-door 拆页：企业游学与产业调研、出海沙龙 两段，各自内部按同一规则排序、分别显示。
// 统计行（合并计数）与产品页块“最近 3 条”仍由合并排序（eventsForSlug）提供，见 statsText / blockHTML。
function closedDoorSections(rel) {
  const tour = sortEvents(events().filter((e) => e.type === 'tour'));
  const salon = sortEvents(events().filter((e) => e.type === 'salon'));
  return `<h2 class="evidence-sub">企业游学与产业调研</h2>\n` +
    tableWrap(tour.map((e) => tableRow(e, rel))) + `\n` +
    `<h2 class="evidence-sub">出海沙龙</h2>\n` +
    tableWrap(salon.map((e) => tableRow(e, rel)));
}

// 拆页完整 HTML（页面内直接写死内容，不依赖 JS 渲染）。
export function splitPageHTML(slug) {
  const p = getProduct(slug);
  const rel = '../../';
  const h1 = H1[slug] || (p ? p.name : slug);
  const stat = statsText(slug);
  const name = p ? p.name : '';
  const backHref = rel + (p ? p.page : '');
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: h1 + '｜海鑫汇 GTN',
    url: 'https://gatewaytonew.com/05-brand/evidence/' + slug + '/',
  });
  return crlf(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(h1)}｜海鑫汇 GTN</title>
<meta name="description" content="${esc(h1)} · 海鑫汇 GTN 实证记录">
<link rel="stylesheet" href="${rel}style.css">
<link rel="stylesheet" href="${rel}events/events.css">
<link rel="canonical" href="https://gatewaytonew.com/05-brand/evidence/${slug}/">
<script type="application/ld+json">
${ld}
</script>
<style>
.evidence-stat{max-width:820px;margin:6px auto 22px;text-align:center;font-size:18px;color:#0A1F44;font-weight:600;}
.evidence-sub{max-width:820px;margin:26px auto 10px;font-size:18px;color:#0A1F44;font-weight:700;text-align:center;}
.back-link{max-width:820px;margin:30px auto 0;}
.index-table{margin:0 auto;max-width:980px;}
</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <a href="${rel}index.html" class="wordmark"><img src="${rel}assets/img/logo-primary.svg" alt="海鑫汇" class="logo-wordmark" fetchpriority="high"><span class="wm-text"><span class="sub">GATEWAY TO NEW</span><span class="slogan">连接中国优势，走向全球</span></span></a>
    <div class="desk-clock"></div>
    <a href="${rel}index.html#proof" class="subpage-back">&larr; 返回首页<span class="en">BACK TO HOME</span></a>
  </div>
</header>
<section class="section">
  <div class="eyebrow">实证 / EVIDENCE</div>
  <h1 class="headline reveal">${esc(h1)}</h1>
  <p class="evidence-stat">${esc(stat)}</p>
${(slug === 'closed-door' ? closedDoorSections(rel) : tableHTML(slug, rel))}
  <p class="back-link"><a href="${esc(backHref)}">&larr; 返回 ${esc(name)}</a></p>
</section>
<footer class="footer" data-depth="2"></footer>
<script src="${rel}script.js" defer></script>
</body>
</html>
`);
}
