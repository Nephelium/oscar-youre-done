const test=require('node:test'),assert=require('node:assert/strict'),S=require('../review/core.js');
const tail=()=>({at:3,message:'结束前的画面未能确认，请核对最后几步是否完整',resolved:false});
const before=()=>S.validate({id:'correction-test',moves:['f2f3','e7e5','g2g4'],issues:[tail()]});
test('missing mate saves the selected targetless warning, result, revision and PGN',()=>{
 const r=before(),snapshot=JSON.stringify(r),next=S.correctRecord(r,3,['d8h4'],0);
 assert.equal(next.result,'0-1');assert.equal(next.issues[0].resolved,true);
 assert.equal(next.revisions.length,1);assert.equal(next.revisions[0].issues[0].resolved,false);
 assert.equal(JSON.stringify(r),snapshot);assert.match(S.toPgn(next),/\[Result "0-1"\]/);
 assert.doesNotMatch(S.toPgn(next),/unresolved/);assert.equal(S.importText(JSON.stringify(next))[0].issues[0].resolved,true);
});
test('legacy completed games normalize tail warnings without erasing unrelated gaps',()=>{
 const raw={...before(),moves:['f2f3','e7e5','g2g4','d8h4'],issues:[tail(),{at:1,message:'其他缺步',resolved:false},{...tail(),continuationId:'segment'},{...tail(),at:99}]};
 const r=S.validate(raw);assert.equal(r.result,'0-1');assert.deepEqual(r.issues.map(i=>!!i.resolved),[true,false,false,false]);
 assert.equal(raw.issues[0].resolved,false);assert.deepEqual(S.validate(r),r);
 assert.equal(S.validate(before()).issues[0].resolved,false);
});
test('correcting one issue does not dismiss unrelated targetless or mismatched gaps',()=>{
 const r=before();r.issues.push({at:0,message:'前面有缺步',resolved:false},{at:3,message:'其他画面',placement:S.START.split(' ')[0],resolved:false});
 const next=S.correctRecord(r,3,['d8h4'],0);assert.deepEqual(next.issues.map(i=>!!i.resolved),[true,false,false]);
 assert.match(S.toPgn(next),/unresolved/);
});
test('manual completeness confirmation needs no moves and affects only its selected issue',()=>{
 const r=before();r.issues.push({at:3,message:'仍需核对',resolved:false});
 const next=S.confirmIssue(r,0);assert.deepEqual(next.moves,r.moves);assert.equal(next.result,'*');
 assert.deepEqual(next.issues.map(i=>!!i.resolved),[true,false]);assert.equal(next.revisions[0].issues[0].resolved,false);
 assert.throws(()=>S.confirmIssue(next,0));assert.throws(()=>S.confirmIssue(r,20));
});
test('correction updates white mate and draw, and clears stale result for unfinished games',()=>{
 const white=S.validate({initialFen:'7k/8/5KQ1/8/8/8/8/8 w - - 0 1',moves:[],issues:[{at:0,message:'待补录'}]});
 assert.equal(S.correctRecord(white,0,['g6g7'],0).result,'1-0');
 assert.equal(S.correctRecord(white,0,['g6f7'],0).result,'1/2-1/2');
 const capture=S.validate({initialFen:'7k/8/8/8/8/8/1r6/K7 w - - 0 1',moves:[],issues:[{at:0}]});
 assert.equal(S.correctRecord(capture,0,['a1b2'],0).result,'1/2-1/2');
 const unfinished=before();unfinished.result='0-1';assert.equal(S.correctRecord(unfinished,3,['b8c6'],0).result,'*');
 const resigned=S.validate({moves:['e2e4'],result:'1-0'});assert.equal(resigned.result,'1-0');
});
test('edits archive old branches and reject illegal moves or stale issue anchors',()=>{
 const r=before();r.branches=[{id:'old',at:3,moves:['b8c6']}];r.issues=[{at:1,message:'补录'}];
 const next=S.correctRecord(r,1,['e7e6'],0);assert.equal(next.branches.length,0);assert.equal(next.revisions[0].branches[0].id,'old');
 assert.throws(()=>S.correctRecord(r,2,['g2g4'],0));assert.throws(()=>S.correctRecord(r,1,[],0));assert.throws(()=>S.correctRecord(r,1,['e8e1'],0));
});
