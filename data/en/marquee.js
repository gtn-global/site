window.GTN=window.GTN||{};window.GTN.marquee=window.GTN.marquee||{};
(function(){
  var up=window.GTN.marquee.up;
  if(up && up.items) up.items.forEach(function(it,i){ it.alt='Outbound visit '+(i+1); });
  var dn=window.GTN.marquee.down;
  if(dn && dn.items) dn.items.forEach(function(it,i){ it.alt='Inbound visit '+(i+1); });
})();
