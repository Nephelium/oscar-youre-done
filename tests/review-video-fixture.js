const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),{execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
async function main(){
 const out=path.resolve(__dirname,'../android/recorder/build/reports');fs.mkdirSync(out,{recursive:true});
 const browser=await pw.chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:412,height:866},deviceScaleFactor:1});
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../review/index.html')).href);await page.locator('[data-route="games"]').first().click();await page.locator('[data-act="new"]').click();
  const moves=['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6'];
  for(let i=0;i<=moves.length;i++){
   if(i){const m=moves[i-1];await page.locator(`[data-square="${m.slice(0,2)}"]`).click();await page.locator(`[data-square="${m.slice(2,4)}"]`).click();}
   await page.screenshot({path:path.join(out,`video-frame${i}.png`),animations:'disabled'});
  }
  fs.writeFileSync(path.join(out,'video-frames.txt'),Array.from({length:7},(_,i)=>`file 'video-frame${i}.png'\nduration 1.2\n`).join('')+"file 'video-frame6.png'\n");
  execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',path.join(out,'video-frames.txt'),'-vf','fps=10,format=yuv420p','-c:v','libx264','-crf','18',path.join(out,'chesssprout-fixture.mp4')]);
  console.log('Created 8.4 second controlled-board video fixture.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
