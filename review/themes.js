(function(root){
  'use strict';
  const pieces=[
    {id:'duo',name:'多邻国',note:'熟悉的圆润棋子'},
    {id:'classic',name:'温润木雕',note:'枫木与深色胡桃木'},
    {id:'mono',name:'青瓷',note:'象牙白与午夜青'},
    {id:'pixel',name:'复古像素',note:'奶油金与薰衣草紫'},
    {id:'paper',name:'彩纸拼贴',note:'奶油纸与森林绿'}
  ];
  const boards=[
    {id:'duo',name:'云朵棋盘',note:'多邻国风格',colors:['#ffffff','#e9edef','#b0bdc3','#d7eaf2','#bad6e1','#77909b','#6f838d','#69808c']},
    {id:'sage',name:'鼠尾草',note:'柔和草木色',colors:['#eef1d7','#8fa96e','#5a7349','#dce6a1','#b7ca68','#507c3e','#5b7046','#f1f3dd']},
    {id:'wood',name:'枫木胡桃',note:'细腻天然木纹',texture:'wood',colors:['#f5e5c8','#bc906a','#9b7153','#eadb8f','#d1b267','#745b3c','#826140','#fff3db']},
    {id:'ocean',name:'深海蓝',note:'安静的夜色',colors:['#bdcdd5','#597487','#3b5365','#acd9db','#689da9','#304f67','#4d6675','#eef9ff']},
    {id:'marble',name:'月光石',note:'象牙石与蓝灰岩',texture:'marble',colors:['#e9e2d6','#92a5ba','#758394','#b9dcd8','#84b4b3','#52687c','#52687c','#ffffff']},
    {id:'paper',name:'手作纸',note:'暖奶油与赤陶',texture:'paper',colors:['#f3e6cc','#c68c73','#a97661','#f2db99','#d2b481','#996c48','#805d43','#fff8e7']},
    {id:'lavender',name:'暮色薰衣草',note:'柔和的平面配色',colors:['#eee9f6','#b4a6cf','#8c7baf','#ead8a2','#ccba8d','#77628d','#79688e','#faf6ff']},
    {id:'rose',name:'玫瑰可可',note:'低饱和奶油粉',colors:['#f8eae7','#cca8ad','#ad858d','#ece0af','#c5b58c','#936b75','#986f79','#fff7f3']}
  ];
  const piece=id=>pieces.find(p=>p.id===id)||pieces[0],board=id=>boards.find(b=>b.id===id)||boards[0];
  const nightColors={
    duo:['#27343a','#161f24','#39464f','#365965','#294b59','#9acada','#aec4cc','#aec4cc'],
    sage:['#53624b','#2c3c2c','#6a7e58','#697b49','#526639','#a9c980','#c6d1ad','#c6d1ad'],
    wood:['#6e5945','#342b27','#80664c','#8c7846','#625332','#e1b477','#e4d0ae','#e4d0ae'],
    ocean:['#415968','#233541','#5b7587','#4b7885','#32616f','#a2d5e4','#c2d8e5','#c2d8e5'],
    marble:['#54616e','#293644','#718393','#577e82','#375e65','#b9d5dc','#d1dee5','#d1dee5'],
    paper:['#6e574b','#3d302c','#8e7161','#8d794b','#665433','#e1b98c','#e8d4b9','#e8d4b9'],
    lavender:['#5d526e','#332c43','#817096','#7d6e63','#5c4e46','#c8b5df','#ded1ed','#ded1ed'],
    rose:['#6b505a','#3c2c36','#906b79','#887359','#5f4b3a','#ddb3c1','#ead3db','#ead3db']
  };
  const dark=(settings,systemDark=false)=>settings.appearance==='dark'||(settings.appearance!=='light'&&systemDark);
  const colors=(id,isDark=false)=>isDark?nightColors[board(id).id]:board(id).colors;
  const url=(set,color,type,isDark=false)=>`assets/pieces/${piece(set).id}${isDark?'-night':''}-${color}${type}.png`;
  const scale=settings=>{
    const id=piece(settings.pieceSet).id,value=settings.pieceSizes?.[id];
    return typeof value==='number'&&Number.isFinite(value)?Math.max(85,Math.min(125,value)):id==='duo'?100:112;
  };
  function apply(settings,systemDark=false){
    const b=board(settings.boardTheme),isDark=dark(settings,systemDark),palette=colors(b.id,isDark);
    document.documentElement.dataset.appearance=isDark?'dark':'light';
    document.documentElement.style.colorScheme=isDark?'dark':'light';
    ['light-square','dark-square','board-edge','last-light','last-dark','board-accent','coord-light','coord-dark'].forEach((k,i)=>document.documentElement.style.setProperty('--'+k,palette[i]));
    document.documentElement.dataset.boardTheme=b.id;
    document.documentElement.dataset.pieceSet=piece(settings.pieceSet).id;
    document.documentElement.style.setProperty('--piece-size',(91*scale(settings)/100)+'%');
    for(const side of ['light','dark'])document.documentElement.style.setProperty('--texture-'+side,b.texture?`url("assets/pieces/board-${b.texture}-${side}.png")`:'none');
  }
  const api={pieces,boards,piece,board,url,apply,scale,dark,colors};
  if(typeof module==='object')module.exports=api;else root.ChessThemes=api;
})(typeof window!=='undefined'?window:globalThis);
