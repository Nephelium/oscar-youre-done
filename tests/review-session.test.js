const test=require('node:test'),assert=require('node:assert/strict'),C=require('../review/battle-clock');
test('clock accounts elapsed time, increments only after a legal move and flags before increment',()=>{
 const c=C.create('15+10');C.start(c,'w',100);assert.equal(C.remaining(c,2600).w,897500);
 assert.equal(C.move(c,'w','b',2600),null);assert.equal(c.w,907500);assert.equal(c.history.length,2);
 C.pause(c,4600);assert.equal(c.b,898000);assert.equal(C.remaining(c,999999).b,898000);
 C.start(c,'w',5000);c.w=1;assert.equal(C.move(c,'w','b',5002),'w');assert.equal(c.w,0);assert.equal(c.history.length,2);
});
test('restoration pauses, unlimited clock stays unlimited, undo restores the earlier turn clock',()=>{
 const c=C.create('3');C.start(c,'w',0);C.move(c,'w','b',2000);C.move(c,'b','w',3000);
 const r=C.restore(JSON.parse(JSON.stringify(c)));assert.equal(r.active,null);assert.equal(r.w,178000);
 C.rewind(r,0);assert.equal(r.w,180000);assert.equal(r.b,180000);assert.equal(r.history.length,1);
 const u=C.create('none');C.start(u,'b',0);assert.equal(C.move(u,'b','w',1e8),null);assert.equal(u.b,null);assert.equal(C.format(null),'∞');
 assert.equal(C.restore({preset:'3',w:-1,b:2}).w,180000);
});
