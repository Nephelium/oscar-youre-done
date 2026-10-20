// Controlled screen replay of local real Duolingo frames through MediaProjection.
// This is not a fresh Duolingo match or physical-phone validation.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {connect,run}=require('./review-android-helper.cjs');
const out=path.resolve(__dirname,'../android/recorder/build/reports');
const reference=JSON.parse(fs.readFileSync(path.join(out,'duolingo-reference.json'),'utf8'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 let frame='duolingo-auto-initial.png',loaded='';
 const allowed=new Set([frame,...reference.frames.map(f=>f.image)]);
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/state'){res.end(frame);return;}
  if(req.url.startsWith('/loaded/')){loaded=decodeURIComponent(req.url.slice(8));res.end('ok');return;}
  const name=req.url.slice(1);
  if(allowed.has(name)){res.setHeader('Content-Type','image/png');res.end(fs.readFileSync(path.join(out,name)));return;}
  res.setHeader('Content-Type','text/html');
  res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}img{width:100%;display:block}</style><img id="frame"><script>let last="";setInterval(async()=>{let next=await(await fetch("/state")).text();if(next!==last){last=next;let img=document.getElementById("frame");img.onload=()=>fetch("/loaded/"+next);img.src="/"+next}},80)</script>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 const c=await connect();
 try{
  run('reverse',`tcp:${port}`,`tcp:${port}`);
  run('shell','am','start','-a','android.intent.action.VIEW','-d',`http://127.0.0.1:${port}/`,'-p','com.android.chrome');
  const until=Date.now()+25000;while(loaded!==frame&&Date.now()<until)await wait(200);assert.equal(loaded,frame,'Chrome must display replay');
  await c.page.waitForFunction(()=>JSON.parse(SproutHost.status()).capture.calibrated,null,{timeout:30000,polling:200});
  const start=Date.now(),id=await c.page.evaluate(()=>JSON.parse(SproutHost.status()).capture.gameId);
  for(const item of reference.frames){
   frame=item.image;const until=Date.now()+5000;while(loaded!==frame&&Date.now()<until)await wait(20);assert.equal(loaded,frame);
   await wait(650); // Two half-moves can occur between frames.
  }
  await c.page.waitForFunction(n=>JSON.parse(SproutHost.status()).capture.plies===n,reference.moves.length,{timeout:15000,polling:200});
  const status=await c.page.evaluate(()=>JSON.parse(SproutHost.status()));
  await c.page.evaluate(()=>SproutHost.captureAction('stop','{}'));await wait(1000);
  const record=await c.page.evaluate(id=>JSON.parse(SproutHost.listGames()).find(g=>g.id===id),id);
  assert.deepEqual(record.moves,reference.moves);
  assert.equal(record.issues.filter(x=>!x.resolved).length,0);
  fs.writeFileSync(path.join(out,'v132-screen-replay.json'),JSON.stringify({passed:true,scope:'Controlled Chrome screen replay of historical Duolingo frames, real full-screen MediaProjection',elapsedMs:Date.now()-start,status,record},null,2));
  console.log(`PASS: ${record.moves.length} exact plies through full-screen capture at 650 ms per two-ply frame, no unresolved gaps.`);
 }finally{await c.browser.close();run('forward','--remove','tcp:'+c.port);run('reverse','--remove',`tcp:${port}`);server.closeAllConnections();server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
