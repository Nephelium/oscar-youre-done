const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
async function main(){
 const browser=await pw.chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 const out=path.resolve(__dirname,'../android/recorder/build/reports'),url=pathToFileURL(path.resolve(__dirname,'../review/index.html')).href;
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(url);const T=await page.evaluate(()=>({pieces:ChessThemes.pieces,boards:ChessThemes.boards}));
  await page.locator('[data-route=settings]').click();
  assert.equal(await page.locator('#piece-size').inputValue(),'100');
  await page.locator('[data-act=pieceSet][data-value=classic]').click();assert.equal(await page.locator('#piece-size').inputValue(),'112');
  await page.locator('#piece-size').evaluate(e=>{e.value=125;e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('#piece-size-value').textContent(),'125%');
  await page.locator('[data-act=pieceSet][data-value=duo]').click();assert.equal(await page.locator('#piece-size').inputValue(),'100');
  await page.reload();await page.locator('[data-route=settings]').click();await page.locator('[data-act=pieceSet][data-value=classic]').click();assert.equal(await page.locator('#piece-size').inputValue(),'125');
  await page.locator('[data-route=home]').click();await page.locator('[data-act=demo]').click();
  const bounds=await page.locator('[data-square=e1] img').evaluate(e=>{const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return a.width/b.width;});
  assert.ok(Math.abs(bounds-1.1375)<.02,`actual size ${bounds}`);
  assert.equal(await page.locator('#chessboard').evaluate(e=>Math.abs(e.clientWidth-e.clientHeight)<2),true);
  await page.evaluate(()=>{while(App.back()){};});await page.locator('[data-route=settings]').click();await page.locator('[data-act=resetPieceSize]').click();assert.equal(await page.locator('#piece-size').inputValue(),'112');
  const shots=[];
  for(const [i,b] of T.boards.entries()){
   const p=T.pieces[i%T.pieces.length];
   await page.evaluate(({b,p})=>{localStorage.setItem('sprout.settings.v1',JSON.stringify({...App.state.settings,pieceSet:p.id,boardTheme:b.id}));}, {b,p});
   await page.reload();await page.locator('[data-act=demo]').click();
   await page.locator('#chessboard img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));
   assert.equal(await page.locator('#chessboard [data-piece]').count(),32);
   assert.equal(await page.locator('#chessboard img').evaluateAll(es=>es.every(e=>e.naturalWidth===384)),true);
   const before=await page.locator('[data-square=a8]').evaluate(e=>getComputedStyle(e,':before').backgroundImage);
   assert.equal(before==='none',!b.texture);
   const name=`v131-theme-${b.id}.png`;await page.locator('#chessboard').screenshot({path:path.join(out,name)});
   shots.push({name,title:b.name,subtitle:p.name});
  }
  const preview=path.join(out,'v131-themes.html');
  fs.writeFileSync(preview,`<!doctype html><meta charset="utf-8"><title>奥斯卡你完了 · 外观</title><style>body{margin:0;padding:32px;background:#faf8f1;color:#2f4334;font:16px 'Microsoft YaHei',sans-serif}h1{font-size:27px;margin:0 0 6px}p{margin:0 0 25px;color:#78816c}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}img{width:100%;display:block;border-radius:9px}h2{font-size:18px;margin:12px 0 3px}small{color:#7b8272}article{padding:12px;background:#fffef9;border-radius:15px;border:1px solid #e3e5da}</style><h1>8 款棋盘 × 5 套棋子</h1><p>多邻国、鼠尾草保留，棋子与棋盘可自由搭配。</p><div class="grid">${shots.map(s=>`<article><img src="${s.name}"><h2>${s.title}</h2><small>搭配：${s.subtitle}</small></article>`).join('')}</div>`);
  await page.setViewportSize({width:1250,height:900});await page.goto(pathToFileURL(preview).href);await page.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));
  await page.screenshot({path:path.join(out,'v131-themes-preview.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: all five raster sets, eight board themes, texture switching and readable 32-piece boards. Preview saved.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
