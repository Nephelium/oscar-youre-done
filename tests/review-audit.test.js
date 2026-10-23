const test=require('node:test'),assert=require('node:assert/strict'),S=require('../review/core.js'),L=require('../review/library.js');
test('damaged optional metadata cannot hide a legal mainline',()=>{
 for(const optional of [{branches:[null,7,{}]},{branches:{}},{issues:{}},{analysis:{[S.START]:{lines:[null,7,{cp:4,depth:12,pv:[]}]}}}]){
  const record=S.validate({moves:['e2e4'],...optional});assert.deepEqual(record.moves,['e2e4']);assert.equal(S.position(record).turn(),'b');
 }
 assert.throws(()=>S.validate({moves:['e2e8']}));
});
test('backup copies remap segment links and correction links without mutating originals',()=>{
 const records=[S.validate({id:'first',moves:['e2e4'],capture:{nextId:'second'},issues:[{at:1,continuationId:'second'}]}),S.validate({id:'second',moves:[],capture:{previousId:'first'}})];
 const before=JSON.stringify(records),copy=S.prepareImport(records,['first','second']);
 assert.notEqual(copy.records[0].id,'first');assert.equal(copy.records[0].capture.nextId,copy.records[1].id);
 assert.equal(copy.records[1].capture.previousId,copy.records[0].id);assert.equal(copy.records[0].issues[0].continuationId,copy.records[1].id);
 assert.equal(copy.ids.get('first'),copy.records[0].id);assert.equal(JSON.stringify(records),before);
 assert.throws(()=>S.prepareImport([records[0],records[0]]),/重复/);
 assert.notEqual(S.prepareImport([S.demo()]).records[0].id,'oscar-demo-v1');
});
test('invalid folder entries cannot break existing favorites or create truncated duplicate IDs',()=>{
 const valid=L.validate({folders:[null,{}, {id:'a'.repeat(101),name:'长编号'},{id:'favorite',name:'冲突'},{id:'ok',name:'训练'}],entries:{game:['ok','favorite']}});
 assert.deepEqual(valid.folders,[{id:'ok',name:'训练'}]);assert.deepEqual(valid.entries.game,['ok','favorite']);
});
