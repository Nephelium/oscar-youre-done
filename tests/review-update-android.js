const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),helper=require('./review-android-helper.cjs');
(async()=>{
 const {browser,page,port}=await helper.connect();
 try{
  await page.evaluate(()=>{while(App.back()){};window.updateResults=[];const original=App.hostEvent;App.hostEvent=e=>{if(e.type==='updateCheck')updateResults.push(e.result);original(e);};});
  await page.locator('[data-route=settings]').click();await page.locator('[data-act=checkUpdate]').click();
  await page.waitForFunction(()=>updateResults.length>0,{},{timeout:25000});
  const first=await page.evaluate(()=>updateResults[0]);assert.equal(first.state,'latest',JSON.stringify(first));assert.equal(first.currentVersion,'1.3.7');assert.ok(first.checkedAt>0);assert.equal(first.cached,false);
  await page.evaluate(()=>SproutHost.checkUpdate(false));await page.waitForFunction(()=>updateResults.length===2);
  const cached=await page.evaluate(()=>updateResults[1]);assert.equal(cached.cached,true);assert.equal(cached.checkedAt,first.checkedAt);
  await page.screenshot({path:path.resolve(__dirname,'../android/recorder/build/reports/v137-update-android.png')});
  fs.writeFileSync(path.resolve(__dirname,'../android/recorder/build/reports/v137-update-result.json'),JSON.stringify({first,cached},null,2));
  console.log('PASS: installed APK queried GitHub, compared installed version, displayed result, reused daily cache. Remote: '+first.version);
 }finally{await browser.close();helper.run('forward','--remove','tcp:'+port);}
})().catch(e=>{console.error(e);process.exitCode=1;});
