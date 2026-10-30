// 图片优化 Stage 1：原地重编码 + 超大图缩像素，保留原扩展名，零引用改动。
// 规则：超过体积阈值 或 最长边 > MAX_SIDE 才处理；仅当压缩后缩小 >= MIN_SAVE 才覆盖原文件（防二次有损）。
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = process.cwd();
const SKIP = new Set(['.git', 'node_modules', 'tools']);
const MAX_SIDE = 2000;       // px，超过则等比缩到最长边 2000
const THRESH_KB = { '.png': 150, '.jpg': 300, '.jpeg': 300, '.webp': 500 };
const MIN_SAVE = 0.08;       // 至少缩小 8% 才覆盖

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else {
      const ext = path.extname(e.name).toLowerCase();
      if (THRESH_KB[ext] !== undefined) files.push(p);
    }
  }
})(ROOT);

let processed = 0, skipped = 0, savedKB = 0, failed = 0;
let beforeTotal = 0, afterTotal = 0;

function safeWrite(file, buf) {
  const tmp = path.join(os.tmpdir(), 'opt-' + Date.now() + '-' + Math.random().toString(36).slice(2) + path.extname(file));
  for (let i = 0; i < 3; i++) {
    try {
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, file);
      return true;
    } catch (err) {
      if (i === 2) { try { fs.unlinkSync(tmp); } catch {} return false; }
      // 短暂等待后重试（应对文件锁/AV 扫描）
      try { require('node:timers/sync').setTimeout?.(120); } catch {}
    }
  }
  return false;
}

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  const before = fs.statSync(file).size;
  beforeTotal += before;
  const sizeKB = before / 1024;
  let img;
  try { img = sharp(file); } catch { failed++; continue; }
  let meta;
  try { meta = await img.metadata(); } catch { failed++; continue; }
  const longest = Math.max(meta.width || 0, meta.height || 0);
  const needResize = longest > MAX_SIDE;
  const needCompress = sizeKB > THRESH_KB[ext];
  if (!needResize && !needCompress) { skipped++; afterTotal += before; continue; }

  let pipe = img;
  if (needResize) pipe = pipe.resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true });
  let buf;
  try {
    if (ext === '.png') buf = await pipe.png({ quality: 80, effort: 6 }).toBuffer();
    else if (ext === '.jpg' || ext === '.jpeg') buf = await pipe.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    else if (ext === '.webp') buf = await pipe.webp({ quality: 78 }).toBuffer();
    else { skipped++; afterTotal += before; continue; }
  } catch (err) { failed++; console.error('FAIL', file, err.message); continue; }

  const saveRatio = (before - buf.length) / before;
  if (buf.length >= before || saveRatio < MIN_SAVE) { skipped++; afterTotal += before; continue; }
  if (!safeWrite(file, buf)) { failed++; console.error('WRITE-FAIL', path.relative(ROOT, file)); afterTotal += before; continue; }

  afterTotal += buf.length;
  savedKB += (before - buf.length) / 1024;
  processed++;
  console.log(`${(before/1024).toFixed(0)}KB -> ${(buf.length/1024).toFixed(0)}KB  ${path.relative(ROOT, file)}`);
}

console.log(`\n处理 ${processed} 张，跳过 ${skipped} 张，失败 ${failed} 张`);
console.log(`体积 ${ (beforeTotal/1024/1024).toFixed(1) }MB -> ${ (afterTotal/1024/1024).toFixed(1) }MB，节省 ${ (savedKB/1024).toFixed(1) }MB`);
