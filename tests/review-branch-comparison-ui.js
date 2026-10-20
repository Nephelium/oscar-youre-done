const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
const pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const S=require('../review/core.js');
async function main(){
 const browser=await pw.chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
 const r=S.importText('1. e4 e5 2. Nf3 Nc6 *')[0];r.id='branch-comparison';
 const a=S.addBranch(r,0,['d2d4','d7d5','c2c4']),b=S.addBranch(r,2,['f1c4','g8f6','d2d3','f8c5']);
 S.timeline(r).forEach(row=>r.analysis[row.fen]={engine:'fixture',budget:600,lines:[{cp:20,wdl:[200,650,150],depth:16,pv:[]}]});
 [a,b].forEach((branch,i)=>S.variationRows(r,branch.at,branch.moves).slice(branch.at+1).forEach((row,j)=>r.analysis[row.fen]={engine:'fixture',budget:600,lines:[{cp:(i?-1:1)*(j+1)*40,wdl:i?[100,600,300]:[300,600,100],depth:16,pv:[]}]}));
 r.branches.unshift({...a,id:'redundant-short',moves:a.moves.slice(0,1)});
 await page.addInitScript(r=>{
  localStorage.setItem('sprout.games.v1',JSON.stringify([r]));
  localStorage.setItem('sprout.view.v1',JSON.stringify({id:r.id,route:'review',ply:0,tab:'analysis'}));
  localStorage.setItem('sprout.settings.v1',JSON.stringify({autoAnalysis:false,animations:false}));
 },r);
 page.on('pageerror',e=>errors.push(e.message));
 const act=async a=>page.locator(`[data-act="${a}"]`).first().click();
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);
  assert.equal(await page.evaluate(()=>App.state.current.branches.length),2);
  await page.locator('.curve-branches summary').click();
  await page.locator(`[data-act="curveBranch"][data-id="${a.id}"]`).click();
  await page.locator(`[data-act="curveBranch"][data-id="${b.id}"]`).click();
  await page.waitForFunction(()=>document.querySelectorAll('.saved-branch-line').length===2);
  const colors=await page.locator('.saved-branch-line').evaluateAll(els=>els.map(e=>e.getAttribute('stroke')));
  assert.equal(new Set(colors).size,2);assert.equal(await page.locator('#curve-scrub').getAttribute('max'),'6');
  const first=page.locator(`[data-saved-branch="${a.id}"][data-branch-ply="2"]`);
  const yWhite=Number(await first.locator('circle').last().getAttribute('cy'));
  await act('flip');
  const yBlack=Number(await first.locator('circle').last().getAttribute('cy'));
  const height=await page.locator('.curve').evaluate(e=>e.getBoundingClientRect().height);
  assert.ok(Math.abs(yWhite+yBlack-(height-16))<.1);
  await page.locator('[data-act="curveMode"][data-value="win"]').click();
  assert.match(await first.getAttribute('aria-label'),/10.0%/);
  await first.scrollIntoViewIfNeeded();
  const point=await first.locator('circle').last().boundingBox();
  await page.mouse.click(point.x+point.width/2,point.y+point.height/2);
  assert.equal(await page.evaluate(()=>App.state.branchAt),0);
  assert.equal(await page.evaluate(()=>App.state.branchPly),2);
  assert.equal(await page.evaluate(()=>Sprout.position(App.state.current,App.state.branchAt,App.state.branch.slice(0,App.state.branchPly)).fen()),S.position(r,0,a.moves.slice(0,2)).fen());
  await page.locator(`[data-act="curveBranch"][data-id="${a.id}"]`).click();
  assert.equal(await page.locator('.saved-branch-line').count(),1);
  const out=path.resolve(__dirname,'../android/recorder/build/reports');
  await page.locator('.curve-branches').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'v132-branch-comparison.png')});
  for(const size of [{width:320,height:740},{width:844,height:390}]){
   await page.setViewportSize(size);await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   assert.ok(await page.locator('.saved-branch-line').count());
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: prefix deduplication, multi-branch curves, common time axis, perspective, win mode, point navigation and responsive layout.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
