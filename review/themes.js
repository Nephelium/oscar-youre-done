(function(root){
  'use strict';
  const pieces=[
    {id:'duo',name:'圆润伙伴',note:'多邻国风格'},
    {id:'classic',name:'经典雕刻',note:'清晰的传统轮廓'},
    {id:'mono',name:'几何剪影',note:'利落的现代线条'}
  ];
  const boards=[
    {id:'duo',name:'云朵棋盘',note:'多邻国风格',colors:['#ffffff','#e9edef','#b0bdc3','#d7eaf2','#bad6e1','#77909b','#6f838d','#69808c']},
    {id:'sage',name:'鼠尾草',note:'柔和草木色',colors:['#eef1d7','#8fa96e','#5a7349','#dce6a1','#b7ca68','#507c3e','#5b7046','#f1f3dd']},
    {id:'wood',name:'奶油木纹',note:'温暖的午后',colors:['#f5e5c8','#bc906a','#9b7153','#eadb8f','#d1b267','#745b3c','#826140','#fff3db']},
    {id:'ocean',name:'深海蓝',note:'安静的夜色',colors:['#bdcdd5','#597487','#3b5365','#acd9db','#689da9','#304f67','#4d6675','#eef9ff']}
  ];
  const piece=id=>pieces.find(p=>p.id===id)||pieces[0],board=id=>boards.find(b=>b.id===id)||boards[0];
  const url=(set,color,type)=>piece(set).id==='classic'?`../vendor/pieces/${color}${type}.svg`:`assets/pieces/${piece(set).id}-${color}${type}.svg`;
  function apply(settings){
    const b=board(settings.boardTheme);
    ['light-square','dark-square','board-edge','last-light','last-dark','board-accent','coord-light','coord-dark'].forEach((k,i)=>document.documentElement.style.setProperty('--'+k,b.colors[i]));
    document.documentElement.dataset.boardTheme=b.id;
    document.documentElement.dataset.pieceSet=piece(settings.pieceSet).id;
  }
  const api={pieces,boards,piece,board,url,apply};
  if(typeof module==='object')module.exports=api;else root.ChessThemes=api;
})(typeof window!=='undefined'?window:globalThis);
