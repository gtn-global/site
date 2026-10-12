/*
 * check-data-fresh.js — 防止「改了 data/*.json 却忘了编译成 data/*.js」的遗漏
 *
 * data/*.js 是浏览器实际加载的数据源（由 tools/build-data.mjs 从 data/*.json 编译）。
 * 历史教训：编辑了 .json 后没重跑 build-data.mjs，导致线上数据陈旧（如顾问 industries 为空、报告状态旧）。
 *
 * 本模块校验：
 *   1) 若 data/<name>.js 的修改时间早于 data/<name>.json → 视为未重新编译（报错）；
 *   2) 若 .js 解析后的对象与 .json 重新解析结果不一致 → 视为未重新编译（报错）。
 *
 * 用法（在 preflight.js / generate-sitemap.js 中）：
 *   const { checkDataFresh } = require('./tools/check-data-fresh.js');
 *   const issues = checkDataFresh(process.cwd());  // 返回问题字符串数组，空数组=通过
 */
const fs = require('fs');
const path = require('path');

function checkDataFresh(ROOT) {
  const issues = [];
  const dataDir = path.join(ROOT, 'data');
  if (!fs.existsSync(dataDir)) return issues;
  for (const f of fs.readdirSync(dataDir)) {
    if (!f.endsWith('.json')) continue;
    const name = f.slice(0, -5);
    const jsFile = name + '.js';
    const jsonPath = path.join(dataDir, f);
    const jsPath = path.join(dataDir, jsFile);
    if (!fs.existsSync(jsPath)) continue; // 无对应 .js 则跳过（如 matrix.json 本身不是编译目标）
    // mtime 检查：.js 早于 .json → 大概率没重跑 build-data.mjs
    if (fs.statSync(jsPath).mtimeMs < fs.statSync(jsonPath).mtimeMs) {
      issues.push(`data/${f}: 对应 data/${jsFile} 修改时间早于 ${f}（可能未重新编译）→ 先跑 node tools/build-data.mjs`);
      continue;
    }
    // 内容一致性：解析后稳定比较，忽略格式/空格差异
    try {
      const jsonObj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const code = fs.readFileSync(jsPath, 'utf8');
      const sandbox = { window: {} };
      // eslint-disable-next-line no-new-func
      const fn = new Function('window', code + '\nreturn window.GTN;');
      const GTN = fn(sandbox.window);
      const jsObj = GTN && GTN[name];
      if (JSON.stringify(jsObj) !== JSON.stringify(jsonObj)) {
        issues.push(`data/${f}: data/${jsFile} 内容与重新生成结果不一致（可能未重新编译）→ 先跑 node tools/build-data.mjs`);
      }
    } catch (e) {
      issues.push(`data/${f}: 校验 data/${jsFile} 失败 - ${e.message}`);
    }
  }
  return issues;
}

module.exports = { checkDataFresh };
