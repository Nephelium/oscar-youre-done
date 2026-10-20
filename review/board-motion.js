(function(root){
  'use strict';
  // Keep board-local geometry so scrolling the review never changes a move's path.
  function snapshot(board){
    if(!board)return null;
    const rect=board.getBoundingClientRect();
    return {fen:board.dataset.fen,record:board.dataset.record,flip:board.dataset.flip,pieces:[...board.querySelectorAll('[data-piece]')].map(img=>{
      const r=img.getBoundingClientRect();
      return {square:img.parentElement.dataset.square,key:img.dataset.piece,x:r.left-rect.left,y:r.top-rect.top,width:r.width,height:r.height,src:img.src};
    })};
  }
  function transition(from,to){
    function find(a,b,reverse){
      const g=new root.Chess(a);
      for(const m of g.moves({verbose:true})){
        g.move(m);const match=g.fen()===b;g.undo();
        if(match){
          const pairs=[[m.from,m.to]];
          if(m.flags.includes('k'))pairs.push(['h'+m.from[1],'f'+m.from[1]]);
          if(m.flags.includes('q'))pairs.push(['a'+m.from[1],'d'+m.from[1]]);
          return reverse?pairs.map(([a,b])=>[b,a]):pairs;
        }
      }
      return [];
    }
    return find(from,to,false).concat(find(to,from,true));
  }
  function pathPairs(rows,from,to){
    const low=Math.min(from,to),high=Math.max(from,to),positions=new Map();
    new root.Chess(rows[low].fen).board().forEach((row,r)=>row.forEach((p,c)=>{if(p){const square='abcdefgh'[c]+(8-r);positions.set(square,square);}}));
    for(let i=low+1;i<=high;i++){
      const m=rows[i],identity=positions.get(m.from);
      positions.delete(m.from);positions.set(m.to,identity);
      if(m.flags.includes('e'))positions.delete(m.to[0]+m.from[1]);
      if(m.flags.includes('k')||m.flags.includes('q')){
        const a=(m.flags.includes('k')?'h':'a')+m.from[1],b=(m.flags.includes('k')?'f':'d')+m.from[1];
        const rook=positions.get(a);positions.delete(a);positions.set(b,rook);
      }
    }
    const pairs=[...positions].filter(([to,from])=>from&&from!==to).map(([to,from])=>[from,to]);
    return from>to?pairs.map(([a,b])=>[b,a]):pairs;
  }
  function play(previous,board,enabled,options={}){
    if(!previous||!board||!enabled||previous.record!==board.dataset.record||previous.flip!==board.dataset.flip||previous.fen===board.dataset.fen)return;
    const pairs=options.pairs||transition(previous.fen,board.dataset.fen),rect=board.getBoundingClientRect(),duration=options.duration??240;
    const old=new Map(previous.pieces.map(p=>[p.square,p])),used=new Set();
    for(const img of board.querySelectorAll('[data-piece]')){
      const square=img.parentElement.dataset.square,from=pairs.find(p=>p[1]===square)?.[0];
      const before=old.get(from||square),r=img.getBoundingClientRect();
      if(before&&(from||before.key===img.dataset.piece)){
        used.add(from||square);
        const dx=before.x-(r.left-rect.left),dy=before.y-(r.top-rect.top);
        if(Math.abs(dx)+Math.abs(dy)>1){
          img.parentElement.style.zIndex='4';
          const a=img.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration,easing:'cubic-bezier(.2,.65,.25,1)'});
          a.finished.then(()=>{img.parentElement.style.zIndex='';}).catch(()=>{});
        }
      }else img.animate([{opacity:0},{opacity:1}],{duration:Math.min(180,duration)});
    }
    for(const p of previous.pieces){
      if(used.has(p.square)||board.querySelector(`[data-square="${p.square}"] [data-piece="${p.key}"]`))continue;
      const img=document.createElement('img');img.src=p.src;img.className='captured-piece';
      Object.assign(img.style,{left:p.x+'px',top:p.y+'px',width:p.width+'px',height:p.height+'px'});
      board.append(img);
      img.animate([{opacity:.85,transform:'scale(1)'},{opacity:0,transform:'scale(.8)'}],{duration:Math.min(160,duration)}).finished.then(()=>img.remove()).catch(()=>img.remove());
    }
    const badge=board.querySelector('.piece-review');
    if(badge)badge.animate([{opacity:0},{opacity:1}],{duration:Math.min(130,duration/2),delay:Math.min(130,duration/2),fill:'backwards'});
  }
  const isPlaying=board=>!!board?.getAnimations({subtree:true}).some(a=>a.playState==='running');
  root.BoardMotion={snapshot,play,isPlaying,pathPairs};
})(typeof window!=='undefined'?window:globalThis);
