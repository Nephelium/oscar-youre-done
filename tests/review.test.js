const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../review/core.js');
const ev = (cp, pv=[]) => ({lines:[{cp,pv,depth:12}]});
test('notebooks classify old records without rewriting history and survive PGN and backup',()=>{
 const game=S.validate({id:'oldgame',moves:['e2e4']});assert.equal(game.notebook,'game');
 const practice=S.validate({id:'oldpractice',initialFen:'7k/P7/8/8/8/8/8/7K w - - 0 1',moves:['a7a8n']});assert.equal(practice.notebook,'practice');
 game.notebook='practice';assert.equal(S.importText(S.toPgn(game))[0].notebook,'practice');
 assert.deepEqual(S.importText(JSON.stringify({games:[game,practice]})).map(r=>r.moves),[game.moves,practice.moves]);
 assert.equal(S.validate({moves:[],capture:{mode:'position'}}).notebook,'practice');
});
test('PGN and FEN roundtrip preserve nonstandard start and promotion',()=>{
  const r=S.importText('[Event "升变"]\n[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=N *')[0];
  assert.equal(r.moves[0],'a7a8n');assert.deepEqual(S.importText(S.toPgn(r))[0].moves,r.moves);
});
test('free variation is independent from mainline',()=>{
 const r=S.importText('1. e4 e5 2. Nf3 Nc6 *')[0], original=r.moves.slice();
 const b=S.addBranch(r,2,['f1c4','g8f6']);assert.deepEqual(r.moves,original);assert.equal(S.position(r,2,b.moves).get('c4').type,'b');
 assert.deepEqual(S.importText(JSON.stringify({games:[r]}))[0].branches[0].moves,b.moves);
});
test('castling, en passant and illegal input',()=>{
 const r=S.importText('1. e4 a6 2. e5 d5 3. exd6 cxd6 4. Nf3 Nf6 5. Be2 e6 6. O-O *')[0];
 assert.equal(S.position(r).get('g1').type,'k');assert.equal(S.position(r).get('f1').type,'r');
 assert.throws(()=>S.validate({moves:['e2e5']}));assert.throws(()=>S.importText('{broken'));
 assert.throws(()=>S.importText('r'.repeat(2200000)));assert.throws(()=>S.fromPlacement('bad'));
});
test('white and black move losses use correct perspective and mate signs',()=>{
 assert.equal(S.assess(ev(100),ev(-100),'w','a2a3').loss,200);
 assert.equal(S.assess(ev(100),ev(300),'b','a7a6').loss,200);
 assert.equal(S.assess(ev(100),ev(300),'w','a2a3').loss,0);
 assert.equal(S.displayScore({lines:[{mate:-3}]}),'−M3');
 assert.equal(S.assess(ev(0,['e2e4']),ev(0),'w','e2e4').label,'最佳走法');
});
test('partially analyzed score is explicitly counted, unresolved capture marked in PGN',()=>{
 const r=S.importText('1. f3 e5 2. g4 Qh4# 0-1')[0], rows=S.timeline(r);
 r.analysis[rows[0].fen]=ev(0);r.analysis[rows[1].fen]=ev(-90);
 assert.equal(S.summary(r).analyzed,1);assert.equal(S.summary(r).total,2);
 r.issues=[{message:'漏步待校正'}];assert.match(S.toPgn(r),/unresolved/);
});
test('terminal scores, engine version boundaries and revision roundtrip',()=>{
 const m={engine:'Stockfish 19',lines:[{cp:-100000,mate:0,terminal:true,pv:[],depth:0}]};
 assert.equal(S.numeric(m),-100000);assert.equal(S.displayScore(m),'将死');
 assert.equal(S.assess({...ev(0),engine:'old'},{...ev(0),engine:'new'},'w','e2e4'),null);
 const r=S.create();r.revisions=[{moves:['e2e4']}];r.undoEvents=[{at:1}];
 const copy=S.importText(JSON.stringify(r))[0];assert.deepEqual(copy.revisions,r.revisions);assert.deepEqual(copy.undoEvents,r.undoEvents);
 const large=JSON.stringify({games:[r],padding:'x'.repeat(2200000)});assert.equal(S.importText(large).length,1);
});
test('facts describe actual captures and mate, duplicate variations are idempotent',()=>{
 const r=S.importText('1. e4 d5 2. exd5 Qxd5 *')[0],rows=S.timeline(r);
 assert.match(S.moveFacts(rows[3],rows[4]).join(''),/黑方的后吃掉了白方的兵/);
 const m=S.timeline(S.importText('1. f3 e5 2. g4 Qh4# 0-1')[0]);assert.match(S.moveFacts(m[4]).join(''),/将杀/);
 S.addBranch(r,0,['d2d4']);S.addBranch(r,0,['d2d4']);assert.equal(r.branches.length,1);
 assert.throws(()=>S.importText('8/8/8/8/8/8/8/8 w - - 0 1'),/白王/);
});
test('display perspective flips cp and mate without changing cached analysis or move assessment',()=>{
 const r=S.importText('1. e4 e5 *')[0],rows=S.timeline(r);
 r.analysis[rows[0].fen]=ev(40,['e2e4']);r.analysis[rows[1].fen]=ev(125);r.analysis[rows[2].fen]=ev(425);
 const stored=JSON.stringify(r);
 assert.equal(S.displayScore(ev(125),'w'),'+1.3');assert.equal(S.displayScore(ev(125),'b'),'-1.3');
 assert.equal(S.displayScore(ev(-1),'b'),'0.0');assert.equal(S.viewNumeric(ev(425),'b'),-425);
 assert.equal(S.displayScore({lines:[{mate:-3}]},'b'),'M3');
 assert.equal(S.summary(r,'w').mistakes,0);assert.equal(S.summary(r,'b').mistakes,1);
 assert.equal(S.viewNumeric({lines:[{mate:0,terminal:true,cp:-100000}]},'b'),100000);
 assert.equal(JSON.stringify(r),stored);
});
test('long demo reaches a real checkmate, and practice rows retain their original turn numbers',()=>{
 const r=S.demo();assert.equal(r.moves.length,35);assert.equal(r.result,'1-0');
 assert.equal(S.position(r).in_checkmate(),true);assert.equal(S.timeline(r).at(-1).san,'Qxh7#');
 const practice=S.importText('7k/8/8/8/8/8/8/KR6 b - - 0 23')[0];practice.moves=['h8g8','b1b2','g8f8'];
 assert.deepEqual(S.timeline(practice).slice(1).map(r=>[r.moveNumber,r.color]),[[23,'b'],[24,'w'],[24,'b']]);
});
test('demo includes complete deep analysis, legal PVs and immediate move badges',()=>{
 const r=S.demo(),rows=S.timeline(r);
 assert.equal(Object.keys(r.analysis).length,36);
 assert.equal(S.summary(r).analyzed,18);
 assert.ok(rows.slice(1).every(row=>row.review));
 assert.equal(S.moveSymbol(rows[1].review),'▤');
 assert.equal(S.moveSymbol(rows.at(-1).review),'★');
 for(const row of rows) {
  const e=row.evaluation;assert.equal(e.engine,'Stockfish 19');assert.ok(e.precomputed);
  for(const line of e.lines){
   assert.ok(line.terminal||line.depth>=20);
   assert.doesNotThrow(()=>S.position({...r,initialFen:row.fen,moves:line.pv}));
  }
 }
 const copy=S.demo();copy.analysis[rows[0].fen].lines[0].cp=12345;
 assert.notEqual(S.demo().analysis[rows[0].fen].lines[0].cp,12345);
});
