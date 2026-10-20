const {test}=require('node:test'),assert=require('node:assert/strict'),G=require('../review/ratings.js'),S=require('../review/core.js');
test('Elo rejects impossible dates, blank values and non-integer scores',()=>{
 for(const elo of [NaN,-1,4001,800.5,'800',null])assert.throws(()=>G.validate({elo,at:'2026-10-20T12:30'}));
 for(const at of ['2026-02-30T12:30','2026-13-01T00:00','2026-01-01','2026-01-01T25:01'])assert.throws(()=>G.validate({elo:0,at}));
 assert.equal(G.validate({elo:0,at:'2024-02-29T12:30'}).elo,0);
});
test('Elo backfill sorts by time and backup conflicts preserve both values',()=>{
 const newer={id:'new',elo:820,at:'2026-10-20T12:00'},older={id:'old',elo:800,at:'2026-10-19T12:00'};
 const sorted=G.list([newer,older]);assert.deepEqual(sorted.map(e=>e.elo),[800,820]);assert.equal(G.merge(sorted,sorted).length,2);
 const merged=G.merge(sorted,[{...newer,elo:830}]);assert.equal(merged.length,3);assert.deepEqual(merged.map(e=>e.elo).sort(),[800,820,830]);
});
test('Elo graph preserves true time spacing, flat scores and same-minute entries',()=>{
 const p=G.plot([{id:'a',elo:800,at:'2026-10-01T00:00'},{id:'b',elo:800,at:'2026-10-02T00:00'},{id:'c',elo:820,at:'2026-10-11T00:00'}]);
 assert.equal(p.points[1].x-p.points[0].x,52);assert.ok(p.points[2].y<p.points[0].y);assert.ok(p.ticks.includes(800));
 const single=G.plot([{elo:4000,at:'2026-10-20T12:00'}]);assert.ok(Number.isFinite(single.points[0].x)&&Number.isFinite(single.points[0].y));
 const same=G.plot([{id:'a',elo:0,at:'2026-10-20T12:00',createdAt:1},{id:'b',elo:10,at:'2026-10-20T12:00',createdAt:2}]);assert.ok(same.points[1].x>same.points[0].x);
});
test('Board and notation use the same evidence-based move symbols',()=>{
 assert.equal(S.moveSymbol(null),'');assert.equal(S.moveSymbol({best:true,loss:0}),'★');assert.equal(S.moveSymbol({loss:20}),'!');assert.equal(S.moveSymbol({loss:90}),'?!');assert.equal(S.moveSymbol({loss:180}),'?');assert.equal(S.moveSymbol({loss:350}),'??');
});
