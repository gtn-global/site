海鑫汇 GTN 站点 · 工具与数据工作流（tools/README.txt）
======================================================

本目录放的是「构建/校验」工具。改完数据或页面后，按顺序跑下面几条，
再 git push（不要直接部署、不要合并、不要强推）。

------------------------------------------------------------
1) 改了 data/ 下的任何 *.json，必须先重新编译成 data/*.js
------------------------------------------------------------
浏览器实际加载的是 data/*.js（由 tools/build-data.mjs 从 data/*.json 生成），
不是 .json 本身。只改 .json 不重跑编译，线上数据会陈旧（历史踩坑：顾问
industries 变空、报告状态不更新）。

    node tools/build-data.mjs

生成：data/index.js / filters.js / calendar.js / matrix.js 等（覆盖写）。

------------------------------------------------------------
2) 改了「产业 × 区域」矩阵格，重新生成 4 个矩阵页
------------------------------------------------------------
    node tools/build-matrix-pages.mjs

生成（覆盖写）：
    matrix/auto-tech-europe/index.html
    matrix/new-energy-europe/index.html
    matrix/ai-southeast-asia/index.html
    matrix/new-energy-middle-east/index.html

页面内容是「静态 HTML」（直接写入，不靠前端 JS 注入）。新增/调整格子时，
改脚本顶部的 CELLS 数组后重跑即可。

------------------------------------------------------------
3) 重新生成 sitemap 与 llms.txt，并做部署前机械校验
------------------------------------------------------------
    node generate-sitemap.js

会写出 sitemap.xml / llms.txt，并自动校验（含 data/*.js 是否已由 *.json 重新
编译、gtn.me 旧域名残留、图片/链接 404、占位符未替换等）。校验不通过会以
非零码退出——此时不要 push。

------------------------------------------------------------
4) 交互级预检（push 前本地跑，不碰线上）
------------------------------------------------------------
    node preflight.js

检查：表单提交逻辑（会不会 404）、关键 select 选项数、success 页按钮对齐，
以及 data/*.js 与 data/*.json 的一致性（防编译遗漏）。发现问题时退出码非 0。

------------------------------------------------------------
防呆底线
------------------------------------------------------------
- 永远「先 build-data.mjs → 再 build-matrix-pages.mjs → 再 generate-sitemap.js → 再 preflight.js」。
- generate-sitemap.js / preflight.js 现在都会检查 data/*.js 是否比 data/*.json 旧或内容不一致，
  不一致会直接报错退出（见 tools/check-data-fresh.js）。
- 想故意验证这条检查：把某个 data/*.js 的修改时间改回旧（如 touch -d "yesterday" data/index.js），
  再跑 preflight.js / generate-sitemap.js，应看到 data 编译遗漏报错；恢复只需重跑 build-data.mjs。
