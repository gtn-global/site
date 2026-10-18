// 在 events-index.html 每个 category-block 的 .category-head 之后、<table> 之前，
// 用 <!-- support:start -->…<!-- support:end --> 包起支撑产品链接。已有则替换，幂等。
// 不动 <tr>，不动 category-block 的 class 与 id。
import fs from 'node:fs';
import path from 'node:path';
import { getProduct } from './evidence-lib.mjs';

const ROOT = process.cwd();
const htmlPath = path.join(ROOT, 'events-index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const EOL = html.includes('\r\n') ? '\r\n' : '\n';

// category-block 的 id（即事件 type）-> 产品 slug
const MAP = {
  tour: 'closed-door',
  salon: 'closed-door',
  visit: 'global-trip',
  forum: 'chuhaiban',
  interview: 'online-connect',
  exchange: 'ceo-tour',
  review: null, // 不加
};

// 先清除旧标记（幂等：重跑产出一致）
html = html.replace(/<!-- support:start -->[\s\S]*?<!-- support:end -->/g, '');

for (const [type, slug] of Object.entries(MAP)) {
  if (!slug) continue;
  const p = getProduct(slug);
  if (!p) { console.log('SKIP (no product): ' + slug); continue; }
  const support = `<!-- support:start --><div class="support-product">支撑产品：<a href="${p.page}">${p.name} →</a></div><!-- support:end -->`;
  const re = new RegExp(
    `(<div class="category-block[^>]*id="${type}"[^>]*>[\\s\\S]*?<div class="category-head">[\\s\\S]*?</div>)(\\s*)(<table)`,
    'g'
  );
  const before = html;
  html = html.replace(re, `$1${EOL}  ${support}${EOL}  $3`);
  console.log((html !== before ? 'OK   ' : 'NOMATCH ') + type + ' -> ' + slug + ' (' + p.name + ')');
}

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('sync-events-support done');
