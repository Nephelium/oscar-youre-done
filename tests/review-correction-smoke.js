const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
async function main(){
 const native=process.env.CORRECTION_ANDROID==='1';
 const connection=native?await require('./review-android-helper.cjs').connect():null;
 const browser=connection?.browser||await pw.chromium.launch({channel:'msedge',headless:true});
 const page=connection?.page||await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const act=async(a)=>page.locator(`[data-act="${a}"]`).first().click();
 try{
  if(!native)await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);
  const ids=await page.evaluate(()=>{
   while(App.back()){};
   localStorage.setItem('sprout.settings.v1',JSON.stringify({...App.state.settings,autoAnalysis:false,animation:false}));
   const base='correction-'+Date.now(),moves=['f2f3','e7e5','g2g4'];
   const tail={at:3,message:'结束前的画面未能确认，请核对最后几步是否完整',resolved:false};
   const records=[
    {id:base+'-missing',title:'补录回归',moves,issues:[tail,{at:0,message:'其他疑点',placement:'8/8/8/8/8/8/8/8',resolved:false}]},
    {id:base+'-legacy',title:'旧终局回归',moves:moves.concat('d8h4'),issues:[tail]},
    {id:base+'-animation',title:'旧动画误报回归',moves:moves.concat('d8h4'),issues:[{at:4,message:'动画疑点',placement:'8/8/8/8/8/8/8/8',resolved:false}]}
   ].map(r=>({...r,initialFen:Sprout.START,side:'b',source:'校对测试',result:'*',createdAt:Date.now(),updatedAt:Date.now()}));
   if(window.SproutHost){for(const r of records){const error=SproutHost.saveGame(JSON.stringify(r));if(error)throw Error(error);}}
   else localStorage.setItem('sprout.games.v1',JSON.stringify(records));
   localStorage.setItem('sprout.view.v1',JSON.stringify({route:'home'}));return records.map(r=>r.id);
  });
  await page.reload();await page.waitForFunction(()=>window.App);
  await page.locator(`[data-open="${ids[0]}"]`).first().click();
  for(const a of ['issues','issue','beginCorrection'])await act(a);
  for(const square of ['d8','h4'])await page.locator(`[data-square="${square}"]`).click();
  await page.reload();await page.waitForFunction(()=>window.App?.state.correcting);
  for(const a of ['saveCorrection','confirmCorrection'])await act(a);
  let current=await page.evaluate(()=>App.state.current);
  assert.equal(current.result,'0-1');assert.deepEqual(current.issues.map(i=>!!i.resolved),[true,false]);
  assert.equal(current.revisions[0].issues[0].resolved,false);
  await page.reload();await page.waitForFunction(()=>window.App?.state.current);
  assert.equal(await page.evaluate(()=>App.state.current.result),'0-1');
  for(const a of ['issues','issue','reviewIssueComplete'])await act(a);
  await act('close');assert.equal(await page.evaluate(()=>App.state.current.issues[1].resolved),false);
  for(const a of ['issues','issue','reviewIssueComplete','confirmIssueComplete'])await act(a);
  assert.equal(await page.locator('[data-act="issues"]').count(),0);
  const exported=await page.evaluate(()=>({pgn:Sprout.toPgn(App.state.current),record:App.state.current}));
  assert.match(exported.pgn,/\[Result "0-1"\]/);assert.doesNotMatch(exported.pgn,/unresolved/);
  assert.equal(exported.record.revisions.length,2);
  const stored=await page.evaluate(id=>JSON.parse(window.SproutHost?SproutHost.listGames():localStorage.getItem('sprout.games.v1')).find(r=>r.id===id),ids[0]);
  assert.equal(stored.result,'0-1');assert.ok(stored.issues.every(i=>i.resolved));
  await act('home');await page.locator(`[data-open="${ids[1]}"]`).first().click();
  assert.equal(await page.locator('[data-act="issues"]').count(),0);
  assert.equal(await page.evaluate(()=>App.state.current.result),'0-1');
  await act('home');await page.locator(`[data-open="${ids[2]}"]`).first().click();
  for(const a of ['issues','issue','reviewIssueComplete','confirmIssueComplete'])await act(a);
  assert.equal(await page.locator('[data-act="issues"]').count(),0);
  assert.equal(await page.evaluate(()=>App.state.current.moves.length),4);
  await page.screenshot({path:path.resolve(__dirname,`../android/recorder/build/reports/v136-correction-${native?'android':'web'}.png`),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: '+(native?'installed Android':'direct-file UI')+' correction, resume, stored result, legacy warnings, selective confirmation/cancel and PGN.');
 }finally{await browser.close();if(connection)require('./review-android-helper.cjs').run('forward','--remove','tcp:'+connection.port);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
