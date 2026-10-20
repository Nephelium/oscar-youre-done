const path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
let pw;try{pw=require('playwright');}catch(_){pw=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const adb=path.join(os.homedir(),'AppData/Local/Android/Sdk/platform-tools/adb.exe');
const run=(...args)=>execFileSync(adb,args,{encoding:'utf8',maxBuffer:8*1024*1024}).trim();
async function connect(){
 let error;
 for(let i=0;i<15;i++){
  let port;
  try{
   const pid=run('shell','pidof','com.jingjing.chesssprout');port=run('forward','tcp:0','localabstract:webview_devtools_remote_'+pid);
   const browser=await pw.chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:2500});
   const page=browser.contexts()[0]?.pages()[0];if(!page){await browser.close();throw Error('WebView not ready');}
   await page.waitForFunction(()=>window.App&&window.SproutHost,{},{timeout:5000});
   return {browser,page,port};
  }catch(e){error=e;if(port)run('forward','--remove','tcp:'+port);await new Promise(r=>setTimeout(r,400));}
 }
 throw error;
}
module.exports={connect,run,adb};
