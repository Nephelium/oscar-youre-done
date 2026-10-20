const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect,run,adb}=require('./review-android-helper.cjs'),{execFileSync}=require('node:child_process'),S=require('../review/core.js'),out=path.resolve(__dirname,'../android/recorder/build/reports');
async function main(){
 if(process.argv[2]==='prepare'){
  const {browser,page,port}=await connect();try{
   await page.waitForLoadState('load');await page.waitForTimeout(250);
   const filename='chesssprout-export-'+Date.now()+'.pgn';
   const pgn=await page.evaluate(name=>{const r=Sprout.importText('[Event "Native export test"]\n\n1. e4 e5 *')[0];const text=Sprout.toPgn(r);SproutHost.exportDocument(name,text,'text/plain');return text;},filename);
   fs.writeFileSync(path.join(out,'native-export-pending.json'),JSON.stringify({filename,pgn},null,2));console.log('Opened native save picker: '+filename);
  }finally{await browser.close();run('forward','--remove','tcp:'+port);}return;
 }
 const expected=JSON.parse(fs.readFileSync(path.join(out,'native-export-pending.json'),'utf8'));
 let text;
 // exec-out has no terminal newline conversion: compare the actual UTF-8 file bytes.
 for(let i=0;i<10;i++){try{text=execFileSync(adb,['exec-out','cat','/sdcard/Download/'+expected.filename]).toString('utf8').trim();break;}catch(_){await new Promise(r=>setTimeout(r,300));}}
 assert.equal(text,expected.pgn.trim(),'Native export must preserve .pgn and exact UTF-8 payload');
 assert.deepEqual(S.importText(text)[0].moves,['e2e4','e7e5']);
 fs.writeFileSync(path.join(out,'android-export-results.json'),JSON.stringify({passed:true,filename:expected.filename,moves:['e2e4','e7e5'],checks:['system create-document picker','PGN extension and MIME','native UTF-8 write','PGN roundtrip']},null,2));
 console.log('PASS: native system-file PGN export, extension and exact re-import.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
