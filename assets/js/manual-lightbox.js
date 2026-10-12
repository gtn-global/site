/* ============================================================================
 * CEO tour 产品手册弹层（可复用组件，所有页面共用一份）
 * ----------------------------------------------------------------------------
 * 用途：点击任意一个带 data-manual-open 的元素，全屏弹层逐页看图。
 * 手册目录与页数只在这个文件里定义一次，页面不写死图片路径：
 *   页面用法：  <button type="button" data-manual-open>查看 CEO tour 手册（英文版）</button>
 *   可选覆盖：  data-manual-base=".../CEO_tour_manual/webp/"  data-manual-count="6"
 *               data-manual-title="CEO tour 手册（英文版）"
 * 行为：不自动翻页、不自动播放；← → 翻页；Esc 关闭；点遮罩关闭；
 *       手机左右滑动翻页；打开时加载当前页并预加载前后各一页；
 *       打开焦点进入弹层、关闭后回到触发元素，Tab 循环不跑出弹层；
 *       系统开启「减少动态效果」时无过渡动画。
 * ========================================================================== */
(function () {
  'use strict';

  var DEFAULTS = {
    base: 'CEO_tour_manual/webp/',   // 相对当前页面的目录
    count: 6,                        // 页数
    ext: 'webp',                     // 扩展名
    title: 'CEO tour 手册（英文版）',
    altPrefix: 'CEO tour 手册'
  };

  var dims = {};      // 已探测到的图片原始宽高（用于防抖布局，可选）
  var box = null, imgEl = null, counterEl = null, titleEl = null, closeEl = null;
  var trigger = null, cfg = DEFAULTS, idx = 0, opened = false;

  function pageSrc(i) {
    return cfg.base + (i + 1) + '.' + cfg.ext;
  }
  function altOf(i) {
    return cfg.altPrefix + ' 第 ' + (i + 1) + ' 页（英文）';
  }
  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---------- 弹层 DOM：只建一次 ---------- */
  function build() {
    if (box) return;
    box = document.createElement('div');
    box.className = 'mlb';
    box.id = 'manualLightbox';
    box.hidden = true;
    box.innerHTML =
      '<div class="mlb-backdrop" data-mlb-close="1"></div>' +
      '<div class="mlb-panel" role="dialog" aria-modal="true" aria-label="' + DEFAULTS.title + '">' +
        '<div class="mlb-bar">' +
          '<span class="mlb-title"></span>' +
          '<span class="mlb-count" aria-live="polite"></span>' +
          '<button type="button" class="mlb-close" data-mlb-close="1" aria-label="关闭手册">✕</button>' +
        '</div>' +
        '<div class="mlb-stage">' +
          '<button type="button" class="mlb-nav mlb-prev" aria-label="上一页">‹</button>' +
          '<img class="mlb-img" alt="">' +
          '<button type="button" class="mlb-nav mlb-next" aria-label="下一页">›</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(box);

    imgEl = box.querySelector('.mlb-img');
    counterEl = box.querySelector('.mlb-count');
    titleEl = box.querySelector('.mlb-title');
    closeEl = box.querySelector('.mlb-close');

    box.querySelector('.mlb-prev').addEventListener('click', function () { go(idx - 1); });
    box.querySelector('.mlb-next').addEventListener('click', function () { go(idx + 1); });
    box.addEventListener('click', function (e) {
      if (e.target.getAttribute && e.target.getAttribute('data-mlb-close')) close();
    });
    document.addEventListener('keydown', onKeydown);
    bindSwipe();
  }

  /* ---------- 翻页 ---------- */
  function preload(i) {
    if (i < 0 || i >= cfg.count) return;
    var im = new Image();
    im.src = pageSrc(i);
  }
  function paint() {
    imgEl.src = pageSrc(idx);
    imgEl.alt = altOf(idx);
    counterEl.textContent = (idx + 1) + ' / ' + cfg.count;
    preload(idx - 1);
    preload(idx + 1);
    var prev = box.querySelector('.mlb-prev'), next = box.querySelector('.mlb-next');
    prev.disabled = idx <= 0;
    next.disabled = idx >= cfg.count - 1;
  }
  function go(i) {
    if (i < 0 || i >= cfg.count) return;
    idx = i;
    paint();
  }

  /* ---------- 键盘：← → 翻页，Esc 关闭，Tab 不跑出弹层 ---------- */
  function onKeydown(e) {
    if (!opened) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); return; }
    if (e.key === 'Tab') {
      var focusables = box.querySelectorAll('button:not([disabled])');
      if (!focusables.length) return;
      var list = Array.prototype.slice.call(focusables);
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  }

  /* ---------- 触摸左右滑动翻页 ---------- */
  function bindSwipe() {
    var startX = 0, startY = 0, active = false;
    var stage = box.querySelector('.mlb-stage');
    stage.addEventListener('touchstart', function (e) {
      var t = e.changedTouches[0];
      startX = t.clientX; startY = t.clientY; active = true;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (!active) return;
      active = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - startX, dy = t.clientY - startY;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;  // 竖向滚动不误触
      go(dx < 0 ? idx + 1 : idx - 1);
    }, { passive: true });
  }

  /* ---------- 打开 / 关闭 ---------- */
  function open(el, i) {
    cfg = {
      base: (el && el.getAttribute('data-manual-base')) || DEFAULTS.base,
      count: parseInt((el && el.getAttribute('data-manual-count')) || DEFAULTS.count, 10) || DEFAULTS.count,
      ext: (el && el.getAttribute('data-manual-ext')) || DEFAULTS.ext,
      title: (el && el.getAttribute('data-manual-title')) || DEFAULTS.title,
      altPrefix: DEFAULTS.altPrefix
    };
    build();
    trigger = el || document.activeElement;
    opened = true;
    box.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    titleEl.textContent = cfg.title;
    box.querySelector('.mlb-panel').setAttribute('aria-label', cfg.title);
    go(typeof i === 'number' ? i : 0);
    closeEl.focus();
  }
  function close() {
    if (!box || !opened) return;
    opened = false;
    box.hidden = true;
    document.documentElement.style.overflow = '';
    if (trigger && trigger.focus) trigger.focus();
  }
  function openAt(i) {
    build();
    open(null, i);
  }

  /* ---------- 绑定页面上的所有入口 ---------- */
  function bindAll(root) {
    (root || document).querySelectorAll('[data-manual-open]').forEach(function (el) {
      if (el.dataset.mlbBound) return;
      el.dataset.mlbBound = '1';
      el.addEventListener('click', function (e) { e.preventDefault(); open(el, 0); });
      if (!el.hasAttribute('aria-haspopup')) el.setAttribute('aria-haspopup', 'dialog');
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bindAll(document); });
  } else {
    bindAll(document);
  }

  window.ManualLightbox = {
    open: openAt,
    close: close,
    openFrom: open,
    bindAll: bindAll,
    defaults: DEFAULTS,
    reducedMotion: reduced
  };
})();
