/*
 * preflight.js — 交互级预检（push 前由本地运行，不碰线上、不影响部署）
 *
 * 目的：在 git push 之前，静态校验"用户点击行为"是否会导致问题，
 *       替代过去"靠人工点页面才发现 404 / 错位 / 缺选项"的盲区。
 *
 * 校验项：
 *   1. 每个会跳转到 success 页的表单：action 目标文件必须存在；
 *   2. 非 Netlify 表单（无 data-netlify）：必须用 method="GET" + onsubmit 内 return false，
 *      否则 POST 到静态 .html 会返回 404；
 *   3. 指定页面里指定 select 的 option（有效业务项）数量须达标；
 *   4. success 页按钮内 .en 不能被 .success-wrap .en{display:block} 之类的规则污染（对齐）。
 *
 * 用法：node preflight.js
 * 退出码非 0 表示有问题（不要 push）。
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
let failures = 0;

function fail(msg) {
  failures++;
  console.log('  ✗ ' + msg);
}
function ok(msg) {
  console.log('  ✓ ' + msg);
}

// 读取文件（相对 ROOT）
function read(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
  catch (e) { return null; }
}

// 解析表单标签
function parseForm(tag) {
  const get = (attr) => {
    const m = tag.match(new RegExp(attr + '\\s*=\\s*"([^"]*)"', 'i'));
    return m ? m[1] : null;
  };
  return {
    method: (get('method') || 'GET').toUpperCase(),
    action: get('action'),
    netlify: /data-netlify/i.test(tag),
    onsubmit: get('onsubmit') || '',
  };
}

// 收集所有 html 中的 <form> 标签
function allForms() {
  const out = [];
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', '.codebuddy', '_demo', 'backup', 'clients'].includes(e.name)) continue;
      const a = path.join(dir, e.name);
      if (e.isDirectory()) walk(a);
      else if (e.name.endsWith('.html')) {
        const c = fs.readFileSync(a, 'utf8');
        const ms = c.match(/<form[\s\S]*?<\/form>/gi) || [];
        ms.forEach(f => out.push({
          file: path.relative(ROOT, a).split(path.sep).join('/'),
          form: f,
        }));
      }
    }
  }
  walk(ROOT);
  return out;
}

console.log('\n=== GTN 站点交互预检 preflight ===\n');

// ---- 校验 1 & 2：所有表单的提交逻辑 ----
const forms = allForms();
console.log('1) 表单提交逻辑（共 ' + forms.length + ' 个）');
for (const { file, form } of forms) {
  const f = parseForm(form);
  const tag = form.match(/<form[^>]*>/i)[0].replace(/\s+/g, ' ');

  // 没有 action 且不是 Netlify（如纯前端 self-test）→ 跳过提交校验
  if (!f.action && !f.netlify) {
    ok(`${file}: 无 action 的纯前端表单，跳过提交校验`);
    continue;
  }

  // action 目标存在性
  if (f.action) {
    const target = path.join(ROOT, path.dirname(file), f.action);
    if (!fs.existsSync(target)) fail(`${file}: action="${f.action}" 目标文件不存在 → 会 404`);
    else ok(`${file}: action="${f.action}" 目标存在`);
  }

  // 非 Netlify 表单必须是 GET + return false
  if (!f.netlify) {
    if (f.method !== 'GET') fail(`${file}: 非 Netlify 表单用了 ${f.method}，POST 到静态页会 404 → 应改 GET`);
    else ok(`${file}: method=GET`);
    if (!/return false/.test(f.onsubmit)) fail(`${file}: onsubmit 缺少 return false → 浏览器会真提交导致 404`);
    else ok(`${file}: onsubmit 含 return false`);
  } else {
    ok(`${file}: Netlify 表单（data-netlify），由平台处理`);
  }
}

// ---- 校验 3：指定 select 的选项数 ----
console.log('\n2) 关键 select 选项数');
const stages = [
  { file: 'cta/book-diagnostic/index.html', selectName: 'stage', expect: 4,
    values: ['planning', 'testing', 'scaling', 'established'] },
];
for (const s of stages) {
  const c = read(s.file);
  if (c === null) { fail(`${s.file} 不存在`); continue; }
  const re = new RegExp('<select[^>]*name="' + s.selectName + '"[\\s\\S]*?</select>', 'i');
  const sel = c.match(re);
  if (!sel) { fail(`${s.file}: 找不到 select[name="${s.selectName}"]`); continue; }
  const present = s.values.filter(v => new RegExp('value="' + v + '"').test(sel[0]));
  if (present.length === s.expect) ok(`${s.file}: select[${s.selectName}] 含 ${present.length} 个业务选项（达标）`);
  else fail(`${s.file}: select[${s.selectName}] 仅 ${present.length}/${s.expect} 个业务选项，缺: ${s.values.filter(v=>!present.includes(v)).join(', ')}`);
}

// ---- 校验 4：success 页按钮 .en 对齐不被污染 ----
console.log('\n3) success 页按钮英文对齐');
const su = read('cta/book-diagnostic/success.html');
if (su === null) fail('cta/book-diagnostic/success.html 不存在');
else {
  if (/\.success-wrap \.en\{display:block\}/.test(su))
    fail('success.html: 存在 .success-wrap .en{display:block} → 会污染按钮内 .en 导致不对齐');
  else ok('success.html: 无污染规则 .success-wrap .en{display:block}');
  if (/\.actions a > \.en/.test(su)) ok('success.html: 按钮 .en 有专用对齐规则 .actions a > .en');
  else fail('success.html: 缺少 .actions a > .en 对齐规则');
}

// ---- 结论 ----
console.log('\n=== 结果 ===');
if (failures === 0) {
  console.log('✓ 全部通过，可以 push。');
  process.exit(0);
} else {
  console.log(`✗ 发现 ${failures} 个问题，先修复再 push（不要 push！）`);
  process.exit(1);
}
