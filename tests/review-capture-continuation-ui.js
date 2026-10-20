const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
const S=require('../review/core.js');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
async function main(){
 const browser=await pw.chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const first=S.validate({id:'gapfirst',title:'多邻国对局',moves:['e2e4','e7e5'],capture:{segment:1,nextId:'gapnext'},issues:[{at:2,message:'中间走法待校对',resolved:false}]});
 const anchor=S.position({...first,moves:['e2e4','e7e5','g1f3','b8c6']}).fen();
 const next=S.validate({id:'gapnext',title:'多邻国对局 · 续录 1',notebook:'game',initialFen:anchor,moves:['f1c4'],capture:{segment:2,previousId:'gapfirst',rightsEstimated:true}});
 try{
  await page.addInitScript(records=>localStorage.setItem('sprout.games.v1',JSON.stringify(records)),[first,next]);
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);
  await page.locator('[data-route="games"]').first().click();
  await page.locator('[data-open="gapfirst"]').first().click();
  await page.locator('.capture-segments [data-open="gapnext"]').click();
  assert.equal(await page.evaluate(()=>App.state.current.id),'gapnext');
  assert.equal(await page.locator('#chessboard').getAttribute('data-fen'),anchor);
  await page.locator('[data-act="next"]').click();
  await page.waitForFunction(()=>App.state.ply===1);
  assert.equal(await page.locator('[data-square="c4"] img').count(),1);
  for(const size of [{width:320,height:568},{width:844,height:390}]) {
   await page.setViewportSize(size);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.locator('.capture-segments [data-open="gapfirst"]').click();
  assert.deepEqual(await page.evaluate(()=>App.state.current.moves),first.moves);
  assert.match(S.toPgn(next),/confirmed segment/);
  assert.equal(S.validate(JSON.parse(JSON.stringify(next))).capture.previousId,'gapfirst');
  assert.deepEqual(errors,[]);
  console.log('PASS: linked capture segments, independent playback, gap-preserving export, compact portrait/landscape.');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
