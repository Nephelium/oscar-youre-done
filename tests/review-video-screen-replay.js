// Private video fixture at REPLAY_RATE (default 1), through real MediaProjection.
// Usage: node tests/review-video-screen-replay.js <local video> <reference JSON>
// Start and authorize full-screen capture before running. No uploads occur.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {connect,run}=require('./review-android-helper.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function closeReplayTab(url){
 let port,browser;
 try {
  let pw;try{pw=require('playwright')}catch{pw=require(path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
  port=run('forward','tcp:0','localabstract:chrome_devtools_remote');
  browser=await pw.chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:5000});
  for(const page of browser.contexts().flatMap(c=>c.pages()))if(page.url()===url)await page.close();
 }catch(error){console.warn('Replay tab cleanup: '+error.message)}
 finally{if(browser)await browser.close();if(port)run('forward','--remove','tcp:'+port);}
}
async function main(){
 const file=path.resolve(process.argv[2]),reference=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
 const bytes=fs.statSync(file).size,out=path.resolve(__dirname,'../android/recorder/build/reports');
 const rate=Number(process.env.REPLAY_RATE||1),reportName=process.env.REPLAY_REPORT||'v133-video-screen-replay.json';
 assert.ok(Number.isFinite(rate)&&rate>0&&rate<=16,'Playback rate must be in (0,16]');
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
  let v=document.querySelector('video'),ready=false,startedAt=0,endedAt=0;
  v.playbackRate=${rate};v.onplaying=()=>{if(!startedAt)startedAt=performance.now()};v.onended=()=>endedAt=performance.now();
  v.onloadedmetadata=()=>{v.currentTime=4.1};v.onseeked=()=>ready=true;
  let timer=setInterval(async()=>{let s=await(await fetch('/state')).json();if(s.play&&ready&&v.paused&&!v.ended)await v.play().catch(()=>{});
  let q=v.getVideoPlaybackQuality();
  await fetch('/progress',{method:'POST',body:JSON.stringify({time:v.currentTime,duration:v.duration,ready,paused:v.paused,ended:v.ended,rate:v.playbackRate,playbackWallMs:startedAt?(endedAt||performance.now())-startedAt:0,totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames,error:v.error?.message})});if(v.ended)clearInterval(timer)},200);
  </script>`);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,events=[];
 try{
  c=await connect();run('reverse',`tcp:${port}`,`tcp:${port}`);
  run('shell','am','start','-a','android.intent.action.VIEW','-d',`http://127.0.0.1:${port}/`,'-p','com.android.chrome');
  const readyDeadline=Date.now()+25000;while(!playback.ready&&Date.now()<readyDeadline){if(playback.error)throw Error(playback.error);await wait(200);}
  assert.ok(playback.ready,'Original video must decode in Chrome');
  // A loaded profile is not proof that this screen's initial board is ready.
  // Poll from the host: background WebViews may throttle their JS timers.
  const boardDeadline=Date.now()+35000;let readySince=0,initialCapture;
  while(Date.now()<boardDeadline){
   initialCapture=await c.page.evaluate(()=>JSON.parse(SproutHost.status()).capture);
   if(initialCapture.message==='棋盘已就绪，可以开始下棋') {if(!readySince)readySince=Date.now();if(Date.now()-readySince>=1200)break;}
   else readySince=0;
   await wait(200);
  }
  fs.writeFileSync(path.join(out,reportName+'.initial.json'),JSON.stringify({playback,capture:initialCapture},null,2));
  if(!readySince || Date.now()-readySince<1200){
   const preview=await c.page.evaluate(()=>SproutHost.capturePreview());
   if(preview)fs.writeFileSync(path.join(out,'video-replay-initial-preview.jpg'),Buffer.from(preview.split(',')[1],'base64'));
   throw Error('Initial screen must be recognized before replay: '+JSON.stringify(initialCapture));
  }
  const id=await c.page.evaluate(()=>JSON.parse(SproutHost.status()).capture.gameId),start=Date.now();play=true;
  let previous=-1,lastLog=0;
  while(!playback.ended&&Date.now()-start<360000){
   await wait(200);
   const capture=await c.page.evaluate(()=>JSON.parse(SproutHost.status()).capture);
   fs.writeFileSync(path.join(out,reportName+'.progress.json'),JSON.stringify({elapsedMs:Date.now()-start,playback,capture}));
   if(capture.plies!==previous){events.push({elapsedMs:Date.now()-start,videoTime:playback.time,capture});previous=capture.plies;}
   if(Date.now()-lastLog>30000){console.log(JSON.stringify({video:playback.time,plies:capture.plies,message:capture.message}));lastLog=Date.now();}
   if(playback.error)throw Error(playback.error);
  }
  assert.ok(playback.ended,'Playback must reach the actual end');await wait(2500);
  await c.page.evaluate(()=>SproutHost.captureAction('stop','{}'));await wait(600);
  const records=await c.page.evaluate(()=>JSON.parse(SproutHost.listGames()));
  const record=records.find(g=>g.id===id),segments=[];let next=record;
  while(next&&!segments.some(g=>g.id===next.id)){segments.push(next);next=records.find(g=>g.id===next.capture?.nextId);}
  const exact=JSON.stringify(record.moves)===JSON.stringify(reference.moves);
  const unresolved=segments.reduce((n,g)=>n+(g.issues||[]).filter(x=>!x.resolved).length,0);
  const report={scope:'Original private video, Chrome variable-speed playback, full-screen MediaProjection; emulator only',requestedRate:rate,exact,unresolved,elapsedMs:Date.now()-start,playback,events,record,segments};
  fs.writeFileSync(path.join(out,reportName),JSON.stringify(report,null,2));
  assert.deepEqual(record.moves,reference.moves);assert.equal(record.issues.filter(x=>!x.resolved).length,0);
  console.log(`PASS: ${record.moves.length} exact plies at playbackRate ${playback.rate}; no unresolved gaps.`);
 }finally{
  if(c){await c.page.evaluate(()=>SproutHost.captureAction('stop','{}')).catch(()=>{});await c.browser.close();run('forward','--remove','tcp:'+c.port);}
  await closeReplayTab(`http://127.0.0.1:${port}/`);
  run('reverse','--remove',`tcp:${port}`);server.closeAllConnections();server.close();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
