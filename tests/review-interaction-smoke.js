const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
async function main(){
 const browser=await pw.chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 const out=path.resolve(__dirname,'../android/recorder/build/reports');
 page.on('pageerror',e=>errors.push(e.message));
 const act=async a=>page.locator(`[data-act="${a}"]`).first().click();
 const trigger=async a=>page.evaluate(a=>document.querySelector(`[data-act="${a}"]`).click(),a);
 const go=async n=>page.evaluate(n=>{const r=document.querySelector('#curve-scrub');r.value=n;r.dispatchEvent(new Event('input',{bubbles:true}));},n);
 const importGame=async text=>{await act('import');await page.locator('#import-text').fill(text);await act('importText');};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);
  await page.locator('[data-route="settings"]').click();
  assert.equal(await page.locator('[role=switch]').getAttribute('aria-checked'),'true');
  for(const width of [320,390,844]){
   await page.setViewportSize({width,height:844});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.setViewportSize({width:390,height:844});
  for(const set of ['duo','classic','mono']){
   await page.locator(`[data-act="pieceSet"][data-value="${set}"]`).click();
   assert.equal(await page.evaluate(()=>App.state.settings.pieceSet),set);
  }
  await page.locator('[data-act="pieceSet"][data-value="duo"]').click();
  await page.waitForTimeout(350);await page.screenshot({path:path.join(out,'v120-settings.png'),fullPage:true});
  await page.locator('[data-route="home"]').click();await act('demo');
  // Browser stays in the same task, no reload needed for a new theme.
  assert.match(await page.locator('[data-square="e2"] img').getAttribute('src'),/duo-wp/);
  await trigger('next');
  assert.ok(await page.locator('[data-square="e4"] img').evaluate(e=>e.getAnimations().length>0),'piece should be in flight');
  const mid=await page.locator('[data-square="e4"] img').evaluate(e=>getComputedStyle(e).transform);
  assert.notEqual(mid,'none');
  for(let i=0;i<6;i++)await trigger('next');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>App.state.ply),7);
  assert.equal(await page.locator('#chessboard [data-piece]').count(),32);
  assert.ok(await page.locator('[data-square="c3"] .piece-review').count());
  // No graph reflow across the entire game, including mate and optional comparison controls.
  const ys=[];
  for(let i=0;i<=35;i++){
   await go(i);
   ys.push(await page.locator('.curve').evaluate(e=>e.getBoundingClientRect().top+scrollY));
  }
  assert.ok(Math.max(...ys)-Math.min(...ys)<1,JSON.stringify(ys));
  await page.locator('[data-act="curveMode"][data-value="win"]').click();
  assert.match(await page.locator('.curve-readout').textContent(),/胜 100.0%.*和 0.0%.*负 0.0%/);
  await trigger('flip');
  assert.match(await page.locator('.curve-readout').textContent(),/胜 0.0%.*负 100.0%/);
  await trigger('flip');await go(8);
  await page.locator('.curve').scrollIntoViewIfNeeded();
  let box=await page.locator('.curve').boundingBox();
  await page.mouse.move(box.x+40,box.y+70);await page.mouse.down();
  await page.mouse.move(box.x+box.width-15,box.y+80,{steps:12});await page.mouse.up();
  assert.equal(await page.evaluate(()=>App.state.ply),35);
  const slider=page.locator('#curve-scrub');await slider.focus();await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>App.state.ply),0);
  await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>App.state.ply),1);
  await page.screenshot({path:path.join(out,'v120-win-curve.png')});
  // Real touch dispatch exercises pointer capture through full page updates.
  const cdp=await page.context().newCDPSession(page);box=await page.locator('.curve').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+45,y:box.y+60}]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+45+(box.width-60)*i/8,y:box.y+61}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.evaluate(()=>App.state.ply),35);
  await cdp.detach();
  await go(13);await trigger('next'); // black castles
  assert.ok(await page.locator('[data-square="f8"] img').evaluate(e=>e.getAnimations().length>0));
  await page.waitForTimeout(270);await trigger('prev');
  assert.ok(await page.locator('[data-square="h8"] img').evaluate(e=>e.getAnimations().length>0));
  await page.waitForTimeout(270);
  for(const b of ['duo','sage','wood','ocean']){
   await act('home');await page.locator('[data-route="settings"]').click();
   await page.locator(`[data-act="boardTheme"][data-value="${b}"]`).click();
   await page.locator('[data-route="home"]').click();await act('demo');await trigger('next');await page.waitForTimeout(270);
   await page.locator('.board-section').screenshot({path:path.join(out,`v120-board-${b}.png`)});
  }
  await act('home');await page.locator('[data-route="settings"]').click();
  await act('animation');await page.locator('[data-act="boardTheme"][data-value="duo"]').click();await page.reload();
  await page.locator('[data-route="settings"]').click();
  assert.equal(await page.locator('[role=switch]').getAttribute('aria-checked'),'false');
  await page.locator('[data-route="home"]').click();await act('demo');await trigger('next');
  assert.equal(await page.locator('#chessboard').evaluate(e=>e.getAnimations({subtree:true}).length),0);
  await act('home');await page.locator('[data-route="settings"]').click();await act('animation');await page.locator('[data-route="home"]').click();
  await importGame('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=Q+ *');
  await trigger('next');
  assert.match(await page.locator('[data-square="a8"] img').getAttribute('src'),/duo-wq/);
  assert.ok(await page.locator('[data-square="a8"] img').evaluate(e=>e.getAnimations().length>0));
  await page.waitForTimeout(270);await trigger('prev');assert.match(await page.locator('[data-square="a7"] img').getAttribute('src'),/duo-wp/);
  assert.match(await page.locator('.curve-caption').textContent(),/自对弈/);
  assert.match(await page.locator('[data-act="analyzeAll"]').last().textContent(),/补充分析/);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'v120-interaction-check.json'),JSON.stringify({passed:true,layoutSpread:Math.max(...ys)-Math.min(...ys),errors},null,2));
  console.log('Interaction checks passed: animation, rapid navigation, castling/promotion, stable layout, mouse/touch/keyboard scrubbing, WDL perspective, themes/persistence.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exit(1);});
