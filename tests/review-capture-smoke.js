// Integration fixture: real MediaProjection over a controlled board in the emulator.
// It is deliberately not evidence of Duolingo theme/device compatibility.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const adb=path.join(os.homedir(),'AppData/Local/Android/Sdk/platform-tools/adb.exe'),out=path.resolve(__dirname,'../android/recorder/build/reports');
const run=(...a)=>execFileSync(adb,a,{encoding:'utf8',maxBuffer:8*1024*1024}).trim();
function systemConsent(){
 for(let attempt=0;attempt<7;attempt++){
  run('shell','uiautomator','dump','/sdcard/chesssprout-ui.xml');const xml=run('shell','cat','/sdcard/chesssprout-ui.xml');
  const nodes=xml.match(/<node\b[^>]*>/g)||[];
  const node=nodes.find(n=>n.includes('permission_allow_button'))||nodes.find(n=>n.includes('text="Share screen"'))||nodes.find(n=>n.includes('text="Share entire screen"'))||nodes.find(n=>n.includes('text="Share one app"'));
  if(!node)return;
  const b=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);if(!b)throw Error('Missing native control bounds');
  run('shell','input','tap',String(Math.floor((Number(b[1])+Number(b[3]))/2)),String(Math.floor((Number(b[2])+Number(b[4]))/2)));
  if(node.includes('text="Share screen"'))return;
 }
}
async function main(){
 const {browser,page,port}=await require('./review-android-helper.cjs').connect();
 try {
  if(process.argv[2]==='grant'){systemConsent();return;}
  if(process.argv[2]==='prepare'){
   await page.evaluate(()=>{while(App.back()){};});await page.locator('[data-act="record"]').click();if(process.argv.includes('--position'))await page.locator('#capture-mode').selectOption('position');await page.locator('[data-act="startCapture"]').click();
   if(process.argv.includes('--grant'))systemConsent();console.log('Requested system capture consent.');return;
  }
  await page.waitForFunction(()=>JSON.parse(SproutHost.status()).capture.running,{},{timeout:20000});
  const recordId=await page.evaluate(()=>JSON.parse(SproutHost.status()).capture.gameId);
  await page.evaluate(()=>{while(App.back()){};});await page.locator('[data-route="games"]').first().click();await page.locator('[data-act="new"]').click();
  await page.waitForFunction(()=>JSON.parse(SproutHost.status()).capture.calibrated,{},{timeout:30000});
  const moves=['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6'];
  for(let i=0;i<moves.length;i++){
   const move=moves[i];await page.locator(`[data-square="${move.slice(0,2)}"]`).click();await page.locator(`[data-square="${move.slice(2,4)}"]`).click();
   await page.waitForFunction(n=>JSON.parse(SproutHost.status()).capture.plies>=n,i+1,{timeout:15000});
   if(i===2){await page.locator('[data-act="flip"]').click();await page.waitForTimeout(1200);}
  }
  const before=await page.evaluate(()=>JSON.parse(SproutHost.status()).capture);
  await page.screenshot({path:path.join(out,'android-capture-controlled-board.png'),animations:'disabled'});
  await page.evaluate(()=>SproutHost.captureAction('stop','{}'));
  await page.waitForFunction(()=>!JSON.parse(SproutHost.status()).capture.running);
  await page.waitForTimeout(1200);
  assert.ok(run('shell','pidof','com.jingjing.chesssprout'),'App must survive stopping the image reader');
  const record=await page.evaluate(id=>JSON.parse(SproutHost.listGames()).find(r=>r.id===id),recordId);
  assert.deepEqual(record.moves,moves);assert.equal(record.issues.filter(i=>!i.resolved).length,0);
  fs.writeFileSync(path.join(out,'android-capture-results.json'),JSON.stringify({passed:true,scope:'emulator controlled artwork, real MediaProjection',capture:before,record},null,2));
  console.log('PASS: real screen capture, auto board location, theme calibration, six exact legal plies and stop persistence.');
 }catch(error){
  const debug=await page.evaluate(()=>({status:JSON.parse(SproutHost.status()),preview:SproutHost.capturePreview(),board:document.querySelector('#chessboard')?.getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));
  if(debug.preview){fs.writeFileSync(path.join(out,'capture-debug.jpg'),Buffer.from(debug.preview.split(',')[1],'base64'));delete debug.preview;}
  fs.writeFileSync(path.join(out,'capture-debug.json'),JSON.stringify(debug,null,2));throw error;
 }finally{await browser.close();run('forward','--remove','tcp:'+port);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
