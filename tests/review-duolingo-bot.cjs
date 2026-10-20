// Local test opponent helper: play only against Duolingo's Oscar, never PvP.
const {spawn}=require('node:child_process'),fs=require('node:fs');
const {run,adb}=require('./review-android-helper.cjs');
const saved=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).record;
const info=run('shell','dumpsys','package','com.jingjing.chesssprout');
const lib=info.match(/legacyNativeLibraryDir=(\S+)/)[1]+'/x86_64/libstockfish.so';
const p=spawn(adb,['shell','-T','run-as','com.jingjing.chesssprout',lib]);
let buf='';const timer=setTimeout(()=>{p.kill();process.exitCode=1;},15000);
p.stdout.on('data',chunk=>{
 buf+=chunk.toString();
 if(buf.includes('uciok')&&!buf.includes('SENT')){
  buf+='SENT';p.stdin.write('setoption name Threads value 1\nsetoption name Hash value 16\nsetoption name EvalFile value /data/user/0/com.jingjing.chesssprout/files/networks/nn-b1a57edbea57.nnue\nsetoption name EvalFileSmall value /data/user/0/com.jingjing.chesssprout/files/networks/nn-baff1ede1f90.nnue\nposition fen '+saved.initialFen+' moves '+saved.moves.join(' ')+'\ngo movetime 350\n');
 }
 const m=buf.match(/bestmove (\S+)/);if(m){console.log(m[1]);clearTimeout(timer);p.stdin.end('quit\n');}
});
p.stderr.on('data',b=>process.stderr.write(b));p.on('close',code=>{clearTimeout(timer);if(!buf.includes('bestmove')){console.error(buf);process.exitCode=code||1;}});p.stdin.write('uci\n');
