// 标签推断：拆分组合字符串、按标题补国家/大区，高置信写回 data/index.json，并产出「标签推断清单.md」。
// 设计原则：只做加法（追加标签），不直接覆盖原数据；高置信（标题含明确国家名）才写回，其余只列入清单。
import fs from 'fs';

const idx = JSON.parse(fs.readFileSync('data/index.json', 'utf8'));
const cfg = JSON.parse(fs.readFileSync('data/filters.json', 'utf8'));

// 国家名 -> {name, region, slug}
const countryMap = {};
(cfg.countries || []).forEach(c => {
  countryMap[c.name] = c;
  (c.aliases || []).forEach(a => { countryMap[a] = c; });
});
const countryNames = Object.keys(countryMap);

const events = idx.event || [];
const rows = [];

for (const e of events) {
  const origC = e.countries || [];
  const origI = e.industries || [];
  const infC = new Set();
  const infR = new Set();
  const basis = [];

  // 1) 拆分组合字符串：["法国 芬兰"] -> 两项；["跨国资本 消费品牌"] -> 两项
  origC.forEach(c => {
    if (/\s/.test(c)) {
      c.split(/\s+/).forEach(x => { infC.add(x); });
      basis.push('拆分组合国家: ' + c);
    }
  });
  origI.forEach(i => {
    if (/\s/.test(i)) {
      i.split(/\s+/).forEach(x => { /* 产业组合仅记录，不擅自增产业标签 */ });
      basis.push('拆分组合产业: ' + i);
    }
  });

  // 2) 标题含明确国家名 -> 补国家与大区
  const title = e.title || '';
  const matched = countryNames.filter(n => title.includes(n));
  matched.forEach(n => {
    const c = countryMap[n];
    infC.add(c.name);
    if (c.region) infR.add(c.region);
    basis.push('标题含国家名「' + n + '」-> ' + c.name + (c.region ? '(' + c.region + ')' : ''));
  });

  // 3) 企业游学（中国境内）不得标成海外国家
  if (/游学|访学|研修|考察团/.test(title) && /中国|境内|国内/.test(title)) {
    basis.push('企业游学(中国境内)：不标海外国家');
  }

  const highConf = matched.length > 0; // 标题含明确国家名 = 高置信
  rows.push({
    id: e.id, title,
    origC: origC.slice(), origI: origI.slice(),
    infC: [...infC], infR: [...infR],
    basis, highConf
  });

  // 高置信：写回（追加，不覆盖）
  if (highConf) {
    e.countries = [...new Set([...origC, ...infC])];
    e.regions = [...new Set([...(e.regions || []), ...infR])];
  }
}

fs.writeFileSync('data/index.json', JSON.stringify(idx, null, 2) + '\n', 'utf8');

let md = '# 标签推断清单\n\n';
md += '> 生成自 tools/infer-tags.mjs。规则：拆分组合字符串；标题含明确国家名则补国家与大区；企业游学（中国境内）不标海外。\n';
md += '> 高置信（标题含明确国家名）的推断已写回 data/index.json；其余仅列入本清单供核对。\n\n';
md += '| 事件 id | 标题 | 原标签(国家/产业) | 推断结果(国家/大区) | 依据 | 高置信 |\n';
md += '|---|---|---|---|---|---|\n';
rows.forEach(r => {
  md += '| ' + r.id + ' | ' + r.title + ' | 国家:[' + r.origC.join(',') + '] 产业:[' + r.origI.join(',') + '] | 国家:[' + r.infC.join(',') + '] 大区:[' + r.infR.join(',') + '] | ' + r.basis.join('；') + ' | ' + (r.highConf ? '是' : '否') + ' |\n';
});
fs.writeFileSync('标签推断清单.md', md, 'utf8');
console.log('events=' + events.length + ' highConf=' + rows.filter(r => r.highConf).length + ' -> 标签推断清单.md');
