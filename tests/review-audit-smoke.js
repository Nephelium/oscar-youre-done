const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
async function main(){
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.statusFixture={engine:'Audit fixture',capture:{running:false},video:{state:'idle'},overlay:true};
  window.requests=[];window.updateCalls=[];window.openedRelease=0;
  window.SproutHost={
   listGames:()=>localStorage.getItem('sprout.games.v1')||'[]',status:()=>JSON.stringify(statusFixture),
   saveGame:text=>{const r=JSON.parse(text),list=JSON.parse(localStorage.getItem('sprout.games.v1')||'[]').filter(x=>x.id!==r.id);list.push(r);localStorage.setItem('sprout.games.v1',JSON.stringify(list));return '';},
   cancelAnalysis:()=>{},analyze:(id,gameId,fen,budget)=>requests.push({id,gameId,fen,budget}),
   checkUpdate:force=>updateCalls.push(force),openRelease:()=>openedRelease++
  };
 });
 const act=async a=>page.locator(`[data-act="${a}"]`).first().click();
 const move=async(a,b)=>{for(const square of [a,b])await page.locator(`[data-square="${square}"]`).click();};
 const seed=async r=>{await page.evaluate(r=>{
  const record=Sprout.validate(r);localStorage.setItem('sprout.games.v1',JSON.stringify([record]));
  localStorage.setItem('sprout.settings.v1',JSON.stringify({autoAnalysis:false,animation:false,autoUpdate:false}));
  localStorage.setItem('sprout.view.v1',JSON.stringify({route:'home'}));
 },r);await page.reload();await page.locator(`[data-open="${r.id}"]`).first().click();};
 const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sprout.games.v1'))[0]);
 const respond=async(index,depth=8)=>page.evaluate(({index,depth})=>{const q=requests[index];App.hostEvent({type:'analysis',id:q.id,result:{engine:'Audit fixture',budget:q.budget,lines:[{depth,cp:5,wdl:[200,600,200],pv:[]}]}});},{index,depth});
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);
  await seed({id:'audit-correction',source:'校对测试',moves:[],issues:[{at:0,message:'遗漏走法'}]});
  for(const a of ['issues','issue','beginCorrection'])await act(a);
  await move('e2','e4');await move('e7','e5');await act('prev');
  assert.equal(await page.evaluate(()=>App.state.branchPly),1);
  await act('saveCorrection');assert.match(await page.locator('.modal-copy').textContent(),/补录的 1 步/);
  await act('confirmCorrection');assert.deepEqual((await stored()).moves,['e2e4']);
  // Earlier deep evaluation survives a new shorter manual search and persistence.
  await seed({id:'audit-depth',source:'导入',moves:[],analysis:{[require('../review/core.js').START]:{engine:'Audit fixture',budget:200,lines:[{depth:24,cp:80,wdl:[400,500,100],pv:['e2e4']}]}}});
  await act('analyzeHere');await page.waitForFunction(()=>requests.length===1);await respond(0);
  await page.waitForFunction(()=>!App.state.busy);assert.equal(Object.values((await stored()).analysis)[0].lines[0].depth,24);
  // Completed positions remain saved when the next position is paused.
  await seed({id:'audit-partial',source:'导入',moves:['e2e4','e7e5']});
  await act('analyzeAll');await page.waitForFunction(()=>requests.length===1);await respond(0,16);
  await page.waitForFunction(()=>requests.length===2);await act('pauseAnalysis');
  assert.equal(Object.keys((await stored()).analysis).length,1);
  // Running importer owns only its own record. Moving cannot mutate its draft.
  await page.evaluate(()=>statusFixture.video={state:'processing',gameId:'audit-partial'});
  await move('d2','d4');assert.equal(await page.evaluate(()=>App.state.branch.length),0);
  assert.match(await page.locator('#toast').textContent(),/停止录屏导入/);
  await page.evaluate(()=>statusFixture.video={state:'idle'});
  // Adaptive search has idle gaps with no pending promise. Pausing there must keep both quick evaluations.
  await seed({id:'audit-adaptive',source:'导入',moves:[]});
  await page.evaluate(()=>App.state.settings.autoAnalysis=true);await move('e2','e4');
  await page.waitForFunction(()=>requests.length===1);await respond(0);
  await page.waitForFunction(()=>requests.length===2);await respond(1);
  await page.waitForFunction(()=>Object.keys(App.state.current.analysis).length===2);
  assert.equal(await page.evaluate(()=>requests.length),2);await page.evaluate(()=>App.pause());
  assert.equal(Object.keys((await stored()).analysis).length,2);
  // Startup disabled, explicit enable, available/latest/error states, download, persisted toggle.
  await page.evaluate(()=>{while(App.back()){};});await page.locator('[data-route=settings]').click();
  await page.waitForTimeout(1300);assert.deepEqual(await page.evaluate(()=>updateCalls),[]);
  await act('autoUpdate');assert.deepEqual(await page.evaluate(()=>updateCalls),[false]);
  await page.evaluate(()=>App.hostEvent({type:'updateCheck',result:{state:'update',version:'1.3.8'}}));
  assert.equal(await page.locator('.update-banner').count(),1);await act('downloadUpdate');assert.equal(await page.evaluate(()=>openedRelease),1);
  await act('checkUpdate');assert.equal(await page.locator('[data-act=checkUpdate]').isDisabled(),true);
  await page.evaluate(()=>App.hostEvent({type:'updateCheck',result:{state:'error',message:'网络不可用'}}));
  assert.match(await page.locator('.update-settings').textContent(),/网络不可用/);assert.equal(await page.locator('.update-banner').count(),1);
  await act('checkUpdate');await page.evaluate(()=>App.hostEvent({type:'updateCheck',result:{state:'latest',version:'1.3.7'}}));
  assert.equal(await page.locator('.update-banner').count(),0);assert.match(await page.locator('.update-settings').textContent(),/最新/);
  await act('autoUpdate');await page.reload();await page.waitForTimeout(1300);assert.deepEqual(await page.evaluate(()=>updateCalls),[]);
  assert.deepEqual(errors,[]);console.log('PASS: correction cursor, deep-cache preservation, partial/adaptive-gap persistence, import ownership, update switch/latest/new/offline/download.');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
