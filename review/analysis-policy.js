(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AnalysisPolicy=api;})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  function settings(raw={}){
    return {autoAnalysis:raw.autoAnalysis!==false,autoSpeed:['adaptive','fast','balanced','deep'].includes(raw.autoSpeed)?raw.autoSpeed:'adaptive',
      autoDepth:[12,16,20,24,28].includes(raw.autoDepth)?raw.autoDepth:20,unlimitedAnalysis:raw.unlimitedAnalysis===true};
  }
  function stages(raw={}){
    const s=settings(raw);
    if(!s.autoAnalysis)return [];
    const bounded=s.autoSpeed==='adaptive'?[{idle:0,budget:200},{idle:800,budget:700},{idle:2200,budget:1800},{idle:5000,budget:4000}]:
      [{idle:0,budget:{fast:200,balanced:700,deep:1800}[s.autoSpeed]}];
    return bounded.map(x=>({...x,depth:s.autoDepth})).concat(s.unlimitedAnalysis?[{idle:6000,budget:0,depth:null,infinite:true}]:[]);
  }
  function accept(previous,next){
    return !previous||previous.engine!==next.engine||(next.lines?.[0]?.depth||0)>=(previous.lines?.[0]?.depth||0);
  }
  return {settings,stages,accept};
});
