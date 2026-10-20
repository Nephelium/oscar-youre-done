const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
async function main(){
 const browser=await pw.chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const action=async a=>page.locator(`[data-act="${a}"]`).first().click(),out=path.resolve(__dirname,'../android/recorder/build/reports');
 async function entry(elo,at,note=''){await action('addRating');await page.locator('#rating-value').fill(elo);await page.locator('#rating-at').fill(at);await page.locator('#rating-note').fill(note);await action('saveRating');}
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);await page.waitForFunction(()=>window.App);
  assert.equal(await page.locator('.brand-mark img').count(),1);assert.ok(await page.locator('.brand-mark img').evaluate(e=>e.complete&&e.naturalWidth>0));
  await page.locator('[data-route="growth"]').first().click();await entry('820','2026-10-20T12:00','今天看到了一步好棋');await entry('800','2026-10-18T12:00');await entry('810','2026-10-19T12:00');
  assert.equal(await page.locator('.rating-row').count(),3);assert.match(await page.locator('.elo-current').textContent(),/^820/);
  await page.locator('.rating-row').first().click();await page.locator('#rating-value').fill('825');await action('saveRating');assert.match(await page.locator('.elo-current').textContent(),/^825/);
  await action('addRating');await action('saveRating');assert.match(await page.locator('#modal-error').textContent(),/填写/);await action('close');
  await page.locator('.rating-row').nth(1).click();await action('deleteRating');await action('close');assert.equal(await page.locator('.rating-row').count(),3);
  await page.locator('.rating-row').nth(1).click();await action('deleteRating');await action('confirmDeleteRating');assert.equal(await page.locator('.rating-row').count(),2);
  await page.screenshot({path:path.join(out,'oscar-growth-390.png'),fullPage:true});const downloadPromise=page.waitForEvent('download');await action('backup');const download=await downloadPromise;await download.saveAs(path.join(out,'growth-backup.json'));const backup=JSON.parse(fs.readFileSync(path.join(out,'growth-backup.json'),'utf8'));assert.deepEqual(backup.elo.map(e=>e.elo),[800,825]);
  await page.evaluate(()=>localStorage.removeItem('sprout.elo.v1'));await page.reload();await page.waitForFunction(()=>window.App);await action('import');await page.locator('#import-text').fill(JSON.stringify(backup));await action('importText');assert.equal(await page.locator('.rating-row').count(),2);
  await page.locator('[data-route="home"]').first().click();assert.match(await page.locator('.elo-home').textContent(),/825 Elo/);await page.screenshot({path:path.join(out,'oscar-home-elo-390.png'),fullPage:true});
  await action('import');await page.locator('#import-text').fill('1. e4 e5 2. Nf3 Nc6');await action('importText');
  await page.evaluate(()=>{const r=App.state.current,values=[0,0,120,-120,400];Sprout.timeline(r).forEach((row,i)=>{r.analysis[row.fen]={engine:'UI fixture',lines:[{cp:values[i],mate:null,depth:10,pv:i===0?['e2e4']:[]}]};});});
  const squares=['e4','e5','f3','c6'],symbols=['!','?!','?','??'];
  for(let i=0;i<4;i++){await action('next');assert.equal(await page.locator(`[data-square="${squares[i]}"] .piece-review`).textContent(),symbols[i]);}
  assert.ok((await page.locator('.curve').first().boundingBox()).height>=200);await page.locator('[data-scale="5"]').first().click();assert.match(await page.locator('.curve').first().getAttribute('aria-label'),/5 兵/);
  await action('flip');assert.equal(await page.locator('[data-square="c6"] .piece-review').textContent(),'??');await page.screenshot({path:path.join(out,'oscar-review-annotations-390.png'),fullPage:true});
  await page.locator('.curve [data-ply="3"]').first().click();assert.equal(await page.evaluate(()=>App.state.ply),3);assert.equal(await page.locator('[data-square="f3"] .piece-review').textContent(),'?');
  await page.locator('[data-square="d7"]').click();await page.locator('[data-square="d5"]').click();assert.equal(await page.locator('.piece-review').count(),0);
  await action('home');await page.locator('[data-route="growth"]').first().click();
  for(const width of [320,360,412,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width}`);}
  await page.reload();await page.waitForFunction(()=>window.App);await page.locator('[data-route="growth"]').first().click();assert.equal(await page.locator('.rating-row').count(),2);assert.deepEqual(errors,[]);
  console.log('PASS: Elo backfill/edit/delete/backup/restore, icon, responsive curve scale/click, board badges/flip/branch.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
