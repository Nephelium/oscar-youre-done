const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {connect,run}=require('./review-android-helper.cjs'),S=require('../review/core.js');
async function main(){
 const c=await connect(),page=c.page;
 const record=S.importText('1. e4 e5 2. Nf3 Nc6 *')[0];
 record.title='分支对比验收';
 S.addBranch(record,0,['d2d4','d7d5','c2c4']);S.addBranch(record,2,['f1c4','g8f6']);
 try{
  await page.evaluate(()=>{while(App.back()){};});
  await page.locator('[data-route=settings]').click();await page.locator('#budget').selectOption('600');
  await page.locator('[data-route=home]').click();await page.locator('[data-act=import]').first().click();
  await page.locator('#import-text').fill(JSON.stringify(record));await page.locator('[data-act=importText]').click();
  await page.locator('.curve-branches summary').click();
  for(const b of record.branches)await page.locator(`[data-act=curveBranch][data-id="${b.id}"]`).click();
  await page.locator('[data-act=analyzeCompared]').click();
  await page.locator('[data-act=next]').click();assert.ok(await page.evaluate(()=>App.state.busy));
  await page.waitForFunction(()=>!App.state.busy,null,{timeout:60000});
  const evaluated=await page.evaluate(()=>App.state.current);
  for(const b of evaluated.branches)for(const row of S.variationRows(evaluated,b.at,b.moves).slice(b.at)){
   assert.match(row.evaluation.engine,/Stockfish/);assert.ok(S.probabilities(row.evaluation));
  }
  assert.equal(await page.locator('.saved-branch-line').count(),2);
  await page.locator('[data-act=curveMode][data-value=win]').click();
  await page.locator('.analysis-card').filter({has:page.locator('.curve')}).screenshot({path:path.resolve(__dirname,'../android/recorder/build/reports/v132-native-branch-comparison.png')});
  fs.writeFileSync(path.resolve(__dirname,'../android/recorder/build/reports/v132-native-branch-comparison.json'),JSON.stringify({passed:true,engine:'native Stockfish',record:evaluated},null,2));
  console.log('PASS: selected branches analyzed with native Stockfish while browsing; every branch FEN has score and WDL.');
 }finally{await c.browser.close();run('forward','--remove','tcp:'+c.port);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
