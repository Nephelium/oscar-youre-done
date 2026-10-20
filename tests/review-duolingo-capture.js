// Actual installed Duolingo emulator run. Commands move only on the inspected 1080px board.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {connect,run,adb}=require('./review-android-helper.cjs');
const out=path.resolve(__dirname,'../android/recorder/build/reports');
async function main(){
 const c=await connect();
 try{
  const action=process.argv[2]||'status',label=process.argv[4]||'duolingo-live';
  if(action==='move'){
   const active=run('shell','dumpsys','activity','activities');
   if(!active.split('\n').some(l=>l.includes('ResumedActivity')&&l.includes('com.duolingo')))throw Error('Duolingo must be foreground');
   const move=process.argv[3];if(!/^[a-h][1-8][a-h][1-8]$/.test(move))throw Error('Explicit square pair required');
   for(const square of [move.slice(0,2),move.slice(2,4)]){
    const x=Math.round((square.charCodeAt(0)-97+.5)*135),y=Math.round(810+(8-Number(square[1])+.5)*135);
    run('shell','input','tap',String(x),String(y));await new Promise(r=>setTimeout(r,300));
   }
   await new Promise(r=>setTimeout(r,2200));
  }
  let status=await c.page.evaluate(()=>JSON.parse(SproutHost.status()));
  const id=status.capture.gameId;
  if(action==='stop'){
   await c.page.evaluate(()=>SproutHost.captureAction('stop','{}'));await new Promise(r=>setTimeout(r,1300));
   status=await c.page.evaluate(()=>JSON.parse(SproutHost.status()));
  }
  const record=await c.page.evaluate(id=>JSON.parse(SproutHost.listGames()).find(r=>r.id===id),id);
  fs.writeFileSync(path.join(out,label+'.png'),execFileSync(adb,['exec-out','screencap','-p'],{maxBuffer:12*1024*1024}));
  fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify({status,record},null,2));
  console.log(JSON.stringify({status,moves:record?.moves,issues:record?.issues},null,2));
 }finally{await c.browser.close();run('forward','--remove','tcp:'+c.port);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
