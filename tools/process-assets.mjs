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

// 生成编号缩略图总览（供创始人挑选），返回清单。
async function makeOverview(srcDir, name) {
  const outDir = path.join(ROOT, 'tools', 'asset-overview', name);
  fs.mkdirSync(outDir, { recursive: true });
  const files = listImages(srcDir);
  const rows = [];
  let i = 1;
  for (const f of files) {
    const src = path.join(srcDir, f);
    const meta = await sharp(src).metadata();
    const num = String(i).padStart(2, '0');
    const out = path.join(outDir, `${num}-${baseName(f)}.webp`);
    await sharp(src).rotate().resize({ width: 480 }).webp({ quality: 60 }).toFile(out);
    rows.push({ num, file: f, w: meta.width, h: meta.height, kb: Math.round(fs.statSync(src).size / 1024) });
    i++;
  }
  return rows;
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
  for (const name of ['GTN_Global', 'CEO_tour', 'carousel']) {
    report.overview[name] = await makeOverview(path.join(ROOT, name), name);
  }

  // 写总览 markdown（相对链接指向同目录缩略图）
  let md = '# 素材总览（供创始人挑选）\n\n';
  md += '> 双向通道上排 = GTN_Global（挑 10–12 张）；下排 = CEO_tour（挑 10–12 张）；往期回顾照片墙 = carousel（挑 8–12 张）。\n\n';
  for (const name of ['GTN_Global', 'CEO_tour', 'carousel']) {
    md += `## ${name}（${report.overview[name].length} 张）\n\n`;
    md += '| # | 原文件名 | 尺寸 | 原体积 | 缩略图 |\n|---|---|---|---|---|\n';
    for (const r of report.overview[name]) {
      md += `| ${r.num} | ${r.file} | ${r.w}×${r.h} | ${r.kb}KB | ![](${r.num}-${baseName(r.file)}.webp) |\n`;
    }
    md += '\n';
  }
  fs.writeFileSync(path.join(ROOT, 'tools', 'asset-overview', 'index.md'), md);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
