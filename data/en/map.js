window.GTN=window.GTN||{};window.GTN.map=window.GTN.map||{};
(function(){
  var NM={"germany":"Germany","singapore":"Singapore","malaysia":"Malaysia","czech":"Czechia","hungary":"Hungary","kazakhstan":"Kazakhstan","pakistan":"Pakistan","maldives":"Maldives","mexico":"Mexico","japan":"Japan","vietnam":"Vietnam","thailand":"Thailand","iraq":"Iraq","philippines":"Philippines","serbia":"Serbia","belgium":"Belgium","netherlands":"Netherlands","france":"France","luxembourg":"Luxembourg","austria":"Austria","slovakia":"Slovakia","korea":"South Korea","中国":"China","中东":"Middle East"};
  var RG={"欧洲":"Europe","东南亚":"Southeast Asia","中亚":"Central Asia","南亚":"South Asia","东亚":"East Asia","中东":"Middle East","美洲":"Americas"};
  if(window.GTN.map.markers){
    window.GTN.map.markers=window.GTN.map.markers.map(function(m){
      if(NM[m.slug]) m.name=NM[m.slug];
      else if(NM[m.name]) m.name=NM[m.name];
      if(m.region && RG[m.region]) m.region=RG[m.region];
      return m;
    });
  }
})();
