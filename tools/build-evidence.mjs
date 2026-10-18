// 生成 5 个实证静态拆页：evidence/<slug>/index.html
// 页面内容全部直接写进 HTML，页面里没有数据副本，也不依赖 JS 渲染。
import fs from 'node:fs';
import path from 'node:path';
import { splitPageHTML } from './evidence-lib.mjs';

const ROOT = process.cwd();
const SLUGS = ['global-trip', 'closed-door', 'chuhaiban', 'online-connect', 'ceo-tour'];

for (const slug of SLUGS) {
  const dir = path.join(ROOT, 'evidence', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), splitPageHTML(slug), 'utf8');
  console.log('wrote evidence/' + slug + '/index.html');
}
console.log('build-evidence done');
