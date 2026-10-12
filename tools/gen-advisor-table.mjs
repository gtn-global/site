// 产出「顾问链主核对表.md」：顾问、产业、isLead、依据页面。isLead 目前为推断，供创始人核对。
import fs from 'fs';
const idx = JSON.parse(fs.readFileSync('data/index.json', 'utf8'));
const cfg = JSON.parse(fs.readFileSync('data/filters.json', 'utf8'));
const slugToName = {};
(cfg.industries || []).forEach(i => { slugToName[i.slug] = i.display || i.name; });

const advs = idx.advisor || [];
let md = '# 顾问链主核对表\n\n';
md += '> isLead 当前为推断值（依据产业标签与页面展示），供创始人核对。\n\n';
md += '| 顾问 | 产业标签 | 是否链主(isLead) | 依据页面 |\n';
md += '|---|---|---|---|\n';
advs.forEach(a => {
  const inds = (a.industries || []).map(x => slugToName[x] || x).join('、') || '（无）';
  md += '| ' + (a.name || a.id) + ' | ' + inds + ' | ' + (a.isLead ? '是' : '否') + ' | ' + (a.url || '') + ' |\n';
});
fs.writeFileSync('顾问链主核对表.md', md, 'utf8');
console.log('advisors=' + advs.length + ' -> 顾问链主核对表.md');
