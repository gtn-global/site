// 生成 6 个产品静态页 p/<slug>/index.html
// 骨架参照 ceo-tour.html（header/footer/script 模式）+ events 深度2页的路径前缀（../../）
// 价格/按钮只取 data/products.json；海报图与抽取文案仅在对应 webp 已生成时才显示（避免占位泄漏到公开页）
import fs from 'node:fs';
import path from 'node:path';
import { blockHTML } from './evidence-lib.mjs';

const ROOT = process.cwd();
const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
const POSTER_DIR = path.join(ROOT, 'assets', 'posters');
let copy = {};
try { copy = JSON.parse(fs.readFileSync(path.join(POSTER_DIR, 'poster-copy.json'), 'utf8')); } catch (_) {}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const filters = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'filters.json'), 'utf8'));
const industryOpts = (filters.industries || []).map(x => `<option value="${esc(x.display)}">${esc(x.display)}</option>`).join('');
const regionOpts = (filters.countries || []).map(x => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('');

const P_SLUGS = ['chuhaiban', 'trade-growth', 'closed-door', 'online-connect', 'global-trip', 'project'];

const MODAL = `
<div class="intent-modal" id="intentModal" hidden>
  <div class="intent-backdrop" data-close="1"></div>
  <div class="intent-box" role="dialog" aria-modal="true" aria-label="登记意向">
    <button class="intent-x" type="button" data-close="1" aria-label="关闭">✕</button>
    <h3 class="intent-title" id="intentTitle">登记意向</h3>
    <p class="intent-sub" id="intentSub"></p>
    <form class="intent-form" id="intentForm">
      <input type="hidden" name="product" id="intentProduct">
      <input type="hidden" name="source" id="intentSource">
      <div class="field"><label for="intentName">姓名（选填）</label><input type="text" name="name" id="intentName" placeholder="您的称呼"></div>
      <div class="field"><label for="intentCompany">公司（选填）</label><input type="text" name="company" id="intentCompany" placeholder="公司名称"></div>
      <div class="field full"><label for="intentContact">联系方式 Contact（必填）</label><input type="text" name="contact" id="intentContact" placeholder="手机号或微信号" required></div>
      <div class="field full"><label class="consent"><input type="checkbox" id="intentConsent" required> 我已阅读并同意<a href="../../privacy.html" target="_blank" rel="noopener">隐私说明</a></label></div>
      <div class="form-submit"><button type="submit" class="btn-submit btn-seal">提交登记</button></div>
      <p class="form-error" id="intentError" hidden></p>
    </form>
  </div>
</div>`;

const MODAL_SCRIPT = `
<script>
(function(){
  var modal=document.getElementById('intentModal'), form=document.getElementById('intentForm');
  var titleEl=document.getElementById('intentTitle'), subEl=document.getElementById('intentSub');
  var productEl=document.getElementById('intentProduct'), sourceEl=document.getElementById('intentSource');
  var errEl=document.getElementById('intentError');
  if(!modal||!form) return;
  function openIntent(product, source, label){
    productEl.value=product||''; sourceEl.value=source||'product-interest';
    titleEl.textContent=label||'登记意向'; subEl.textContent=product?('意向：'+product):'';
    if(errEl){ errEl.hidden=true; errEl.textContent=''; }
    var btn=form.querySelector('button[type=submit]'); if(btn){ btn.disabled=false; btn.textContent='提交登记'; }
    modal.hidden=false;
  }
  window.openIntent=openIntent;
  modal.addEventListener('click',function(e){ if(e.target.getAttribute('data-close')) modal.hidden=true; });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&!modal.hidden) modal.hidden=true; });
  form.addEventListener('submit',function(ev){
    ev.preventDefault();
    var f=this; if(f.dataset.busy) return; f.dataset.busy='1';
    var btn=f.querySelector('button[type=submit]'); if(btn){ btn.disabled=true; btn.textContent='提交中…'; }
    if(errEl){ errEl.hidden=true; errEl.textContent=''; }
    var d={ name:f.name.value, company:f.company.value, contact:f.contact.value, brief: GTN_SRC_BRIEF('意向产品：'+(productEl.value||'')), source:sourceEl.value };
    fetch('/feishu-proxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)})
      .then(function(r){ if(!r.ok) throw new Error('server:'+r.status); return r.json(); })
      .then(function(j){ if(!j.ok) throw new Error(j.error||'feishu error'); if(btn) btn.textContent='已提交，我们会联系你'; f.dataset.busy=''; })
      .catch(function(e){ console.error(e); if(errEl){ var cw=window.CONTACT_WECHAT; errEl.textContent='提交失败，请稍后重试'+(cw?('，或加微信 '+cw):''); errEl.hidden=false; } if(btn){ btn.disabled=false; btn.textContent='提交登记'; } f.dataset.busy=''; });
  });
  document.querySelectorAll('button[data-product]').forEach(function(b){
    b.addEventListener('click',function(){ openIntent(b.getAttribute('data-product'), b.getAttribute('data-source')||'product-interest', b.textContent.trim()); });
  });
})();
</script>`;

// 出海项目表单（p/project），仅前端，提交走 /feishu-proxy（source=project-inquiry）；新字段拼进 brief。
const PROJECT_FORM = `
<form id="projectForm" class="project-form" novalidate>
  <div class="field"><label for="pf-name">姓名 *</label><input type="text" id="pf-name" name="name" required></div>
  <div class="field"><label for="pf-company">公司 *</label><input type="text" id="pf-company" name="company" required></div>
  <div class="field"><label for="pf-title">职位 *</label><input type="text" id="pf-title" name="title" required></div>
  <div class="field"><label for="pf-ctype">企业类型</label><select id="pf-ctype" name="company_type"><option value="">请选择</option><option value="专精特新">专精特新</option><option value="上市公司">上市公司</option><option value="其他">其他</option></select></div>
  <div class="field"><label for="pf-industry">行业</label><select id="pf-industry" name="industry"><option value="">请选择</option>${industryOpts}</select></div>
  <div class="field"><label for="pf-region">意向区域</label><select id="pf-region" name="region"><option value="">请选择</option>${regionOpts}</select></div>
  <div class="field"><label for="pf-stage">出海阶段</label><select id="pf-stage" name="stage"><option value="">请选择</option><option value="planning">规划中 · 已立项</option><option value="testing">试水阶段 · 小规模测试</option><option value="scaling">扩张中 · 多国运营</option><option value="established">已成熟 · 深度本地化</option></select></div>
  <div class="field"><label for="pf-contact">联系方式 *</label><input type="text" id="pf-contact" name="contact" required placeholder="手机号或微信号"></div>
  <div class="field full"><label for="pf-project">想聊的项目（选填）</label><textarea id="pf-project" name="project" rows="4" placeholder="一句话描述你的出海项目"></textarea></div>
  <div class="field full consent"><label class="consent"><input type="checkbox" id="pf-consent" name="consent" required> 我已阅读并同意<a href="../../privacy.html" target="_blank" rel="noopener">隐私说明</a></label></div>
  <div class="form-submit"><button type="submit" class="btn-submit btn-seal">提交出海项目</button></div>
  <p class="form-error" id="pf-error" hidden></p>
</form>`;

const PROJECT_FORM_SCRIPT = `
<script>
(function(){
  var form=document.getElementById('projectForm'); if(!form) return;
  var errEl=document.getElementById('pf-error');
  form.addEventListener('submit',function(ev){
    ev.preventDefault();
    var f=this; if(f.dataset.busy) return; f.dataset.busy='1';
    var btn=f.querySelector('button[type=submit]'); if(btn){ btn.disabled=true; btn.textContent='提交中…'; }
    if(errEl){ errEl.hidden=true; errEl.textContent=''; }
    if(!f.name.value || !f.company.value || !f.title.value || !f.contact.value || !f.consent.checked){
      if(errEl){ errEl.textContent='请填写姓名、公司、职位、联系方式，并勾选同意隐私说明'; errEl.hidden=false; }
      if(btn){ btn.disabled=false; btn.textContent='提交出海项目'; } f.dataset.busy=''; return;
    }
    var parts=[];
    if(f.title.value) parts.push('职位:'+f.title.value);
    if(f.company_type.value) parts.push('企业类型:'+f.company_type.value);
    if(f.industry.value) parts.push('行业:'+f.industry.value);
    if(f.region.value) parts.push('意向区域:'+f.region.value);
    if(f.stage.value) parts.push('出海阶段:'+f.stage.value);
    if(f.project.value) parts.push('项目:'+f.project.value);
    var brief=parts.join('｜');
    var src=(window.GTN_SRC&&window.GTN_SRC())||''; if(src) brief='[src:'+src+'] '+brief;
    var d={ name:f.name.value, company:f.company.value, title:f.title.value, company_type:f.company_type.value, industry:f.industry.value, region:f.region.value, stage:f.stage.value, contact:f.contact.value, project:f.project.value, brief:brief, source:'project-inquiry' };
    fetch('/feishu-proxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)})
      .then(function(r){ if(!r.ok) throw new Error('server:'+r.status); return r.json(); })
      .then(function(j){ if(!j.ok) throw new Error(j.error||'feishu error'); window.location.href='success.html'; })
      .catch(function(e){ console.error(e); if(errEl){ errEl.textContent='提交失败，请稍后重试'; errEl.hidden=false; } if(btn){ btn.disabled=false; btn.textContent='提交出海项目'; } f.dataset.busy=''; });
  });
})();
</script>`;

function pageHTML(p) {
  const slug = p.slug;
  const name = p.name;
  const price = p.price_text || '';
  const cta = p.cta || '登记意向';
  const url = 'https://gatewaytonew.com/p/' + slug + '/';
  const desc = p.desc || name;
  const webp = path.join(POSTER_DIR, slug + '.webp');
  const hasPoster = fs.existsSync(webp);
  const posterImg = hasPoster
    ? `<figure class="poster-figure"><img src="../../assets/posters/${slug}.webp" alt="${esc(name)}海报" loading="lazy" width="1080" height="1440"></figure>`
    : '';
  let copyBlock = '';
  const c = copy[slug];
  if (c) {
    const isProj = slug === 'project';
    const keep = (t) => {
      if (!t) return false;
      if (/【|】|待填|待确认|待定/.test(t)) return false;          // 占位片段丢弃
      if (/元|万元/.test(t)) return false;                         // 含价格字样丢弃
      if (isProj && /周|档|数量|周期|—\d|–\d/.test(t)) return false; // 项目页不显示周期/数量/价格档
      return true;
    };
    const parts = [];
    if (keep(c.subtitle)) parts.push(`<p class="product-sub">${esc(c.subtitle)}</p>`);
    if (keep(c.oneLiner)) parts.push(`<p class="product-oneliner">${esc(c.oneLiner)}</p>`);
    if (c.points && c.points.length) {
      const lis = c.points.filter(keep).map(t => `<li>${esc(t)}</li>`).join('');
      if (lis) parts.push('<ul class="product-points">' + lis + '</ul>');
    }
    copyBlock = parts.join('\n');
  }

  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebPage',
    name: name + '｜海鑫汇 GTN', description: desc, url
  });

  let bodyInner, ctaBlock, afterFooter = '';
  const evidenceSlugs = ['global-trip', 'closed-door', 'chuhaiban', 'online-connect'];
  const evidenceBlock = evidenceSlugs.includes(slug) ? blockHTML(slug, '../../') : '';
  if (slug === 'project') {
    bodyInner = `
  <div class="eyebrow">产品 / PRODUCT</div>
  <h1 class="headline reveal">${esc(name)}</h1>
  <div class="product-meta">
    <div class="price">${esc(price)}</div>
  </div>
  <p class="product-desc">我们提供判断与资源连接，不承诺订单或成交。每个出海项目按以下三段交付：</p>
  <ul class="deliverables">
    <li>国家与城市选择</li>
    <li>本地伙伴对接</li>
    <li>政府与园区对接</li>
  </ul>
  <div class="product-cta">
    <a href="#project-form" class="btn-submit btn-seal">提交出海项目</a>
  </div>
  ${PROJECT_FORM}`;
    ctaBlock = '';
    afterFooter = PROJECT_FORM_SCRIPT;
  } else {
    bodyInner = `
  <div class="eyebrow">产品 / PRODUCT</div>
  <h1 class="headline reveal">${esc(name)}</h1>
  ${posterImg}
  ${copyBlock}
  <div class="product-meta">
    <div class="price">${esc(price)}</div>
  </div>
  <div class="product-cta">
    <button type="button" class="btn-submit btn-seal" data-product="${esc(name)}" data-source="product-interest">${esc(cta)}</button>
  </div>${evidenceBlock}`;
    ctaBlock = MODAL;
    afterFooter = MODAL_SCRIPT;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(name)}｜海鑫汇 GTN</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="/favicon.ico" type="image/x-icon">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(name)}｜海鑫汇 GTN">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:site_name" content="Gateway To New (GTN)">
<link rel="stylesheet" href="../../style.css">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
${ld}
</script>
<style>
.product-meta{max-width:760px;margin:0 auto 8px;text-align:center;}
.price{font-size:30px;font-weight:700;color:#0A1F44;margin-bottom:6px;}
.product-cta{text-align:center;margin:18px 0 40px;}
.product-desc{max-width:680px;margin:14px auto 18px;font-size:16px;line-height:1.7;color:#4A5568;}
.deliverables{max-width:680px;margin:0 auto 24px;padding-left:20px;font-size:16px;line-height:1.9;color:#0A1F44;}
.deliverables li{margin:4px 0;}
.poster-figure{max-width:420px;margin:24px auto;}
.poster-figure img{width:100%;height:auto;border-radius:10px;box-shadow:0 8px 24px rgba(10,31,68,.12);display:block;}
.product-sub{text-align:center;font-size:18px;color:#4A5568;margin:8px 0;}
.product-oneliner{text-align:center;font-size:16px;color:#4A5568;margin:6px 0 14px;}
.product-points{max-width:680px;margin:0 auto 20px;padding-left:22px;font-size:16px;line-height:1.8;color:#0A1F44;}
</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <a href="../../index.html" class="wordmark"><img src="../../assets/img/logo-primary.svg" alt="海鑫汇" class="logo-wordmark" fetchpriority="high"><span class="wm-text"><span class="sub">GATEWAY TO NEW</span><span class="slogan">连接中国优势，走向全球</span></span></a>
    <div class="desk-clock"></div>
    <a href="../../index.html#contact" class="subpage-back">&larr; 返回首页<span class="en">BACK TO HOME</span></a>
  </div>
</header>
<section class="section">${bodyInner}
</section>${ctaBlock}
<footer class="footer" data-depth="2"></footer>
<script src="../../assets/js/src-track.js" defer></script>
<script src="../../script.js" defer></script>${afterFooter}
</body>
</html>
`;
}

function successHTML() {
  const url = 'https://gatewaytonew.com/p/project/success.html';
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: '提交成功｜海鑫汇 GTN', url });
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>提交成功｜海鑫汇 GTN</title>
<meta name="description" content="出海项目提交成功">
<link rel="icon" href="/favicon.ico" type="image/x-icon">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="提交成功｜海鑫汇 GTN">
<meta property="og:description" content="出海项目提交成功">
<meta property="og:site_name" content="Gateway To New (GTN)">
<link rel="stylesheet" href="../../style.css">
<link rel="canonical" href="${url}">
<script type="application/ld+json">${ld}</script>
<style>
.success-wrap{max-width:620px;margin:80px auto;text-align:center;padding:0 20px;}
.success-title{font-size:28px;font-weight:700;color:#0A1F44;margin-bottom:14px;}
.success-meta{font-size:16px;color:#4A5568;line-height:1.8;margin-bottom:28px;}
.actions{margin-top:10px;}
.actions .btn-submit{display:inline-block;}
</style>
</head>
<body>
<header class="topbar"><div class="topbar-inner"><a href="../../index.html" class="wordmark"><img src="../../assets/img/logo-primary.svg" alt="海鑫汇" class="logo-wordmark"><span class="wm-text"><span class="sub">GATEWAY TO NEW</span><span class="slogan">连接中国优势，走向全球</span></span></a></div></header>
<section class="section"><div class="success-wrap">
  <h1 class="success-title">提交成功</h1>
  <p class="success-meta">我们已收到你的出海项目信息，会尽快与你联系，请留意来电或微信。</p>
  <div class="actions"><a href="../../index.html" class="btn-submit btn-seal">返回首页</a></div>
</div></section>
<footer class="footer" data-depth="2"></footer>
<script src="../../script.js" defer></script>
</body>
</html>`;
}

P_SLUGS.forEach(slug => {
  const p = products.find(x => x.slug === slug);
  if (!p) { console.log('SKIP (no products.json entry): ' + slug); return; }
  const dir = path.join(ROOT, 'p', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), pageHTML(p).replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote p/' + slug + '/index.html');
  if (slug === 'project') {
    fs.writeFileSync(path.join(dir, 'success.html'), successHTML().replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'utf8');
    console.log('wrote p/project/success.html');
  }
});

// 实证块：ceo-tour.html 与 reports/index.html 用标记幂等注入（不依赖一次性脚本）。
// 首次运行若标记不存在，则在稳定锚点处插入空标记；其后每次重跑只替换标记之间的内容。
function applyEvidenceMarkers(fileRel, block) {
  const f = path.join(ROOT, fileRel);
  if (!fs.existsSync(f)) { console.log('SKIP (no file): ' + fileRel); return; }
  let html = fs.readFileSync(f, 'utf8');
  const EOL = html.includes('\r\n') ? '\r\n' : '\n';
  const markerRe = /<!-- evidence:start -->[\s\S]*?<!-- evidence:end -->/;
  if (!markerRe.test(html)) {
    let inserted = false;
    if (fileRel === 'ceo-tour.html') {
      html = html.replace(/(<div class="cta-form form-wrap reveal">[\s\S]*?<\/form>\s*<\/div>)(\s*)(<\/section>)/,
        (m, g1, g2, g3) => g1 + g2 + '<!-- evidence:start -->' + EOL + '<!-- evidence:end -->' + EOL + g3);
      inserted = true;
    } else if (fileRel === 'reports/index.html') {
      html = html.replace(/(<p class="report-note">[\s\S]*?<\/p>)(\s*)(<figure)/,
        (m, g1, g2, g3) => g1 + g2 + '<!-- evidence:start -->' + EOL + '<!-- evidence:end -->' + EOL + g3);
      inserted = true;
    }
    if (!inserted) { console.log('WARN no anchor for markers: ' + fileRel); return; }
    console.log('inserted evidence markers: ' + fileRel);
  }
  html = html.replace(markerRe, '<!-- evidence:start -->' + EOL + block + EOL + '<!-- evidence:end -->');
  fs.writeFileSync(f, html, 'utf8');
  console.log('updated evidence block: ' + fileRel);
}

applyEvidenceMarkers('ceo-tour.html', blockHTML('ceo-tour', ''));
const EOLR = '\r\n';
const reportsBlock = '<section class="evidence-block">' + EOLR +
  '  <h2 class="evidence-title">实证 · 已发布报告</h2>' + EOLR +
  '  <p class="evidence-stat">新能源电力电气 · 2026.09</p>' + EOLR +
  '  <p class="evidence-report-link"><a href="cleantech/index.html">查看报告 &rarr;</a></p>' + EOLR +
  '</section>';
applyEvidenceMarkers('reports/index.html', reportsBlock);

console.log('done');
