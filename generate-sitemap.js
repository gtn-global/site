#!/usr/bin/env node
/**
 * 自动生成 sitemap.xml（零依赖，仅使用 Node 内置模块）
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
      // 排除内部说明/演示页（如 *-demo.html），不进入线上 sitemap
      if (/.*-demo\.html$/.test(ent.name)) continue;
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

function build() {
  const pages = [];
  collectPages(ROOT, '', pages);

  // 去重 + 排序，保证输出稳定
  const unique = Array.from(new Set(pages)).sort();

  const urlEls = [];

  for (const rel of unique) {
    const urlPath = toUrl(rel);                 // 站点相对路径
    const locPath = encodeUrlPath(urlPath);     // 编码后的路径
    const loc = BASE + locPath;

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
        `    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`
      );
    }

    // 优先级：首页最高，其余 0.8
    const isHome = urlPath === '/';
    lines.push(`    <changefreq>${isHome ? 'weekly' : 'monthly'}</changefreq>`);
    lines.push(`    <priority>${isHome ? '1.0' : '0.8'}</priority>`);
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
}

build();
