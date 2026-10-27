const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const helper=require('./review-android-helper.cjs'),S=require('../review/core.js');
const out=path.resolve(__dirname,'../android/recorder/build/reports');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function nodes(xml){return Array.from(xml.matchAll(/<node\b([^>]+)>/g),m=>Object.fromEntries(Array.from(m[1].matchAll(/([\w-]+)="([^"]*)"/g),a=>[a[1],a[2]])));}
function tap(node){const n=node.bounds.match(/\d+/g).map(Number);helper.run('shell','input','tap',String(Math.floor((n[0]+n[2])/2)),String(Math.floor((n[1]+n[3])/2)));}
async function savePicker(){
 for(let i=0;i<8;i++){
  helper.run('shell','uiautomator','dump','/sdcard/export-138-picker.xml');
  const xml=helper.run('shell','cat','/sdcard/export-138-picker.xml');fs.writeFileSync(path.join(out,'export-138-picker.xml'),xml);
  const save=nodes(xml).find(n=>n.enabled==='true'&&(/^(save|保存)$/i.test(n.text)||n['resource-id']?.endsWith(':id/action_menu_save')));
  if(save){tap(save);return;}
  await pause(350);
 }
 throw Error('System save button was not found; inspect export-138-picker.xml.');
}
async function main(){
 const {browser,page,port}=await helper.connect(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const act=name=>page.locator(`[data-act="${name}"]`).click();
 const title='Export-138-'+Date.now(),pgn=`[Event "${title}"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4K3/7R b - - 0 23"]\n\n23... Kd7 24. Rh7+ *`,files=[];
 try{
  await page.evaluate(()=>{while(App.back()){};});await act('import');await page.locator('#import-text').fill(pgn);await act('importText');
  const record=await page.evaluate(()=>App.state.current);assert.equal(record.initialFen,S.importText(pgn)[0].initialFen);
  for(const [action,extension,expected] of [['exportPgn','pgn',S.toPgn(record)],['exportSan','txt',S.toSan(record)]]){
   await act('export');assert.equal(await page.locator('.export-actions button').count(),4);
   await page.screenshot({path:path.join(out,'export-138-native-dialog.png')});await act(action);await pause(350);
   fs.writeFileSync(path.join(out,`export-138-native-picker-${extension}.png`),execFileSync(helper.adb,['exec-out','screencap','-p']));
   await savePicker();const filename=title+'.'+extension;
   let text;
   for(let i=0;i<20;i++){
    try{text=execFileSync(helper.adb,['exec-out','cat','/sdcard/Download/'+filename],{stdio:['ignore','pipe','pipe']}).toString('utf8');if(text===expected)break;}catch(_){}
    await pause(250);
   }
   assert.equal(text,expected,'Native file payload must exactly match '+extension);
   if(extension==='pgn'){const copy=S.importText(text)[0];assert.equal(copy.initialFen,record.initialFen);assert.deepEqual(copy.moves,record.moves);}
   files.push({filename,bytes:Buffer.byteLength(text)});await page.waitForFunction(()=>document.hasFocus());
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'export-138-native-results.json'),JSON.stringify({passed:true,files,checks:['installed 1.3.8 shared dialog','both actual system create-document pickers','exact UTF-8 PGN and SAN files','black-to-move numbering','custom FEN PGN roundtrip'],errors},null,2));
  console.log('PASS: installed APK exports both PGN and SAN through real system file pickers with exact payloads.');
 }finally{await browser.close();helper.run('forward','--remove','tcp:'+port);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
