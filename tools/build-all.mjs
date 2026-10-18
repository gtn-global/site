// 按顺序执行各步；任一步失败（非零退出）即停。
// build-data -> build-evidence -> build-product-pages -> sync-events-support
// -> sync-home-counts -> build-data（再补一次）-> generate-sitemap -> preflight
// build-posters 单独跑（需要 Chrome），不在其中。
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NODE = JSON.stringify(process.execPath);
const steps = [
  'tools/build-data.mjs',
  'tools/build-evidence.mjs',
  'tools/build-product-pages.mjs',
  'tools/sync-events-support.mjs',
  'tools/sync-home-counts.mjs',
  'tools/build-data.mjs',
  'generate-sitemap.js',
  'preflight.js',
];

for (const s of steps) {
  console.log('\n===== ' + s + ' =====');
  execSync(NODE + ' ' + s, { cwd: ROOT, stdio: 'inherit' });
}
console.log('\n===== build-all complete =====');
