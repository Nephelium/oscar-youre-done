const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const root=path.resolve(__dirname,'..'),out=path.join(root,'android/recorder/build/reports');
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const browser=await pw.chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const act=name=>page.locator(`[data-act="${name}"]`).click();
 const open=()=>act('export');
 try{
  await page.goto(pathToFileURL(path.join(root,'review/index.html')).href);
  await act('import');await page.locator('#import-text').fill('[Event "导出方案测试"]\n\n1. e4 e5 2. Nf3 Nc6 *');await act('importText');
  // Export the full saved mainline, even while viewing a different cursor or variation.
  await page.locator('[data-square="d2"]').click();await page.locator('[data-square="d4"]').click();
  await open();assert.equal(await page.locator('[data-act="exportGame"]').count(),0);
  assert.equal(await page.locator('.export-actions button').count(),4);
  for(const [action,extension,expected] of [['exportPgn','pgn','1. e4 e5 2. Nf3 Nc6 *'],['exportSan','txt','1. e4 e5 2. Nf3 Nc6 *']]){
   if(!await page.locator('#modal').evaluate(e=>e.open))await open();
   const waiting=page.waitForEvent('download');await act(action);const file=await waiting;
   assert.equal(file.suggestedFilename(),'导出方案测试.'+extension);
   const dest=path.join(out,'export-options.'+extension);await file.saveAs(dest);const text=fs.readFileSync(dest,'utf8');
   if(extension==='txt')assert.equal(text,expected);else {assert.match(text,/\[Event "导出方案测试"\]/);assert.deepEqual(require('../review/core.js').importText(text)[0].moves,['e2e4','e7e5','g1f3','b8c6']);}
  }
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedNotation=text;}}}));
  for(const action of ['copySan','copyPgn']){
   await open();await act(action);await page.waitForFunction(()=>!document.querySelector('#modal').open);
   const text=await page.evaluate(()=>window.copiedNotation);assert.ok(text.includes('1. e4 e5 2. Nf3 Nc6 *'));assert.match(await page.locator('#toast').textContent(),/已复制/);
   assert.equal(text.includes('[Event'),action==='copyPgn');
  }
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('denied');};document.execCommand=command=>{window.fallbackText=document.activeElement.value;return command==='copy';};});
  await open();await act('copySan');assert.equal(await page.evaluate(()=>window.fallbackText),'1. e4 e5 2. Nf3 Nc6 *');
  await page.evaluate(()=>{document.execCommand=()=>false;});await open();await act('copySan');
  assert.equal(await page.locator('#modal').evaluate(e=>e.open),true);assert.match(await page.locator('#modal-error').textContent(),/无法复制/);await act('close');
  for(const [width,height,night] of [[320,568,false],[390,844,false],[844,390,false],[390,844,true]]){
   await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:night?'dark':'light'});await open();
   const overflow=await page.evaluate(()=>{const d=document.querySelector('#modal');return d.scrollWidth>d.clientWidth+1||document.documentElement.scrollWidth>innerWidth;});assert.equal(overflow,false);
   for(const b of await page.locator('.export-actions button').all()){const box=await b.boundingBox();assert.ok(box.width>=44&&box.height>=44);}
   await page.screenshot({path:path.join(out,`export-options-${width}x${height}${night?'-night':''}.png`)});await act('close');
  }
  await page.evaluate(()=>{const r=App.state.current;r.initialFen='4k3/8/8/8/8/8/4K3/7R b - - 0 23';r.moves=['e8d7','h1h7'];r.issues=[{message:'needs correction'}];});
  await open();assert.match(await page.locator('#modal').textContent(),/只含走法/);assert.match(await page.locator('#modal .notice').textContent(),/已确认/);await act('close');
  await act('home');await page.locator('[data-route="games"]').first().click();assert.equal(await page.locator('[data-act="backup"]').count(),1);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'export-options-results.json'),JSON.stringify({passed:true,checks:['PGN and SAN file payloads','four actions','saved mainline scope','clipboard success and fallback','clipboard failure remains actionable','320px landscape and night layout','nonstandard start guidance','unresolved mainline warning','global backup retained'],errors},null,2));
  console.log('PASS: export files, both copy formats, fallback/error handling, responsive layouts and backup compatibility.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
