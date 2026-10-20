// Mechanical extraction only. Artwork is generated with the built-in image tool.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let sharp;try{sharp=require('sharp');}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'));}
const dir=path.resolve(__dirname,'../review/assets/pieces');
async function pieces(id){
 const file=path.join(dir,`sheet-${id}.png`),{data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true}),w=info.width,h=info.height;
 const alpha=(x,y)=>data[(y*w+x)*4+3];
 let split=Math.floor(h/2),best=Infinity;
 for(let y=Math.floor(h*.46);y<h*.54;y++){let n=0;for(let x=0;x<w;x++)if(alpha(x,y)>80)n++;const cost=n+Math.abs(y-h/2)/h;if(cost<best){best=cost;split=y;}}
 const crops=[];
 for(const [row,[top,bottom]] of [[0,split],[split,h]].entries()){
  const bands=[];let start=-1,empty=0;
  for(let x=0;x<=w;x++){
   let count=0;if(x<w)for(let y=top;y<bottom;y++)if(alpha(x,y)>80)count++;
   if(count>8){if(start<0)start=x;empty=0;}else if(start>=0){empty++;if(empty>8||x===w){const end=x-empty+1;if(end-start>40)bands.push([start,end]);start=-1;empty=0;}}
  }
  if(bands.length!==6)throw Error(`${id} row ${row}: expected six pieces, got ${JSON.stringify(bands)}`);
  for(const [col,[a,b]] of bands.entries()){
   let minY=bottom,maxY=top;for(let y=top;y<bottom;y++)for(let x=a;x<b;x++)if(alpha(x,y)>80){minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
   const left=Math.max(0,a-4),right=Math.min(w,b+4),y=Math.max(top,minY-4),end=Math.min(bottom,maxY+5);
   crops.push({name:`${id}-${row?'b':'w'}${'kqrbnp'[col]}.png`,left,top:y,width:right-left,height:end-y});
  }
 }
 const scale=Math.min(332/Math.max(...crops.map(c=>c.height)),346/Math.max(...crops.map(c=>c.width)));
 for(const c of crops){
  const width=Math.round(c.width*scale),height=Math.round(c.height*scale);
  const input=await sharp(file).extract({left:c.left,top:c.top,width:c.width,height:c.height}).resize(width,height,{kernel:id.startsWith('pixel')?'nearest':'lanczos3'}).png().toBuffer();
  await sharp({create:{width:384,height:384,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input,left:Math.round((384-width)/2),top:359-height}]).png().toFile(path.join(dir,c.name));
 }
 console.log(`${id}: 12 sprites, common scale ${scale.toFixed(3)}`);
 return {id,split,scale,crops};
}
async function main(){
 const manifest=[];for(const id of ['duo','classic','mono','pixel','paper'])for(const suffix of ['','-night'])manifest.push(await pieces(id+suffix));
 for(const id of ['wood','marble','paper']){
  const file=path.join(dir,`board-sheet-${id}.png`),meta=await sharp(file).metadata(),half=Math.floor(meta.width/2);
  for(let side=0;side<2;side++)await sharp(file).extract({left:side*half+4,top:4,width:half-8,height:meta.height-8}).resize(256,256).png().toFile(path.join(dir,`board-${id}-${side?'dark':'light'}.png`));
 }
 fs.writeFileSync(path.join(dir,'extraction.json'),JSON.stringify(manifest,null,2));
}
main().catch(e=>{console.error(e);process.exit(1);});
