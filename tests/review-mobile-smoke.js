const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const root=path.resolve(__dirname,'..'),out=path.join(root,'android/recorder/build/reports');fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await pw.chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const action=name=>page.locator(`[data-act="${name}"]`).click(),move=async(a,b)=>{await page.locator(`[data-square="${a}"]`).click();await page.locator(`[data-square="${b}"]`).click();};
 const screenshot=name=>page.screenshot({path:path.join(out,name+'.png'),fullPage:false,animations:'disabled'});
 try{
  await page.goto(pathToFileURL(path.join(root,'review/index.html')).href);await page.getByRole('heading',{name:'下完一局， 再进步一点。'}).waitFor();await screenshot('sprout-home-390');
  await action('record');assert.ok(await page.getByRole('heading',{name:'让这一局，留下棋谱'}).isVisible());await action('startCapture');assert.match(await page.locator('#toast').textContent(),/安卓/);await action('close');
  await action('import');await page.locator('#import-text').fill('[Event "复盘测试"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 *');await action('importText');
  assert.equal(await page.locator('.square').count(),64);assert.equal(await page.evaluate(()=>App.state.current.moves.length),6);await screenshot('sprout-review-390');
  await move('d2','d4');assert.equal(await page.evaluate(()=>App.state.branchActive),true);
  const from=await page.locator('[data-square="d7"]').boundingBox(),to=await page.locator('[data-square="d5"]').boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});await page.mouse.up();
  assert.equal(await page.evaluate(()=>App.state.branch.length),2);await action('saveBranch');assert.equal(await page.evaluate(()=>App.state.current.branches.length),1);assert.equal(await page.evaluate(()=>App.state.current.moves.length),6);
  await page.reload();assert.equal(await page.evaluate(()=>App.state.branch.length),2);await action('mainline');await action('next');assert.equal(await page.locator('[data-square="e4"] img').count(),1);
  await page.locator('.review-tab[data-tab="moves"]').click();await page.locator('[data-ply="4"]').first().click();assert.equal(await page.evaluate(()=>App.state.ply),4);
  await page.locator('[data-tab="branches"]').click();await page.locator('[data-branch="0"]').click();assert.equal(await page.locator('[data-square="d4"] img').count(),1);await screenshot('sprout-variation-390');
  await action('mainline');await page.locator('[data-tab="analysis"]').click();await action('analyzeHere');await page.waitForFunction(()=>!App.state.busy);assert.match(await page.locator('#toast').textContent(),/安卓/);
  await page.evaluate(()=>{const r=App.state.current;const target={...r,moves:['e2e4','e7e5','f1c4','g8f6']};r.issues.push({at:2,placement:Sprout.position(target).fen().split(' ')[0],message:'测试漏步校对',resolved:false});});
  await page.locator('.review-tab[data-tab="moves"]').click();await page.locator('.review-tab[data-tab="analysis"]').click();await action('issues');await action('issue');await action('beginCorrection');
  await move('f1','c4');await move('g8','f6');await action('saveCorrection');await action('confirmCorrection');
  assert.deepEqual(await page.evaluate(()=>App.state.current.moves),['e2e4','e7e5','f1c4','g8f6']);assert.equal(await page.evaluate(()=>App.state.current.revisions[0].moves.length),6);assert.equal(await page.evaluate(()=>App.state.current.issues[0].resolved),true);
  for(const size of [{width:320,height:568},{width:360,height:640},{width:412,height:915},{width:844,height:390},{width:1280,height:800}]){
   await page.setViewportSize(size);const b=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,board:document.querySelector('#chessboard').getBoundingClientRect().toJSON()}));assert.equal(b.overflow,false,JSON.stringify(size));assert.ok(b.board.width>0&&b.board.right<=size.width);await screenshot(`sprout-review-${size.width}x${size.height}`);
  }
  await page.setViewportSize({width:390,height:844});await action('home');await page.locator('[data-route="settings"]').click();await page.locator('#budget').selectOption('1500');await page.reload();await page.locator('[data-route="settings"]').click();assert.equal(await page.locator('#budget').inputValue(),'1500');await screenshot('sprout-settings-390');
  await page.locator('[data-route="games"]').click();const downloadPromise=page.waitForEvent('download');await action('backup');const download=await downloadPromise;await download.saveAs(path.join(out,'browser-test-backup.json'));const backup=JSON.parse(fs.readFileSync(path.join(out,'browser-test-backup.json'),'utf8'));assert.equal(backup.games.length,1);assert.equal(backup.games[0].branches.length,1);await screenshot('sprout-games-390');
  await action('import');await page.locator('#import-text').fill('<img src=x onerror=alert(1)>');await action('importText');assert.ok((await page.locator('#modal-error').textContent()).length>0);await action('close');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-review-results.json'),JSON.stringify({passed:true,errors,checks:['direct file','record permission guidance','PGN import','64 squares','branch independence','reload recovery','movelist navigation','native-only engine boundary','320/360/390/412/landscape/desktop layouts','settings persistence','backup includes branches','invalid import feedback']},null,2));
  console.log('PASS: Sprout direct-file interface, import, branches, persistence, responsive layout and export.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
