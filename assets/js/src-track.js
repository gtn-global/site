// 渠道来源追踪（极简）。从 URL ?src= 读取，仅保留 [A-Za-z0-9_-]，最长 32；
// 有合法 src 时写入 sessionStorage（覆盖已存值），否则读已存值。
// 暴露 window.GTN_SRC()（无值返回 ''）与 window.GTN_SRC_BRIEF(base)（自动加 [src:xxx] 前缀）。
(function () {
  function readSrc() {
    try {
      var m = /[?&]src=([A-Za-z0-9_-]{1,32})/.exec(location.search);
      var v = m ? m[1] : '';
      if (v) {
        try { sessionStorage.setItem('gtn_src', v); } catch (e) {}
        return v;
      }
      try { return sessionStorage.getItem('gtn_src') || ''; } catch (e) { return ''; }
    } catch (e) { return ''; }
  }
  var SRC = readSrc();
  window.GTN_SRC = function () { return SRC; };
  window.GTN_SRC_BRIEF = function (base) {
    var s = (window.GTN_SRC && window.GTN_SRC()) || '';
    if (!s) return (base || '');
    return '[src:' + s + '] ' + (base || '');
  };
})();
