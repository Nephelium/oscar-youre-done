const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../ios/App/NativeBridge.js'),'utf8');
function setup(reply){const sent=[],context={window:{prompt:reply,webkit:{messageHandlers:{oscar:{postMessage:m=>sent.push(m)}}}}};vm.runInNewContext(source,context);return {host:context.window.SproutHost,sent};}
test('iOS storage bridge reports native failures before acknowledging saves',()=>{
 const {host}=setup(()=>JSON.stringify({error:'磁盘空间不足'}));
 assert.equal(host.saveGame('{}'),'磁盘空间不足');assert.equal(host.deleteGame('g1'),'磁盘空间不足');assert.throws(()=>host.listGames(),/磁盘空间不足/);
 const disconnected=setup(()=>null).host;assert.match(disconnected.saveGame('{}'),/连接已中断/);
});
test('iOS bridge preserves serialized records and asynchronous request identity',()=>{
 const calls=[],{host,sent}=setup(text=>{calls.push(JSON.parse(text.slice('oscar-native:'.length)));return JSON.stringify({value:'[]'});});
 assert.equal(host.platform,'ios');assert.equal(Object.isFrozen(host),true);assert.equal(host.listGames(),'[]');assert.equal(calls[0].method,'listGames');
 host.analyzeLive('r1','g1','fen',JSON.stringify({budget:600,depth:18}));
 assert.equal(sent[0].method,'analyzeLive');assert.deepEqual(Array.from(sent[0].args),['r1','g1','fen','{"budget":600,"depth":18}']);
 host.cancelAnalysis();assert.equal(sent[1].method,'cancelAnalysis');
 assert.equal(host.capabilities.overlay,false);
});
