const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const adb=path.join(os.homedir(),'AppData/Local/Android/Sdk/platform-tools/adb.exe'),out=path.resolve(__dirname,'../android/recorder/build/reports');
const run=(...args)=>execFileSync(adb,args,{encoding:'utf8',maxBuffer:8*1024*1024}).trim();
async function main(){
 const {browser,page,port}=await require('./review-android-helper.cjs').connect();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.waitForFunction(()=>window.App&&window.SproutHost);await page.evaluate(()=>{while(App.back()){};});await page.screenshot({path:path.join(out,'android-home.png'),animations:'disabled'});
  const id=await page.evaluate(()=>{const r=Sprout.importText('[Event "Android 本地引擎验证"]\n\n1. f3 e5 2. g4 Qh4# 0-1')[0];const error=SproutHost.saveGame(JSON.stringify(r));if(error)throw Error(error);App.resume();return r.id;});
  await page.locator('[data-route="games"]').first().click();await page.locator('[data-act="notebook"][data-book="game"]').click();await page.locator(`[data-open="${id}"]`).click();await page.getByRole('button',{name:'分析整盘',exact:true}).click();
  await page.waitForFunction(()=>!App.state.busy,{},{timeout:120000});
  const result=await page.evaluate(()=>({record:App.state.current,summary:Sprout.summary(App.state.current),status:JSON.parse(SproutHost.status())}));
  assert.equal(Object.keys(result.record.analysis).length,5,JSON.stringify(result));assert.equal(result.summary.analyzed,2);assert.match(result.status.engine,/Stockfish/);
  assert.ok(Object.values(result.record.analysis).every(e=>e.lines.length>0));
  await page.locator('[data-act="next"]').click();await page.screenshot({path:path.join(out,'android-stockfish-analysis.png'),animations:'disabled'});
  await page.reload();await page.waitForFunction(()=>window.App&&App.state.current);assert.equal(await page.evaluate(()=>Object.keys(App.state.current.analysis).length),5);
  assert.equal(await page.evaluate(()=>{const r=App.state.current;return r.analysis[Sprout.position(r).fen()].lines[0].mate;}),0);
  await page.locator('[data-square="g7"]').click();await page.locator('[data-square="g6"]').click();await page.locator('[data-act="engineMove"]').click();
  await page.waitForFunction(()=>!App.state.busy&&App.state.branch.length===2,{},{timeout:60000});
  assert.equal(await page.evaluate(()=>App.state.current.moves.length),4);await page.locator('[data-act="saveBranch"]').click();
  assert.equal(await page.evaluate(()=>App.state.current.branches.length),1);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'android-engine-results.json'),JSON.stringify({passed:true,engine:result.status.engine,positions:5,summary:result.summary,errors},null,2));
  console.log('PASS: installed APK, real native Stockfish analysis, per-position persistence and WebView reload.');
 }finally{await browser.close();run('forward','--remove','tcp:'+port);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
