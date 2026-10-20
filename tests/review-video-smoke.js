const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect,run}=require('./review-android-helper.cjs'),out=path.resolve(__dirname,'../android/recorder/build/reports');
async function main(){
 const {browser,page,port}=await connect();
 try{
  if(process.argv[2]==='prepare'){
   await page.evaluate(()=>{while(App.back()){};});await page.locator('[data-act="video"]').click();console.log('Opened system video chooser.');return;
  }
  await page.waitForFunction(()=>JSON.parse(SproutHost.status()).video.state==='ready',{},{timeout:20000});
  await page.getByRole('button',{name:'开始识别',exact:true}).click();
  await page.waitForFunction(()=>['done','error'].includes(JSON.parse(SproutHost.status()).video.state),{},{timeout:120000});
  const result=await page.evaluate(()=>{const video=JSON.parse(SproutHost.status()).video;return {video,record:JSON.parse(SproutHost.listGames()).find(r=>r.id===video.gameId)};});
  assert.equal(result.video.state,'done',JSON.stringify(result));assert.deepEqual(result.record.moves,['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6']);assert.equal(result.record.issues.filter(i=>!i.resolved).length,0);
  await page.waitForFunction(()=>App.state.route==='review');await page.evaluate(()=>{while(App.back()){};});await page.reload();await page.waitForFunction(()=>window.App);assert.equal(await page.evaluate(()=>App.state.route),'home');
  fs.writeFileSync(path.join(out,'android-video-results.json'),JSON.stringify({passed:true,scope:'controlled video fixture',...result},null,2));
  console.log('PASS: system video picker, native video decoding, board calibration and six exact plies.');
 }finally{await browser.close();run('forward','--remove','tcp:'+port);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
