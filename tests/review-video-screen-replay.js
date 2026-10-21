// Private video fixture at normal playback speed, through real MediaProjection.
// Usage: node tests/review-video-screen-replay.js <local video> <reference JSON>
// Start and authorize full-screen capture before running. No uploads occur.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {connect,run}=require('./review-android-helper.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const file=path.resolve(process.argv[2]),reference=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
 const bytes=fs.statSync(file).size,out=path.resolve(__dirname,'../android/recorder/build/reports');
 let play=false,playback={},c;
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/state'){res.end(JSON.stringify({play}));return;}
  if(req.url==='/progress'){
   let body='';req.on('data',b=>body+=b);req.on('end',()=>{try{playback=JSON.parse(body);}catch(_){}res.end('ok');});return;
  }
  if(req.url==='/video'){
   res.setHeader('Content-Type','video/mp4');res.setHeader('Accept-Ranges','bytes');
   const range=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');
   const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),bytes-1):bytes-1;
   if(start>=bytes){res.writeHead(416,{'Content-Range':`bytes */${bytes}`});res.end();return;}
   res.setHeader('Content-Length',end-start+1);
   if(range)res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${bytes}`});
   fs.createReadStream(file,{start,end}).pipe(res);return;
  }
  res.setHeader('Content-Type','text/html');
  res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#111}video{width:100%;height:100dvh;object-fit:contain;display:block}</style><video id="v" muted playsinline preload="auto" src="/video"></video><script>
  let v=document.querySelector('video'),ready=false;
  v.onloadedmetadata=()=>{v.currentTime=4.1};v.onseeked=()=>ready=true;
  setInterval(async()=>{let s=await(await fetch('/state')).json();if(s.play&&ready&&v.paused&&!v.ended)await v.play().catch(()=>{});
  await fetch('/progress',{method:'POST',body:JSON.stringify({time:v.currentTime,duration:v.duration,ready,paused:v.paused,ended:v.ended,rate:v.playbackRate,error:v.error?.message})})},200);
  </script>`);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,events=[];
 try{
  c=await connect();run('reverse',`tcp:${port}`,`tcp:${port}`);
  run('shell','am','start','-a','android.intent.action.VIEW','-d',`http://127.0.0.1:${port}/`,'-p','com.android.chrome');
  const readyDeadline=Date.now()+25000;while(!playback.ready&&Date.now()<readyDeadline){if(playback.error)throw Error(playback.error);await wait(200);}
  assert.ok(playback.ready,'Original video must decode in Chrome');
  await c.page.waitForFunction(()=>JSON.parse(SproutHost.status()).capture.calibrated,null,{timeout:30000,polling:200});
  await wait(1200);
  const id=await c.page.evaluate(()=>JSON.parse(SproutHost.status()).capture.gameId),start=Date.now();play=true;
  let previous=-1,lastLog=0;
  while(!playback.ended&&Date.now()-start<360000){
   await wait(200);
   const capture=await c.page.evaluate(()=>JSON.parse(SproutHost.status()).capture);
   if(capture.plies!==previous){events.push({elapsedMs:Date.now()-start,videoTime:playback.time,capture});previous=capture.plies;}
   if(Date.now()-lastLog>30000){console.log(JSON.stringify({video:playback.time,plies:capture.plies,message:capture.message}));lastLog=Date.now();}
   if(playback.error)throw Error(playback.error);
  }
  assert.ok(playback.ended,'Playback must reach the actual end');await wait(2500);
  await c.page.evaluate(()=>SproutHost.captureAction('stop','{}'));await wait(600);
  const record=await c.page.evaluate(id=>JSON.parse(SproutHost.listGames()).find(g=>g.id===id),id);
  const report={scope:'Original private video, Chrome normal-speed playback, full-screen MediaProjection; emulator only',elapsedMs:Date.now()-start,playback,events,record};
  fs.writeFileSync(path.join(out,'v133-video-screen-replay.json'),JSON.stringify(report,null,2));
  assert.deepEqual(record.moves,reference.moves);assert.equal(record.issues.filter(x=>!x.resolved).length,0);
  console.log(`PASS: ${record.moves.length} exact plies at playbackRate ${playback.rate}; no unresolved gaps.`);
 }finally{
  if(c){await c.page.evaluate(()=>SproutHost.captureAction('stop','{}')).catch(()=>{});await c.browser.close();run('forward','--remove','tcp:'+c.port);}
  run('reverse','--remove',`tcp:${port}`);server.closeAllConnections();server.close();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
