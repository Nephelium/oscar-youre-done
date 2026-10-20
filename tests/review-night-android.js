const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const {connect,run,adb}=require('./review-android-helper.cjs'),out=path.resolve(__dirname,'../android/recorder/build/reports');
async function main(){
 const {browser,page,port}=await connect(),previous=run('shell','cmd','uimode','night'),mode=previous.match(/Night mode:\s*(\w+)/i)?.[1];
 assert.ok(['yes','no','auto','custom'].includes(mode),previous);
 const setting=await page.evaluate(()=>App.state.settings.appearance||'system');
 try{
  await page.evaluate(()=>{while(App.back()){};});await page.locator('[data-route=settings]').click();await page.locator('#appearance-mode').selectOption('system');
  await page.locator('[data-route=home]').click();await page.locator('[data-act=demo]').click();await page.locator('[data-act=next]').click();
  const before=await page.evaluate(()=>({id:App.state.current.id,ply:App.state.ply}));
  for(const [value,expected] of [['yes','dark'],['no','light']]){
   run('shell','cmd','uimode','night',value);
   await page.waitForFunction(e=>document.documentElement.dataset.appearance===e,expected);
   await page.waitForFunction(e=>document.querySelector('#chessboard img').src.includes('-night-')===(e==='dark'),expected);
   assert.deepEqual(await page.evaluate(()=>({id:App.state.current.id,ply:App.state.ply})),before);
   assert.equal(await page.evaluate(()=>JSON.parse(SproutHost.status()).nightMode),expected==='dark');
   fs.writeFileSync(path.join(out,`v131-native-${expected}.png`),execFileSync(adb,['exec-out','screencap','-p'],{maxBuffer:20*1024*1024}));
  }
  console.log('PASS: Android system day/night changes update artwork and UI without recreating the review position.');
 }finally{
  run('shell','cmd','uimode','night',mode);
  await page.evaluate(()=>{while(App.back()){};});await page.locator('[data-route=settings]').click();await page.locator('#appearance-mode').selectOption(setting);await page.locator('[data-route=home]').click();
  await browser.close();run('forward','--remove',`tcp:${port}`);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
