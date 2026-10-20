const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
async function main(){
 const browser=await pw.chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
 const out=path.resolve(__dirname,'../android/recorder/build/reports');fs.mkdirSync(out,{recursive:true});
 page.on('pageerror',e=>errors.push(e.message));
 const action=async a=>page.locator(`[data-act="${a}"]`).first().click();
 const importText=async text=>{await action('import');await page.locator('#import-text').fill(text);await action('importText');};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);
  await importText('1. e4 e5 2. Nf3 Nc6 *');
  await page.evaluate(()=>{
   const r=App.state.current;
   Sprout.timeline(r).forEach((row,i)=>{const game=new Chess(row.fen),move=game.moves({verbose:true})[0];r.analysis[row.fen]={engine:'UI fixture',budget:600,lines:[{cp:[0,125,300,-150,400][i],mate:i===3?-2:null,depth:14,pv:move?[Sprout.uci(move)]:[]}]};});
  });
  await action('next');
  const original=await page.evaluate(()=>JSON.stringify(App.state.current));
  assert.match(await page.locator('.board-caption .score-chip').textContent(),/白方 \+1.3/);
  const whiteCandidate=await page.locator('.candidate-score').first().textContent();
  const whiteY=await page.locator('.curve [data-ply="1"] circle').first().getAttribute('cy');
  await page.locator('.analysis-section').screenshot({path:path.join(out,'v111-review-white.png')});
  await action('flip');
  assert.match(await page.locator('.board-caption .score-chip').textContent(),/黑方 -1.3/);
  assert.equal(await page.locator('.candidate-score').first().textContent(),whiteCandidate.replace('+','-'));
  assert.match(await page.locator('.analysis-depth').textContent(),/黑方视角/);
  assert.match(await page.locator('.stats').textContent(),/黑方表现分/);
  assert.ok(await page.locator('.evaluation-bar').evaluate(e=>e.classList.contains('black-view')));
  assert.ok(Number(await page.locator('.curve [data-ply="1"] circle').first().getAttribute('cy'))>Number(whiteY));
  assert.equal(await page.evaluate(()=>JSON.stringify(App.state.current)),original);
  await page.locator('.analysis-section').screenshot({path:path.join(out,'v111-review-black.png')});
  await page.locator('.curve [data-ply="3"]').click();
  assert.equal(await page.locator('.analysis-heading .score-chip').textContent(),'M2');
  await action('flip');assert.equal(await page.locator('.analysis-heading .score-chip').textContent(),'−M2');
  assert.doesNotMatch(await page.locator('.analysis-copy').first().textContent(),/999|1000/);
  for(const width of [320,360,390,412,844,1280]){
   await page.setViewportSize({width,height:844});
   await page.waitForFunction(()=>{const s=document.querySelector('.curve');return Math.abs(s.viewBox.baseVal.width-s.getBoundingClientRect().width)<.1;});
   const dims=await page.locator('.curve text').first().evaluate(e=>{const t=e.getScreenCTM();return {x:t.a,y:t.d,font:parseFloat(getComputedStyle(e).fontSize)};});
   assert.ok(Math.abs(dims.x-1)<.001&&Math.abs(dims.y-1)<.001,JSON.stringify({width,dims}));
   assert.equal(dims.font,12);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`);
   assert.ok((await page.locator('.curve').boundingBox()).height>=200);
  }
  await page.setViewportSize({width:390,height:844});await action('home');
  await importText('1. f3 e5 2. g4 Qh4# 0-1');await action('last');
  assert.match(await page.locator('.analysis-heading h2').textContent(),/黑方完成将杀/);
  assert.equal(await page.locator('.analysis-heading .score-chip').textContent(),'负');
  assert.equal(await page.locator('.candidate').count(),0);assert.equal(await page.locator('[data-act="analyzeHere"]').count(),0);
  await action('flip');assert.equal(await page.locator('.analysis-heading .score-chip').textContent(),'胜');
  await action('home');
  await importText('[SetUp "1"]\n[FEN "7k/8/8/8/8/8/8/KR6 b - - 0 23"]\n\n23... Kg8 24. Rb2 Kf8 *');
  await page.locator('[data-tab="moves"]').first().click();
  assert.deepEqual(await page.locator('.move-no').allTextContents(),['23.','24.']);
  assert.equal(await page.locator('.move-pair').first().locator('.move-placeholder').count(),1);
  await action('next');await page.locator('[data-tab="analysis"]').first().click();
  assert.match(await page.locator('.analysis-heading small').textContent(),/第 23 回合 · 黑方/);
  await action('home');
  const legacy=await page.evaluate(()=>{
   const r=Sprout.importText('1. f3 e5 2. g4 Qh4# 0-1')[0];r.id='legacy-demo';r.source='演示棋谱';r.notebook='practice';Sprout.addBranch(r,0,['e2e4']);
   const records=JSON.parse(localStorage.getItem('sprout.games.v1'));records.push(r);localStorage.setItem('sprout.games.v1',JSON.stringify(records));return r;
  });
  await page.reload();await page.locator('[data-route="home"]').first().click();
  const stored=await page.evaluate(()=>localStorage.getItem('sprout.games.v1'));
  await action('demo');assert.equal(await page.evaluate(()=>App.state.current.moves.length),35);
  assert.equal(await page.locator('[data-act="rename"]').count(),0);
  await page.locator('[data-square="d2"]').click();await page.locator('[data-square="d4"]').click();await action('saveBranch');
  assert.equal(await page.evaluate(()=>App.state.current.branches.length),1);
  await action('mainline');await action('last');
  assert.match(await page.locator('.analysis-heading h2').textContent(),/白方完成将杀 · Qxh7#/);
  await action('home');await action('demo');assert.equal(await page.evaluate(()=>App.state.current.branches.length),1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('sprout.games.v1')),stored);
  await page.reload();assert.equal(await page.evaluate(()=>App.state.route),'home');
  await page.locator('[data-route="games"]').first().click();await page.locator('[data-book="practice"]').click();
  assert.equal(await page.locator('[data-open="legacy-demo"]').count(),0);
  await page.locator('[data-route="home"]').first().click();await action('legacyDemos');await page.locator('[data-open="legacy-demo"]').click();
  assert.deepEqual(await page.evaluate(()=>App.state.current.branches),legacy.branches);
  await action('rename');await action('keepLegacy');await action('home');
  await page.locator('[data-book="practice"]').click();assert.equal(await page.locator('[data-open="legacy-demo"]').count(),1);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'v111-browser-review.json'),JSON.stringify({passed:true,checks:['cp/mate/candidates/bar/summary flip','canonical evaluations unchanged','1:1 SVG text at 6 widths','terminal UI','black-to-move numbering','35-ply ephemeral demo','legacy variations retained'],errors},null,2));
  console.log('PASS: perspective, undistorted labels, terminal UI, practice notation, long demo isolation and legacy preservation.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
