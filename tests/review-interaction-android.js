const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {connect,run,adb}=require('./review-android-helper.cjs');
async function main(){
 const {browser,page,port}=await connect(),out=path.resolve(__dirname,'../android/recorder/build/reports'),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const click=async a=>{await page.evaluate(a=>document.querySelector(`[data-act="${a}"]`).click(),a);if(['first','last','playKey','prevKey'].includes(a))await page.waitForFunction(()=>!App.state.playing);};
 const shot=name=>fs.writeFileSync(path.join(out,name),execFileSync(adb,['exec-out','screencap','-p'],{maxBuffer:10*1024*1024}));
 try{
  await page.evaluate(()=>{while(App.back()){};});
  const before=await page.evaluate(()=>JSON.stringify(JSON.parse(SproutHost.listGames()).sort((a,b)=>a.id.localeCompare(b.id))));
  await click('demo');
  assert.ok(await page.evaluate(()=>Sprout.timeline(App.state.current).every(r=>Sprout.probabilities(r.evaluation))));
  assert.equal(await page.evaluate(()=>App.state.settings.pieceSet),'duo');
  const moving=await page.evaluate(()=>{document.querySelector('[data-act=next]').click();return document.querySelector('[data-square=e4] img').getAnimations().length;});
  assert.ok(moving>0);
  await page.waitForTimeout(3400);await page.locator('#chessboard').scrollIntoViewIfNeeded();shot('v120-android-board.png');
  const layout=await page.evaluate(()=>{
   const positions=[];
   for(let i=0;i<=35;i++){const input=document.querySelector('#curve-scrub');input.value=i;input.dispatchEvent(new Event('input',{bubbles:true}));positions.push(document.querySelector('.curve').getBoundingClientRect().top+scrollY);}
   return Math.max(...positions)-Math.min(...positions);
  });
  assert.ok(layout<1);
  await page.locator('[data-act="curveMode"][data-value="win"]').click();
  await click('flip');assert.match(await page.locator('.curve-readout').textContent(),/胜 0.0%.*负 100.0%/);
  await click('flip');await page.locator('.curve').scrollIntoViewIfNeeded();
  const cdp=await page.context().newCDPSession(page),box=await page.locator('.curve').boundingBox(),counts=[];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+42,y:box.y+65}]});
  for(let i=1;i<=6;i++){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+42+(box.width-55)*i/6,y:box.y+66}]});
   await page.waitForTimeout(40);counts.push(await page.evaluate(()=>App.state.ply));
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(new Set(counts).size>=4,JSON.stringify(counts));assert.equal(await page.evaluate(()=>App.state.ply),35);
  // Drag the native range thumb in multiple stages, proving it retains capture.
  const slider=await page.locator('#curve-scrub').boundingBox(),steps=[];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:slider.x+slider.width-12,y:slider.y+20}]});
  for(let i=1;i<=5;i++){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:slider.x+slider.width-12-(slider.width-24)*i/5,y:slider.y+20}]});
   await page.waitForTimeout(40);steps.push(await page.evaluate(()=>App.state.ply));
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(new Set(steps).size>=4,JSON.stringify(steps));assert.equal(await page.evaluate(()=>App.state.ply),0);
  await cdp.detach();shot('v120-android-win-curve.png');
  await click('analyzeAll');await page.waitForFunction(()=>!App.state.busy,{},{timeout:90000,polling:500});
  const native=await page.evaluate(()=>Sprout.timeline(App.state.current).map(r=>({engine:r.evaluation.engine,wdl:r.evaluation.lines[0].wdl})));
  assert.ok(native.every(a=>a.engine==='Stockfish 16.1'&&Array.isArray(a.wdl)&&a.wdl.reduce((a,b)=>a+b,0)===1000));
  await click('first');await page.locator('#chessboard').scrollIntoViewIfNeeded();
  await page.locator('[data-square="d2"]').click();await page.locator('[data-square="d4"]').click();
  await click('engineMove');await page.waitForFunction(()=>!App.state.busy&&App.state.branch.length===2,{},{timeout:45000,polling:500});
  const branch=await page.evaluate(()=>App.state.current.analysis[Sprout.position(App.state.current,App.state.branchAt,[App.state.branch[0]]).fen()]);
  assert.ok(branch.lines.every(l=>l.wdl?.length===3));
  await click('saveBranch');await click('home');
  assert.equal(await page.evaluate(()=>JSON.stringify(JSON.parse(SproutHost.listGames()).sort((a,b)=>a.id.localeCompare(b.id)))),before);
  await page.reload();await page.waitForFunction(()=>window.App);
  assert.equal(await page.evaluate(()=>JSON.stringify(JSON.parse(SproutHost.listGames()).sort((a,b)=>a.id.localeCompare(b.id)))),before);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'v120-native-interaction.json'),JSON.stringify({passed:true,layoutSpread:layout,touchPlot:counts,touchSlider:steps,nativePositions:native.length,nativeEngine:'Stockfish 16.1',notebooksUnchanged:JSON.parse(before).length,errors},null,2));
  console.log('PASS: installed APK animation, layout, native plot and slider touch capture, 36 WDL analyses, engine branch and unchanged notebooks.');
 }finally{await browser.close();run('forward','--remove','tcp:'+port);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
