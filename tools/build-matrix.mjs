// 产业 × 区域覆盖矩阵：每格里报告/考察/顾问/运营中心/日历各几条，标出至少 2 类内容的格子
// 用法：node tools/build-matrix.mjs（需先跑 node tools/build-index.mjs）
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const D = (...p) => path.join(ROOT, ...p);
const idx = JSON.parse(fs.readFileSync(D('data', 'index.json'), 'utf8'));
const filters = JSON.parse(fs.readFileSync(D('data', 'filters.json'), 'utf8'));

const industries = (filters.industries || []).filter(i => !i.hidden_in_dropdown);
const countries = (filters.countries || []).filter(c => !c.hidden_in_dropdown);
const has = (arr, name) => (arr || []).indexOf(name) >= 0;

let md = '# 产业 × 区域覆盖矩阵\n\n';
md += '> 由 `node tools/build-matrix.mjs` 自动生成（数据源 data/index.json）。\n';
md += '> 数字为该格内各类内容的条数；✅ = 该格至少有 2 类内容。\n\n';
md += '| 产业 × 国家 | 报告 | 考察/活动 | 顾问 | 运营中心 | 日历 | 类数 | ≥2类 |\n|---|---|---|---|---|---|---|---|\n';

let total = 0, ok = 0;
for (const ind of industries) {
  for (const c of countries) {
    const rep = (idx.report || []).filter(r => r.industry === ind.name).length;
    const ev = (idx.event || []).filter(e => has(e.industries, ind.name) && has(e.countries, c.name)).length;
    const adv = (idx.advisor || []).filter(a => has(a.industries, ind.name)).length;
    const ops = (idx.ops_center || []).filter(o => o.country === c.name).length;
    const cal = (idx.calendar || []).filter(x => x.visible !== false && String(x.location || '').indexOf(c.name) >= 0).length;
    const kinds = [rep, ev, adv, ops, cal].filter(n => n > 0).length;
    total++;
    if (kinds >= 2) ok++;
    md += '| ' + ind.name + ' × ' + c.name + ' | ' + rep + ' | ' + ev + ' | ' + adv + ' | ' + ops + ' | ' + cal + ' | ' + kinds + ' | ' + (kinds >= 2 ? '✅' : '') + ' |\n';
  }
}
md += '\n合计格子 ' + total + ' 个，其中至少有 2 类内容的格子 ' + ok + ' 个。\n';
fs.writeFileSync(D('产业×区域覆盖矩阵.md'), md, 'utf8');
console.log('覆盖矩阵生成：格子 ' + total + '，≥2 类内容 ' + ok + ' → 产业×区域覆盖矩阵.md');
