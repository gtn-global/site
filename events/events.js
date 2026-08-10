/**
 * events.js — 海鑫汇 50+活动 单篇详情页共享脚本
 * ------------------------------------------------
 * 注意：全部交互用 click 事件实现，不用纯 CSS :hover 触发，
 * 避免重蹈首页手风琴"移动端触屏无法展开"的同类问题。
 */

document.addEventListener('DOMContentLoaded', function () {
  initMobileNav();
  initShareLink();
});

/* 移动端导航开关 */
function initMobileNav() {
  var toggle = document.querySelector('.ev-nav__toggle');
  var links = document.querySelector('.ev-nav__links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', function () {
    var isOpen = links.classList.toggle('ev-nav__links--open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
}

/* 复制本页链接（用于分享，若页面上有 .ev-share-btn 按钮） */
function initShareLink() {
  var btn = document.querySelector('.ev-share-btn');
  if (!btn) return;

  btn.addEventListener('click', function () {
    var url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        var original = btn.textContent;
        btn.textContent = '链接已复制';
        setTimeout(function () { btn.textContent = original; }, 1800);
      });
    }
  });
}
