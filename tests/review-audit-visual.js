const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),out=path.resolve(__dirname,'../android/recorder/build/reports');
 const act=a=>page.locator(`[data-act="${a}"]`).first().click();
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);
  await page.evaluate(()=>localStorage.setItem('sprout.settings.v1',JSON.stringify({autoAnalysis:false,animation:false})));await page.reload();
  await act('demo');for(let i=0;i<4;i++)await act('next');
  for(const v of [{width:390,height:844},{width:320,height:740},{width:844,height:390}]){
   await page.setViewportSize(v);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const location=()=>page.evaluate(()=>{const panel=document.querySelector('.analysis-section');return document.querySelector('.candidates-card').getBoundingClientRect().top+scrollY+panel.scrollTop;});const before=await location();await act('next');const after=await location();assert.ok(Math.abs(before-after)<1,JSON.stringify({v,before,after}));
   const candidate=await page.locator('.candidate').first().boundingBox();assert.ok(candidate.height>=44);
   if(v.width===390)await page.locator('.analysis-section').scrollIntoViewIfNeeded();
   await page.waitForTimeout(3400);await page.screenshot({path:path.join(out,`v137-review-${v.width}.png`)});
  }
  await page.evaluate(()=>{while(App.back()){};});await page.locator('[data-route=settings]').click();
  await page.setViewportSize({width:390,height:844});await page.locator('#appearance-mode').selectOption('dark');
  await page.locator('[data-route=home]').click();await act('demo');for(let i=0;i<4;i++)await act('next');await page.locator('.analysis-section').scrollIntoViewIfNeeded();
  await page.waitForTimeout(3400);await page.screenshot({path:path.join(out,'v137-review-dark.png')});
  await page.evaluate(()=>{while(App.back()){};App.hostEvent({type:'updateCheck',result:{state:'update',version:'1.3.8'}});});
  await page.waitForTimeout(3400);await page.screenshot({path:path.join(out,'v137-home-update.png')});
  await page.locator('[data-route=settings]').click();await page.waitForTimeout(3400);await page.screenshot({path:path.join(out,'v137-update-settings.png')});
  console.log('PASS: 320/390 portrait, 844 landscape, stable assessment, 44px candidate targets and dark/update screenshots.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
