// 将 index.html 07 区各分类标签里的 <span class="n"> 数字，替换为 data/index.json 中该 type 的条数。
// 用 <!-- counts:start/end --> 包起区域，幂等；标签链接保持原样；不手写数字。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf8')).event;
const counts = {};
for (const e of data) counts[e.type] = (counts[e.type] || 0) + 1;

const htmlPath = path.join(ROOT, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const EOL = html.includes('\r\n') ? '\r\n' : '\n';

// 仅替换各分类标签里的 .n 数字，其余（链接、文案）不动。
const re = /(<a class="type-tag" data-type=")(\w+)("[^>]*>)([\s\S]*?)(<span class="n">)[^<]*(<\/span>)([\s\S]*?<\/a>)/g;
html = html.replace(re, (m, p1, type, p3, p4, p5, p6, p7) => {
  if (counts[type] === undefined) return m;
  return p1 + type + p3 + p4 + p5 + counts[type] + p6 + p7;
});

// 首次运行时用标记包起 .event-breakdown 区域（幂等）。
if (!html.includes('<!-- counts:start -->')) {
  html = html.replace(/(<div class="event-breakdown">[\s\S]*?<\/div>\s*)/, '<!-- counts:start -->' + EOL + '$1' + '<!-- counts:end -->' + EOL);
}

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('home counts updated:', JSON.stringify(counts));
console.log('sync-home-counts done');
