const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../review/core.js'),L=require('../review/library.js');
const P=require('../review/analysis-policy.js');
test('automatic analysis defaults are bounded; unlimited is explicit and shallow updates cannot erase deeper scores',()=>{
 const s=P.settings();assert.equal(s.autoAnalysis,true);assert.equal(s.unlimitedAnalysis,false);assert.equal(s.autoDepth,20);
 const stages=P.stages();assert.ok(stages.every(x=>x.depth===20&&!x.infinite));assert.equal(stages.reduce((n,x)=>n+x.budget,0),6700);
 assert.deepEqual(P.stages({autoAnalysis:false}),[]);
 assert.equal(P.stages({autoSpeed:'fast'})[0].budget,200);
 assert.equal(P.stages({unlimitedAnalysis:true}).at(-1).infinite,true);
 assert.equal(P.accept({engine:'X',lines:[{depth:20}]},{engine:'X',lines:[{depth:12}]}),false);
 assert.equal(P.accept({engine:'X',lines:[{depth:20}]},{engine:'Y',lines:[{depth:12}]}),true);
});
const ev=(cp,wdl=[200,700,100],mate=null)=>({engine:'test-engine',budget:600,lines:[{cp,wdl,mate,depth:12,pv:[]}]});
test('variation timeline preserves mainline and evaluates every branch step from shared FEN cache',()=>{
 const r=S.importText('1. e4 e5 2. Nf3 Nc6 *')[0],before=JSON.stringify(r.moves);
 const line=['f1c4','g8f6','d2d3'],rows=S.variationRows(r,2,line);
 assert.equal(rows.length,6);assert.equal(rows[2].variation,false);assert.equal(rows[3].variation,true);
 rows.forEach((row,i)=>r.analysis[row.fen]=ev(i*100));
 assert.equal(S.variationRows(r,2,line)[5].evaluation.lines[0].cp,500);
 assert.equal(JSON.stringify(r.moves),before);
 assert.equal(S.position(r,2,line.slice(0,1)).get('c4').type,'b');
});
test('evaluation deltas preserve perspective, distinguish win percentage points and exclude mate pawn losses',()=>{
 const a=ev(200,[300,600,100]),b=ev(-100,[50,550,400]);
 assert.deepEqual(S.evaluationChange(a,b,'w'),{cp:-300,win:-25,mateChanged:false});
 assert.deepEqual(S.evaluationChange(a,b,'b'),{cp:300,win:30,mateChanged:false});
 assert.equal(S.evaluationChange(a,{...b,engine:'other'}),null);
 assert.equal(S.evaluationChange(a,ev(100000,[1000,0,0],0)).cp,null);
 assert.equal(S.evaluationChange(a,ev(100000,[1000,0,0],0)).mateChanged,true);
});
test('explanation names actual capture, promotion, mate and legal current captures without claiming forced loss',()=>{
 const r=S.importText('1. e4 d5 2. exd5 Qxd5 *')[0];
 let rows=S.timeline(r);rows.forEach((row,i)=>r.analysis[row.fen]=ev(i===3?-300:30));
 rows=S.timeline(r);
 const text=S.explainMove(rows,3).paragraphs.join('\n');
 assert.match(text,/白方兵从 e4 到 d5，吃掉兵/);
 assert.match(text,/黑方后可从 d8 吃 d5 的兵/);
 assert.match(text,/评价损失 3.30 兵/);
 assert.match(text,/这条棋谱下一步：黑方后/);
 assert.match(text,/关键节点/);
 const promotion=S.importText('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=Q+ *')[0];
 assert.match(S.explainMove(S.timeline(promotion),1).paragraphs.join(''),/升变为后/);
 const mate=S.demo(),last=S.timeline(mate).length-1;
 assert.match(S.explainMove(S.timeline(mate),last).paragraphs.join(''),/完成将杀/);
 assert.doesNotMatch(S.explainMove(S.timeline(mate),last).paragraphs.join(''),/1000[.0-9]* 兵/);
 assert.ok(S.keyMoments(S.timeline(mate)).some(k=>k.ply===last));
});
test('favorites isolate membership, sanitize input and remap imported duplicate game IDs',()=>{
 const original={folders:[{id:'f1',name:'残局'}],entries:{g1:['favorite','f1']}};
 const next=L.assign(original,'g1',[]);assert.equal(next.entries.g1,undefined);assert.deepEqual(original.entries.g1,['favorite','f1']);
 const map=new Map([['g1','copy-g1']]),merged=L.merge(original,original,map,()=> 'new-folder');
 assert.equal(merged.folders.length,1);assert.deepEqual(merged.entries['copy-g1'],['favorite','f1']);
 assert.deepEqual(L.validate({folders:[],entries:{g1:['missing']}}).entries,{});
 assert.deepEqual(L.validate(JSON.parse('{"folders":[],"entries":{"__proto__":["favorite"]}}')).entries,{});
});
