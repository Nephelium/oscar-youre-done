const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
async function main(){
 const browser=await pw.chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
 const out=path.resolve(__dirname,'../android/recorder/build/reports');
 page.on('pageerror',e=>errors.push(e.message));
 // Bridge fixtures verify UI state and races only. Actual engine/video are tested on Android separately.
 await page.addInitScript(()=>{
  window.fixtureVideo={state:'idle'};window.fixtureAnalyses=[];window.fixtureOptions=[];
  window.SproutHost={
   listGames:()=>localStorage.getItem('sprout.games.v1')||'[]',
   status:()=>JSON.stringify({engine:'UI fixture',overlay:true,moveFeedback:true,capture:{running:false},video:fixtureVideo}),
   saveGame:text=>{const r=JSON.parse(text),all=JSON.parse(localStorage.getItem('sprout.games.v1')||'[]').filter(x=>x.id!==r.id);all.push(r);localStorage.setItem('sprout.games.v1',JSON.stringify(all));return '';},
   deleteGame:id=>{localStorage.setItem('sprout.games.v1',JSON.stringify(JSON.parse(localStorage.getItem('sprout.games.v1')||'[]').filter(x=>x.id!==id)));return '';},
   cancelAnalysis:()=>{clearInterval(window.fixtureLiveTimer);},
   analyzeLive:(id,gameId,fen,text)=>{const options=JSON.parse(text);fixtureOptions.push(options);if(options.infinite){let depth=20;window.fixtureLiveTimer=setInterval(()=>App.hostEvent({type:"analysisUpdate",id,result:{engine:"UI fixture",budget:7000,lines:[{depth:++depth,cp:80,wdl:[410,490,100],pv:[]}]}}),100);}else SproutHost.analyze(id,gameId,fen,options.budget);},
   analyze:(id,gameId,fen,budget)=>{fixtureAnalyses.push(fen);setTimeout(()=>{const g=new Chess(fen),m=g.moves({verbose:true})[0];App.hostEvent({type:'analysis',id,result:{engine:'UI fixture',budget,lines:[{depth:14,cp:75,wdl:[400,500,100],pv:m?[Sprout.uci(m)]:[]}]}});},50);},
   playMove:(id,text)=>{const data=JSON.parse(text),g=Sprout.position(data),m=g.moves({verbose:true})[0];setTimeout(()=>App.hostEvent({type:'playMove',id,result:{move:Sprout.uci(m),skill:data.skill,engine:'UI fixture'}}),300);},
   exportDocument:(name,text)=>{window.exported=JSON.parse(text);},
   selectVideo:()=>{fixtureVideo={state:'loading'};App.hostEvent({type:'videoLoading'});},
   cancelVideo:()=>{fixtureVideo={...fixtureVideo,state:'done',cancelled:true};}
  };
 });
 const act=async a=>{const el=page.locator(`[data-act="${a}"]`).first();if(["first","last"].includes(a)&&await el.isDisabled())return;await el.click();if(["first","last","playKey","prevKey"].includes(a))await page.waitForFunction(()=>!App.state.playing);};
 const trigger=async a=>page.evaluate(a=>document.querySelector(`[data-act="${a}"]`).click(),a);
 const move=async(a,b)=>{await page.locator(`[data-square="${a}"]`).click();await page.locator(`[data-square="${b}"]`).click();};
 const home=async()=>{await page.evaluate(()=>App.back());};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);
  await act('demo');await act('controls');
  assert.ok(await page.locator('.control-fill').count()>0);
  const control=await page.locator('[data-square="e3"] .control-fill').getAttribute('style');
  await act('flip');assert.equal(await page.locator('[data-square="e3"] .control-fill').getAttribute('style'),control);await act('flip');
  await move('d2','d4');await move('d7','d5');
  await page.waitForFunction(()=>App.state.branch.length===2&&!App.state.busy&&!!App.state.current.analysis[Sprout.position(App.state.current,0,['d2d4','d7d5']).fen()]);
  assert.equal(await page.locator('.branch-step').count(),3);
  assert.match(await page.locator('.branch-step').last().textContent(),/\+0.8.*40.0/);
  assert.ok(await page.locator('.variation-line').count());
  await act('prev');assert.equal(await page.evaluate(()=>App.state.branch.length),2);assert.equal(await page.evaluate(()=>App.state.branchPly),1);
  await act('next');assert.equal(await page.evaluate(()=>App.state.branchPly),2);
  assert.equal(await page.evaluate(()=>App.state.current.branches.length),0);await act('saveBranch');await act('mainline');assert.equal(await page.evaluate(()=>App.state.branch.length),2);await act('resumeBranch');
  await act('first');assert.equal(await page.evaluate(()=>App.state.branchActive),false);assert.equal(await page.locator('.branch-banner').count(),0);await move('e2','e4');await page.waitForFunction(()=>!App.state.busy);assert.equal(await page.evaluate(()=>App.state.current.branches.length),1);await act('saveBranch');assert.equal(await page.evaluate(()=>App.state.current.branches.length),2);assert.ok(await page.evaluate(()=>fixtureOptions.every(o=>o.depth===20&&!o.infinite)));assert.equal(await page.locator('.evaluation-deltas span').count(),2);assert.doesNotMatch(await page.locator('.review-copy').textContent(),/个百分点/);
  assert.equal(await page.evaluate(()=>App.state.branch.length),1);
  assert.equal(await page.evaluate(()=>App.state.current.moves.length),35);
  await act('last');await act('explain');assert.match(await page.locator('#modal-content').textContent(),/白方兵从 e2 到 e4/);await act('close');
  await page.screenshot({path:path.join(out,'v130-variation-browser.png'),fullPage:true});
  await act('mainline');await page.locator('[data-tab=branches]').click();assert.equal(await page.locator('.branch-item').count(),2);assert.ok(await page.locator('.branch-values').count());await page.locator('[data-tab=analysis]').click();await act('first');const target=await page.evaluate(()=>Sprout.keyMoments(Sprout.timeline(App.state.current))[0].ply);
  await act('playKey');await page.waitForFunction(n=>App.state.ply===n,target,{timeout:25000});await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>App.state.ply),target);
  await home();await page.locator('[data-route="games"]').first().click();await act('new');await move('e2','e4');await home();
  const id=await page.locator('[data-open]').first().getAttribute('data-open');
  // A previous installation may have persisted the old zero-step variation screen.
  await page.evaluate(id=>localStorage.setItem('sprout.view.v1',JSON.stringify({route:'review',id,ply:0,branchAt:0,branch:['d2d4'],branchPly:0,branchActive:true})),id);
  await page.reload();assert.equal(await page.evaluate(()=>App.state.branchActive),false);assert.equal(await page.locator('.branch-banner').count(),0);assert.equal(await page.evaluate(()=>App.state.current.branches.length),0);await home();
  const card=page.locator(`[data-open="${id}"]`),box=await card.boundingBox();
  await page.mouse.move(box.x+box.width-25,box.y+20);await page.mouse.down();await page.mouse.move(box.x+60,box.y+20,{steps:6});await page.mouse.up();
  assert.equal(await card.locator('..').getAttribute('class'),'record-swipe open');
  await page.locator(`[data-act="favorite"][data-id="${id}"]`).click();await page.locator('#folder-name').fill('残局研究');await act('createFolder');await act('saveFavorite');
  assert.equal(await page.locator('.favorite-star').count(),1);
  await act('backup');const backup=await page.evaluate(()=>exported);
  await act('import');await page.locator('#import-text').fill(JSON.stringify(backup));await act('importText');const imported=await page.evaluate(()=>App.state.current.id);
  assert.notEqual(imported,id);assert.equal(await page.evaluate(id=>App.state.library.entries[id].length,imported),1);await home();
  await page.locator(`[data-open="${imported}"]`).locator('..').locator('[data-act="cardMenu"]').click();await page.locator(`[data-act="deleteCard"][data-id="${imported}"]`).click();await act('close');
  assert.equal(await page.locator(`[data-open="${imported}"]`).count(),1);
  await page.locator(`[data-act="deleteCard"][data-id="${imported}"]`).click();await act('confirmDelete');assert.equal(await page.locator(`[data-open="${imported}"]`).count(),0);assert.equal(await page.locator(`[data-open="${id}"]`).count(),1);
  await page.locator('[data-route="play"]').click();await page.locator('input[name="play-side"][value="b"]').check();await act('startBattle');
  await page.waitForFunction(()=>App.state.current.moves.length===1&&!App.state.battleThinking);assert.equal(await page.evaluate(()=>App.state.flip),true);
  assert.equal(await page.locator('.arrows').count(),0);
  await move('e7','e5');await page.waitForFunction(()=>App.state.current.moves.length===3&&!App.state.battleThinking);
  await page.screenshot({path:path.join(out,'v130-battle-browser.png'),fullPage:true});
  await act('suspendBattle');await home();await page.reload();await page.locator('[data-route="play"]').click();assert.equal(await page.evaluate(()=>App.state.current.moves.length),3);
  await act('resignBattle');await act('close');assert.equal(await page.evaluate(()=>App.state.battle.ended),false);
  await act('resignBattle');await act('confirmResign');assert.equal(await page.evaluate(()=>App.state.current.result),'1-0');
  await act('battleReview');assert.equal(await page.evaluate(()=>App.state.route),'review');await home();await page.locator('[data-route="home"]').click();
  await page.locator('[data-route=settings]').click();assert.equal(await page.locator('[data-act=unlimitedAnalysis]').getAttribute('aria-checked'),'false');await act('autoAnalysis');await page.locator('[data-route=home]').click();await act('demo');const beforeAuto=await page.evaluate(()=>fixtureOptions.length);await move('c2','c4');await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>fixtureOptions.length),beforeAuto);await home();await page.locator('[data-route=settings]').click();await act('autoAnalysis');await page.locator('#auto-speed').selectOption('fast');await act('unlimitedAnalysis');await page.locator('[data-route=home]').click();await act('demo');await move('b2','b4');await page.waitForFunction(()=>fixtureOptions.some(o=>o.infinite),null,{timeout:12000});await page.waitForFunction(()=>Object.values(App.state.current.analysis).some(a=>a.engine==='UI fixture'&&a.lines[0].depth>20));await act('first');assert.equal(await page.evaluate(()=>App.state.busy),false);assert.equal(await page.locator('.branch-banner').count(),0);await home();await page.locator('[data-route=settings]').click();await act('unlimitedAnalysis');await page.locator('[data-route=home]').click();
  await act('video');assert.match(await page.locator('#video-stage').textContent(),/正在读取/);assert.equal(await page.locator('#video-progress').getAttribute('value'),null);
  await page.evaluate(()=>fixtureVideo={state:'processing',progress:36,plies:7,processedMs:3000,duration:9000});await page.waitForFunction(()=>document.querySelector('#video-percent').textContent==='36%');
  assert.match(await page.locator('#video-count').textContent(),/7 步.*3 \/ 9 秒/);
  await page.evaluate(id=>fixtureVideo={state:'done',gameId:id,plies:7,progress:100},id);await page.waitForFunction(()=>document.querySelector('#video-stage').textContent==='录屏导入完成');
  assert.equal(await page.evaluate(()=>App.state.route),'home');await act('openVideo');assert.equal(await page.evaluate(()=>App.state.current.id),id);await home();
  await page.evaluate(()=>App.hostEvent({type:'videoLoadError',message:'测试错误'}));assert.equal(await page.locator('#video-retry').isVisible(),true);await act('close');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'v130-browser-check.json'),JSON.stringify({passed:true,checks:['variation navigation and autoscan','fork preservation','control map flip','key playback','swipe confirmation','folder backup mapping','battle black side recovery','video progress and retry'],errors},null,2));
  console.log('PASS: 1.3.0 variations, factual explanations, key playback, favorites, controls, battle lifecycle and video progress (bridge fixtures).');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
