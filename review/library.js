(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NotebookLibrary=api;})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const empty=()=>({folders:[],entries:{}});
  function validate(input){
    if(!input||!Array.isArray(input.folders)||!input.entries||typeof input.entries!=='object')return empty();
    const folders=[],seen=new Set();
    for(const f of input.folders.slice(0,100)){
      if(typeof f.id!=='string'||!f.id||typeof f.name!=='string'||!f.name.trim()||seen.has(f.id))continue;
      folders.push({id:f.id.slice(0,100),name:f.name.trim().slice(0,40)});seen.add(f.id);
    }
    const entries={};
    for(const [id,ids] of Object.entries(input.entries).slice(0,10000)){
      if(['__proto__','constructor','prototype'].includes(id)||!Array.isArray(ids))continue;
      const valid=[...new Set(ids.filter(x=>x==='favorite'||seen.has(x)))];
      if(valid.length)entries[id]=valid;
    }
    return {folders,entries};
  }
  function assign(library,id,folders){
    const next=validate(library),valid=folders.filter(f=>f==='favorite'||next.folders.some(x=>x.id===f));
    if(valid.length)next.entries[id]=[...new Set(valid)];else delete next.entries[id];
    return next;
  }
  function merge(library,incoming,gameIds,makeId){
    const next=validate(library),source=validate(incoming),folderIds=new Map([['favorite','favorite']]);
    for(const f of source.folders){
      let target=next.folders.find(x=>x.name===f.name);
      if(!target&&next.folders.length<100){target={id:makeId(),name:f.name};next.folders.push(target);}
      if(target)folderIds.set(f.id,target.id);
    }
    for(const [oldId,ids] of Object.entries(source.entries)){
      const id=gameIds.get(oldId);if(!id)continue;
      const mapped=ids.map(x=>folderIds.get(x)).filter(Boolean);
      if(mapped.length)next.entries[id]=[...new Set([...(next.entries[id]||[]),...mapped])];
    }
    return next;
  }
  return {empty,validate,assign,merge};
});
