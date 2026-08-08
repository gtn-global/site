#!/usr/bin/env node
/**
 * 自动生成 sitemap.xml 与 llms.txt（零依赖，仅使用 Node 内置模块）
 *
 * 运行方式（在仓库根目录执行）：
 *   node generate-sitemap.js
 * 脚本会同时写出 sitemap.xml（站点地图）与 llms.txt（AI 索引，GEO 核心）。
 * ⚠️ 这两个产物文件请勿手改——下次运行本脚本会被覆盖。
 *   新增/移动/删除页面后，务必重跑本脚本再 push。
 *   说明见《海鑫汇GTN-网站运维 Handoff.md》五-B 节。
 *
 * 规则：
 *  - 根目录 index.html           -> https://<BASE>/
 *  - 根目录 xxx.html（非 index）  -> https://<BASE>/xxx.html
 *  - 含 index.html 的子目录       -> https://<BASE>/<目录名>/
 *      * 目录名含非 ASCII（如中文）会自动做 URL 编码
 *  - 若某目录存在 en/index.html 或 en/ 子目录，
 *    则对应中文页与英文页互相添加 hreflang (zh-CN / en / x-default)
 *
 * 资源目录（images/css/js/媒体/logo 等）会被跳过，不进入 sitemap。
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BASE = 'https://gtn-global.netlify.app';

// 这些目录只是静态资源，不是可访问页面，跳过
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.codebuddy',
  'carousel', 'clients', 'flags', 'logo',
  '_demo', // 各板块的样板/模板页，不是真实页面，永不收录
]);

// 这些扩展名不是页面，跳过
const SKIP_EXT = new Set(['.ai', '.mp4', '.mov', '.jpg', '.jpeg', '.png', '.svg', '.gif', '.webp', '.ico', '.css', '.js', '.json', '.toml', '.md', '.woff', '.woff2', '.ttf']);

/**
 * 把绝对目录/文件路径转成站点 URL 路径（带结尾斜杠或 .html）
 */
function toUrl(relPath) {
  // 统一用 / 分隔
  const p = relPath.split(path.sep).join('/');
  if (p === '' || p === '/') return '/';
  if (p.endsWith('/index.html')) {
    return '/' + p.slice(0, -'index.html'.length); // 去掉 index.html，保留结尾 /
  }
  return '/' + p;
}

/**
 * 对 URL 路径做编码（仅编码非 ASCII / 保留字符），保留 / 和 .html
 */
function encodeUrlPath(urlPath) {
  return urlPath
    .split('/')
    .map((seg) => seg === '' ? '' : encodeURI(segmentKeepExt(seg)))
    .join('/');
}

function segmentKeepExt(seg) {
  // 对 xxx.html 只编码文件名部分（其实 encodeURI 对 .html 安全，整体编码即可）
  return seg;
}

/** 递归收集页面条目 */
function collectPages(dir, relBase, pages) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    const rel = relBase ? relBase + '/' + ent.name : ent.name;
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      collectPages(abs, rel, pages);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (SKIP_EXT.has(ext)) continue;
      if (ext !== '.html') continue;
      // 排除内部说明/演示页（如 *-demo.html、*-demo-en.html、*说明*.html），不进入线上 sitemap
      if (/-demo.*\.html$/.test(ent.name)) continue;
      if (/说明.*\.html$/.test(ent.name)) continue;
      // 记录页面（rel 为相对 ROOT 的路径，使用 / 分隔）
      pages.push(rel.split(path.sep).join('/'));
    }
  }
}

/** 判断某目录是否有英文版（en/index.html 或 en 子目录） */
function hasEnSibling(relHtmlPath) {
  // relHtmlPath 形如 experts/donglixin/index.html 或 index.html
  if (!relHtmlPath.endsWith('index.html')) return null;
  const dir = relHtmlPath.slice(0, -'index.html'.length); // experts/donglixin/ 或 ''
  const enDir = (dir + 'en').split('/').filter(Boolean).join('/');
  const enIndexPath = path.join(ROOT, ...enDir.split('/'), 'index.html');
  const enDirPath = path.join(ROOT, ...enDir.split('/'));
  if (fs.existsSync(enIndexPath)) {
    return (dir + 'en/');
  }
  if (fs.existsSync(enDirPath) && fs.statSync(enDirPath).isDirectory()) {
    return (dir + 'en/');
  }
  return null;
}

/**
 * 读取单个 HTML 页面的 <title> 与 <meta name="description">
 * 用于生成 llms.txt 的条目文案（从真实页面取，避免人工维护脱节）
 */
function readPageMeta(relHtmlPath) {
  const abs = path.join(ROOT, ...relHtmlPath.split('/'));
  let html = '';
  try {
    html = fs.readFileSync(abs, 'utf-8');
  } catch (e) {
    return { title: '', desc: '' };
  }
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const descMatch = html.match(/<meta\s+name="description"\s+content="([\s\S]*?)"/i);
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  return {
    title: clean(titleMatch ? titleMatch[1] : ''),
    desc: clean(descMatch ? descMatch[1] : ''),
  };
}

/**
 * 按路径对页面分类，决定 llms.txt 的分组与 sitemap 的优先级
 *  - experts/xxx/index.html        -> 专家页 (priority 0.7)
 *  - member/运营中心xxx/index.html -> 运营中心页 (priority 0.7)
 *  - 根 index.html                  -> 首页 (priority 1.0)
 *  - 根 xxx-index.html / 其他 html  -> 索引/核心页 (priority 0.6)
 */
function classify(relHtmlPath, urlPath) {
  if (urlPath === '/') return { group: 'home', priority: '1.0' };
  if (/^experts\//.test(relHtmlPath)) return { group: 'expert', priority: '0.7' };
  if (/^member\//.test(relHtmlPath)) return { group: 'hub', priority: '0.7' };
  return { group: 'index', priority: '0.6' };
}

const GROUP_LABEL = {
  expert: '## 专家顾问',
  hub: '## 运营中心',
  index: '## 核心页面',
  home: '## 核心页面',
};

function build() {
  const pages = [];
  collectPages(ROOT, '', pages);

  // 去重 + 排序，保证输出稳定
  const unique = Array.from(new Set(pages)).sort();

  const urlEls = [];
  const llmsGroups = { home: [], expert: [], hub: [], index: [] };

  for (const rel of unique) {
    const urlPath = toUrl(rel);                 // 站点相对路径
    const locPath = encodeUrlPath(urlPath);     // 编码后的路径
    const loc = BASE + locPath;

    const cls = classify(rel, urlPath);
    const meta = readPageMeta(rel);
    const label = meta.title || loc;

    // 累积 llms.txt 条目
    const bullet = `- [${label}](${loc})${meta.desc ? '：' + meta.desc : ''}`;
    llmsGroups[cls.group].push(bullet);

    const enRel = hasEnSibling(rel);
    const lines = [];
    lines.push(`  <url>`);
    lines.push(`    <loc>${loc}</loc>`);

    if (enRel) {
      // enRel 已经是目录形式（如 experts/donglixin/en/），toUrl 直接得到 /experts/donglixin/en/
      const enUrlPath = toUrl(enRel);
      const enLocPath = encodeUrlPath(enUrlPath);
      const enLoc = BASE + enLocPath;
      const zhLoc = loc;
      // 中文页：列出 hreflang 互指
      lines.push(`    <xhtml:link rel="alternate" hreflang="zh-CN" href="${zhLoc}"/>`);
      lines.push(`    <xhtml:link rel="alternate" hreflang="en" href="${enLoc}"/>`);
      lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${zhLoc}"/>`);
      // 英文页单独作为一个 <url> 条目（带反向 hreflang）
      urlEls.push(
        `  <url>\n    <loc>${enLoc}</loc>\n` +
        `    <xhtml:link rel="alternate" hreflang="en" href="${enLoc}"/>\n` +
        `    <xhtml:link rel="alternate" hreflang="zh-CN" href="${zhLoc}"/>\n` +
        `    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`
      );
    }

    lines.push(`    <changefreq>${cls.group === 'home' ? 'weekly' : 'monthly'}</changefreq>`);
    lines.push(`    <priority>${cls.priority}</priority>`);
    lines.push(`  </url>`);
    urlEls.push(lines.join('\n'));
  }

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">

${urlEls.join('\n\n')}

</urlset>
`;

  const outPath = path.join(ROOT, 'sitemap.xml');
  fs.writeFileSync(outPath, xml, 'utf-8');
  console.log(`[sitemap] 生成完成：${outPath}`);
  console.log(`[sitemap] 共 ${urlEls.length} 个 <url> 条目`);

  // 同步生成 llms.txt（与 sitemap 共用同一数据源，域名统一 BASE）
  genLlmsTxt(llmsGroups);

  // ===== 自动校验 + 自动修（部署前兜底）=====
  const { issues, autoFixed } = verifyAndAutoFix();
  if (autoFixed.length) {
    console.log(`\n[verify] 自动修复 ${autoFixed.length} 处：`);
    autoFixed.forEach(s => console.log(`  ✓ ${s}`));
  }
  if (issues.length) {
    console.log(`\n[verify] 发现 ${issues.length} 处需人工处理的问题：`);
    issues.forEach(s => console.log(`  ✗ ${s}`));
    console.log(`\n[verify] 校验未通过——存在需人工确认的问题，部署前应处理。`);
    process.exit(1); // 非零退出：Netlify build / GitHub Action 会判定失败、拦截部署
  } else {
    console.log(`\n[verify] 校验通过，无机械错误。`);
  }
}

/**
 * 校验 + 自动修（核心自动化，不依赖人工/智能体记忆）
 * ------------------------------------------------------------
 * 在生成 sitemap/llms 之后，自动扫描全站，发现机械错误就：
 *  1) 能自动修的（如 gtn.me 残留）→ 直接改文件并报告；
 *  2) 不能自动修的（如头像指向不存在的文件）→ 仅报告，供部署前拦截。
 * 本函数返回发现的问题数；>0 时脚本以非零码退出，Netlify/GitHub 会拦部署。
 */
const OLD_DOMAIN = 'gtn.me';
const CANON_DOMAIN = 'gtn-global.netlify.app';

function verifyAndAutoFix() {
  const issues = [];
  const autoFixed = [];
  const htmlFiles = [];

  // 收集所有 html 文件
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (e) { return; }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        walk(abs);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.html')) {
        htmlFiles.push(abs);
      }
    }
  })(ROOT);

  for (const abs of htmlFiles) {
    let content;
    try { content = fs.readFileSync(abs, 'utf-8'); }
    catch (e) { continue; }

    // --- 规则1：禁用旧域名 gtn.me（自动修）---
    if (content.includes(OLD_DOMAIN)) {
      const fixed = content.split(OLD_DOMAIN).join(CANON_DOMAIN);
      fs.writeFileSync(abs, fixed, 'utf-8');
      autoFixed.push(`gtn.me → ${CANON_DOMAIN}（${path.relative(ROOT, abs)}）`);
      content = fixed;
    }

    // --- 规则1-前置：member/ 运营中心页面豁免 ---
    // 各运营中心页面由对应中心自行维护配图与链接（内容待补），图片/链接缺失不阻塞部署
    const relAbs = path.relative(ROOT, abs);
    const isMemberPage = relAbs.startsWith('member' + path.sep) || relAbs === 'member';

    // --- 规则2：头像/图片 src 指向必须存在（仅报告，不自动改，避免误伤）---
    // 已知正常例外（按《运维 Handoff.md》五-A-3 铁律）：
    //   - adv-13~30.jpg：预留占位卡片，CSS display:none 隐藏，缺失属正常
    const SRC_IGNORE = /adv-(1[3-9]|2[0-9]|30)\.jpg$|avatar-placeholder\.svg$/i;
    const srcRegex = /src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif|svg))["']/gi;
    let m;
    if (!isMemberPage) {
      while ((m = srcRegex.exec(content)) !== null) {
        const src = m[1];
        if (/^(https?:)?\/\//i.test(src)) continue; // 外链跳过
        if (SRC_IGNORE.test(src)) continue; // 已知正常例外
        const imgAbs = path.resolve(path.dirname(abs), src);
        if (!fs.existsSync(imgAbs)) {
          // member/ 目录下的图片由各运营中心自行提供（内容待补），缺失不阻塞部署
          const imgRel = path.relative(ROOT, imgAbs);
          if (imgRel.startsWith('member' + path.sep)) continue;
          issues.push(`图片缺失：${path.relative(ROOT, abs)} 引用 ${src}（文件不存在）`);
        }
      }
    }

    // --- 规则3：内部 html 跳转 href 指向必须存在（仅报告）---
    const hrefRegex = /href=["']([^"']+\.html[^"']*)["']/gi;
    if (!isMemberPage) {
      while ((m = hrefRegex.exec(content)) !== null) {
        const href = m[1];
        if (/^(https?:)?\/\//i.test(href) || href.startsWith('#') || href.startsWith('mailto:')) continue;
        // 去掉锚点
        const clean = href.split('#')[0];
        if (!clean) continue;
        const targetAbs = path.resolve(path.dirname(abs), clean);
        if (!fs.existsSync(targetAbs)) {
          issues.push(`链接 404：${path.relative(ROOT, abs)} 链接到 ${href}（文件不存在）`);
        }
      }
    }
  }

  // --- 规则4：sitemap 是否包含了所有 public 页面（demo/说明已排除）---
  // 与 collectPages 同口径再扫一遍，比对 sitemap.xml 实际条目
  const expected = [];
  collectPages(ROOT, '', expected);
  const uniqueExpected = Array.from(new Set(expected)).map(toUrl).map(p => BASE + encodeUrlPath(p));
  let sitemapContent = '';
  try { sitemapContent = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf-8'); } catch (e) {}
  const missing = uniqueExpected.filter(loc => !sitemapContent.includes(loc));
  if (missing.length) {
    issues.push(`sitemap 漏收 ${missing.length} 个页面（示例：${missing.slice(0, 3).join('、')}）`);
  }

  return { issues, autoFixed };
}

/**
 * 生成 llms.txt：品牌头固定写死，页面列表由脚本从目录扫描自动产出。
 * 以后无需人工维护；新增页面重新部署即自动更新。
 */
function genLlmsTxt(groups) {
  const header = `# 海鑫汇（海鑫汇 GTN · Global Talent Network）

> 海鑫汇，全称海鑫汇·全球国际化人才联盟（英文 Global Talent Network，简称 GTN），是面向中国企业出海的决策咨询与全球化人才服务机构。两期累计签约 30+ 位专家顾问，均为上市公司或知名企业高管，均已获公开展示授权。业务覆盖出海决策咨询、跨境电商、制造业全球化、AI 硬科技、低空经济、教育出海、投资与财富配置等领域。运营节点：哈萨克斯坦（KZ）· 新加坡（SG）· 德国（DE）。

> 本文件由 generate-sitemap.js 在每次部署时自动生成，请勿手动编辑；新增页面后重新部署即自动收录。

`;

  const parts = [header];
  for (const key of ['expert', 'hub', 'index', 'home']) {
    const items = groups[key];
    if (!items || items.length === 0) continue;
    parts.push(GROUP_LABEL[key] + '\n');
    parts.push(items.join('\n') + '\n');
    parts.push('');
  }

  const outPath = path.join(ROOT, 'llms.txt');
  fs.writeFileSync(outPath, parts.join('\n'), 'utf-8');
  console.log(`[llms.txt] 生成完成：${outPath}`);
  console.log(`[llms.txt] 共 ${Object.values(groups).reduce((n, a) => n + a.length, 0)} 个条目`);
}

build();
