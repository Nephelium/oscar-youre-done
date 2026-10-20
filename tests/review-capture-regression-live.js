// Real installed Duolingo Oscar match, observed black-bottom 1080px board at y=810.
// Never use this helper for human opponents.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {connect,run,adb}=require('./review-android-helper.cjs'),out=path.resolve(__dirname,'../android/recorder/build/reports');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const c=await connect(),page=c.page,limit=Number(process.argv[2]||8),white=process.argv.includes('--white'),prefix=white?'v132-live-white':'v121-live-black';
 const state=()=>page.evaluate(()=>{const status=JSON.parse(SproutHost.status());return{status,record:JSON.parse(SproutHost.listGames()).find(r=>r.id===status.capture.gameId)};});
 const snap=(name,value)=>{fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2));fs.writeFileSync(path.join(out,name+'.png'),execFileSync(adb,['exec-out','screencap','-p'],{maxBuffer:12*1024*1024}));};
 try{
  let current=await state();assert.equal(current.record.side,white?'w':'b');assert.equal(current.record.capture.mode,'game');
  if(process.argv.includes('--switch')){
   const count=current.record.moves.length;
   run('shell','am','start','-n','com.jingjing.chesssprout/.MainActivity');await delay(1200);
   const own=await state();assert.equal(own.status.capture.ownAppVisible,true);assert.equal(own.record.moves.length,count);
   snap('v121-live-own-app',own);
   run('shell','monkey','-p','com.duolingo','-c','android.intent.category.LAUNCHER','1');await delay(1200);
   current=await state();assert.equal(current.record.moves.length,count);
  }
  for(let i=0;i<limit;i++){
   const before=await state();if(before.record.result!=='*')break;
   assert.equal(before.record.moves.length%2,white?0:1,'Wait for Oscar before moving');
   assert.ok(run('shell','dumpsys','activity','activities').split('\n').some(l=>l.includes('ResumedActivity')&&l.includes('com.duolingo')));
   const input=path.join(out,'v121-black-engine.json');fs.writeFileSync(input,JSON.stringify(before));
   const move=execFileSync(process.execPath,[path.join(__dirname,'review-duolingo-bot.cjs'),input],{encoding:'utf8',timeout:20000}).trim();
   assert.match(move,/^[a-h][1-8][a-h][1-8]$/,'Inspect promotion chooser separately');
   if(!white)await delay(4000);const start=Date.now();console.log("Playing "+move);
   const coord=s=>white?[Math.round((s.charCodeAt(0)-97+.5)*135),Math.round(810+(8-Number(s[1])+.5)*135)]:[Math.round((7-(s.charCodeAt(0)-97)+.5)*135),Math.round(810+(Number(s[1])-1+.5)*135)];
   const from=coord(move.slice(0,2)),to=coord(move.slice(2,4));
   if(white && i%4===2){
    run('shell','input','tap',...from.map(String));await delay(600);
    const selected=await state();assert.equal(selected.record.moves.length,before.record.moves.length,'Selection must not record a move');
    run('shell','input','tap',...from.map(String));await delay(150);
   }
   run('shell','input','swipe',...from.map(String),...to.map(String),white?'200':'500');
   await page.waitForFunction(n=>JSON.parse(SproutHost.status()).capture.plies>n,before.record.moves.length,{timeout:20000,polling:200});
   await page.waitForFunction(n=>{const s=JSON.parse(SproutHost.status()),r=JSON.parse(SproutHost.listGames()).find(g=>g.id===s.capture.gameId);return r.result!=='*'||r.moves.length>=n+2;},before.record.moves.length,{timeout:20000,polling:200});
   const after=await state();assert.equal(after.record.moves[before.record.moves.length],move);assert.equal(after.record.issues.filter(e=>!e.resolved).length,0);
   snap(prefix+'-'+String(after.record.moves.length).padStart(2,'0'),after);
   console.log(`${after.record.moves.length} plies, ${move}, ${Date.now()-start} ms incl. Oscar reply, result ${after.record.result}`);
  }
  const final=await state();snap(prefix+'-current',final);
  if(final.record.result!=='*'){
   await page.evaluate(()=>SproutHost.captureAction('stop','{}'));await delay(1000);
   const record=await page.evaluate(id=>JSON.parse(SproutHost.listGames()).find(g=>g.id===id),final.record.id);
   assert.equal(record.issues.filter(e=>!e.resolved).length,0);
   fs.writeFileSync(path.join(out,prefix+'-complete.json'),JSON.stringify({passed:true,record},null,2));
   console.log('PASS: full live game, full-screen MediaProjection, exact player moves, no unresolved issues.');
  }
 }finally{await c.browser.close();run('forward','--remove','tcp:'+c.port);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
