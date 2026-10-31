import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const join = p => path.join(ROOT, p);
const rel = p => p;

// ---- exemption list (per spec F) ----
const EXEMPT = ['club.html', 'functions/feishu-proxy.js', '*.md', 'node_modules', '.git', 'tools/'];
const isExemptFile = r =>
  r === 'club.html' ||
  r === 'functions/feishu-proxy.js' ||
  r.endsWith('.md');

const out = [];
let fails = 0;
function check(name, cond, evidence) {
  out.push(`${cond ? 'PASS' : 'FAIL'}  ${name}` + (evidence ? `\n      ↳ ${evidence}` : ''));
  if (!cond) fails++;
}
function info(line) { out.push(line); }

// ---- collect all non-exempt repo files ----
const allFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'tools') continue;
    const full = path.join(d, e.name);
    const r = path.relative(ROOT, full).replace(/\\/g, '/');
    if (e.isDirectory()) walk(full);
    else if (!isExemptFile(r)) allFiles.push(r);
  }
})(ROOT);

const isText = f => /\.(html|json|js|css|txt|xml|md)$/.test(f);

// ================= F.1 =================
{
  const forbidden = ['首诊', '菁英荟'];
  const re99 = /99\s*元/;
  const re1 = /1\s*元/;
  const hits = [], known = [];
  for (const f of allFiles) {
    if (!isText(f)) continue;
    const lines = fs.readFileSync(join(f), 'utf8').split('\n');
    lines.forEach((ln, i) => {
      const tag = hits;
      forbidden.forEach(k => { if (ln.includes(k)) tag.push(`${f}:${i + 1} ${k}`); });
      if (re99.test(ln)) tag.push(`${f}:${i + 1} 99元`);
      if (re1.test(ln)) tag.push(`${f}:${i + 1} 1元`);
    });
  }
  check('F.1 首诊/菁英荟/99元 命中为 0（全站严格）', hits.length === 0,
    '非预期命中: ' + JSON.stringify(hits.slice(0, 25)));
  info('  F.1 已对全站（含 08-engage/self-test）严格扫描，无豁免');

  // "200 元" only in "200 元/份" or "单份 200 元"
  const bad200 = [];
  for (const f of allFiles) {
    if (!isText(f)) continue;
    const txt = fs.readFileSync(join(f), 'utf8');
    const re = /200\s*元/g; let m;
    while ((m = re.exec(txt))) {
      const ctx = txt.slice(Math.max(0, m.index - 16), m.index + 16);
      if (!/200\s*元\/份/.test(ctx) && !/单份\s*200\s*元/.test(ctx)) bad200.push(`${f}: …${ctx}…`);
    }
  }
  check('F.1 "200 元" 仅允许在「200 元/份」或「单份 200 元」上下文', bad200.length === 0,
    bad200.slice(0, 10).join(' | '));
}

// ================= F.2 =================
{
  const re = /阅读\s*2024|2024\s*版/;
  const hits = [];
  for (const f of allFiles) {
    if (f.startsWith('09-research/reports/EV/')) continue;
    if (!isText(f)) continue;
    if (re.test(fs.readFileSync(join(f), 'utf8'))) hits.push(f);
  }
  check('F.2 「阅读2024」「2024版」为 0（reports/EV/ 除外）', hits.length === 0, hits.slice(0, 12).join(', '));
}

// ================= F.3 =================
// ---- git helper (F.3 仓库洁净度守卫) ----
function findGit() {
  const cands = ['git', 'C:\\Program Files\\Git\\bin\\git.exe', 'C:\\Program Files (x86)\\Git\\bin\\git.exe', '/usr/bin/git', '/usr/local/bin/git'];
  for (const c of cands) {
    try { execSync(`"${c}" --version`, { cwd: ROOT, stdio: 'pipe' }); return c; }
    catch (e) { /* try next */ }
  }
  return 'git';
}
const GIT = findGit();
function git(args) {
  try { return execSync(`"${GIT}" ${args}`, { cwd: ROOT, stdio: 'pipe' }).toString(); }
  catch (e) { return ''; }
}
function statusFiles() {
  return new Set(git('status --porcelain').split('\n').map(l => {
    const m = l.match(/^.{0,2}\s+(.+)$/);
    return m ? m[1].trim() : '';
  }).filter(Boolean));
}
function diffOnlyLastmod(file) {
  const d = git(`diff -- ${file}`);
  if (!d.trim()) return true;
  const changed = d.split('\n').filter(l => l.startsWith('+') || l.startsWith('-'));
  return changed.filter(l => !/lastmod/i.test(l)).length === 0;
}

function runTool(script) {
  try {
    execSync(`"${process.execPath}" "${join(script)}"`, { cwd: ROOT, stdio: 'pipe' });
    return { ok: true };
  } catch (e) {
    return { ok: false, err: (e.stderr ? e.stderr.toString() : '') + (e.stdout ? e.stdout.toString() : '') };
  }
}
const beforeBuild = statusFiles();
const r1 = runTool('tools/build-data.mjs');
const r2 = runTool('generate-sitemap.js');
const r3 = runTool('preflight.js');
check('F.3 build-data 通过', r1.ok, r1.ok ? '' : String(r1.err).slice(0, 300));
check('F.3 generate-sitemap 通过', r2.ok, r2.ok ? '' : String(r2.err).slice(0, 300));
check('F.3 preflight 通过', r3.ok, r3.ok ? '' : String(r3.err).slice(0, 300));

// F.3 构建不应改变仓库：仅 sitemap.xml / llms.txt 的 lastmod 变动允许还原，其余一律 FAIL
const afterBuild = statusFiles();
const induced = [...afterBuild].filter(f => !beforeBuild.has(f));
const f3Dirty = [];
for (const f of induced) {
  if (f === 'sitemap.xml' || f === 'llms.txt') {
    if (diffOnlyLastmod(f)) git(`checkout -- ${f}`);
    else f3Dirty.push(`${f}: 非 lastmod 变动`);
  } else {
    f3Dirty.push(`${f}: 构建引入意外改动`);
  }
}
check('F.3 构建不改变仓库（除 sitemap/llms lastmod）', f3Dirty.length === 0, f3Dirty.join('; '));

// ================= F.4 =================
let byType = {}, total = 0;
{
  const idx = JSON.parse(fs.readFileSync(join('data/index.json'), 'utf8'));
  const events = idx.event || [];
  total = events.length;
  events.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
  const expect = { visit: 36, interview: 8, exchange: 7, salon: 7, forum: 6, tour: 5, review: 4 };
  let ok = total === 73;
  for (const k in expect) if (byType[k] !== expect[k]) ok = false;
  check('F.4 data/index.json 活动计数', ok, `total=${total} byType=${JSON.stringify(byType)}`);
}

// ================= F.5 =================
{
  const types = ['tour', 'forum', 'interview', 'exchange', 'visit', 'salon', 'review'];
  const expectSorted = [4, 5, 6, 7, 7, 8, 36];
  const homeTxt = fs.readFileSync(join('index.html'), 'utf8');
  const evTxt = fs.readFileSync(join('events-index.html'), 'utf8');
  const homeNums = types.map(t => {
    const m = homeTxt.match(new RegExp(`data-type="${t}"[^>]*>[\\s\\S]*?<span class="n">(\\d+)</span>`));
    return m ? +m[1] : null;
  });
  const evNums = [...evTxt.matchAll(/<span class="count">(\d+) 场/g)].map(m => +m[1]);
  const s = a => [...a].sort((x, y) => x - y);
  const homeOk = JSON.stringify(s(homeNums)) === JSON.stringify(expectSorted);
  const evOk = JSON.stringify(s(evNums)) === JSON.stringify(expectSorted);
  check('F.5 首页分类数字 = events-index 分类数字', homeOk && evOk,
    `home=${JSON.stringify(homeNums)} ev=${JSON.stringify(evNums)} expect=${JSON.stringify(expectSorted)}`);
}

// ================= F.6 （严格占位/括号审计；task4 收尾，无"已知待确认"豁免） =================
{
  const PLAIN = ['待定', '待确认', '待填', '占位'];
  const BK_KEYS = ['待', '主题', '日期', '姓名', '身份', '本期', '数量', '范围', '真实数字'];
  const pub = allFiles.filter(f =>
    /\.html$/.test(f) ||
    /^data\/.*\.(json|js)$/.test(f) ||
    (/^assets\//.test(f) && /\.(json|js|css)$/.test(f)) ||
    f === 'sitemap.xml' || f === 'llms.txt' || f === '_redirects');
  const failsHits = [];
  let bracketTotal = 0;
  for (const f of pub) {
    const lines = fs.readFileSync(join(f), 'utf8').split('\n');
    lines.forEach((ln, i) => {
      PLAIN.forEach(w => {
        if (ln.includes(w)) failsHits.push(`[明文占位:${w}] ${f}:${i + 1} …${ln.trim().slice(0, 100)}…`);
      });
      const m = ln.match(/【([^】]*)】/g);
      if (m) m.forEach(br => {
        bracketTotal++;
        const inner = br.slice(1, -1);
        if (BK_KEYS.some(k => inner.includes(k))) failsHits.push(`[占位括号:${inner}] ${f}:${i + 1} …${ln.trim().slice(0, 100)}…`);
      });
    });
  }
  info('  F.6 占位/括号审计（严格）：命中 ' + failsHits.length + ' 处；正常书名号【】共 ' + bracketTotal + ' 处（仅统计，不计入失败）');
  failsHits.slice(0, 200).forEach(h => info('    ' + h));
  check('F.6 发布产物无明文占位（待定/待确认/待填/占位）且无占位括号【…】', failsHits.length === 0, failsHits.slice(0, 12).join(' | '));
}

// ================= F.7 =================
{
  const club = fs.readFileSync(join('club.html'), 'utf8');
  const ev = fs.readFileSync(join('09-research/reports/EV/index.html'), 'utf8');
  const noidxClub = /name="robots"[^>]*content="noindex"/.test(club);
  const noidxEV = /name="robots"[^>]*content="noindex"/.test(ev);
  const linksToClub = [], linksToEV = [];
  for (const f of allFiles) {
    if (!f.endsWith('.html')) continue;
    const t = fs.readFileSync(join(f), 'utf8');
    if (/<a[^>]+href=["'][^"']*club\.html/.test(t)) linksToClub.push(f);
    if (/<a[^>]+href=["'][^"']*09-research/reports/EV\b/.test(t)) linksToEV.push(f);
  }
  const sm = fs.readFileSync(join('sitemap.xml'), 'utf8');
  const ll = fs.readFileSync(join('llms.txt'), 'utf8');
  const smBad = sm.includes('club.html') || sm.includes('09-research/reports/EV');
  const llBad = ll.includes('club.html') || ll.includes('09-research/reports/EV');
  check('F.7 club.html & reports/EV/index.html 有 noindex', noidxClub && noidxEV, `club=${noidxClub} ev=${noidxEV}`);
  check('F.7 全站无指向 club.html / reports/EV 的链接', linksToClub.length === 0 && linksToEV.length === 0,
    `club=${linksToClub.join(',')} ev=${linksToEV.join(',')}`);
  check('F.7 sitemap.xml / llms.txt 不含 club.html / reports/EV', !(smBad || llBad),
    `sitemap=${smBad} llms=${llBad}`);
}

// ================= F.8 =================
{
  const prods = JSON.parse(fs.readFileSync(join('data/products.json'), 'utf8'));
  let ok = true; const lines = [];
  for (const p of prods) {
    const exists = fs.existsSync(join(p.page));
    let priceOk = false, posterOk = false, evOk = false, btnOk = false;
    if (exists) {
      const t = fs.readFileSync(join(p.page), 'utf8');
      const isP = p.page.startsWith('02-projects/');
      priceOk = isP ? t.includes(p.price_text) : null; // 价格文字一致仅校验 p/ 页（spec F.8）
      btnOk = /feishu-proxy/.test(t) || /class="btn-submit"/.test(t) || /data-product=/.test(t);
      posterOk = p.poster ? fs.existsSync(join(p.poster)) : true;
      evOk = (p.evidence_types && p.evidence_types.length > 0)
        ? /evidence|data-evidence|实证|证据/.test(t)
        : true;
    } else ok = false;
    const lineOk = exists && priceOk !== false && posterOk && evOk && btnOk;
    if (!lineOk) ok = false;
    lines.push(`${lineOk ? 'OK ' : 'XX '}${p.slug} | page=${exists} price=${priceOk === null ? 'n/a' : priceOk} poster=${posterOk} ev[${p.evidence_types ? p.evidence_types.length : 0}]=${evOk} btn=${btnOk}`);
  }
  check('F.8 9 个产品逐项核对', ok, lines.join(' | '));
}

// ================= F.9 =================
{
  const home = fs.readFileSync(join('index.html'), 'utf8');
  const start = home.indexOf('id="stage"');
  const end = home.indexOf('id="reports"');
  const sec = home.slice(start, end < 0 ? home.length : end);
  const hrefs = [...sec.matchAll(/href="([^"]+)"/g)].map(m => m[1])
    .filter(h => !h.startsWith('#') && !h.startsWith('http'));
  const miss = [];
  for (const h of hrefs) if (!fs.existsSync(join(h))) miss.push(h);
  check('F.9 首页 #stage 四张卡 8 条目链接文件均存在', miss.length === 0,
    `links=${JSON.stringify([...new Set(hrefs)])} missing=${JSON.stringify(miss)}`);
}

// ================= F.10 =================
{
  const a1 = ['calendar.html', 'ceo-tour.html', 'club.html', '08-engage/self-test/index.html',
    'events-index.html', 'index.html', '02-projects/chuhaiban/index.html', '02-projects/closed-door/index.html',
    '02-projects/global-trip/index.html', '02-projects/online-connect/index.html', '02-projects/project/index.html',
    '02-projects/trade-growth/index.html', '09-research/reports/index.html'];
  const miss = [];
  for (const pg of a1) {
    const t = fs.readFileSync(join(pg), 'utf8');
    if (!/src-track\.js/.test(t)) miss.push(pg);
  }
  const pp = fs.existsSync(join('02-projects/project/index.html'));
  const pps = fs.existsSync(join('02-projects/project/success.html'));
  check('F.10 src-track 接入全部 A1 页面；p/project 与 success 存在', miss.length === 0 && pp && pps,
    `missing=${miss.join(',')} p/project=${pp} success=${pps}`);
}

// ---- summary ----
info('');
info('豁免清单 (EXEMPT): ' + EXEMPT.join(', '));
info(`==== 总计: ${fails === 0 ? 'ALL PASS' : fails + ' FAIL'} ====`);
console.log(out.join('\n'));
process.exit(fails === 0 ? 0 : 1);
