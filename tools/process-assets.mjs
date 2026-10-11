// 本地素材预处理脚本（不进构建链，仅本地运行：node tools/process-assets.mjs）
// 依赖：node_modules/sharp
// 规则：原图不覆盖、不进部署；输出到 */webp/；转换时去除 EXIF 并自动按 EXIF 方向旋转。
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MAX80 = 80 * 1024; // 80KB

const isImg = (f) => /\.(png|jpe?g|webp)$/i.test(f);
const listImages = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter(isImg).sort() : [];
const baseName = (f) => f.replace(/\.[^.]+$/, '');
const extRank = (f) => ({ webp: 0, jpg: 1, jpeg: 2, png: 3 })[f.split('.').pop().toLowerCase()] ?? 9;

// 转 webp，自动按 EXIF 方向旋转并去掉 EXIF；超出 maxBytes 时降质。
async function toWebp(src, out, { width, height, longEdge, quality = 82, maxBytes = MAX80 }) {
  let img = sharp(src).rotate(); // 应用 EXIF 方向并丢弃 EXIF
  if (longEdge) img = img.resize(longEdge, longEdge, { fit: 'inside', withoutEnlargement: false });
  else if (width) img = img.resize({ width });
  else if (height) img = img.resize({ height });
  let q = quality;
  let buf = await img.clone().webp({ quality: q }).toBuffer();
  while (buf.length > maxBytes && q > 40) {
    q -= 8;
    buf = await img.clone().webp({ quality: q }).toBuffer();
  }
  fs.writeFileSync(out, buf);
  return buf.length;
}

// 生成编号缩略图总览（同图 jpg/webp 去重，只保留一个编号，其余标注重复）；返回 {rows, dups}
async function makeOverview(srcDir, name) {
  const outDir = path.join(ROOT, 'tools', 'asset-overview', name);
  fs.mkdirSync(outDir, { recursive: true });
  const groups = {};
  for (const f of listImages(srcDir)) {
    const b = baseName(f);
    (groups[b] = groups[b] || []).push(f);
  }
  const rows = [];
  const dups = [];
  let i = 1;
  for (const b of Object.keys(groups).sort()) {
    const grp = groups[b].sort((a, c) => extRank(a) - extRank(c));
    const keep = grp[0];
    const src = path.join(srcDir, keep);
    const meta = await sharp(src).metadata();
    const num = String(i).padStart(2, '0');
    const out = path.join(outDir, `${num}-${b}.webp`);
    await sharp(src).rotate().resize({ width: 480 }).webp({ quality: 60 }).toFile(out);
    rows.push({ num, file: keep, w: meta.width, h: meta.height, kb: Math.round(fs.statSync(src).size / 1024) });
    if (grp.length > 1) dups.push({ num, kept: keep, dropped: grp.slice(1) });
    i++;
  }
  return { rows, dups };
}

function mdGallery(rows, dups) {
  let s = '';
  for (const r of rows) {
    s += `| ${r.num} | ${r.file} | ${r.w}×${r.h} | ${r.kb}KB | ![](${r.num}-${baseName(r.file)}.webp) |\n`;
  }
  if (dups.length) {
    s += '\n> 重复项（同图 jpg/webp 已合并，仅保留 webp 编号）：\n';
    for (const d of dups) {
      s += `> - ${d.num} 保留 \`${d.kept}\`；重复丢弃：${d.dropped.join('、')}\n`;
    }
  }
  return s;
}

function htmlGallery(rows, dups) {
  const cards = rows.map((r) => `
      <figure>
        <img src="${r.num}-${baseName(r.file)}.webp" alt="${r.file}" loading="lazy">
        <figcaption>#${r.num} · ${r.w}×${r.h} · ${r.kb}KB<br>${r.file}</figcaption>
      </figure>`).join('');
  const dupNote = dups.length
    ? `<p class="dup">重复项（同图 jpg/webp 已合并，仅保留 webp 编号）：${dups.map((d) => `#${d.num} 保留 ${d.kept}（丢弃 ${d.dropped.join('、')}）`).join('；')}</p>`
    : '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>素材总览</title><style>
body{font-family:system-ui,'Microsoft YaHei',sans-serif;background:#0c0c0c;color:#eee;margin:0;padding:24px;}
h1{font-size:20px;} h2{font-size:16px;margin-top:32px;color:#9fe;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;}
figure{margin:0;border:1px solid #333;border-radius:8px;overflow:hidden;background:#161616;}
figure img{width:100%;height:120px;object-fit:cover;display:block;}
figcaption{font-size:11px;padding:6px 8px;line-height:1.4;color:#bbb;}
.dup{font-size:12px;color:#f0c674;background:#221c08;padding:8px 10px;border-radius:6px;}
</style></head><body>
<h1>素材总览（供挑选）</h1>
<p>双向通道上排 = GTN_Global（挑 10–12）｜下排 = CEO_tour（挑 10–12）｜照片墙 = carousel（挑 8–12）。</p>
${dupNote}
<h2>GTN_Global（${rows.length} 张）</h2><div class="grid">${cards}</div>
</body></html>`;
}

async function main() {
  const report = { optimized: {}, overview: {} };

  // 1) GTN_Global → 双向通道上排：统一高度 240，单张 ≤80KB
  const gtnDir = path.join(ROOT, 'GTN_Global');
  const gtnOut = path.join(gtnDir, 'webp');
  fs.mkdirSync(gtnOut, { recursive: true });
  for (const f of listImages(gtnDir)) {
    const out = path.join(gtnOut, `${baseName(f)}.webp`);
    const sz = await toWebp(path.join(gtnDir, f), out, { height: 240, maxBytes: MAX80 });
    report.optimized[`GTN_Global/${f}`] = `${(sz / 1024).toFixed(1)}KB`;
  }

  // 2) CEO_tour_manual → 手册灯箱：保持清晰，长边≥1600，质量80，不受80KB限制
  const manDir = path.join(ROOT, 'CEO_tour_manual');
  const manOut = path.join(manDir, 'webp');
  fs.mkdirSync(manOut, { recursive: true });
  for (const f of listImages(manDir)) {
    const out = path.join(manOut, `${baseName(f)}.webp`);
    const sz = await toWebp(path.join(manDir, f), out, { longEdge: 1600, quality: 80, maxBytes: 20 * 1024 * 1024 });
    report.optimized[`CEO_tour_manual/${f}`] = `${(sz / 1024).toFixed(1)}KB`;
  }

  // 3) 总览缩略图（CEO_tour / carousel 暂不产出成品，等创始人挑选）
  const overview = {};
  for (const name of ['GTN_Global', 'CEO_tour', 'carousel']) {
    overview[name] = await makeOverview(path.join(ROOT, name), name);
  }
  report.overview = overview;

  // 写 markdown + html 画廊
  let md = '# 素材总览（供创始人挑选）\n\n';
  md += '> 双向通道上排 = GTN_Global（挑 10–12 张）；下排 = CEO_tour（挑 10–12 张）；往期回顾照片墙 = carousel（挑 8–12 张）。\n\n';
  for (const name of ['GTN_Global', 'CEO_tour', 'carousel']) {
    md += `## ${name}（${overview[name].rows.length} 张）\n\n`;
    md += '| # | 原文件名 | 尺寸 | 原体积 | 缩略图 |\n|---|---|---|---|---|\n';
    md += mdGallery(overview[name].rows, overview[name].dups);
    md += '\n';
  }
  fs.writeFileSync(path.join(ROOT, 'tools', 'asset-overview', 'index.md'), md);

  // HTML 画廊（每个目录一份，便于本地浏览器打开挑选）
  for (const name of ['GTN_Global', 'CEO_tour', 'carousel']) {
    fs.writeFileSync(
      path.join(ROOT, 'tools', 'asset-overview', name, 'gallery.html'),
      `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} 素材总览</title><style>
body{font-family:system-ui,'Microsoft YaHei',sans-serif;background:#0c0c0c;color:#eee;margin:0;padding:24px;}
h1{font-size:20px;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-top:16px;}
figure{margin:0;border:1px solid #333;border-radius:8px;overflow:hidden;background:#161616;}
figure img{width:100%;height:120px;object-fit:cover;display:block;}
figcaption{font-size:11px;padding:6px 8px;line-height:1.4;color:#bbb;}
.dup{font-size:12px;color:#f0c674;background:#221c08;padding:8px 10px;border-radius:6px;margin-top:12px;}
</style></head><body>
<h1>${name} 素材总览（${overview[name].rows.length} 张）</h1>
${overview[name].dups.length ? `<p class="dup">重复项（同图 jpg/webp 已合并，仅保留 webp 编号）：${overview[name].dups.map((d) => `#${d.num} 保留 ${d.kept}（丢弃 ${d.dropped.join('、')}）`).join('；')}</p>` : ''}
<div class="grid">${overview[name].rows.map((r) => `<figure><img src="${r.num}-${baseName(r.file)}.webp" alt="${r.file}" loading="lazy"><figcaption>#${r.num} · ${r.w}×${r.h} · ${r.kb}KB<br>${r.file}</figcaption></figure>`).join('')}</div>
</body></html>`
    );
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
