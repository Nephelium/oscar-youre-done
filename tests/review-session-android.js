const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const {connect,run,adb}=require('./review-android-helper.cjs'),out=path.resolve(__dirname,'../android/recorder/build/reports');
async function main(){
 const {browser,page,port}=await connect(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const rotation=run('shell','wm','user-rotation');
 const act=async a=>{await page.evaluate(a=>document.querySelector(`[data-act="${a}"]`).click(),a);if(['last','first','playKey','prevKey'].includes(a))await page.waitForFunction(()=>!App.state.playing);};
 const home=()=>page.evaluate(()=>{while(App.back()){};});
 const shot=name=>fs.writeFileSync(path.join(out,name),execFileSync(adb,['exec-out','screencap','-p'],{maxBuffer:20*1024*1024}));
 try{
  await home();await page.locator('[data-route=settings]').click();
  if(!await page.evaluate(()=>App.state.settings.animation))await act('animation');
  if(await page.evaluate(()=>App.state.settings.allowUndo))await act('allowUndo');
  await page.locator('[data-act=pieceSet][data-value=duo]').click();await page.locator('[data-act=boardTheme][data-value=duo]').click();
  await page.locator('[data-route=home]').click();await act('import');await page.locator('#import-text').fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *');await act('importText');
  const gameId=await page.evaluate(()=>App.state.current.id);await act('analyzeAll');await act('next');await act('prev');
  assert.ok(await page.evaluate(()=>App.state.busy&&App.state.analysisJob.whole));
  await act('last');await page.locator('#curve-scrub').evaluate(e=>{e.value=2;e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>!App.state.busy,null,{timeout:90000});
  assert.equal(await page.evaluate(()=>Object.keys(App.state.current.analysis).length),7);
  assert.equal(await page.evaluate(()=>App.state.ply),2);assert.ok(await page.evaluate(()=>Object.values(App.state.current.analysis).every(a=>a.engine.includes('Stockfish')&&Sprout.probabilities(a))));
  await home();await act('demo');
  const start=Date.now();await act('last');const duration=Date.now()-start;assert.ok(duration>=1100&&duration<2500,`native duration ${duration}`);assert.equal(await page.evaluate(()=>App.state.ply),35);
  await act('first');assert.equal(await page.locator('.moments-bar').count(),0);await act('playKey');
  shot('v131-native-review.png');
  run('shell','wm','user-rotation','lock','1');await page.waitForFunction(()=>innerWidth>innerHeight);
  await page.waitForTimeout(350);
  assert.ok(await page.evaluate(()=>{const b=document.querySelector('#chessboard').getBoundingClientRect(),t=document.querySelector('.transport').getBoundingClientRect(),p=document.querySelector('.analysis-section').getBoundingClientRect();return t.bottom<=innerHeight+1&&p.left>=b.right&&document.documentElement.scrollWidth<=innerWidth+1;}));
  shot('v131-native-landscape-review.png');
  run('shell','wm','user-rotation','lock','0');await page.waitForFunction(()=>innerWidth<innerHeight);
  await home();await page.locator('[data-route=play]').click();
  if(await page.locator('[data-act=resignBattle]').count()){await act('resignBattle');await act('confirmResign');}
  if(await page.locator('[data-act=newBattle]').count())await act('newBattle');
  assert.equal(await page.locator('#play-time').inputValue(),'10');await page.locator('#play-time').selectOption('15+10');await act('startBattle');
  assert.equal(await page.locator('[data-act=undoBattle]').count(),0);
  const userAnimation=await page.evaluate(()=>{document.querySelector('[data-square=e2]').click();document.querySelector('[data-square=e4]').click();return BoardMotion.isPlaying(document.querySelector('#chessboard'));});assert.ok(userAnimation);
  // Observe the actual native engine callback's resulting animation in-page.
  await page.evaluate(()=>{window.aiAnimated=false;window.aiWatch=setInterval(()=>{if(App.state.current.moves.length===2){window.aiAnimated=BoardMotion.isPlaying(document.querySelector('#chessboard'));clearInterval(window.aiWatch);}},10);});
  await page.waitForFunction(()=>App.state.current.moves.length===2&&!App.state.battleThinking,null,{timeout:40000});
  await page.waitForTimeout(50);assert.ok(await page.evaluate(()=>aiAnimated));
  await act('suspendBattle');const paused=await page.evaluate(()=>App.state.battle.clock.w);await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>App.state.battle.clock.w),paused);assert.ok(paused>900000);
  shot('v131-native-battle.png');
  await home();await page.locator('[data-route=settings]').click();await act('allowUndo');await page.locator('[data-route=play]').click();await act('undoBattle');assert.equal(await page.evaluate(()=>App.state.current.moves.length),0);
  await act('suspendBattle');run('shell','wm','user-rotation','lock','1');await page.waitForFunction(()=>innerWidth>innerHeight);await page.waitForTimeout(250);
  assert.ok(await page.evaluate(()=>document.querySelector('#chessboard').getBoundingClientRect().bottom<=innerHeight));shot('v131-native-landscape-battle.png');
  await act('resumeBattle');await page.evaluate(()=>{App.state.battle.clock.w=80;App.state.battle.clock.last=performance.now();});await page.waitForFunction(()=>App.state.battle.ended);assert.equal(await page.evaluate(()=>App.state.current.result),'0-1');
  await home();await page.locator('[data-route=settings]').click();await act('allowUndo');await page.locator('[data-route=home]').click();
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'v131-native-session.json'),JSON.stringify({gameId,duration,engine:'native Stockfish',passed:true,errors},null,2));
  console.log('PASS: native whole-game analysis during navigation, WDL, compressed playback, physical landscape, PNG pieces, actual human/AI animations, increment/pause/undo/timeout.');
 }finally{
  run('shell','wm','user-rotation',...(rotation.startsWith('lock')?rotation.split(/\s+/):['free']));
  await browser.close();run('forward','--remove','tcp:'+port);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
