// 本地校验：data/filters.json 必须与 events-index.html 的筛选 chip 完全一致。
// 运行：node tools/validate-filters.mjs
import fs from 'node:fs';

const root = process.cwd();
const filters = JSON.parse(fs.readFileSync('data/filters.json', 'utf8'));
const html = fs.readFileSync('events-index.html', 'utf8');

const indNames = new Set(filters.industries.map((i) => i.name));
const ctyNames = new Set(filters.countries.map((c) => c.name));

const chipInd = [...html.matchAll(/data-industry="([^"]+)"/g)].map((m) => m[1]).filter((v) => v !== 'all');
const chipCty = [...html.matchAll(/data-country="([^"]+)"/g)].map((m) => m[1]).filter((v) => v !== 'all');

const issues = [];
[...new Set(chipInd)].forEach((n) => { if (!indNames.has(n)) issues.push(`行业 chip 不在 filters.json：${n}`); });
[...new Set(chipCty)].forEach((n) => { if (!ctyNames.has(n)) issues.push(`国家 chip 不在 filters.json：${n}`); });
filters.industries.forEach((i) => { if (!chipInd.includes(i.name)) issues.push(`filters.json 行业未在 chip 出现：${i.name}`); });
filters.countries.forEach((c) => { if (!chipCty.includes(c.name)) issues.push(`filters.json 国家未在 chip 出现：${c.name}`); });

if (issues.length) {
  console.error('❌ filters.json 与 events-index chips 不一致：\n' + issues.map((x) => '  - ' + x).join('\n'));
  process.exit(1);
}
console.log('✅ filters.json 与 events-index chips 完全一致（行业 ' + filters.industries.length + ' / 国家 ' + filters.countries.length + '）');
