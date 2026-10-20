(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.Growth=api;})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  function stamp(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('请选择完整的记录时间。');
    const [y,m,d,h,n]=value.split(/[-T:]/).map(Number),date=new Date(y,m-1,d,h,n);
    if(y<1900||y>2100||date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d||date.getHours()!==h||date.getMinutes()!==n)throw Error('记录时间无效。');
    return date.getTime();
  }
  function validate(raw){
    if(!raw||typeof raw!=='object'||typeof raw.elo!=='number'||!Number.isInteger(raw.elo)||raw.elo<0||raw.elo>4000)throw Error('Elo 请输入 0–4000 的整数。');
    stamp(raw.at);
    return {id:/^[a-zA-Z0-9_-]{1,80}$/.test(raw.id||'')?raw.id:'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,10),at:raw.at,elo:raw.elo,note:String(raw.note||'').slice(0,120),createdAt:Number(raw.createdAt)||Date.now()};
  }
  function list(raw){if(!Array.isArray(raw)||raw.length>20000)throw Error('Elo 记录格式不正确。');return raw.map(validate).sort((a,b)=>stamp(a.at)-stamp(b.at)||a.createdAt-b.createdAt||a.id.localeCompare(b.id));}
  function merge(existing,incoming){const result=list(existing),seen=new Map(result.map(e=>[e.id,e]));for(const e of list(incoming)){const old=seen.get(e.id);if(old&&old.at===e.at&&old.elo===e.elo&&old.note===e.note)continue;const item=old?{...e,id:validate({...e,id:''}).id}:e;result.push(item);seen.set(item.id,item);}return list(result);}
  function localTime(time=Date.now()){const d=new Date(time),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}
  function plot(entries){
    const sorted=list(entries);if(!sorted.length)return {points:[],ticks:[]};
    const values=sorted.map(e=>e.elo),low=Math.min(...values),high=Math.max(...values),step=[10,20,50,100,200,500,1000].find(n=>(high-low)/n<=4)||1000;
    let min=Math.max(0,Math.floor((low-step*.4)/step)*step),max=Math.ceil((high+step*.4)/step)*step;if(max===min)max=min+step;
    const first=stamp(sorted[0].at),last=stamp(sorted.at(-1).at),ticks=[];for(let v=min;v<=max;v+=step)ticks.push(v);
    return {min,max,ticks,points:sorted.map((e,i)=>({...e,x:first===last?52+(sorted.length===1?.5:i/(sorted.length-1))*520:52+(stamp(e.at)-first)/(last-first)*520,y:180-(e.elo-min)/(max-min)*150}))};
  }
  return {stamp,validate,list,merge,localTime,plot};
});
