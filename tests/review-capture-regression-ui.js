const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
async function main(){
 const browser=await pw.chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 const out=path.resolve(__dirname,'../android/recorder/build/reports');
 page.on('pageerror',e=>errors.push(e.message));
 const data='data:image/png;base64,'+fs.readFileSync(path.join(out,'duolingo-auto-initial.png')).toString('base64');
 await page.addInitScript(data=>{
  window.nativeState={capture:{running:false},video:{state:'idle'},themeReady:true,version:'test'};
  window.SproutHost={
   cancelAnalysis(){},listGames:()=> '[]',status:()=>JSON.stringify(nativeState),videoPreview:()=>data,
   selectVideo(){nativeState.video={state:'ready',duration:10000};App.hostEvent({type:'videoReady'});},
   seekVideo(t){nativeState.video.previewTime=t;App.hostEvent({type:'videoPreviewUpdated'});},
   prepareVideo(options){window.submitted=JSON.parse(options);App.hostEvent({type:'videoRecognized',fen:'3k4/8/2K5/3P4/8/8/8/8 w - - 0 1',side:'w'});},
   runVideo(options){window.confirmed=JSON.parse(options);},
   setMoveFeedback(enabled){nativeState.moveFeedback=enabled;},
   capturePreview:()=>data,openDuolingo(){window.openedDuo=true;}
  };
 },data);
 const act=async a=>page.locator(`[data-act="${a}"]`).first().click();
 const rect=()=>page.locator('#crop-box').boundingBox();
 const drag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);
  await act('video');await page.locator('#crop-image').waitFor();
  const img=await page.locator('#crop-image').boundingBox();
  await drag({x:img.x+img.width*.1,y:img.y+img.height*.3},{x:img.x+img.width*.85,y:img.y+img.height*.7});
  const first=await rect();
  await drag({x:first.x+first.width/2,y:first.y+first.height/2},{x:first.x+first.width/2+8,y:first.y+first.height/2+14});
  const moved=await rect();assert.ok(Math.abs(moved.x-first.x-8)<2);assert.ok(Math.abs(moved.width-first.width)<2);
  const handle=await page.locator('.crop-handle.se').boundingBox();
  await drag({x:handle.x+handle.width/2,y:handle.y+handle.height/2},{x:handle.x+handle.width/2-12,y:handle.y+handle.height/2+15});
  const resized=await rect();assert.ok(resized.width<moved.width-9);assert.ok(resized.height>moved.height+10);
  await page.locator('#video-time').evaluate(el=>{el.value=2300;el.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.match(await page.locator('#video-time-label').textContent(),/2.3/);
  assert.deepEqual(await rect(),resized);
  await page.evaluate(()=>App.hostEvent({type:'videoError',message:'调整选框后再试'}));
  assert.equal(await page.locator('#modal-error').textContent(),'调整选框后再试');
  assert.deepEqual(await rect(),resized);
  await page.screenshot({path:path.join(out,'v121-editable-crop.png')});
  await act('applyCrop');await page.locator('#position-turn').selectOption('b');await act('confirmVideo');
  assert.equal(await page.evaluate(()=>window.confirmed.confirmFen),'3k4/8/2K5/3P4/8/8/8/8 b - - 0 1');
  assert.equal(await page.locator('#video-stage').count(),1);await act('close');
  await act('demo');
  for(let i=0;i<6;i++)await act('next');
  assert.equal(await page.locator('.arrows path').count(),1);
  assert.equal(await page.locator('.arrows marker,.arrows [stroke-linecap]').count(),0);
  await page.waitForTimeout(300);await page.screenshot({path:path.join(out,'v121-arrow-tip.png')});
  await page.locator('[data-square="d2"]').click();
  assert.equal(await page.locator('.arrows').count(),0);
  await page.evaluate(()=>{while(App.back()){};});
  await page.locator('[data-route=settings]').click();
  assert.equal(await page.locator('[data-act=moveFeedback]').getAttribute('aria-checked'),'true');
  await act('moveFeedback');
  assert.equal(await page.evaluate(()=>nativeState.moveFeedback),false);
  await page.reload();await page.locator('[data-route=settings]').click();
  assert.equal(await page.locator('[data-act=moveFeedback]').getAttribute('aria-checked'),'false');
  assert.deepEqual(errors,[]);console.log('PASS: crop creation, translation, resize, seek, retry retention, practice confirmation, single-contour arrow.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
