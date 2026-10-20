const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
async function main(){
 const browser=await pw.chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844},colorScheme:'light'});
 const out=path.resolve(__dirname,'../android/recorder/build/reports'),url=pathToFileURL(path.resolve(__dirname,'../review/index.html')).href,errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(url);await page.locator('[data-act=demo]').click();await page.locator('[data-act=next]').click();
  const before=await page.evaluate(()=>({fen:App.state.current.moves.join(),ply:App.state.ply}));
  await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.appearance==='dark');
  await page.waitForFunction(()=>document.querySelector('#chessboard img').src.includes('-night-'));
  assert.deepEqual(await page.evaluate(()=>({fen:App.state.current.moves.join(),ply:App.state.ply})),before);
  assert.ok((await page.locator('#chessboard img').first().getAttribute('src')).includes('-night-'));
  await page.screenshot({path:path.join(out,'v131-night-review.png'),fullPage:true});
  await page.evaluate(()=>App.back());await page.locator('[data-route=settings]').click();
  await page.locator('#appearance-mode').selectOption('light');assert.equal(await page.locator('html').getAttribute('data-appearance'),'light');
  await page.reload();assert.equal(await page.locator('html').getAttribute('data-appearance'),'light');
  await page.locator('[data-route=settings]').click();await page.locator('#appearance-mode').selectOption('dark');
  await page.emulateMedia({colorScheme:'light'});assert.equal(await page.locator('html').getAttribute('data-appearance'),'dark');
  await page.locator('#appearance-mode').selectOption('system');assert.equal(await page.locator('html').getAttribute('data-appearance'),'light');
  const sets=await page.evaluate(()=>ChessThemes.pieces),shots=[];
  for(const p of sets)for(const mode of ['light','dark']){
   await page.evaluate(({p,mode})=>localStorage.setItem('sprout.settings.v1',JSON.stringify({...App.state.settings,pieceSet:p.id,boardTheme:'duo',appearance:mode})),{p,mode});
   await page.reload();await page.locator('[data-act=demo]').click();
   await page.locator('#chessboard img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));
   assert.equal(await page.locator('#chessboard img').evaluateAll(es=>es.every(e=>e.naturalWidth===384)),true);
   const name=`v131-${p.id}-${mode}.png`;await page.locator('#chessboard').screenshot({path:path.join(out,name)});
   shots.push({name,title:p.name,mode});
  }
  const preview=path.join(out,'v131-day-night.html');
  fs.writeFileSync(preview,`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:25px;background:#e8ede2;font:16px 'Microsoft YaHei';color:#33482d}h1{margin:0 0 5px;font-size:25px}p{margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:16px}article{border-radius:13px;padding:10px;background:#fffdf5}article.dark{background:#162022;color:#edf3f6}img{width:100%;display:block}h2{font-size:16px;margin:7px 0}.grid article:nth-child(even){grid-row:2}</style><h1>五套棋子 · 日夜外观</h1><p>日间在上，夜间在下。多邻国 100%，其他四套 112%，可按风格独立调整。</p><div class="grid">${shots.map(s=>`<article class="${s.mode}"><img src="${s.name}"><h2>${s.title}</h2></article>`).join('')}</div>`);
  await page.setViewportSize({width:1500,height:800});await page.goto(pathToFileURL(preview).href);await page.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));
  await page.screenshot({path:path.join(out,'v131-day-night-preview.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: system appearance, manual override/persistence, live position preservation and 120 day/night sprites. Preview saved.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
