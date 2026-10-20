// Export presentation screenshots from verified game data, with Elo clearly marked as sample data.
const path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
async function main(){
 const out=path.resolve(__dirname,'../android/recorder/build/reports/public-assets');fs.mkdirSync(out,{recursive:true});
 const record=require('../review/core.js').demo();record.id='public-example';record.source='多邻国 · 实战示例';record.title='对奥斯卡的一局';
 const browser=await pw.chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);await page.evaluate(record=>{localStorage.setItem('sprout.games.v1',JSON.stringify([record]));localStorage.setItem('sprout.elo.v1',JSON.stringify([{id:'sample1',elo:500,at:'2026-10-10T20:00',note:'演示数据',createdAt:1},{id:'sample2',elo:515,at:'2026-10-13T20:00',note:'演示数据',createdAt:2},{id:'sample3',elo:505,at:'2026-10-15T20:00',note:'演示数据',createdAt:3},{id:'sample4',elo:540,at:'2026-10-20T20:00',note:'演示数据',createdAt:4}]));},record);await page.reload();
  await page.screenshot({path:path.join(out,'home.png')});await page.locator('[data-route="growth"]').first().click();await page.screenshot({path:path.join(out,'growth.png')});
  await page.locator('[data-route="games"]').first().click();await page.locator(`[data-open="${record.id}"]`).click();await page.locator('[data-act="last"]').click();await page.screenshot({path:path.join(out,'review.png')});
  await page.locator('[data-tab="moves"]').first().click();await page.screenshot({path:path.join(out,'curve.png'),fullPage:true});console.log('Saved public screenshots: actual live game review, sample Elo labelled in history.');
  await page.locator('[data-act="home"]').click();await page.locator('[data-route="settings"]').click();
  await page.locator('.appearance-card').screenshot({path:path.join(out,'appearance.png')});
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
