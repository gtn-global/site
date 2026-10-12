// 候选矩阵格：对每个 (产业 × 大区) 计算真实命中活动数与顾问数；
// 候选条件：该产业有已发布报告，或 (真实命中活动 >=3 且 顾问 >=1)。
import fs from 'fs';
const idx = JSON.parse(fs.readFileSync('data/index.json', 'utf8'));
const cfg = JSON.parse(fs.readFileSync('data/filters.json', 'utf8'));

const VARIANTS = {
  'new-energy': ['新能源电力电气', '绿色能源', '新能源'],
  'auto-tech': ['新能源车与智慧交通', '新能源车', '智慧交通'],
  'ai': ['人工智能', 'AI产业', 'AI'],
  'consumer': ['消费品牌', '消费品牌出海'],
  'capital': ['跨国资本与并购', '跨国资本', '并购'],
  'talent': ['国际人才与职教', '国际人才', '职教']
};
function acc(slug) {
  const s = new Set([slug]);
  (VARIANTS[slug] || []).forEach(x => s.add(x));
  (cfg.industries || []).filter(i => i.slug === slug).forEach(i => { s.add(i.name); (i.aliases || []).forEach(a => s.add(a)); });
  return s;
}
const nameToSlug = {};
(cfg.industries || []).forEach(i => { nameToSlug[i.name] = i.slug; (i.aliases || []).forEach(a => { nameToSlug[a] = i.slug; }); });
Object.keys(VARIANTS).forEach(s => VARIANTS[s].forEach(n => { nameToSlug[n] = s; }));
const publishedSlugs = new Set();
(idx.report || []).forEach(r => {
  if (/已上线|已发布/.test(r.status || '')) {
    const slug = nameToSlug[r.industry];
    if (slug) publishedSlugs.add(slug);
  }
});

const industries = cfg.industries || [];
const regions = ['东南亚', '东亚', '南亚', '中亚', '中东', '欧洲', '非洲', '美洲'];

const cands = [];
for (const ind of industries) {
  const a = acc(ind.slug);
  const indName = ind.display || ind.name;
  for (const region of regions) {
    const evs = (idx.event || []).filter(e => {
      const okI = (e.industries || []).some(x => a.has(x));
      const tagged = (e.industries && e.industries.length) || (e.countries && e.countries.length) || (e.regions && e.regions.length);
      const okR = (e.countries || []).some(c => (cfg.countries || []).find(cc => cc.name === c && cc.region === region)) || (e.regions || []).includes(region);
      return okI && okR;
    }).length;
    const advs = (idx.advisor || []).filter(x => (x.industries || []).some(y => a.has(y))).length;
    const hasReport = publishedSlugs.has(ind.slug);
    const isCand = hasReport || (evs >= 3 && advs >= 1);
    if (isCand) cands.push({ cell: indName + ' × ' + region, evs, advs, hasReport });
  }
}
console.log('候选格清单（共 ' + cands.length + ' 个）：');
cands.forEach(c => console.log('  - ' + c.cell + ' | 真实命中活动=' + c.evs + ' | 顾问=' + c.advs + ' | 已发布报告=' + (c.hasReport ? '是' : '否')));
fs.writeFileSync('候选矩阵格.md', '# 候选矩阵格\n\n' + cands.map(c => '- ' + c.cell + '（活动 ' + c.evs + ' / 顾问 ' + c.advs + ' / 已发布报告 ' + (c.hasReport ? '是' : '否') + '）').join('\n') + '\n', 'utf8');
console.log('-> 候选矩阵格.md');
