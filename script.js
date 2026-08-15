// ============================================================
// 海鑫汇 Global Expansion Desk — shared behavior
// Used by: index.html / events-index.html / advisors-index.html
// Defensive: every block checks the element exists before acting,
// so this one file is safe to include on every page even if a
// given page doesn't have all the same elements.
// ============================================================

// ---- desk clock: rendered entirely from JS so a single change here
//      propagates to every page (no per-HTML hardcoding) ----
// 国家顺序 / 文案 / 时区都只在这里定义一次。
const CLOCK_ZONES = [
  { label: '哈萨克斯坦', tz: 'Asia/Almaty' },
  { label: '新加坡',     tz: 'Asia/Singapore' },
  { label: '德国',       tz: 'Europe/Berlin' },
  { label: '日本',       tz: 'Asia/Tokyo' }
];

function renderClocks(){
  const root = document.querySelector('.desk-clock');
  if(!root) return;
  const now = new Date();

  // 仅在首次构建 DOM 结构（避免每 30s 重建节点）
  if(!root.dataset.built){
    root.innerHTML = CLOCK_ZONES.map((z, i) =>
      '<span><span class="clk-label">' + z.label + '</span> ' +
      '<b data-tz="' + z.tz + '">--:--</b></span>'
    ).join('');
    root.dataset.built = '1';
  }

  root.querySelectorAll('b[data-tz]').forEach(b => {
    b.textContent = new Intl.DateTimeFormat('zh-CN',{
      timeZone: b.dataset.tz, hour:'2-digit', minute:'2-digit', hour12:false
    }).format(now);
  });
}
renderClocks();
setInterval(renderClocks, 30000);

// ---- scroll reveal (fade-up on entry into viewport) ----
const revealEls = document.querySelectorAll('.reveal');
if(revealEls.length){
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
  },{threshold:0.12});
  revealEls.forEach(el=>io.observe(el));
}

// ---- nav active-state (only relevant on index.html, which has matching #ids) ----
const sections = document.querySelectorAll('.section[id]');
const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
if(sections.length && navLinks.length){
  const navIo = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        navLinks.forEach(l=>l.classList.remove('active'));
        const active = document.querySelector('.nav-links a[href="#'+entry.target.id+'"]');
        if(active) active.classList.add('active');
      }
    });
  },{rootMargin:'-45% 0px -50% 0px'});
  sections.forEach(s=>navIo.observe(s));
}

// ---- 手风琴（首页行业决策情境 + 政府/机构对接）----
// 交互：鼠标悬停（mouseenter）展开，悬停到另一项时切换；
// 鼠标离开整个手风琴容器（mouseleave）时全部收起，避免移走后仍摊开。
// ⚠️ 严格禁止 click 作为展开条件。
function initAccordion(rootId){
  const root = document.getElementById(rootId);
  if(!root) return;
  const items = root.querySelectorAll('.accordion-item');
  if(!items.length) return;
  const closeAll = ()=>{
    items.forEach(it=>{
      it.classList.remove('open');
      const t = it.querySelector('.accordion-trigger');
      if(t) t.setAttribute('aria-expanded', 'false');
    });
  };
  items.forEach(item=>{
    const trigger = item.querySelector('.accordion-trigger');
    if(!trigger) return;
    trigger.addEventListener('mouseenter', ()=>{
      // 同一手风琴内只保持一项展开：先收起其他项
      items.forEach(other=>{
        if(other !== item){
          other.classList.remove('open');
          const ot = other.querySelector('.accordion-trigger');
          if(ot) ot.setAttribute('aria-expanded', 'false');
        }
      });
      item.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    });
  });
  // 鼠标移出手风琴区域：全部收起
  root.addEventListener('mouseleave', closeAll);
}
initAccordion('situation-accordion');
initAccordion('govtrack-accordion');
initAccordion('decision-accordion');

// ---- 行业决策情境：绿色胶囊统一为最宽宽度 ----
// 运行时测量每个胶囊真实渲染宽度，取最大值套用到全部，保证等长对齐。
function equalizeScenarioTags(){
  const tags = document.querySelectorAll('#situation-accordion .accordion-trigger .tag');
  if(tags.length < 2) return;
  let max = 0;
  tags.forEach(t=>{ t.style.minWidth = ''; }); // 先清除，测自然宽度
  tags.forEach(t=>{ max = Math.max(max, t.getBoundingClientRect().width); });
  const w = Math.ceil(max) + 'px';
  tags.forEach(t=>{ t.style.minWidth = w; });
}
equalizeScenarioTags();
window.addEventListener('resize', equalizeScenarioTags);
// 字体加载完成后宽度会变，重新校准一次
if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(equalizeScenarioTags);
}

// ===== #content-hub 背景轮播（6张图自动切换） =====
(function() {
  var slides = document.querySelectorAll('#content-hub .hub-slide');
  var dots = document.querySelectorAll('#content-hub .hub-dots .dot');
  if (!slides.length) return;
  var current = 0, timer = null;

  function goTo(index) {
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;
    slides.forEach(function(s) { s.classList.remove('active'); });
    dots.forEach(function(d) { d.classList.remove('active'); });
    slides[index].classList.add('active');
    dots[index].classList.add('active');
    current = index;
  }

  function next() { goTo(current + 1); }

  function start() {
    if (timer) clearInterval(timer);
    timer = setInterval(next, 4000);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  dots.forEach(function(dot, i) {
    dot.addEventListener('click', function() {
      stop();
      goTo(i);
      start();
    });
  });

  var container = document.getElementById('content-hub');
  if (container) {
    container.addEventListener('mouseenter', stop);
    container.addEventListener('mouseleave', start);
  }

  goTo(0);
  start();
})();

// ===== #content-hub Logo 跑马灯（自动探测 logo-01 ~ logo-99） =====
// 你只需把图片按 logo-01.png、logo-02.png … 顺序放进 logo/ 文件夹，
// 本脚本会自动加载存在的图片并生成无缝双组跑马灯，不存在的编号自动跳过。
(function() {
  var track = document.getElementById('hubMarqueeTrack');
  if (!track) return;

  var MAX = 99;          // 最多探测到 logo-99
  var BASE = 'logo/logo-';
  var SUFFIX = '.webp';
  var found = [];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // 顺序探测，避免并发导致顺序错乱
  function probe(i) {
    if (i > MAX) { build(); return; }
    var img = new Image();
    img.onload = function() {
      found.push(BASE + pad(i) + SUFFIX);
      probe(i + 1);
    };
    img.onerror = function() { probe(i + 1); };
    img.src = BASE + pad(i) + SUFFIX;
  }

  function build() {
    if (!found.length) return;
    // 双组相同列表，保证 translateX(-50%) 无缝
    var lists = ['', 'aria-hidden="true"'];
    lists.forEach(function(attr) {
      var list = document.createElement('div');
      list.className = 'marquee-list';
      if (attr) list.setAttribute('aria-hidden', 'true');
      found.forEach(function(src) {
        var im = document.createElement('img');
        im.src = src;
        im.alt = 'partner';
        list.appendChild(im);
      });
      track.appendChild(list);
    });
  }

  probe(1);
})();

// ===== 统计数字 count-up 增长动画（参考 startupalliance 效果） =====
// 进入视口时，数字从 0 滚动增长到 data-count 目标值，停留在该值。
(function() {
  var line = document.querySelector('.stat-line');
  if (!line) return;
  var nums = line.querySelectorAll('.stat-count');
  if (!nums.length) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animate(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    if (reduce) { el.textContent = target; return; }
    var duration = 2000;
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      // easeOutCubic 缓动，先快后慢，停在目标值
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) {
          nums.forEach(animate);
          io.disconnect();
        }
      });
    }, { threshold: 0.4 });
    io.observe(line);
  } else {
    nums.forEach(animate);
  }
})();

// ---- 统一 footer：内容只在这里定义一次，所有页面（含三级页）共用 ----
const FOOTER_LINKS = [
  { label: '深度诊断', href: 'index.html#offer' },
  { label: '专家顾问', href: 'advisors-index.html' },
  { label: '全球生态', href: 'ecosystem-index.html' },
  { label: '活动记录', href: 'events-index.html' },
  { label: '新闻报道', href: 'news-index.html' }
];

function renderFooter(){
  const root = document.querySelector('.footer');
  if(!root) return;
  const depth = parseInt(root.dataset.depth || '0', 10);
  const prefix = '../'.repeat(depth);
  const linksHtml = FOOTER_LINKS.map(l =>
    '<a href="' + prefix + l.href + '">' + l.label + '</a>'
  ).join(' · ');
  root.innerHTML =
    '<div class="footer-brand">&copy; 2026 海鑫汇 Global Talent Network (GTN). 版权所有 All rights reserved.</div>' +
    '<nav class="footer-links">' + linksHtml + '</nav>' +
    '<div class="footer-meta">ALA · SIN · BER</div>';
}
renderFooter();
