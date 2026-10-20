const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
async function main(){
 const browser=await pw.chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,reducedMotion:'reduce'});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);await page.waitForFunction(()=>window.App);
  await page.evaluate(()=>{
   const full=Sprout.validate({id:'qa_full',title:'完整对局保留样本',moves:['e2e4','e7e5']}),practice=Sprout.validate({id:'qa_practice',title:'升变练习',initialFen:'7k/P7/8/8/8/8/8/7K w - - 0 1',moves:[]});
   delete full.notebook;delete practice.notebook;localStorage.setItem('sprout.games.v1',JSON.stringify([full,practice]));
  });await page.reload();await page.waitForFunction(()=>window.App);
  assert.match(await page.title(),/奥斯卡你完了/);await page.screenshot({path:'android/recorder/build/reports/oscar-home-390.png',fullPage:true});
  await page.locator('[data-route="games"]').first().click();assert.equal(await page.locator('[data-open="qa_full"]').count(),1);assert.equal(await page.locator('[data-open="qa_practice"]').count(),0);
  await page.locator('[data-book="practice"]').click();assert.equal(await page.locator('[data-open="qa_full"]').count(),0);assert.equal(await page.locator('[data-open="qa_practice"]').count(),1);
  await page.screenshot({path:'android/recorder/build/reports/oscar-notebooks-390.png',fullPage:true});
  await page.locator('[data-open="qa_practice"]').click();await page.locator('[data-act="rename"]').first().click();
  await page.screenshot({path:'android/recorder/build/reports/oscar-manage-390.png'});await page.locator('#game-notebook').selectOption('game');await page.locator('[data-act="saveTitle"]').click();
  await page.locator('[data-act="home"]').click();assert.equal(await page.locator('[data-open]').count(),2);
  await page.locator('[data-open="qa_practice"]').click();await page.locator('[data-act="rename"]').first().click();await page.locator('[data-act="deleteRecord"]').click();await page.locator('[data-act="close"]').first().click();assert.ok(await page.evaluate(()=>App.state.current));
  await page.locator('[data-act="rename"]').first().click();await page.locator('[data-act="deleteRecord"]').click();await page.locator('[data-act="confirmDelete"]').click();
  assert.equal(await page.locator('[data-open="qa_full"]').count(),1);assert.equal(await page.locator('[data-open="qa_practice"]').count(),0);
  await page.reload();await page.waitForFunction(()=>window.App);const records=await page.evaluate(()=>JSON.parse(localStorage.getItem('sprout.games.v1')));assert.equal(records.length,1);assert.deepEqual(records[0].moves,['e2e4','e7e5']);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);console.log('PASS: rename, legacy notebook classification, notebook transfer, cancel/delete, other record retention and reload.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
