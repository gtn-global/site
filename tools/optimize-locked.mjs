// 针对被外部进程锁住、无法就地覆盖的 webp：用 copyFileSync 绕过锁读取，压缩后另存 .opt.webp 兄弟文件，原文件保持不动。
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX = 2000;
const targets = [
  '02-projects/closed-door/closed-door.webp',
  '02-projects/featured/chuhaiban/chuhaiban.webp',
  '02-projects/global-trip/global-trip.webp',
];

for (const f of targets) {
  const out = f.replace(/\.webp$/i, '.opt.webp');
  const tmp = path.join(os.tmpdir(), 'lk-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.webp');
  try {
    fs.copyFileSync(f, tmp);               // 绕过锁：copy 能读
    let img = sharp(tmp);
    const m = await img.metadata();
    const longest = Math.max(m.width || 0, m.height || 0);
    if (longest > MAX) img = img.resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true });
    const buf = await img.webp({ quality: 78 }).toBuffer();
    fs.writeFileSync(out, buf);
    fs.unlinkSync(tmp);
    const before = fs.statSync(f).size, after = buf.length;
    console.log(`OK  ${(before/1024).toFixed(0)}KB -> ${(after/1024).toFixed(0)}KB  ${f}  (压缩版: ${out})`);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    console.log(`FAIL  ${f}  -> ${e.message}`);
  }
}
