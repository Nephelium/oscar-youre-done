const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../review/core.js'),T=require('../review/themes.js');
test('WDL is exact, side-aware, roundtrips backups and rejects malformed values',()=>{
  const r=S.demo(),rows=S.timeline(r);
  for(const row of rows)for(const line of row.evaluation.lines)assert.ok(S.validWdl(line.wdl));
  const copy=S.validate(r);
  assert.deepEqual(S.probabilities(copy.analysis[rows[0].fen]),S.probabilities(rows[0].evaluation));
  const e={lines:[{cp:120,wdl:[300,650,50]}]};
  assert.deepEqual(S.probabilities(e,'w'),{win:30,draw:65,loss:5});
  assert.deepEqual(S.probabilities(e,'b'),{win:5,draw:65,loss:30});
  for(const wdl of [[1000,2,0],[-2,1002,0],[.5,999.5,0],['1',999,0],null])assert.equal(S.probabilities({lines:[{wdl}]}),null);
  assert.equal(S.probabilities({lines:[{cp:100}]}),null);
  assert.deepEqual(S.probabilities(rows.at(-1).evaluation),{win:100,draw:0,loss:0});
});
test('Every selectable piece set has all twelve local piece assets',()=>{
  for(const set of T.pieces)for(const side of ['w','b'])for(const type of 'pnbrqk'){
    const file=path.resolve(__dirname,'../review',T.url(set.id,side,type));
    assert.match(fs.readFileSync(file,'utf8'),/viewBox="0 0 100 100"/);
  }
  assert.equal(T.piece('invalid').id,'duo');assert.equal(T.board('invalid').id,'duo');
});
