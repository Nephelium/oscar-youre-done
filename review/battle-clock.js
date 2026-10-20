(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BattleClock=api;})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const presets=[{id:'3',name:'3 分钟',base:180000,increment:0},{id:'5',name:'5 分钟',base:300000,increment:0},{id:'10',name:'10 分钟',base:600000,increment:0},{id:'15+10',name:'15 + 10 秒',base:900000,increment:10000},{id:'none',name:'不限时',base:null,increment:0}];
  const preset=id=>presets.find(p=>p.id===id)||presets[2];
  const snapshot=c=>({w:c.w,b:c.b});
  function create(id){const p=preset(id),c={preset:p.id,w:p.base,b:p.base,active:null,last:0,history:[]};c.history=[snapshot(c)];return c;}
  function remaining(c,now){const values=snapshot(c);if(c.active&&values[c.active]!==null)values[c.active]=Math.max(0,values[c.active]-Math.max(0,now-c.last));return values;}
  function settle(c,now){Object.assign(c,remaining(c,now));c.last=now;return c.active&&c[c.active]!==null&&c[c.active]<=0?c.active:null;}
  function pause(c,now){const expired=settle(c,now);c.active=null;return expired;}
  function start(c,side,now){c.active=side;c.last=now;}
  function move(c,side,next,now){const expired=settle(c,now);if(expired)return expired;if(c[side]!==null)c[side]+=preset(c.preset).increment;c.history.push(snapshot(c));start(c,next,now);return null;}
  function rewind(c,ply){const old=c.history[ply];if(old)Object.assign(c,old);c.history=c.history.slice(0,ply+1);c.active=null;}
  function restore(raw){if(!raw||!presets.some(p=>p.id===raw.preset))return create('none');const c=create(raw.preset),valid=v=>c.w===null?v===null:Number.isFinite(v)&&v>=0;
    if(!valid(raw.w)||!valid(raw.b))return c;c.w=raw.w;c.b=raw.b;c.history=Array.isArray(raw.history)?raw.history.filter(h=>h&&valid(h.w)&&valid(h.b)).slice(0,6001):[snapshot(c)];return c;}
  function format(ms){if(ms===null)return '∞';const s=Math.ceil(Math.max(0,ms)/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
  return {presets,preset,create,remaining,settle,pause,start,move,rewind,restore,format};
});
