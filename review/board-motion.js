(function(root){
  'use strict';
  // Keep board-local geometry so scrolling the review never changes a move's path.
  function snapshot(board){
    if(!board)return null;
    const rect=board.getBoundingClientRect();
    return {fen:board.dataset.fen,record:board.dataset.record,flip:board.dataset.flip,pieces:[...board.querySelectorAll('[data-piece]')].map(img=>{
      const r=img.getBoundingClientRect();
      return {square:img.parentElement.dataset.square,key:img.dataset.piece,x:r.left-rect.left,y:r.top-rect.top,src:img.src};
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
  function play(previous,board,enabled){
    if(!previous||!board||!enabled||previous.record!==board.dataset.record||previous.flip!==board.dataset.flip||previous.fen===board.dataset.fen)return;
    const pairs=transition(previous.fen,board.dataset.fen),rect=board.getBoundingClientRect();
    const old=new Map(previous.pieces.map(p=>[p.square,p])),used=new Set();
    for(const img of board.querySelectorAll('[data-piece]')){
      const square=img.parentElement.dataset.square,from=pairs.find(p=>p[1]===square)?.[0];
      const before=old.get(from||square),r=img.getBoundingClientRect();
      if(before&&(from||before.key===img.dataset.piece)){
        used.add(from||square);
        const dx=before.x-(r.left-rect.left),dy=before.y-(r.top-rect.top);
        if(Math.abs(dx)+Math.abs(dy)>1){
          img.parentElement.style.zIndex='4';
          const a=img.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:240,easing:'cubic-bezier(.2,.65,.25,1)'});
          a.finished.then(()=>{img.parentElement.style.zIndex='';}).catch(()=>{});
        }
      }else img.animate([{opacity:0},{opacity:1}],{duration:180});
    }
    for(const p of previous.pieces){
      if(used.has(p.square)||board.querySelector(`[data-square="${p.square}"] [data-piece="${p.key}"]`))continue;
      const img=document.createElement('img');img.src=p.src;img.className='captured-piece';
      Object.assign(img.style,{left:p.x+'px',top:p.y+'px',width:(rect.width-6)/8*.91+'px',height:(rect.width-6)/8*.91+'px'});
      board.append(img);
      img.animate([{opacity:.85,transform:'scale(1)'},{opacity:0,transform:'scale(.8)'}],{duration:160}).finished.then(()=>img.remove()).catch(()=>img.remove());
    }
    const badge=board.querySelector('.piece-review');
    if(badge)badge.animate([{opacity:0},{opacity:1}],{duration:130,delay:130,fill:'backwards'});
  }
  root.BoardMotion={snapshot,play};
})(typeof window!=='undefined'?window:globalThis);
