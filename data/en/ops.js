window.GTN=window.GTN||{};window.GTN.index=window.GTN.index||{};
(function(){
  var CITY={"hangzhou":"Hangzhou Operation Center","kazakhstan":"Kazakhstan Operation Center"};
  var C={"中国":"China","日本":"Japan","哈萨克斯坦":"Kazakhstan","巴基斯坦":"Pakistan","新加坡":"Singapore","美国":"United States"};
  var RG={"欧洲":"Europe","东南亚":"Southeast Asia","中亚":"Central Asia","南亚":"South Asia","东亚":"East Asia","中东":"Middle East","美洲":"Americas"};
  if(window.GTN.index.ops_center){
    window.GTN.index.ops_center=window.GTN.index.ops_center.map(function(o){
      if(CITY[o.city]) o.name=CITY[o.city];
      if(o.country!==undefined && C[o.country]!==undefined) o.country=C[o.country];
      if(o.region!==undefined && RG[o.region]!==undefined) o.region=RG[o.region];
      return o;
    });
  }
})();
