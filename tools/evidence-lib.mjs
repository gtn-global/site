// 生成 assets/js/evidence-lib.js + assets/css/evidence.css
// 读 data/index.json，按 type 提供：统计行（年范围取 event.year min/max）、
// 按 date 字符串倒序（同 date 按 id 倒序）的事件表、details 折叠、锚点平滑滚动、复制到剪贴板。
// 不解析/不规整 date；页面与实证块里 date 按数据原样显示。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf8'));
const events = idx.event || [];

// type -> { label(中文), en, product(支撑产品名), href(支撑产品页) }
// 支撑产品映射依据第3批 step3d：
// tour->海鑫汇全球行 / visit->来华产业考察 / exchange->出海沙龙 / forum->线下闭门小场
// interview->出海线上连线 / salon->出海训练营工作坊 / review->产业出海研究报告
// 注：exchange(出海沙龙) 暂无独立产品页，href 暂挂线下闭门小场(p/closed-door) 作占位，待补。
const META = {
  tour:      { label: '企业游学与产业调研', en: 'CORPORATE STUDY TOURS & INDUSTRY RESEARCH', product: '海鑫汇全球行', href: 'p/global-trip/index.html' },
  visit:     { label: '海外考察',           en: 'OVERSEAS FIELD VISITS',                 product: '来华产业考察（CEO tour）', href: 'ceo-tour.html' },
  exchange:  { label: '国际交流',           en: 'INTERNATIONAL EXCHANGES',               product: '出海沙龙', href: 'p/closed-door/index.html' },
  forum:     { label: '出海论坛',           en: 'OUTBOUND FORUMS',                      product: '线下闭门小场', href: 'p/closed-door/index.html' },
  interview: { label: '出海访谈',           en: 'OUTBOUND INTERVIEWS',                  product: '出海线上连线', href: 'p/online-connect/index.html' },
  salon:     { label: '出海沙龙',           en: 'OUTBOUND SALONS',                      product: '出海训练营工作坊', href: 'p/trade-growth/index.html' },
  review:    { label: '出海读书会',         en: 'EXECUTIVE BOOK CLUB',                  product: '产业出海研究报告', href: 'reports/index.html' },
};

const meta = JSON.stringify(META);
const data = JSON.stringify(events);

const js = `window.EVIDENCE={meta:${meta},events:${data}};
(function(){
  var M=window.EVIDENCE.meta, EV=window.EVIDENCE.events;
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  // date 字符串倒序；同 date 按 id 倒序。不解析日期。
  function sortEvents(list){
    return list.slice().sort(function(a,b){
      var d=String(b.date||'').localeCompare(String(a.date||''));
      if(d) return d;
      return String(b.id||'').localeCompare(String(a.id||''));
    });
  }
  function stats(list){
    var ys=list.map(function(e){return parseInt(e.year,10);}).filter(function(n){return !isNaN(n);});
    var min=ys.length?Math.min.apply(null,ys):null, max=ys.length?Math.max.apply(null,ys):null;
    var ind={}; list.forEach(function(e){(e.industries||[]).forEach(function(i){ind[i]=(ind[i]||0)+1;});});
    var indArr=Object.keys(ind).sort(function(a,b){return ind[b]-ind[a];}).map(function(k){return k+' '+ind[k];});
    return {min:min,max:max,total:list.length,byIndustry:indArr};
  }
  // 渲染实证块到 el。types: 字符串或数组；opts:{limit,filter}
  function renderInto(el, types, opts){
    if(!el) return;
    opts=opts||{};
    var limit=opts.limit||5;
    var filter=opts.filter!==false;
    var typesArr=(typeof types==='string')?[types]:types.slice();
    var list=sortEvents(EV.filter(function(e){return typesArr.indexOf(e.type)>=0;}));
    var st=stats(list);
    var html='';
    var yr=(st.min!=null)?(st.min+'–'+st.max):'—';
    html+='<div class="evidence-stats">';
    html+='<span class="ev-stat"><b>'+st.total+'</b> 场</span>';
    html+='<span class="ev-stat">年份 <b>'+esc(yr)+'</b></span>';
    if(st.byIndustry.length) html+='<span class="ev-stat ev-ind">行业：'+esc(st.byIndustry.join(' · '))+'</span>';
    html+='</div>';
    if(filter){
      var inds={}; list.forEach(function(e){(e.industries||[]).forEach(function(i){inds[i]=1;});});
      var indKeys=Object.keys(inds);
      if(indKeys.length){
        html+='<div class="evidence-filter"><span>按行业：</span>';
        html+='<button class="ev-chip is-active" data-ind="all">全部</button>';
        indKeys.forEach(function(k){ html+='<button class="ev-chip" data-ind="'+esc(k)+'">'+esc(k)+'</button>'; });
        html+='</div>';
      }
    }
    html+='<div class="evidence-actions"><button type="button" class="ev-copy">复制列表</button></div>';
    html+=tableHTML(list.slice(0,limit));
    if(list.length>limit){
      html+='<details class="evidence-more"><summary>查看其余 '+(list.length-limit)+' 条</summary>'+tableHTML(list.slice(limit))+'</details>';
    }
    el.innerHTML=html;
    if(filter){
      var chips=el.querySelectorAll('.ev-chip');
      chips.forEach(function(b){ b.addEventListener('click',function(){
        chips.forEach(function(x){x.classList.remove('is-active');}); b.classList.add('is-active');
        var v=b.getAttribute('data-ind');
        el.querySelectorAll('.evidence-table tbody tr').forEach(function(r){
          var ok=v==='all'||(r.getAttribute('data-ind')||'').split(' ').indexOf(v)>=0;
          r.style.display=ok?'':'none';
        });
      }); });
    }
    var cp=el.querySelector('.ev-copy');
    if(cp) cp.addEventListener('click',function(){
      var text=list.map(function(e){return e.id+'\\t'+e.date+'\\t'+e.title;}).join('\\n');
      if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(function(){cp.textContent='已复制';setTimeout(function(){cp.textContent='复制列表';},1500);},function(){cp.textContent='复制失败';}); }
      else { cp.textContent='复制不可用'; }
    });
    el.querySelectorAll('a[href^="#"]').forEach(function(a){ a.addEventListener('click',function(ev){ var t=document.getElementById(a.getAttribute('href').slice(1)); if(t){ev.preventDefault();t.scrollIntoView({behavior:'smooth'});} }); });
  }
  function tableHTML(rows){
    var h='<table class="index-table evidence-table"><colgroup><col class="c-key"><col class="c-title"><col class="c-date"><col class="c-link"></colgroup>';
    h+='<thead><tr><th>KEY</th><th>活动标题 TITLE</th><th>日期 DATE</th><th>链接 LINK</th></tr></thead><tbody>';
    rows.forEach(function(e){
      h+='<tr data-ind="'+esc((e.industries||[]).join(' '))+'"><td class="key">'+esc(e.id)+'</td><td>'+esc(e.title)+'</td><td class="mono">'+esc(e.date)+'</td><td><a href="'+esc(e.url)+'" class="ext-link" target="_blank" rel="noopener">查看原文 &#8599;</a></td></tr>';
    });
    h+='</tbody></table>';
    return h;
  }
  window.Evidence={renderInto:renderInto,sortEvents:sortEvents,stats:stats};
})();
`;

const css = `.evidence-stats{display:flex;flex-wrap:wrap;gap:14px;margin:14px 0;font-size:14px;color:var(--ink-soft, #4A5568);}
.evidence-stats b{color:var(--ink, #0A1F44);}
.evidence-filter{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0;font-size:13px;color:var(--ink-soft, #4A5568);}
.ev-chip{font:inherit;font-size:13px;border:1px solid var(--rule, #e3ddd2);background:var(--paper, #fff);border-radius:999px;padding:4px 12px;cursor:pointer;color:var(--ink, #0A1F44);}
.ev-chip.is-active{border-color:var(--seal, #A72B23);color:var(--seal, #A72B23);}
.evidence-actions{margin:10px 0;}
.ev-copy{font:inherit;font-size:13px;font-weight:600;color:var(--seal, #A72B23);background:none;border:1px solid var(--seal, #A72B23);border-radius:8px;padding:5px 12px;cursor:pointer;}
.evidence-more{margin-top:10px;}
.evidence-more summary{cursor:pointer;font-size:14px;color:var(--seal, #A72B23);padding:6px 0;}
.evidence-table{margin-top:8px;}
.support-product{margin:6px 0 14px;font-size:14px;color:var(--ink-soft, #4A5568);}
.support-product a{color:var(--seal, #A72B23);font-weight:600;text-decoration:none;}
.support-product a:hover{text-decoration:underline;}
.evidence-embed-wrap .section-title{margin-top:8px;}
`;

const jsDir = path.join(ROOT, 'assets', 'js');
const cssDir = path.join(ROOT, 'assets', 'css');
fs.mkdirSync(jsDir, { recursive: true });
fs.mkdirSync(cssDir, { recursive: true });
fs.writeFileSync(path.join(jsDir, 'evidence-lib.js'), js, 'utf8');
fs.writeFileSync(path.join(cssDir, 'evidence.css'), css, 'utf8');
console.log('wrote assets/js/evidence-lib.js (' + events.length + ' events) + assets/css/evidence.css');
