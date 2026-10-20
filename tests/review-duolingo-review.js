const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {connect,run}=require('./review-android-helper.cjs'),out=path.resolve(__dirname,'../android/recorder/build/reports');
async function main(){
 const c=await connect(),errors=[];c.page.on('pageerror',e=>errors.push(e.message));
 try{
  const {page}=c;
  await page.evaluate(()=>{while(App.back()){};});
  const live=JSON.parse(fs.readFileSync(path.join(out,process.argv[2]||'duolingo-live-v110-complete.json'),'utf8')).record,count=live.moves.length;
  const id=live.id;
  assert.ok(id,'Actual Duolingo reference record must exist');
  await page.locator('[data-route="games"]').first().click();await page.locator('[data-book="game"]').click();await page.locator(`[data-open="${id}"]`).click();
  await page.locator('[data-act="analyzeAll"]').first().click();
  await page.waitForFunction(()=>!App.state.busy,{},{timeout:120000});
  const result=await page.evaluate(()=>({record:App.state.current,summary:Sprout.summary(App.state.current),status:JSON.parse(SproutHost.status()),pgn:Sprout.toPgn(App.state.current)}));
  assert.equal(Object.keys(result.record.analysis).length,count+1);assert.equal(result.summary.analyzed,Math.ceil(count/2));assert.equal(result.summary.total,Math.ceil(count/2));
  assert.ok(Object.values(result.record.analysis).every(a=>a.lines.length&&a.engine.includes('Stockfish')));
  assert.deepEqual(result.record.moves,live.moves);
  await page.locator('[data-act="last"]').click();await page.screenshot({path:path.join(out,'duolingo-stockfish-complete.png')});
  await page.locator('[data-act="first"]').click();await page.locator('[data-square="d2"]').click();await page.locator('[data-square="d4"]').click();
  await page.locator('[data-act="engineMove"]').click();await page.waitForFunction(()=>!App.state.busy&&App.state.branch.length===2,{},{timeout:60000});
  await page.locator('[data-act="saveBranch"]').click();assert.equal(await page.evaluate(()=>App.state.current.moves.length),count);
  await page.screenshot({path:path.join(out,'duolingo-stockfish-variation.png')});
  await page.reload();await page.waitForFunction(()=>window.App&&App.state.current);assert.equal(await page.evaluate(()=>App.state.current.moves.length),count);
  assert.ok(await page.evaluate(()=>App.state.current.branches.length)>0);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,process.argv[3]||'duolingo-review-results.json'),JSON.stringify({passed:true,scope:'actual captured Duolingo game frames, native Stockfish review and variation',...result,errors},null,2));
  fs.writeFileSync(path.join(out,'duolingo-complete.pgn'),result.pgn);console.log('PASS: fresh live game, all real engine positions and own moves, independent saved engine variation, reload and PGN.');
 }finally{await c.browser.close();run('forward','--remove','tcp:'+c.port);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
