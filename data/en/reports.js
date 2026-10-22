window.GTN=window.GTN||{};window.GTN.index=window.GTN.index||{};
(function(){
  var T={"新能源":"Clean Energy Power & Electrical","汽车智能科技":"Smart Manufacturing","AI产业":"Artificial Intelligence"};
  if(window.GTN.index.report){
    window.GTN.index.report=window.GTN.index.report.map(function(r){
      if(r.id==='report-new-energy'){ r.title='Clean Energy Power & Electrical Outbound Research Report'; r.status='Live'; r.action='Get access'; }
      else if(r.id==='report-auto-tech-2026'){ r.title='Smart Manufacturing Outbound Research Report (2026 New Edition)'; r.status='Expected release in Nov'; r.action='Register interest'; }
      else if(r.id==='report-ai'){ r.title='AI Industry Outbound Research Report'; r.status='Research in progress'; r.action='Register interest'; }
      if(T[r.industry]) r.industry=T[r.industry];
      return r;
    });
  }
})();
