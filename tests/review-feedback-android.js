// Run only against the inspected emulator Oscar match: white bottom, 1080px, y=810.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {connect,run,adb}=require('./review-android-helper.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const move=process.argv[2],enabled=process.argv[3]!=='off';
 assert.match(move,/^[a-h][1-8][a-h][1-8]$/);
 const {browser,page,port}=await connect(),out=path.resolve(__dirname,'../android/recorder/build/reports'),prefix=enabled?'v121-feedback-on':'v121-feedback-off';
 const status=()=>page.evaluate(()=>JSON.parse(SproutHost.status()));
 const overlays=()=>run('shell','dumpsys','window','windows').split(/(?=  Window #)/).filter(b=>b.includes('com.jingjing.chesssprout')&&b.includes('ty=APPLICATION_OVERLAY')&&b.includes('mHasSurface=true')).length;
 try{
  if(!process.argv.includes('--current')){
  run('shell','am','start','-n','com.jingjing.chesssprout/.MainActivity');await delay(800);
  await page.evaluate(()=>{while(App.back()){};});await page.locator('[data-route=settings]').click();
  const toggle=page.locator('[data-act=moveFeedback]');
  if((await toggle.getAttribute('aria-checked')==='true')!==enabled)await toggle.click();
  assert.equal((await status()).moveFeedback,enabled);
  await page.reload();await page.waitForFunction(()=>window.App&&window.SproutHost);
  await page.locator('[data-route=settings]').click();
  assert.equal(await page.locator('[data-act=moveFeedback]').getAttribute('aria-checked'),String(enabled));
  await page.screenshot({path:path.join(out,prefix+'-settings.png')});
  run('shell','monkey','-p','com.duolingo','-c','android.intent.category.LAUNCHER','1');await delay(1800);
  }
  const before=await status(),baseline=overlays(),start=Date.now();
  assert.ok(before.overlay,'This check requires the previously authorized emulator overlay permission');
  const coord=s=>[Math.round((s.charCodeAt(0)-97+.5)*135),Math.round(810+(8-Number(s[1])+.5)*135)];
  run('shell','input','tap',...coord(move.slice(0,2)).map(String));await delay(350);
  run('shell','input','tap',...coord(move.slice(2,4)).map(String));
  await page.waitForFunction(serial=>JSON.parse(SproutHost.status()).capture.feedbackSerial>serial,before.capture.feedbackSerial,{timeout:20000,polling:40});
  await delay(110);
  fs.writeFileSync(path.join(out,prefix+'.png'),execFileSync(adb,['exec-out','screencap','-p'],{maxBuffer:12*1024*1024}));
  const during=await status(),visible=overlays();
  assert.equal(visible,baseline+(enabled?1:0),'Transient overlay must follow the switch');
  await delay(6000);
  const after=await status(),record=await page.evaluate(id=>JSON.parse(SproutHost.listGames()).find(g=>g.id===id),before.capture.gameId);
  assert.equal(record.moves[before.capture.plies],move);
  assert.equal(record.issues.filter(i=>!i.resolved).length,0);
  assert.equal(overlays(),baseline,'Transient overlay must dismiss');
  fs.writeFileSync(path.join(out,prefix+'.json'),JSON.stringify({passed:true,enabled,move,baselineWindows:baseline,visibleWindows:visible,elapsedMs:Date.now()-start,before:before.capture,during:during.capture,after:after.capture},null,2));
  console.log('PASS: actual move '+move+', feedback '+(enabled?'shown and dismissed':'disabled')+(process.argv.includes('--current')?'':', setting persisted')+', recording continued.');
 }finally{await browser.close();run('forward','--remove','tcp:'+port);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
