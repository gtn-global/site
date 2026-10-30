// 针对 4 个被外部锁住、rename 覆盖失败的 webp：备份后尝试直接 writeFileSync 压缩，失败自动还原。
import sharp from 'sharp';
import fs from 'node:fs';

const MAX = 2000;
const targets = [
  '02-projects/closed-door/closed-door.webp',
  '02-projects/featured/chuhaiban/chuhaiban.webp',
  '02-projects/global-trip/global-trip.webp',
  'member/ops-japan/40a4c15f250ebace07ea8c5503683bce.webp',
];

for (const f of targets) {
  const bak = f + '.bak';
  try { fs.copyFileSync(f, bak); } catch (e) { console.log('BAK-FAIL', f, e.message); continue; }
  try {
    let img = sharp(f);
    const m = await img.metadata();
    const longest = Math.max(m.width || 0, m.height || 0);
    if (longest > MAX) img = img.resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true });
    const buf = await img.webp({ quality: 78 }).toBuffer();
    const orig = fs.statSync(bak).size;
    if (buf.length < orig) {
      fs.writeFileSync(f, buf);
      fs.unlinkSync(bak);
      console.log(`OK  ${(orig/1024).toFixed(0)}KB -> ${(buf.length/1024).toFixed(0)}KB  ${f}`);
    } else {
      fs.copyFileSync(bak, f); fs.unlinkSync(bak);
      console.log(`NO-GAIN  ${f}`);
    }
  } catch (e) {
    try { fs.copyFileSync(bak, f); } catch {}
    try { fs.unlinkSync(bak); } catch {}
    console.log(`FAIL  ${f}  -> ${e.message}`);
  }
}
