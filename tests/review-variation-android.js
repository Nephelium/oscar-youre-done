const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {connect,run}=require('./review-android-helper.cjs'),out=path.resolve(__dirname,'../android/recorder/build/reports');
async function main(){
 const {browser,page,port}=await connect(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const act=async a=>page.locator(`[data-act="${a}"]`).first().click();
 const move=async(a,b)=>{await page.locator(`[data-square="${a}"]`).click();await page.locator(`[data-square="${b}"]`).click();};
 const goHome=async()=>page.evaluate(()=>{while(App.back()){};});
 try{
  await goHome();await page.locator('[data-route="settings"]').click();
  if(!await page.evaluate(()=>App.state.settings.autoAnalysis))await act('autoAnalysis');
  if(await page.evaluate(()=>App.state.settings.unlimitedAnalysis))await act('unlimitedAnalysis');
  await page.locator('#auto-speed').selectOption('fast');await page.locator('#auto-depth').selectOption('12');
  await page.locator('[data-route="play"]').click();
  if(await page.locator('[data-act="resignBattle"]').count()){await act('resignBattle');await act('confirmResign');}
  if(await page.locator('[data-act="newBattle"]').count())await act('newBattle');
  await page.locator('input[name="play-level"][value="3"]').check();await act('startBattle');
  await move('e2','e4');await page.waitForFunction(()=>App.state.current.moves.length===2&&!App.state.battleThinking,null,{timeout:40000});
  await move('g1','f3');await page.waitForFunction(()=>App.state.current.moves.length===4&&!App.state.battleThinking,null,{timeout:30000});
  const battle=await page.evaluate(()=>App.state.current);
  assert.equal(battle.source,'Stockfish 对战');assert.equal(await page.locator('.arrows').count(),0);
  await page.screenshot({path:path.join(out,'v130-native-battle.png'),fullPage:false});
  await act('pauseBattle');await page.reload();await page.waitForFunction(()=>window.App);await page.locator('[data-route="play"]').click();
  assert.equal(await page.evaluate(()=>App.state.current.id),battle.id);assert.equal(await page.evaluate(()=>App.state.current.moves.length),4);
  await act('resignBattle');await act('confirmResign');await act('battleReview');
  await move('d2','d4');await move('d7','d5');
  await page.waitForFunction(()=>!App.state.busy&&App.state.branch.length===2&&Sprout.variationRows(App.state.current,App.state.branchAt,App.state.branch).every(r=>!!r.evaluation),null,{timeout:40000});
  const variation=await page.evaluate(()=>Sprout.variationRows(App.state.current,App.state.branchAt,App.state.branch));
  assert.ok(variation.every(r=>r.evaluation.engine.includes('Stockfish')&&r.evaluation.lines[0].wdl.length===3));
  assert.ok(variation.every(r=>r.evaluation.lines[0].depth<=12));
  assert.ok(await page.locator('.variation-line').count());assert.ok(await page.locator('.piece-review').count());
  assert.equal(await page.locator('.evaluation-deltas span').count(),2);
  await page.screenshot({path:path.join(out,'v130-native-variation.png'),fullPage:false});
  await act('prev');assert.equal(await page.evaluate(()=>App.state.branch.length),2);
  await act('prev');assert.equal(await page.evaluate(()=>App.state.branchActive),false);assert.equal(await page.locator('.branch-banner').count(),0);
  await page.locator('[data-tab="branches"]').click();assert.equal(await page.locator('.branch-item').count(),1);
  await page.reload();await page.waitForFunction(()=>window.App);assert.equal(await page.locator('.branch-item').count(),1);
  await goHome();await page.locator('[data-route="settings"]').click();await act('unlimitedAnalysis');
  await page.locator('[data-route="home"]').click();await act('demo');await move('c2','c4');
  await page.waitForFunction(()=>App.state.busy&&Object.values(App.state.current.analysis).some(a=>!a.precomputed&&a.engine===JSON.parse(SproutHost.status()).engine&&a.lines[0].depth>12),null,{timeout:30000});
  const liveDepth=await page.evaluate(()=>App.state.current.analysis[Sprout.position(App.state.current,App.state.branchAt,App.state.branch).fen()].lines[0].depth);
  run('shell','input','keyevent','KEYCODE_HOME');await page.waitForTimeout(1600);
  assert.equal(await page.evaluate(()=>App.state.busy),false);
  const stopped=await page.evaluate(()=>JSON.stringify(App.state.current.analysis));await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>JSON.stringify(App.state.current.analysis)),stopped);
  run('shell','am','start','-n','com.jingjing.chesssprout/.MainActivity');await page.waitForTimeout(500);await goHome();
  await page.locator('[data-route="settings"]').click();await act('unlimitedAnalysis');await page.locator('#auto-speed').selectOption('adaptive');await page.locator('#auto-depth').selectOption('20');
  await page.locator('[data-route="home"]').click();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'v130-native-ui-check.json'),JSON.stringify({passed:true,battleId:battle.id,battleMoves:battle.moves,branch:variation.map(r=>({fen:r.fen,depth:r.evaluation.lines[0].depth,wdl:r.evaluation.lines[0].wdl})),liveDepth,backgroundStopped:true,errors},null,2));
  console.log('PASS: actual APK native battle, resume, automatic per-step evaluation, depth cap, branches and infinite/background cancellation.');
 }finally{await browser.close();run('forward','--remove','tcp:'+port);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
