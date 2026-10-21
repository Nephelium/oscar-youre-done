const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
async function main(){
 const browser=await pw.chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 const out=path.resolve(__dirname,'../android/recorder/build/reports');fs.mkdirSync(out,{recursive:true});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.calls=[];window.cancels=0;window.playDelay=650;
  window.SproutHost={
   listGames:()=>localStorage.getItem('sprout.games.v1')||'[]',
   status:()=>JSON.stringify({engine:'UI fixture',overlay:true,moveFeedback:true,capture:{running:false},video:{state:'idle'}}),
   saveGame:text=>{const r=JSON.parse(text),list=JSON.parse(localStorage.getItem('sprout.games.v1')||'[]').filter(x=>x.id!==r.id);list.push(r);localStorage.setItem('sprout.games.v1',JSON.stringify(list));return '';},
   cancelAnalysis:()=>cancels++,
   analyze:(id,gameId,fen,budget)=>{calls.push(fen);setTimeout(()=>{const g=new Chess(fen),m=g.moves({verbose:true})[0];App.hostEvent({type:'analysis',id,result:{engine:'UI fixture',budget,lines:[{depth:14,cp:40,wdl:[200,700,100],pv:m?[Sprout.uci(m)]:[]}]}});},350);},
   playMove:(id,text)=>{const data=JSON.parse(text),g=Sprout.position(data),m=g.moves({verbose:true})[0];setTimeout(()=>App.hostEvent({type:'playMove',id,result:{move:Sprout.uci(m)}}),playDelay);}
  };
 });
 const act=async a=>{const el=page.locator(`[data-act="${a}"]`).first();if(["first","last"].includes(a)&&await el.isDisabled())return;await el.click();if(["first","last","playKey","prevKey"].includes(a))await page.waitForFunction(()=>!App.state.playing);},home=async()=>page.evaluate(()=>{while(App.back()){};});
 const clickMove=async(a,b)=>page.evaluate(([a,b])=>{document.querySelector(`[data-square="${a}"]`).click();document.querySelector(`[data-square="${b}"]`).click();},[a,b]);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);
  await act('import');await page.locator('#import-text').fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *');await act('importText');
  await act('analyzeAll');const before=await page.evaluate(()=>cancels);
  await act('next');await act('prev');await act('last');
  await page.locator('#curve-scrub').evaluate(e=>{e.value='2';e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>cancels),before);assert.equal(await page.evaluate(()=>App.state.busy),true);
  await page.waitForFunction(()=>!App.state.busy);
  assert.equal(await page.evaluate(()=>Object.keys(App.state.current.analysis).length),7);assert.equal(await page.evaluate(()=>calls.length),7);
  assert.equal(await page.evaluate(()=>App.state.ply),2);
  // Both analysis buttons and the comparison row remain separate at all widths.
  await home();await act('demo');await act('next');await act('next');await act('next');await act('next');
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:667,height:375},{width:960,height:540}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(300);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const a=await page.locator('.analysis-actions').boundingBox(),b=await page.locator('.compare-slot').boundingBox();
   assert.ok(b.y>=a.y+a.height+8,JSON.stringify({a,b}));
   if(viewport.width>600){
    const board=await page.locator('#chessboard').boundingBox(),transport=await page.locator('.transport').boundingBox(),panel=await page.locator('.analysis-section').boundingBox();
    assert.ok(transport.y+transport.height<=viewport.height+1,JSON.stringify({transport,viewport}));
    assert.ok(panel.x>=board.x+board.width,JSON.stringify({board,panel}));
    await page.locator('.analysis-section').evaluate(el=>el.scrollTop=180);const scroll=await page.locator('.analysis-section').evaluate(el=>el.scrollTop);
    await act('next');await page.waitForTimeout(300);assert.equal(await page.locator('.analysis-section').evaluate(el=>el.scrollTop),scroll);
   }
  }
  await page.screenshot({path:path.join(out,'v131-landscape-review.png')});
  await home();await page.setViewportSize({width:390,height:844});await page.locator('[data-route=play]').click();
  assert.equal(await page.locator('#play-time').inputValue(),'10');await page.locator('#play-time').selectOption('15+10');await act('startBattle');
  assert.equal(await page.locator('[data-act=undoBattle]').count(),0);
  await clickMove('e2','e4');assert.ok(await page.evaluate(()=>BoardMotion.isPlaying(document.querySelector('#chessboard'))));
  await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>BoardMotion.isPlaying(document.querySelector('#chessboard'))));
  await page.waitForFunction(()=>App.state.current.moves.length===2);
  assert.ok(await page.evaluate(()=>BoardMotion.isPlaying(document.querySelector('#chessboard'))));
  await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>BoardMotion.isPlaying(document.querySelector('#chessboard'))));
  assert.ok(await page.evaluate(()=>App.state.battle.clock.w>900000));
  await act('suspendBattle');const remaining=await page.evaluate(()=>App.state.battle.clock.w);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>App.state.battle.clock.w),remaining);
  await home();await page.locator('[data-route=settings]').click();assert.equal(await page.locator('[data-act=allowUndo]').getAttribute('aria-checked'),'false');await act('allowUndo');
  await page.locator('[data-route=play]').click();
  // Observe restoration in the click task, before the resumed clock's next tick.
  const undone=await page.evaluate(()=>{document.querySelector('[data-act=undoBattle]').click();return {moves:App.state.current.moves.length,white:App.state.battle.clock.w};});
  assert.equal(undone.moves,0);assert.equal(undone.white,900000);
  await page.evaluate(()=>playDelay=1400);await clickMove('d2','d4');await act('undoBattle');await page.waitForTimeout(1600);
  assert.equal(await page.evaluate(()=>App.state.current.moves.length),0);
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);
  const board=await page.locator('#chessboard').boundingBox(),panel=await page.locator('.battle-panel').boundingBox();
  assert.ok(panel.x>=board.x+board.width);assert.ok(board.y+board.height<=390);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,'v131-landscape-battle.png')});
  await page.evaluate(()=>App.pause());const paused=await page.evaluate(()=>App.state.battle.clock.w);await page.waitForTimeout(400);await page.evaluate(()=>App.resume());assert.equal(await page.evaluate(()=>App.state.battle.clock.active),null);assert.equal(await page.evaluate(()=>App.state.battle.clock.w),paused);
  await act('resumeBattle');await page.evaluate(()=>{App.state.battle.clock.w=80;App.state.battle.clock.last=performance.now();});await page.waitForFunction(()=>App.state.battle.ended);
  assert.equal(await page.evaluate(()=>App.state.current.result),'0-1');assert.match(await page.locator('.battle-status').textContent(),/白方超时/);
  assert.deepEqual(errors,[]);console.log('PASS: whole-game navigation, action spacing, landscape scrolling, clocks/increment/timeout, undo race, both move animations and background pause.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
