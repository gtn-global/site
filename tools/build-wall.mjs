// 照片墙源图：_img_backup/clients/footprints/source/client-01~40.png
// 转为正方形 webp 放到 clients/wall/（该目录不被 .gitignore 忽略，可随站发布）
// 用法：node tools/build-wall.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, '_img_backup', 'clients', 'footprints', 'source');
const OUT = path.join(ROOT, 'clients', 'wall');

if (!fs.existsSync(SRC)) {
  console.error('未找到源图目录：' + SRC);
  process.exit(1);
}
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

let n = 0;
const missing = [];
for (let i = 1; i <= 40; i++) {
  const name = 'client-' + String(i).padStart(2, '0');
  const p = path.join(SRC, name + '.png');
  if (!fs.existsSync(p)) { missing.push(name); continue; }
  await sharp(p).resize(320, 320, { fit: 'cover' }).webp({ quality: 80 })
    .toFile(path.join(OUT, name + '.webp'));
  n++;
}
console.log('照片墙 webp 生成：' + n + ' 张 → clients/wall/');
if (missing.length) { console.error('缺失源图：' + missing.join(', ')); process.exitCode = 1; }
