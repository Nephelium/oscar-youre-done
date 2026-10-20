const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
async function main(){
 const browser=await pw.chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const act=a=>page.evaluate(a=>document.querySelector(`[data-act="${a}"]`).click(),a),settle=()=>page.waitForFunction(()=>!App.state.playing);
 const home=()=>page.evaluate(()=>{while(App.back()){};});
 const go=n=>page.locator('#curve-scrub').evaluate((e,n)=>{e.value=n;e.dispatchEvent(new Event('input',{bubbles:true}));},n);
 const out=path.resolve(__dirname,'../android/recorder/build/reports');
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);await act('demo');
  assert.equal(await page.locator('.moments-bar').count(),0);
  assert.deepEqual(await page.locator('.transport button').evaluateAll(es=>es.map(e=>e.dataset.act)),['first','prevKey','prev','next','playKey','last']);
  const check=async action=>{
   const from=await page.evaluate(()=>App.state.ply),start=Date.now();await act(action);
   assert.ok(await page.evaluate(()=>App.state.playing));
   await page.waitForTimeout(300);const mid=await page.evaluate(()=>App.state.ply);
   assert.notEqual(mid,from);assert.ok(await page.evaluate(()=>App.state.playing));
   await settle();const ms=Date.now()-start;assert.ok(ms>=1100&&ms<1900,`duration ${ms}`);
   assert.equal(await page.locator('#chessboard').getAttribute('data-fen'),await page.evaluate(()=>Sprout.position(App.state.current,App.state.ply).fen()));
   return ms;
  };
  const forward=await check('last');assert.equal(await page.evaluate(()=>App.state.ply),35);
  const backward=await check('first');assert.equal(await page.evaluate(()=>App.state.ply),0);
  const keys=await page.evaluate(()=>Sprout.keyMoments(Sprout.timeline(App.state.current)).map(k=>k.ply));
  await act('playKey');await settle();assert.equal(await page.evaluate(()=>App.state.ply),keys[0]);
  await go(35);await act('prevKey');await settle();assert.equal(await page.evaluate(()=>App.state.ply),keys.filter(p=>p<35).at(-1));
  // Rapid reversal cancels the old schedule. Scrubbing always takes over immediately.
  await go(0);await act('last');await page.waitForTimeout(250);await act('first');await settle();assert.equal(await page.evaluate(()=>App.state.ply),0);
  await act('last');await page.waitForTimeout(200);await go(8);await page.waitForTimeout(1400);assert.equal(await page.evaluate(()=>App.state.ply),8);
  for(const viewport of [{width:320,height:740},{width:390,height:844},{width:667,height:375},{width:844,height:390}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(150);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const buttons=await page.locator('.transport button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,w:r.width};}));
   for(let i=1;i<buttons.length;i++)assert.ok(buttons[i].x>=buttons[i-1].x+buttons[i-1].w);
   assert.ok(buttons.every(b=>b.w>=26));
  }
  await page.setViewportSize({width:390,height:844});await home();await page.locator('[data-route=settings]').click();await act('animation');
  await page.locator('[data-route=home]').click();await act('demo');await act('last');assert.equal(await page.evaluate(()=>App.state.ply),35);assert.equal(await page.evaluate(()=>App.state.playing),false);
  await home();await page.locator('[data-route=settings]').click();await act('animation');await page.locator('[data-route=home]').click();
  await act('import');await page.locator('#import-text').fill(Array.from({length:100},(_,i)=>`${i*2+1}. Nf3 Nf6 ${i*2+2}. Ng1 Ng8`).join(' ')+' *');await act('importText');
  const long=await check('last');assert.equal(await page.evaluate(()=>App.state.ply),400);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'v131-navigation-check.json'),JSON.stringify({forward,backward,long,keys,errors},null,2));
  console.log('PASS: compact key navigation, fixed-time forward/backward/400-ply playback, interruptions, precise final FEN, disabled animations and narrow/landscape controls.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
