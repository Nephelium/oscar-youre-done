(function () {
  'use strict';
  const S = Sprout, host = window.SproutHost, $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const markContent = review => review?.book ? icon('book') : S.moveSymbol(review);
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const button = (text, action, cls = '', extra = '') => `<button class="button ${cls}" data-act="${action}" ${extra}>${text}</button>`;
  let legacyDemos = [], demoRecord = null;
  let library=NotebookLibrary.empty(),folderFilter='',favoriteId=null,deleteId=null,swipe=null,suppressCardClick=0;
  try{library=NotebookLibrary.validate(JSON.parse(localStorage.getItem('sprout.library.v1')||'null'));}catch(_){}
  const saveLibrary=next=>{localStorage.setItem('sprout.library.v1',JSON.stringify(next));library=next;};
  function favoriteDialog(id){favoriteId=id;const r=records.find(x=>x.id===id);if(!r)return;
    modal('收藏到…',`<p class="modal-copy">${esc(r.title)}</p><div class="folder-list">${[{id:'favorite',name:'我的收藏'},...library.folders].map(f=>`<label class="check-label"><input type="checkbox" name="favorite-folder" value="${esc(f.id)}" ${(library.entries[id]||[]).includes(f.id)?'checked':''}>${esc(f.name)}</label>`).join('')}</div><div class="row"><input id="folder-name" type="text" maxlength="40" placeholder="新建收藏夹" aria-label="收藏夹名称">${button('新建','createFolder','small')}</div>`,button('保存收藏','saveFavorite','primary'));
  }
  function deleteDialog(id){const r=allStored().find(x=>x.id===id);if(!r)return;deleteId=id;modal('删除这篇手记？',`<p class="modal-copy">${esc(r.title)}</p><p class="notice">棋谱、分析、推演和对应的校对图片会一起删除。</p>`,button('保留','close')+button('删除手记','confirmDelete','danger'));}
  function folderTools(){return `<div class="folder-tools"><select id="folder-filter" aria-label="筛选收藏夹"><option value="">全部手记</option><option value="favorite" ${folderFilter==='favorite'?'selected':''}>所有收藏</option>${library.folders.map(f=>`<option value="${esc(f.id)}" ${folderFilter===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}</select>${button('新建收藏夹','newFolder','small')}<span class="tiny muted">左滑手记可收藏或删除</span></div>`;}

  const isDemo = record => record?.id === 'oscar-demo-v1';
  const viewSide = () => flip ? 'b' : 'w';
  const viewLabel = () => flip ? '黑方' : '白方';
  const score = evaluation => S.displayScore(evaluation, viewSide());
  const numeric = evaluation => S.viewNumeric(evaluation, viewSide());
  const allStored = () => records.concat(legacyDemos);
  let records = [], route = 'home', current = null, ply = 0, branch = [], branchAt = 0, branchActive = false, correcting = false;
  let branchPly=0,branchId=null,autoTimer=null,playTimer=null,playing=false,autoAnalyzing=false,videoDialog=false,autoEpoch=0,analysisJob=null,animationRenderTimer=null;
  let selected = null, flip = false, tab = 'analysis', busy = false, progress = 0, analysisToken = 0, toastTimer, capture = {running:false}, video = {state:'idle'};
  let cropMode = 'capture', crop = null, cropStart = null, cropRequest = 0;
  let imageFen=null,notebook=localStorage.getItem('sprout.notebook')==='practice'?'practice':'game';
  let ratings=[],ratingEditId=null,curveRange=Number(localStorage.getItem('sprout.curveRange'))||2;
  let curveMode=localStorage.getItem('sprout.curveMode')==='win'?'win':'cp',curveDrag=null,rangePointer=null,curveFrame=0,ignoreCurveClickUntil=0,skipMotion=false,frameRows=null;
  const reviewRows=()=>frameRows||(frameRows=S.timeline(current));
  const activeRows=()=>playbackRows||(branchActive?S.variationRows(current,branchAt,branch):reviewRows());
  const activePly=()=>branchActive?branchAt+branchPly:ply;
  let playbackRows=null,playbackEpoch=0;
  let curveBranches=new Set(),branchPickerOpen=false,curveTrackId=null;
  const branchColors=['#467bc4','#b75a9d','#279c91','#cd6042','#8b6bcc','#888f29'];
  const comparedBranches=()=>current.branches.map((b,index)=>({b,index,color:branchColors[[...curveBranches].indexOf(b.id)%branchColors.length]})).filter(({b})=>curveBranches.has(b.id));
  const curveTotal=()=>Math.max(reviewRows().length-1,activeRows().length-1,...comparedBranches().map(({b})=>b.at+b.moves.length));
  function stopPlayback(){clearTimeout(playTimer);cancelAnimationFrame(playTimer);playTimer=null;playing=false;playbackRows=null;playbackEpoch++;}
  function storeBranch(manual=false){
    const moves=manual?branch.slice(0,branchPly):branch;
    if(correcting||!moves.length)return;
    if(!manual&&!S.shouldStoreBranch(current,branchAt,moves))return;
    branchId=S.addBranch(current,branchAt,moves).id;
    save();
  }
  function keepWholeAnalysis(){return busy&&analysisJob?.whole&&analysisJob.record===current;}
  function pauseForNavigation(){if(!keepWholeAnalysis())pauseAnalysis();}
  function goBranch(n){
    stopPlayback();pauseForNavigation();branchPly=Math.max(0,Math.min(branch.length,n));selected=null;
    if(branchPly===0&&!correcting){storeBranch();ply=branchAt;branchActive=false;branch=[];branchId=null;}
    render();if(branchActive)autoBranchAnalysis();
  }
  function autoBranchAnalysis(){
    if(keepWholeAnalysis())return;
    clearTimeout(autoTimer);autoEpoch++;
    if(!host||correcting||!branchActive||!settings.autoAnalysis||capture.running||video.state==='processing')return;
    pauseAnalysis();const epoch=autoEpoch;
    autoTimer=setTimeout(()=>{autoTimer=null;if(epoch===autoEpoch&&branchActive&&route==='review')runAutoBranch(epoch);},100);
  }
  async function runAutoBranch(epoch){
    if(busy)return;
    busy=true;autoAnalyzing=true;const token=++analysisToken,record=current,started=Date.now(),rows=activeRows(),cursor=activePly(),engine=JSON.parse(host.status()).engine;
    const stages=AnalysisPolicy.stages(settings),valid=()=>epoch===autoEpoch&&token===analysisToken&&route==='review'&&current===record&&branchActive;
    const fresh=(fen,budget,depth)=>{const a=record.analysis[fen];return a&&a.engine===engine&&S.probabilities(a)&&(a.lines[0]?.terminal||a.lines[0]?.depth>=depth||a.budget>=budget);};
    render();
    try{
      const queue=[rows[cursor],rows[Math.max(branchAt,cursor-1)],...rows.slice(branchAt)].filter(Boolean);
      const fens=[...new Set(queue.map(r=>r.fen))];
      for(const fen of fens){if(!valid())return;if(!fresh(fen,200,settings.autoDepth))await analyzeFen(fen,token,{budget:200,depth:settings.autoDepth});}
      for(const stage of stages){
        if(!valid())return;
        const fen=rows[cursor].fen;
        if(!stage.infinite&&fresh(fen,stage.budget,stage.depth))continue;
        const delay=stage.idle-(Date.now()-started);if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
        if(!valid())return;
        await analyzeFen(fen,token,stage);
      }
      if(valid())save(record);
    }catch(error){if(valid())toast(error.message);}
    finally{if(token===analysisToken){busy=false;autoAnalyzing=false;render();}}
  }
  try{ratings=Growth.list(JSON.parse(localStorage.getItem('sprout.elo.v1')||'[]'));}catch(_){toast('Elo 记录读取失败，请保留数据并恢复备份。');}
  function saveRatings(next){const valid=Growth.list(next);localStorage.setItem('sprout.elo.v1',JSON.stringify(valid));ratings=valid;}
  let drag=null,ghost=null,ignoreBoardClickUntil=0;
  const pending = new Map();
  let settings;
  try { settings = JSON.parse(localStorage.getItem('sprout.settings.v1') || '{}'); } catch (_) { settings = {}; }
  settings = {allowUndo:false,controls:false,budget:600,side:'w',moveFeedback:true,animation:!matchMedia('(prefers-reduced-motion: reduce)').matches,pieceSet:'duo',boardTheme:'duo',...settings};
  settings={...settings,...AnalysisPolicy.settings(settings)};
  if(host){try{const value=JSON.parse(host.status()).moveFeedback;if(typeof value==='boolean')settings.moveFeedback=value;}catch(_){}}
  settings.pieceSet=ChessThemes.piece(settings.pieceSet).id;settings.boardTheme=ChessThemes.board(settings.boardTheme).id;
  const systemAppearance=matchMedia('(prefers-color-scheme: dark)');
  let systemDark=systemAppearance.matches,nativeAppearance=null;
  if(host)try{const mode=JSON.parse(host.status()).nightMode;if(typeof mode==='boolean')systemDark=mode;}catch(_){}
  const isDark=()=>ChessThemes.dark(settings,systemDark);
  function applyAppearance(){
    ChessThemes.apply(settings,systemDark);
    const dark=isDark();$('meta[name="theme-color"]')?.setAttribute('content',dark?'#162022':'#faf8f1');
    if(nativeAppearance!==dark&&host?.setAppearance){host.setAppearance(dark);nativeAppearance=dark;}
  }
  function updateSystemAppearance(value){systemDark=value;applyAppearance();if(!playing)render();}
  systemAppearance.addEventListener('change',e=>{if(!host)updateSystemAppearance(e.matches);});
  const pieceUrl=(color,type)=>ChessThemes.url(settings.pieceSet,color,type,isDark());
  const pieceNames = {p:'兵',n:'马',b:'象',r:'车',q:'后',k:'王'};
  function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200); }
  function refresh() {
    try {
      const input = host ? JSON.parse(host.listGames()) : JSON.parse(localStorage.getItem('sprout.games.v1') || '[]');
      const valid = input.map(r=>{try{return S.validate(r);}catch(_){return null;}}).filter(Boolean).sort((a,b)=>b.updatedAt-a.updatedAt);
      legacyDemos = valid.filter(r=>r.source==='演示棋谱');
      records = valid.filter(r=>r.source!=='演示棋谱');
    } catch (_) { toast('棋谱读取失败，请保留当前数据并重新打开应用。'); }
  }
  function save(record = current) {
    if (!record || isDemo(record)) return;
    record.updatedAt=Date.now();
    if (host) { const error=host.saveGame(JSON.stringify(record)); if(error) throw Error(error); }
    const target=record.source==='演示棋谱'?legacyDemos:records, index=target.findIndex(r=>r.id===record.id);
    if(index<0) target.unshift(record); else target[index]=record;
    if(!host) localStorage.setItem('sprout.games.v1',JSON.stringify(allStored()));
  }
  function persistView() {
    localStorage.setItem('sprout.view.v1',JSON.stringify(isDemo(current)&&route==='review'?{route:'home'}:{route,id:current?.id,ply,branch,branchAt,branchPly,branchId,branchActive,correcting,flip,tab}));
  }
  function modal(title, content, actions = '') {
    if(playing){stopPlayback();render();}
    $('#modal-content').innerHTML=`<div class="modal-inner"><div class="modal-heading"><h2>${title}</h2><button class="icon-button" data-act="close" aria-label="关闭">${icon('close')}</button></div>${content}${actions?`<div class="modal-actions">${actions}</div>`:''}<p class="modal-error" role="alert" id="modal-error"></p></div>`;
    if(!$('#modal').open) $('#modal').showModal();
  }
  function closeModal() { $('#modal').close();videoDialog=false; }
  const brandMark=()=>'<span class="brand-mark"><img src="assets/oscar-panic.png" alt="奥斯卡抱头惊恐，黑王倒下"></span>';
  function header() { return `<header class="topbar"><div class="brand">${brandMark()}<div><div class="brand-name">奥斯卡你完了</div><div class="brand-en">OSCAR, YOU’RE DONE</div></div></div><div class="offline"><span></span>在手机里，慢慢进步</div></header>`; }
  function nav() { return `<nav class="bottom-nav" aria-label="主导航">${[['home','home','开始'],['games','book','手记'],['play','spark','下棋'],['growth','trend','成长'],['settings','tune','设置']].map(([r,i,t])=>`<button class="nav-button ${route===r?'active':''}" data-route="${r}" ${route===r?'aria-current="page"':''}>${icon(i)}<span>${t}</span></button>`).join('')}</nav>`; }
  function date(time) {return new Date(time).toLocaleDateString('zh-CN',{month:'short',day:'numeric'});}
  function card(r) {
    const summary=S.summary(r), issues=r.issues.filter(i=>!i.resolved).length;
    return `<div class="record-swipe"><div class="record-actions">${button('收藏','favorite','soft',`data-id="${esc(r.id)}"`)}${button('删除','deleteCard','danger',`data-id="${esc(r.id)}"`)}</div><button class="record-card" data-open="${esc(r.id)}"><span class="record-stamp"><img src="${pieceUrl(r.side,'n')}" alt=""></span><span class="grow"><h3>${esc(r.title)}</h3><p>${date(r.createdAt)} · ${r.moves.length} 步 · ${r.result==='*'?'未标记结果':esc(r.result)}</p><span class="pill ${issues?'warn':'gray'}">${issues?'待校对 '+issues+' 处':esc(r.source)}</span></span><span class="record-score">${summary.score??'—'}<small>${summary.score===null?'待分析':'表现分'}</small></span>${library.entries[r.id]?.length?'<span class="favorite-star" aria-label="已收藏">★</span>':''}</button><button class="card-menu" data-act="cardMenu" aria-label="收藏或删除手记">⋯</button></div>`;
  }
  function liveBanner() {
    if(capture.running)return `<div class="live-banner"><span class="live-dot"></span><div class="grow"><h3>${capture.paused?'记录已暂停':capture.awaitingPosition?'请先确认练习局面':'正在记录这一局'}</h3><p>${esc(capture.message)}</p></div>${button('控制','captureControl','small')}</div>`;
    if(['loading','processing','done','error'].includes(video.state)&&localStorage.getItem('sprout.lastVideo')!==video.gameId)return `<div class="live-banner"><span class="live-dot"></span><div class="grow"><h3>${video.state==='done'?'录屏导入完成':video.state==='error'?'录屏导入需处理':video.state==='loading'?'正在读取录屏':'正在识别录屏 · '+(video.progress||0)+'%'}</h3><p>${esc(video.message)}</p></div>${button('查看进度','videoProgress','small')}</div>`;
    return '';
  }
  function home() {
    const unresolved=records.filter(r=>r.issues.some(i=>!i.resolved)).length;
    const analyzed=records.filter(r=>{const a=S.summary(r);return a.total>0&&a.analyzed===a.total;}).length;
    return `${header()}<main class="page">${liveBanner()}<section class="hero"><div class="hero-copy"><div class="eyebrow">A LITTLE BETTER, EVERY GAME</div><h1>下完一局，<br>再进步一点。</h1><p>留住双方的每一步，<br>下完，再慢慢看懂。</p>${button(icon('record')+'记录一局','record','primary')}</div><div class="hero-art" aria-hidden="true"><div class="art-disc"></div><div class="art-tiles"></div><span class="art-star">✧</span><img class="hero-knight" src="${pieceUrl('w','n')}" alt=""><div class="art-leaf">${icon('spark')}</div><div class="art-label">记谱 · 复盘 · 自由推演</div></div></section><div class="quick-actions"><button class="quick-card" data-act="import"><span class="quick-icon">${icon('import')}</span><span><strong>导入棋谱</strong><small>棋谱 / 截图 / 备份</small></span>${icon('next')}</button><button class="quick-card" data-act="video"><span class="quick-icon">${icon('video')}</span><span><strong>从录屏记谱</strong><small>下完再导入，也可以</small></span>${icon('next')}</button></div>${eloHome()}<div class="stats"><div class="stat"><strong>${records.length}</strong><span>已存对局</span></div><div class="stat"><strong>${analyzed}</strong><span>完成分析</span></div><div class="stat"><strong>${unresolved}</strong><span>待校对</span></div></div><div class="section-heading"><h2>最近的棋局</h2><button class="text-button" data-route="games">全部对局 ${icon('next')}</button></div><div class="record-list">${records.length?records.slice(0,3).map(card).join(''):`<div class="empty-card">${icon('book')}<h3>第一局，从这里开始</h3><p>下棋前开启记录，结束后就能回看。</p></div>`}</div><div class="section-heading"><h2>先试一试</h2></div><button class="demo-card" data-act="demo">${icon('spark')}<div class="grow"><h3>18 回合的王翼攻势</h3><p>从开局到将杀，试试复盘与自由推演。</p></div>${icon('next')}</button>${legacyDemos.length?`<button class="text-button legacy-demos" data-act="legacyDemos">旧版演示与变化 · ${legacyDemos.length}</button>`:''}</main>${nav()}`;
  }
  function gamesPage() {
    const selectedRecords=records.filter(r=>r.notebook===notebook&&(!folderFilter||(folderFilter==='favorite'?library.entries[r.id]?.length:library.entries[r.id]?.includes(folderFilter))));
    return `${header()}<main class="page"><div class="page-heading"><div><h1>你的棋局手记</h1><p>完整对局，慢慢复盘。日常练习，随手记下。</p></div><button class="icon-button" data-act="import" aria-label="导入棋谱">${icon('plus')}</button></div>${liveBanner()}<div class="notebook-tabs" role="tablist" aria-label="手记分类">${[['game','完整对局'],['practice','小练习']].map(([key,title])=>`<button role="tab" aria-selected="${notebook===key}" class="${notebook===key?'active':''}" data-act="notebook" data-book="${key}">${title}<span>${records.filter(r=>r.notebook===key).length}</span></button>`).join('')}</div>${folderTools()}<div class="record-list records-grid">${selectedRecords.length?selectedRecords.map(card).join(''):`<div class="empty-card">${icon('book')}<h3>${notebook==='practice'?'把好奇的局面留在这里':'还没有保存的完整对局'}</h3><p>${notebook==='practice'?'从练习题开始记录，或导入一张截图。':'记录一局，或者导入已有棋谱。'}</p></div>`}</div><div class="row" style="margin-top:22px">${button(icon('plus')+'手动记一局','new','soft')}${button(icon('export')+'导出备份','backup')}</div></main>${nav()}`;
  }
  function appearanceSettings() {
    const sample=(set)=>['k','q','r','b','n','p'].map((p,i)=>`<span><img src="${ChessThemes.url(set,i<3?'w':'b',p,isDark())}" alt=""></span>`).join('');
    return `<section class="setting-card appearance-card"><h2>你的棋盘，你的风格</h2><p class="setting-intro">棋子和棋盘可以自由搭配。</p><label class="appearance-mode" for="appearance-mode"><strong>日夜模式</strong><select id="appearance-mode">${[['system','跟随系统'],['light','日间'],['dark','夜间']].map(([v,t])=>`<option value="${v}" ${(settings.appearance||'system')===v?'selected':''}>${t}</option>`).join('')}</select></label><h3 class="setting-label">棋子</h3><div class="piece-choices">${ChessThemes.pieces.map(p=>`<button class="theme-choice ${settings.pieceSet===p.id?'active':''}" data-act="pieceSet" data-value="${p.id}" aria-pressed="${settings.pieceSet===p.id}"><span class="piece-sample">${sample(p.id)}</span><span class="theme-name">${p.name}<small>${p.note}</small></span><span class="theme-check">${settings.pieceSet===p.id?'✓':''}</span></button>`).join('')}</div>${pieceSizeSettings()}<h3 class="setting-label">棋盘</h3><div class="board-choices">${ChessThemes.boards.map(b=>`<button class="board-choice ${settings.boardTheme===b.id?'active':''}" data-act="boardTheme" data-value="${b.id}" aria-pressed="${settings.boardTheme===b.id}"><span class="board-sample" style="--sample-light:${ChessThemes.colors(b.id,isDark())[0]};--sample-dark:${ChessThemes.colors(b.id,isDark())[1]}">${Array.from({length:8},(_,i)=>`<i style="${b.texture&&!isDark()?'background-image:url(assets/pieces/board-'+b.texture+'-'+([1,3,4,6].includes(i)?'dark':'light')+'.png);background-size:cover':''}">${[1,6].includes(i)?`<img src="${pieceUrl(i===1?'b':'w',i===1?'k':'n')}" alt="">`:''}</i>`).join('')}</span><strong>${b.name}</strong><small>${b.note}${settings.boardTheme===b.id?' · ✓':''}</small></button>`).join('')}</div></section>`;
  }
  function pieceSizeSettings(){
    return `<div class="piece-size-settings"><div class="row spread"><label for="piece-size"><strong>棋子大小</strong> <output id="piece-size-value">${ChessThemes.scale(settings)}%</output></label>${button('恢复默认','resetPieceSize','small')}</div><div class="piece-size-preview" aria-label="当前尺寸预览">${['wk','wq','wp','bk','bq','bp'].map((p,i)=>`<span class="size-cell ${i%2?'dark':''}"><img src="${pieceUrl(p[0],p[1])}" alt="${p[0]==='w'?'白':'黑'}${pieceNames[p[1]]}"></span>`).join('')}</div><input id="piece-size" type="range" min="85" max="125" step="1" value="${ChessThemes.scale(settings)}" aria-label="棋子大小"><div class="row spread tiny muted"><span>85% · 小巧</span><span>125% · 接近满格</span></div></div>`;
  }
  function autoAnalysisSettings(){return `<section class="setting-card auto-analysis-settings"><div class="setting-row"><div class="grow"><strong>变化自动分析</strong><p>每走一步更新兵值、胜率与走法评价</p></div><button role="switch" aria-checked="${settings.autoAnalysis}" class="toggle ${settings.autoAnalysis?'on':''}" data-act="autoAnalysis" aria-label="变化自动分析"><span></span></button></div><div class="setting-row"><div class="grow"><strong>计算速度</strong><p>自适应：先快算，停下来后逐步加深</p></div><select id="auto-speed" aria-label="自动分析速度" ${settings.autoAnalysis?'':'disabled'}>${[['adaptive','自适应'],['fast','快速 · 0.2 秒'],['balanced','均衡 · 0.7 秒'],['deep','深入 · 1.8 秒']].map(([v,t])=>`<option value="${v}" ${v===settings.autoSpeed?'selected':''}>${t}</option>`).join('')}</select></div><div class="setting-row"><div class="grow"><strong>深度上限</strong><p>自适应最多约 7 秒计算量</p></div><select id="auto-depth" aria-label="自动分析深度上限" ${settings.unlimitedAnalysis||!settings.autoAnalysis?'disabled':''}>${[12,16,20,24,28].map(n=>`<option value="${n}" ${n===settings.autoDepth?'selected':''}>${n} 层</option>`).join('')}</select></div><div class="setting-row"><div class="grow"><strong>持续分析，不限深度</strong><p>持续更新当前局面；离开复盘或进入后台即停止</p></div><button role="switch" aria-checked="${settings.unlimitedAnalysis}" class="toggle ${settings.unlimitedAnalysis?'on':''}" data-act="unlimitedAnalysis" aria-label="持续分析，不限深度" ${settings.autoAnalysis?'':'disabled'}><span></span></button></div></section>`;}
  function settingsPage() {
    return `${header()}<main class="page"><div class="page-heading"><div><h1>按自己的节奏</h1><p>棋谱与分析，保存在这台设备里。</p></div></div>${appearanceSettings()}${autoAnalysisSettings()}<section class="setting-card"><div class="setting-row"><div class="grow"><strong>对战允许悔棋</strong><p>退回自己上一手之前，同时撤回对方应手</p></div><button role="switch" aria-checked="${!!settings.allowUndo}" class="toggle ${settings.allowUndo?'on':''}" data-act="allowUndo" aria-label="对战允许悔棋"><span></span></button></div></section><section class="setting-card"><div class="setting-row"><div class="grow"><strong>走子动画</strong><p>平滑移动棋子，方便看清每一步</p></div><button role="switch" aria-checked="${!!settings.animation}" class="toggle ${settings.animation?'on':''}" data-act="animation" aria-label="走子动画"><span></span></button></div><div class="setting-row"><div class="grow"><strong>走子识别提示</strong><p>每次记到走法或撤回时短暂提示</p>${host&&!JSON.parse(host.status()).overlay?button("开启连续提示权限","overlay","small"):""}</div><button role="switch" aria-checked="${!!settings.moveFeedback}" class="toggle ${settings.moveFeedback?'on':''}" data-act="moveFeedback" aria-label="走子识别提示"><span></span></button></div><div class="setting-row"><div class="grow"><strong>分析用时</strong><p>每个局面的搜索时间，越久越充分</p></div><select id="budget" aria-label="分析用时">${[[600,'轻快 · 0.6 秒'],[1500,'细看 · 1.5 秒'],[3500,'深入 · 3.5 秒']].map(([n,t])=>`<option value="${n}" ${settings.budget===n?'selected':''}>${t}</option>`).join('')}</select></div><div class="setting-row"><div class="grow"><strong>记录时的小悬浮按钮</strong><p>可选，也可以从通知栏暂停与结束</p></div>${button('去设置','overlay','small')}</div><div class="setting-row"><div class="grow"><strong>保存一份棋谱备份</strong><p>包含手记、分析、推演与 Elo 历史</p></div><button class="icon-button" data-act="backup" aria-label="导出备份">${icon('export')}</button></div><div class="setting-row"><div class="grow"><strong>恢复备份 / 导入棋谱</strong><p>导入为副本，保留已有对局</p></div><button class="icon-button" data-act="import" aria-label="导入备份">${icon('import')}</button></div></section><section class="setting-card" style="margin-top:18px"><h3>表现分怎样计算？</h3><p class="analysis-copy" style="margin-top:10px">根据自己每步的局面评价损失计算：100 × exp(−平均损失 / 250)，损失以百分之一兵为单位，每步最多计 2000。它是奥斯卡你完了的复盘指标。尚未分析完整时，会显示已分析手数。</p><p class="analysis-copy" style="margin-top:8px">局面分数随棋盘底部颜色切换视角。正数表示该方占优，负数表示该方落后；M 表示将杀距离。翻转棋盘也会切换该方的表现统计。</p><p class="analysis-copy" style="margin-top:8px">棋子角标与棋谱采用同一套评级：书本表示已收录的开局理论走法，★ 表示引擎首选，! 表示好棋，✓ 表示稳健，?! / ? / ?? 表示逐级增加的评价损失。</p></section><div class="about-mark">${brandMark()}</div><p class="about-copy">奥斯卡你完了 1.3.3 · 离线记谱与复盘<br>chess.js · chesslib · Stockfish<br><button class="text-button" data-act="licenses">开源组件与许可</button></p></main>${nav()}`;
  }
  const levels=[[0,'轻松'],[3,'入门'],[7,'进阶'],[12,'挑战'],[17,'高手'],[20,'全力']];
  let battle=null,battleThinking=false,battleToken=0,battleError='',lastClockSave=0;
  try{const b=JSON.parse(localStorage.getItem('sprout.battle.v1')||'null');if(b&&typeof b.id==='string'&&['w','b'].includes(b.side)&&levels.some(([n])=>n===b.skill)){battle=b;battle.clock=BattleClock.restore(b.clock);}}catch(_){}
  const storeBattle=()=>localStorage.setItem('sprout.battle.v1',JSON.stringify(battle));
  function battleClocks(){
    const values=BattleClock.remaining(battle.clock,performance.now());
    return `<div class="battle-clock-label">${BattleClock.preset(battle.clock.preset).name} · ${battle.ended?'已结束':battle.clock.active?'计时中':'已暂停'}</div><div class="battle-clocks">${['w','b'].map(side=>`<div class="battle-clock ${battle.clock.active===side?'active':''}" data-clock-side="${side}"><span>${side==='w'?'白方':'黑方'} · ${side===battle.side?'你':'Stockfish'}</span><strong role="timer" aria-label="${side==='w'?'白方':'黑方'}剩余时间">${BattleClock.format(values[side])}</strong></div>`).join('')}</div>`;
  }
  function finishOnTime(side){
    if(!battle||battle.ended)return;
    const record=records.find(r=>r.id===battle.id);if(!record)return;
    const g=S.position(record),winner=side==='w'?'b':'w';
    const onlyKing=g.board().flat().filter(p=>p?.color===winner).every(p=>p.type==='k');
    record.result=onlyKing||g.insufficient_material()?'1/2-1/2':side==='w'?'0-1':'1-0';
    battle.ended=true;battle.endReason=(side==='w'?'白方':'黑方')+'超时 · '+(record.result==='1/2-1/2'?'和棋':winner==='w'?'白方获胜':'黑方获胜');
    BattleClock.pause(battle.clock,performance.now());battleToken++;battleThinking=false;pauseAnalysis();save(record);storeBattle();render();
  }
  function tickBattle(){
    if(route!=='play'||!battle?.clock||battle.ended||!battle.clock.active)return;
    const now=performance.now(),values=BattleClock.remaining(battle.clock,now),side=battle.clock.active;
    if(values[side]!==null&&values[side]<=0){finishOnTime(side);return;}
    document.querySelectorAll('[data-clock-side]').forEach(el=>{const side=el.dataset.clockSide;el.querySelector('strong').textContent=BattleClock.format(values[side]);el.classList.toggle('active',side===battle.clock.active);el.classList.toggle('urgent',values[side]!==null&&values[side]<=30000);});
    if(now-lastClockSave>=1000){BattleClock.settle(battle.clock,now);storeBattle();lastClockSave=now;}
  }
  function undoTarget(){
    if(!battle||battle.ended||!settings.allowUndo)return -1;
    const r=records.find(r=>r.id===battle.id);if(!r)return -1;
    let target=r.moves.length-1;if(target>=0&&S.position(r,target).turn()!==battle.side)target--;
    return target;
  }
  function undoBattle(){
    const target=undoTarget();if(target<0)return;
    pauseBattle();if(battle.ended)return;
    current.moves=current.moves.slice(0,target);current.result='*';ply=target;selected=null;
    BattleClock.rewind(battle.clock,target);BattleClock.start(battle.clock,viewGame().turn(),performance.now());battleError='';
    save();storeBattle();render();toast('已退回自己上一手之前。');
  }
  function playPage(){
    const r=battle&&records.find(r=>r.id===battle.id);
    if(!r)return `${header()}<main class="page play-setup"><div class="page-heading"><div><h1>和 Stockfish 下盘棋</h1><p>选一个适合自己的等级，下完直接复盘。</p></div></div><section class="setting-card"><h2>这次挑战哪个等级？</h2><div class="level-options">${levels.map(([n,t],i)=>`<label><input type="radio" name="play-level" value="${n}" ${i===1?'checked':''}><span><b>${t}</b><small>等级 ${i+1}</small></span></label>`).join('')}</div><label class="field">你执哪一方？</label><div class="side-options"><label class="side-option"><input type="radio" name="play-side" value="w" checked><img src="${pieceUrl('w','k')}" alt="">白方先行</label><label class="side-option"><input type="radio" name="play-side" value="b"><img src="${pieceUrl('b','k')}" alt="">黑方后行</label></div><label class="field" for="play-time">每方用时</label><select id="play-time" class="full">${BattleClock.presets.map(p=>`<option value="${p.id}" ${p.id==='10'?'selected':''}>${p.name}</option>`).join('')}</select>${button('开始对战','startBattle','primary full')}<p class="notice">六档使用 Stockfish 的棋力等级，不换算为 Elo。每一步自动保存。离开对战或进入后台会暂停计时。</p></section></main>${nav()}`;
    current=r;ply=r.moves.length;branchActive=false;selected=viewGame().turn()===battle.side?selected:null;
    const g=viewGame(),ended=battle.ended||g.game_over(),turn=g.turn()===battle.side;
    return `${header()}<main class="page battle-page"><div class="page-heading"><div><h1>Stockfish · ${levels.find(x=>x[0]===battle.skill)[1]}</h1><p>你执${battle.side==='w'?'白':'黑'} · ${r.moves.length} 步 · 自动保存</p></div>${button('复盘','battleReview','small')}</div><div class="battle-grid"><section class="battle-board"><div class="board-toolbar"><span class="turn-chip">${ended?'对局已结束':battleThinking?'Stockfish 正在思考…':turn?'轮到你走':battleError?'应手待重试':'轮到 Stockfish'}</span><button class="control-toggle ${settings.controls?'active':''}" data-act="controls" aria-pressed="${!!settings.controls}">控制格${settings.controls?' · 开':''}</button><button class="text-button" data-act="flip">${icon('flip')}翻转</button></div><div id="chessboard" class="chessboard" role="group" aria-label="国际象棋棋盘"></div></section><section class="battle-panel">${battleClocks()}<div class="battle-status" role="status">${ended?esc(battle.endReason||(r.result==='*'?'已收好棋谱，可以开始复盘':r.result==='1/2-1/2'?'和棋':r.result==='1-0'?'白方获胜':'黑方获胜')):!battle.clock.active?'已暂停 · 点继续对战恢复计时':battleError?esc(battleError):turn?'点选或拖动棋子，走出你的下一手。':'引擎正在准备应手。'}</div><div class="battle-moves">${S.timeline(r).slice(-8).filter(x=>x.san).map(x=>`<span>${x.moveNumber}${x.color==='w'?'.':'…'} ${esc(x.san)}</span>`).join('')}</div><div class="row battle-actions">${ended?button('再来一盘','newBattle','primary')+button('分析这盘棋','battleReview','soft'):(battle.clock.active?button('暂停','suspendBattle','soft'):button(battleError?'重试并继续':'继续对战','resumeBattle','primary'))+button('认输','resignBattle','danger')+(settings.allowUndo?button('悔棋','undoBattle','soft',undoTarget()<0?'disabled':''):'')}</div></section></div></main>${nav()}`;
  }
  function pauseBattle(){if(battle?.clock){const expired=BattleClock.pause(battle.clock,performance.now());storeBattle();if(expired&&!battle.ended)finishOnTime(expired);}battleToken++;battleThinking=false;pauseAnalysis();}
  async function requestBattleMove(){
    if(!host||!battle||battle.ended||!battle.clock.active||route!=='play'||battleThinking||viewGame().turn()===battle.side||viewGame().game_over())return;
    if(capture.running||video.state==='processing'){battleError='先结束记录或等待导入完成，再继续对战。';render();return;}
    const record=current,fen=viewGame().fen(),token=++battleToken;pauseAnalysis();battleThinking=true;battleError='';render();
    const request='p'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    try{
      const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(request);reject(Error('应手超时，点重试继续。'));},50000);pending.set(request,{resolve,reject,timer});host.playMove(request,JSON.stringify({initialFen:record.initialFen,moves:record.moves,skill:battle.skill}));});
      if(token!==battleToken||route!=='play'||current?.id!==record.id||viewGame().fen()!==fen)return;
      commitBattleMove(result.move);
    }catch(error){if(token===battleToken){battleError=error.message;BattleClock.pause(battle.clock,performance.now());storeBattle();}}
    finally{if(token===battleToken){battleThinking=false;render();}}
  }
  function commitBattleMove(input){const g=viewGame(),side=g.turn(),m=S.move(g,input);if(!m)throw Error('引擎走法无效，请重试。');const expired=BattleClock.move(battle.clock,side,g.turn(),performance.now());if(expired){finishOnTime(expired);return;}current.moves.push(S.uci(m));ply=current.moves.length;selected=null;
    if(g.in_checkmate()){current.result=g.turn()==='w'?'0-1':'1-0';battle.ended=true;}else if(g.in_draw()){current.result='1/2-1/2';battle.ended=true;}
    if(battle.ended)BattleClock.pause(battle.clock,performance.now());save();storeBattle();render();
  }
  function enterPlay(){pauseBattle();route='play';refresh();const r=battle&&records.find(r=>r.id===battle.id);if(r){current=r;ply=r.moves.length;branchActive=false;flip=battle.side==='b';if(!battle.ended)BattleClock.start(battle.clock,viewGame().turn(),performance.now());}selected=null;window.scrollTo(0,0);render();if(r)requestBattleMove();}
  function viewGame() {return playbackRows?new Chess(playbackRows[activePly()].fen):S.position(current,branchActive?branchAt:ply,branchActive?branch.slice(0,branchPly):[]);}
  function ratingChart(){
    const p=Growth.plot(ratings);if(!p.points.length)return '<div class="elo-empty">'+icon('trend')+'<h3>把今天的分数记下来</h3><p>第一条记录，就能成为曲线的起点。</p></div>';
    const label=e=>e.at.slice(5,10).replace('-','/'),first=p.points[0],last=p.points.at(-1);
    return `<svg class="elo-curve" viewBox="0 0 600 220" role="img" aria-label="手动记录的 Elo 随时间变化曲线">${p.ticks.map(v=>{const y=180-(v-p.min)/(p.max-p.min)*150;return `<path d="M52 ${y}H572" stroke="#e4e8da"/><text x="42" y="${y+4}" text-anchor="end">${v}</text>`;}).join('')}<path d="M${first.x},180 ${p.points.map(e=>`L${e.x},${e.y}`).join(' ')} L${last.x},180Z" fill="#dce8bf" opacity=".55"/><polyline points="${p.points.map(e=>`${e.x},${e.y}`).join(' ')}" fill="none" stroke="#507c3e" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>${p.points.map(e=>`<g><circle cx="${e.x}" cy="${e.y}" r="${e.id===last.id?6:4}" fill="#507c3e" stroke="#fffefb" stroke-width="2"/><title>${esc(e.at.replace('T',' '))} · ${e.elo} Elo</title></g>`).join('')}<text x="52" y="211">${label(first)}</text>${p.points.length>1?`<text x="572" y="211" text-anchor="end">${label(last)}</text>`:''}</svg>`;
  }
  function eloHome(){const last=ratings.at(-1);return `<button class="elo-home" data-route="growth"><span class="quick-icon">${icon('trend')}</span><span class="grow"><strong>${last?last.elo+' Elo':'记录当前 Elo'}</strong><small>${last?'最近记录 · '+esc(last.at.replace('T',' ')):'留一条属于自己的进步曲线'}</small></span>${icon('next')}</button>`;}
  function growthPage(){
    const last=ratings.at(-1),first=ratings[0],delta=last?last.elo-first.elo:0;
    return `${header()}<main class="page growth-page"><div class="page-heading"><div><div class="eyebrow">ONE MOVE AT A TIME</div><h1>Elo 成长手记</h1><p>记下分数，也记下认真下棋的日子。</p></div></div><section class="elo-panel"><div class="row spread"><div><span class="tiny muted">最近一次 Elo</span><div class="elo-current">${last?last.elo:'—'}<small>Elo</small></div></div>${button(icon('plus')+'记一笔','addRating','primary')}</div><div class="elo-meta"><span>${ratings.length} 条记录</span><span>${last?'较第一条 '+(delta>0?'+':'')+delta:'从今天开始'}</span>${last?'<span>最高 '+Math.max(...ratings.map(e=>e.elo))+'</span>':''}</div>${ratingChart()}<p class="tiny muted">手动记录多邻国分数，按记录时间排列。</p></section><div class="section-heading"><h2>每一次小进步</h2><button class="text-button" data-act="backup">导出备份 ${icon('export')}</button></div><div class="rating-list">${ratings.length?ratings.slice().reverse().map(e=>`<button class="rating-row" data-act="editRating" data-id="${esc(e.id)}"><span class="rating-dot"></span><span class="grow"><strong>${esc(e.at.replace('T',' '))}</strong>${e.note?`<small>${esc(e.note)}</small>`:''}</span><b>${e.elo}</b>${icon('next')}</button>`).join(''):'<p class="analysis-copy">下完一局，点“记一笔”录入当前分数。也可以补记以前的分数。</p>'}</div></main>${nav()}`;
  }
  function ratingDialog(entry){
    ratingEditId=entry?.id||null;
    modal(entry?'修改 Elo 记录':'记下此刻的 Elo',`<label class="field" for="rating-value">当前 Elo</label><input id="rating-value" type="number" min="0" max="4000" step="1" inputmode="numeric" placeholder="例如 800" value="${entry?.elo??''}"><label class="field" for="rating-at">记录时间</label><input id="rating-at" type="datetime-local" value="${entry?.at||Growth.localTime()}"><label class="field" for="rating-note">随手记一句（选填）</label><input id="rating-note" type="text" maxlength="120" placeholder="今天终于看到了那个将杀" value="${esc(entry?.note||'')}">`,(entry?button('删除','deleteRating','danger'):'')+button('保存记录','saveRating','primary'));
  }
  function branchComparisonControls() {
    if(!current.branches.length)return '';
    const selected=comparedBranches();
    return `<details class="curve-branches" ${branchPickerOpen?'open':''}><summary>对比分支 · ${selected.length}/6</summary><div class="curve-branch-options">${current.branches.map((b,i)=>{const chosen=curveBranches.has(b.id),color=selected.find(x=>x.b.id===b.id)?.color;return `<button data-act="curveBranch" data-id="${esc(b.id)}" aria-pressed="${chosen}" ${!chosen&&selected.length>=6?'disabled':''} style="--branch-color:${color||'var(--muted)'}">${chosen?'✓':'＋'} 分支 ${i+1}<small>第 ${b.at} 步起 · ${b.moves.length} 步</small></button>`;}).join('')}</div></details>${selected.length?`<div class="curve-legend"><span>● 实战</span>${selected.map(({b,index,color})=>`<button data-act="openCompared" data-id="${esc(b.id)}" style="color:${color}">● 分支 ${index+1}</button>`).join('')}${button('分析所选','analyzeCompared','small soft',busy?'disabled':'')}</div>`:''}`;
  }
  function openCompared(id,n) {
    const b=current.branches.find(b=>b.id===id);if(!b)return;
    curveTrackId=b.id;
    if(n!==undefined&&n<=b.at){goTo(n);return;}
    stopPlayback();pauseForNavigation();branchId=b.id;branchAt=b.at;branch=b.moves.slice();branchPly=Math.max(1,Math.min(branch.length,n===undefined?branch.length:n-b.at));branchActive=true;correcting=false;selected=null;tab='analysis';render();autoBranchAnalysis();
  }
  function chart(rows) {
    const scale=[2,5,10].includes(curveRange)?curveRange:2,active=activeRows();
    const available=active.concat(...comparedBranches().map(({b})=>S.variationRows(current,b.at,b.moves).slice(b.at))).some(r=>curveMode==='win'?S.probabilities(r.evaluation):S.numeric(r.evaluation)!==null);
    return `<div class="curve-tools"><div role="group" aria-label="局面曲线指标">${[['cp','兵值'],['win','胜率']].map(([v,t])=>`<button data-act="curveMode" data-value="${v}" aria-pressed="${curveMode===v}" class="${curveMode===v?'active':''}">${t}</button>`).join('')}</div><div role="group" aria-label="局面曲线纵轴范围">${curveMode==='win'?viewLabel()+'获胜概率':[2,5,10].map(n=>`<button data-act="curveScale" data-scale="${n}" aria-pressed="${n===scale}" class="${n===scale?'active':''}">±${n}</button>`).join('')}</div></div>${branchComparisonControls()}${branchActive?'<div class="curve-legend"><span>● 实战</span><span class="variation-key">● 当前变化</span></div>':''}<div class="curve-interaction"><svg class="curve" role="group" aria-label="局面曲线" data-empty="${!available}"></svg><input id="curve-scrub" class="curve-scrub" type="range" min="0" max="${active.length-1}" step="1" value="${activePly()}" aria-label="拖动查看局面"><div class="curve-readout"></div></div><p class="curve-caption">${curveMode==='win'?'Stockfish 自对弈模型估计 · 和棋概率单独显示':'兵值 · '+viewLabel()+'视角 · 边缘箭头表示超出范围或将杀'}</p>${curveMode==='win'&&!available?button('补充分析胜率','analyzeAll','small soft',busy?'disabled':''):''}`;
  }
  function drawCurve(svg) {
    const {width,height}=svg.getBoundingClientRect();if(!width||!height)return;
    const main=reviewRows(),rows=activeRows(),win=curveMode==='win',scale=[2,5,10].includes(curveRange)?curveRange:2,limit=scale*100;
    const left=win?38:32,right=width-13,top=17,bottom=height-33,mid=(top+bottom)/2,span=(bottom-top)/2,total=curveTotal();
    const x=i=>left+i/Math.max(1,total)*(right-left),y=n=>win?bottom-n/100*(bottom-top):mid-Math.max(-limit,Math.min(limit,n))/limit*span;
    const points=data=>data.map(r=>{const n=win?S.probabilities(r.evaluation,viewSide())?.win??null:numeric(r.evaluation);return n===null?null:{x:x(r.ply),y:y(n),ply:r.ply,n,label:win?n.toFixed(1)+'%':score(r.evaluation)};});
    function series(data,color,variation=false,savedId=null){const pts=points(data),segments=[];let part=[];for(const p of pts){if(p)part.push(p);else{if(part.length)segments.push(part);part=[];}}if(part.length)segments.push(part);
      return segments.map(a=>`<polyline class="${savedId?'saved-branch-line':variation?'variation-line':'mainline-line'}" points="${a.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="${color}" stroke-width="${variation?3.3:2.5}" stroke-linejoin="round"/>`).join('')+pts.filter(Boolean).map(p=>`<g role="button" tabindex="0" ${savedId?'data-saved-branch="'+esc(savedId)+'" data-branch-ply':variation?'data-variation-ply':'data-ply'}="${p.ply}" aria-label="${variation?'变化':'实战'}第 ${p.ply} 步，${esc(p.label)}"><circle cx="${p.x}" cy="${p.y}" r="10" fill="transparent"/><circle cx="${p.x}" cy="${p.y}" r="${activePly()===p.ply?4:2}" fill="${color}"/>${!win&&Math.abs(p.n)>limit&&(p.ply===activePly()||!pts.some(q=>q&&q.ply<p.ply&&Math.abs(q.n)>limit))?`<path d="M${p.x-4} ${p.y+(p.n>0?7:-7)}L${p.x} ${p.y}l4,${p.n>0?7:-7}" stroke="${color}" stroke-width="2" fill="none"/>`:''}<title>${esc(p.label)}</title></g>`).join('');}
    const comparisons=comparedBranches().map(x=>({...x,rows:S.variationRows(current,x.b.at,x.b.moves).slice(x.b.at)}));
    const hasData=points(rows).some(Boolean)||comparisons.some(x=>points(x.rows).some(Boolean));
    const cursor=activePly(),ticks=win?[100,75,50,25,0]:[scale,scale/2,0,-scale/2,-scale];
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label',viewLabel()+'视角的'+(win?'获胜概率曲线':'局面评价曲线，纵轴正负 '+scale+' 兵'));
    svg.innerHTML=ticks.map(v=>`<path d="M${left} ${y(win?v:v*100)}H${right}" stroke="#e4e8da" stroke-dasharray="3 4"/><text x="${left-8}" y="${y(win?v:v*100)}" dominant-baseline="middle" text-anchor="end">${win?v+'%':(v>0?'+':'')+v}</text>`).join('')+(!hasData?`<text x="${(left+right)/2}" y="${mid}" text-anchor="middle">分析后显示${win?'胜率':'兵值'}曲线</text>`:'')+series(main,'#507c3e')+comparisons.map(({b,color,rows})=>series(rows,color,true,b.id)).join('')+(branchActive?series(rows.slice(branchAt),'#bd7e23',true):'')+`<path class="curve-cursor" d="M${x(cursor)} ${top-4}V${bottom+5}" stroke="#a97528" stroke-dasharray="4 4"/>`+S.keyMoments(rows).map(k=>`<path d="M${x(k.ply)-3} ${bottom+12}l3,-4 3,4 -3,4Z" fill="#bd7e23"/>`).join('')+`<text x="${left}" y="${height-5}">起始</text><text x="${right}" y="${height-5}" text-anchor="end">${total} 步</text>`;
    const wrap=svg.closest('.curve-interaction'),slider=wrap.querySelector('#curve-scrub'),row=rows[cursor],prob=S.probabilities(row?.evaluation,viewSide());
    slider.style.marginLeft=(left-12.5)+'px';slider.style.width=`calc(100% - ${left-12}px)`;slider.max=total;slider.value=cursor;
    slider.setAttribute('aria-valuetext',`第 ${cursor} 步 ${row?.san||''}`);
    wrap.querySelector('.curve-readout').innerHTML=`<strong>${branchActive&&cursor>branchAt?'变化 · ':''}${cursor?'第 '+row.moveNumber+' 回合 · '+(row.color==='w'?'白':'黑')+' '+esc(row.san):'起始局面'}</strong><span>${viewLabel()} ${score(row?.evaluation)} · ${prob?'胜 '+prob.win.toFixed(1)+'% · 和 '+prob.draw.toFixed(1)+'% · 负 '+prob.loss.toFixed(1)+'%':'胜率待分析'}</span>`;
  }
  function branchPanel(){
    const rows=activeRows().slice(branchAt),list=rows.map((r,i)=>`<button class="branch-step ${i===branchPly?'active':''}" data-variation-ply="${branchAt+i}"><strong>${i?i+'. '+esc(r.san):'分支起点'}</strong><span>${score(r.evaluation)}</span><span>${S.probabilities(r.evaluation,viewSide())?.win.toFixed(1)??'—'}%</span></button>`).join('');
    return `<div class="branch-banner"><div class="row spread"><strong>${correcting?'补录棋谱':'当前变化'} · ${branchPly}/${branch.length} 步</strong><span class="tiny">${viewLabel()} · 兵值 / 胜率</span></div><div class="branch-steps">${list}</div><div class="row">${button(correcting?'保存校对':'保存变化',correcting?'saveCorrection':'saveBranch','small soft')}${button('回到实战','mainline','small')}${button('引擎应手','engineMove','small soft',(busy&&!autoAnalyzing)||viewGame().game_over()?'disabled':'')}</div></div>`;
  }

  const curveObserver=new ResizeObserver(entries=>entries.forEach(({target})=>{if(target.isConnected)drawCurve(target);}));
  function movesHtml(rows) {
    let html='',number=null;
    for(const r of rows.slice(1)) {
      if(r.moveNumber!==number) {
        if(number!==null)html+='</div>';
        number=r.moveNumber;html+=`<div class="move-pair"><span class="move-no">${number}.</span>${r.color==='b'?'<span class="move-placeholder">…</span>':''}`;
      }
      html+=`<button class="move-button ${!branchActive&&ply===r.ply?'active':''}" data-ply="${r.ply}"><span>${esc(r.san)}</span>${r.review?`<span class="mark ${r.review.tone}">${markContent(r.review)}</span>`:''}</button>`;
    }
    return html?html+'</div>':'<p class="muted tiny">在棋盘上走子，或导入棋谱。</p>';
  }
  function positionScore(game,evaluation) {
    if(game.in_checkmate())return game.turn()===viewSide()?'负':'胜';
    if(game.in_draw())return '和棋';
    return score(evaluation);
  }
  function analysisHtml(game,rows) {
    rows=activeRows();const index=activePly(),evaluation=current.analysis[game.fen()],row=rows[index];
    const terminal=game.game_over(),mate=game.in_checkmate(),details=S.explainMove(rows,index,viewSide());
    let heading=row?.review?row.review.label+' · '+row.san:row?.san?'走法 · '+row.san:'起始局面',tone=row?.review?.tone||'';
    if(terminal){heading=(mate?(game.turn()==='w'?'黑方完成将杀':'白方完成将杀'):'和棋局面')+(row?.san?' · '+row.san:'');tone=mate?(game.turn()===viewSide()?'bad':'good'):'soft';}
    const copy=details.paragraphs.filter(t=>!t.includes('百分点')&&!t.includes('评价损失')).map(esc).join('<br>');
    const delta=details.delta,chip=(n,suffix)=>`<span class="${n===null||n===undefined?'':n>=0?'up':'down'}">${n===null||n===undefined?'—':(n>0?'+':'')+n.toFixed(suffix==='兵'?2:1)}<small>${suffix}</small></span>`,deltas=`<div class="evaluation-deltas" aria-label="${viewLabel()}走子前后变化：兵值与获胜概率百分点" title="走子前后变化：兵值 / 获胜概率百分点">${chip(delta?.cp==null?null:delta.cp/100,'兵')}${chip(delta?.win,'%')}</div>`;
    const subtitle=(branchActive?'变化 · ':'')+(index?'第 '+row.moveNumber+' 回合 · '+(row.color==='w'?'白方':'黑方'):'起始局面');
    const depth=evaluation?.lines?.[0]?.depth||0;
    return `<div class="analysis-card review-assessment"><div class="analysis-heading"><span class="analysis-badge ${tone}">${icon(row?.review?.book?'book':row?.review?.best?'check':'spark')}</span><div class="analysis-title"><h2>${heading}</h2><small>${subtitle}</small></div><span class="score-chip">${positionScore(game,evaluation)}</span></div>${deltas}<p class="analysis-copy review-copy" tabindex="0" aria-label="走法说明">${copy}</p><button class="text-button detail-link" data-act="explain">展开完整说明${details.key?' · 关键节点':''}</button><div class="analysis-actions">${button(busy?icon('pause')+(autoAnalyzing?'自动分析中':'暂停分析'):icon('spark')+(branchActive?'分析这条变化':isDemo(current)?'重新分析整盘':'分析整盘'),busy?'pauseAnalysis':'analyzeAll','primary')}${terminal?button('回看上一步','prev','',(branchActive?branchPly===0:ply===0)?'disabled':''):button('分析此处','analyzeHere','',busy?'disabled':'')}</div><div class="compare-slot"></div><div class="progress-slot">${busy?`<div class="analyze-progress"><div style="width:${progress}%"></div></div><p class="tiny muted" style="margin-top:6px">正在分析 · ${progress}%</p>`:''}</div><p class="analysis-depth">${icon('sprout')}${evaluation?(evaluation.precomputed?'预置分析 · ':'')+esc(evaluation.engine)+(terminal?' · 终局':depth?' · 深度 '+depth:'')+' · ':''}${viewLabel()}视角</p></div>${`<div class="analysis-card candidates-card"><div class="row spread"><h3>可以试试</h3><span class="tiny muted">点击走法推演</span></div>${!terminal&&evaluation?.lines?.some(l=>l.pv.length)?evaluation.lines.map((l,i)=>{if(!l.pv.length)return '';const san=S.lineSan(game.fen(),l.pv,6);return `<button class="candidate" data-candidate="${i}"><span class="candidate-number">${i+1}</span><span class="candidate-moves"><strong>${esc(san[0])}</strong> ${esc(san.slice(1).join(' '))}</span><span class="candidate-score">${score({lines:[l]})}</span></button>`;}).join(''):`<p class="analysis-copy" style="margin-top:12px">${terminal?'本局已结束。回到前面一步，看看还有哪些选择。':'分析当前局面后，这里会列出推荐变化。'}</p>`}</div>`}`;
  }
  function navigationHtml(){
    const at=activePly(),base=branchActive?branchAt:0,end=branchActive?branchAt+branch.length:current.moves.length;
    const nav=(act,label,symbol,disabled,cls='')=>`<button class="icon-button ${cls}" data-act="${act}" aria-label="${label}" title="${label}" ${disabled?'disabled':''}>${icon(symbol)}</button>`;
    return `<div class="transport" role="group" aria-label="棋谱导航">${nav('first','回到起点','first',at===base)}${nav('prevKey','上一关键节点','prev-key',keyTarget(-1)===undefined,'key-navigation')}${nav('prev','上一步','back',at===base)}<span class="ply-counter">${branchActive?branchPly+' / '+branch.length+' 变化':ply+' / '+current.moves.length}</span>${nav('next','下一步','next',at===end,'primary-transport')}${nav('playKey','下一关键节点','next-key',keyTarget(1)===undefined,'key-navigation')}${nav('last','跳到终点','last',at===end)}</div>`;
  }
  function captureSegmentsHtml() {
    const c=current.capture||{}, available=new Set(allStored().map(r=>r.id));
    const previous=available.has(c.previousId)?c.previousId:null,next=available.has(c.nextId)?c.nextId:null;
    if(!previous&&!next)return '';
    return `<div class="row spread capture-segments"><span class="tiny muted">第 ${Number(c.segment)||1} 段 · 缺口前后分别保留</span><div class="row">${previous?`<button class="text-button" data-open="${esc(previous)}">上一段</button>`:''}${next?`<button class="text-button" data-open="${esc(next)}">续录下一段</button>`:''}</div></div>`;
  }
  function reviewPage() {
    const g=viewGame(),rows=reviewRows(),sum=S.summary(current,viewSide(),rows),issues=current.issues.filter(i=>!i.resolved);
    return `<main class="review-page"><header class="review-header"><button class="icon-button" data-act="home" aria-label="返回对局">${icon('back')}</button><div class="review-title grow"><h1>${esc(current.title)}</h1><p>${branchActive?(correcting?'校对棋谱':'自由推演'):esc(current.source)+' · '+current.moves.length+' 步'+(isDemo(current)?' · 不计入手记':'')}</p></div>${isDemo(current)?'<span class="pill gray">演示</span>':button('管理','rename','small')}${button(icon('export')+'导出','export','small')}</header><div class="stats compact-stats"><div class="stat"><strong>${sum.score??'—'}</strong><span>${viewLabel()}表现分</span></div><div class="stat"><strong>${sum.mistakes}</strong><span>失误 / 严重失误</span></div><div class="stat"><strong>${sum.analyzed}/${sum.total}</strong><span>已分析的${viewLabel()}走法</span></div></div><div class="review-grid"><section class="board-section"><div class="board-toolbar"><span class="turn-chip">${g.in_checkmate()?(g.turn()==='w'?'黑方胜 · 将死':'白方胜 · 将死'):g.in_draw()?'和棋':g.turn()==='w'?'○ 白方走':'● 黑方走'}</span>${branchActive?'<span class="pill warn">'+(correcting?'补录中':'变化')+'</span>':''}<button class="control-toggle ${settings.controls?'active':''}" data-act="controls" aria-pressed="${!!settings.controls}">控制格${settings.controls?' · 开':''}</button><button class="text-button" data-act="flip">${icon('flip')}翻转棋盘</button></div><div class="board-wrap"><div class="evaluation-bar ${flip?'black-view':''}" aria-label="${viewLabel()}局面评价"><div class="evaluation-white" style="height:${g.in_checkmate()?(g.turn()===viewSide()?0:100):g.in_draw()?50:numeric(current.analysis[g.fen()])===null?50:50+Math.tanh(numeric(current.analysis[g.fen()])/450)*46}%"></div></div><div id="chessboard" class="chessboard" role="group" aria-label="国际象棋棋盘"></div></div><div class="board-caption"><span>${branchActive?'在棋盘上继续走子':selected?'选择落点':'点选棋子，试试另一种走法'}</span><span class="score-chip">${viewLabel()} ${positionScore(g,current.analysis[g.fen()])}</span></div>${navigationHtml()}${branchActive?branchPanel():branch.length?button('继续刚才的变化','resumeBranch','small soft resume-branch'):''}</section><section class="analysis-section">${captureSegmentsHtml()}${issues.length?`<div class="issue-card"><div class="grow"><strong>${issues.length} 处棋谱需要校对</strong><p>保留了对应画面，可从这里补录。</p></div>${button('查看','issues','small')}</div>`:''}<div class="review-tabs"><button class="review-tab ${tab==='analysis'?'active':''}" data-tab="analysis">复盘</button><button class="review-tab ${tab==='moves'?'active':''}" data-tab="moves">棋谱</button><button class="review-tab ${tab==='branches'?'active':''}" data-tab="branches">分支 <small>${current.branches.length}</small></button></div>${tab==='analysis'?analysisHtml(g,rows):tab==='moves'?`<div class="analysis-card"><div class="row spread"><h3>局面起伏</h3><span class="tiny muted">${viewLabel()}视角</span></div>${chart(rows)}<div class="row spread" style="margin-top:10px"><h3>实战棋谱</h3><button class="text-button" data-act="rename">改名</button></div><div class="move-list">${movesHtml(rows)}</div></div>`:`<div class="analysis-card"><h3>不同的走法，分别留下</h3><p class="tiny muted" style="margin-top:7px">新路线满 3 步自动保存 · ${viewLabel()}视角 · 显示各分支末步局面</p><div class="branch-list">${current.branches.length?current.branches.map((b,i)=>{const last=S.variationRows(current,b.at,b.moves).at(-1),prob=S.probabilities(last.evaluation,viewSide());return `<button class="branch-item ${branchId===b.id&&branchActive?'active':''}" data-branch="${i}"><div class="row spread"><strong>分支 ${i+1}</strong><span class="branch-values">${score(last.evaluation)} <small>兵值</small> · ${prob?prob.win.toFixed(1)+'%':'—'} <small>胜率</small></span></div><small>从实战第 ${b.at} 步分出 · ${b.moves.length} 步</small><p>${esc(S.lineSan(S.position(current,b.at).fen(),b.moves,8).join(' '))}</p></button>`;}).join(''):'<p class="tiny muted">新路线走满 3 步后自动保存，也可随时点击保存变化。</p>'}</div></div>`}${tab==='analysis'?`<div class="analysis-card"><div class="row spread"><h3>局面起伏</h3><button class="text-button" data-tab="moves">查看棋谱 ${icon('next')}</button></div>${chart(rows)}</div>`:''}</section></div></main>`;
  }
  function render() {
    if(drag)return;
    if(playing)return;
    const activeBoard=$('#chessboard');
    if((route==='play'||route==='review')&&current&&activeBoard?.dataset.record===current.id&&activeBoard.dataset.fen===viewGame().fen()&&activeBoard.dataset.flip===String(flip)&&BoardMotion.isPlaying(activeBoard)){clearTimeout(animationRenderTimer);animationRenderTimer=setTimeout(render,260);return;}
    const analysisScroll=$('.analysis-section')?.scrollTop||0,battleScroll=$('.battle-panel')?.scrollTop||0;
    const scroll=window.scrollY,previous=BoardMotion.snapshot($('#chessboard'));
    const retainedCurve=(curveDrag||rangePointer!==null||document.activeElement?.id==='curve-scrub')?$('.curve-interaction'):null;
    frameRows=null;applyAppearance();
    const html=route==='review'&&current?reviewPage():route==='games'?gamesPage():route==='play'?playPage():route==='growth'?growthPage():route==='settings'?settingsPage():home();
    if(retainedCurve&&route==='review'){
      // Never detach a captured/focused control during scrubbing. Detached range inputs
      // lose their native drag session on Android even if immediately reattached.
      const fresh=document.createElement('div');fresh.innerHTML=html;
      function updateAround(oldNode,newNode){
        if(oldNode===retainedCurve)return;
        const oldBranch=[...oldNode.children].find(n=>n.contains(retainedCurve));
        const newBranch=[...newNode.children].find(n=>n.matches('.curve-interaction')||n.querySelector('.curve-interaction'));
        if(!oldBranch||!newBranch)return;
        [...oldNode.childNodes].filter(n=>n!==oldBranch).forEach(n=>n.remove());
        let before=true;
        for(const n of [...newNode.childNodes]){
          if(n===newBranch){before=false;continue;}
          if(before)oldNode.insertBefore(n,oldBranch);else oldNode.append(n);
        }
        updateAround(oldBranch,newBranch);
      }
      updateAround($('#app'),fresh);
    }else $('#app').innerHTML=html;
    if((route==='review'||route==='play'&&battle&&records.some(r=>r.id===battle.id))&&current){
      renderBoard();
      BoardMotion.play(previous,$('#chessboard'),settings.animation&&!skipMotion);skipMotion=false;
      if(route==='review'&&!branchActive&&tab==='analysis'&&ply>0){
        const rows=reviewRows(),review=rows[ply].review;
        if(review&&!review.best&&review.loss>=90&&current.analysis[rows[ply-1].fen]?.lines?.[0]?.pv?.length){
          const compare=document.createElement('button');compare.className='button small soft';compare.dataset.act='compare';compare.textContent='对照这一步的推荐走法';compare.style.flexBasis='100%';$('.compare-slot').append(compare);
        }
      }
      const slot=$('.compare-slot');
      if(slot&&!slot.children.length)slot.innerHTML=`<span class="compare-hint">${icon('spark')}${viewGame().game_over()?'回到前面，寻找另一种选择':'直接在棋盘上推演，试试其他选择'}</span>`;
    }
    curveObserver.disconnect();document.querySelectorAll('.curve').forEach(svg=>{drawCurve(svg);curveObserver.observe(svg);});
    if($('.analysis-section'))$('.analysis-section').scrollTop=analysisScroll;if($('.battle-panel'))$('.battle-panel').scrollTop=battleScroll;
    window.scrollTo(0,scroll);persistView();
  }
  function renderBoard() {
    const element=$('#chessboard');if(!element)return;
    const g=viewGame(),legal=selected?g.moves({square:selected,verbose:true}).map(m=>m.to):[];
    const last=branchActive?branch[branchPly-1]:current.moves[ply-1];
    const review=route==='play'?null:activeRows()[activePly()]?.review;
    const badge=review&&last?`<span class="piece-review ${review.tone}" role="img" aria-label="${esc(review.label)}：${S.moveSymbol(review)}">${markContent(review)}</span>`:'';
    const controls=settings.controls?ControlMap.compute(g):null;
    const squares=[];for(let row=0;row<8;row++)for(let col=0;col<8;col++) {
      const file=flip?7-col:col,rank=flip?row+1:8-row,square='abcdefgh'[file]+rank,p=g.get(square),c=controls?.[square],ratio=c?(c.w/(c.w+c.b)*100):0;
      squares.push(`<button class="square ${(row+col)%2?'dark':''} ${selected===square?'selected':''} ${legal.includes(square)?'legal':''} ${last&&(last.slice(0,2)===square||last.slice(2,4)===square)?'last':''}" data-square="${square}" aria-label="${square}${p?' '+(p.color==='w'?'白':'黑')+pieceNames[p.type]:' 空格'}">${c&&(c.w+c.b)?`<span class="control-fill" style="background:linear-gradient(90deg,#d99d40a8 ${ratio}%,#408bb6a8 ${ratio}%)"></span>`:''}${p?`<img data-piece="${p.color+p.type}" src="${pieceUrl(p.color,p.type)}" alt="" draggable="false">`:''}${p&&last?.slice(2,4)===square?badge:''}${col===0?`<span class="coord rank">${rank}</span>`:''}${row===7?`<span class="coord file">${'abcdefgh'[file]}</span>`:''}</button>`);
    }
    const candidate=current.analysis[g.fen()]?.lines?.[0]?.pv?.[0];
    if(route!=='play'&&candidate&&!selected){const coord=s=>{const f='abcdefgh'.indexOf(s[0]),r=8-Number(s[1]);return [((flip?7-f:f)+.5)*100,((flip?7-r:r)+.5)*100];},a=coord(candidate.slice(0,2)),b=coord(candidate.slice(2,4)),length=Math.hypot(b[0]-a[0],b[1]-a[1]),angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;squares.push(`<svg class="arrows" viewBox="0 0 800 800" aria-hidden="true"><path d="M0,-6.5 H${length-31} V-20 L${length},0 L${length-31},20 V6.5 H0 A6.5,6.5 0 0 1 0,-6.5 Z" transform="translate(${a[0]} ${a[1]}) rotate(${angle})" fill="#d89b36" opacity=".85"/></svg>`);}
    element.dataset.fen=g.fen();element.dataset.record=current.id;element.dataset.flip=String(flip);
    element.innerHTML=squares.join('');
  }
  function openRecord(id) {
    pauseBattle();stopPlayback();clearTimeout(autoTimer);current=isDemo({id})?demoRecord:allStored().find(r=>r.id===id);if(!current)return;closeModal();
    notebook=current.notebook;localStorage.setItem('sprout.notebook',notebook);
    curveBranches.clear();branchPickerOpen=false;curveTrackId=null;
    route='review';ply=0;branch=[];branchPly=0;branchId=null;branchActive=false;correcting=false;selected=null;flip=current.side==='b';tab='analysis';window.scrollTo(0,0);render();
  }
  function leave() {stopPlayback();clearTimeout(autoTimer);pauseAnalysis();route=current?.source==='演示棋谱'?'home':'games';selected=null;refresh();window.scrollTo(0,0);render();}
  function goTo(n) {stopPlayback();pauseForNavigation();branchActive=false;correcting=false;selected=null;ply=Math.max(0,Math.min(current.moves.length,n));render();}
  function applyMove(input) {
    if(route==='play'){if(!battle||battle.ended||!battle.clock.active||battleThinking||viewGame().turn()!==battle.side)return;commitBattleMove(input);requestBattleMove();return;}
    const g=viewGame(),m=S.move(g,input);if(!m){toast('这一步不符合当前局面的规则。');return;}
    const value=S.uci(m);selected=null;
    if(current.source==='手动录入'&&!branchActive&&ply===current.moves.length) {
      current.moves.push(value);ply++;
      if(g.in_checkmate())current.result=g.turn()==='w'?'0-1':'1-0';else if(g.in_draw())current.result='1/2-1/2';
      save();
    }
    else {if(!branchActive){branchAt=ply;branch=[];branchPly=0;branchId=null;branchActive=true;}if(branchPly<branch.length){storeBranch();branch=branch.slice(0,branchPly);branchId=null;}branch.push(value);branchPly=branch.length;storeBranch();}
    stopPlayback();render();if(branchActive)autoBranchAnalysis();
  }
  function squareClick(square) {
    if(playing){stopPlayback();render();}
    if(route==='play'&&(!battle||battle.ended||!battle.clock.active||battleThinking||viewGame().turn()!==battle.side))return;
    const g=viewGame(),p=g.get(square);
    if(selected) {
      const choices=g.moves({square:selected,verbose:true}).filter(m=>m.to===square);
      if(choices.length) {
        if(choices.some(m=>m.promotion)){modal('选择升变棋子',`<div class="side-options">${['q','r','b','n'].map(type=>`<button class="side-option" data-promote="${selected+square+type}"><img src="${pieceUrl(g.turn(),type)}" alt="${pieceNames[type]}"></button>`).join('')}</div>`);return;}
        applyMove(selected+square);return;
      }
    }
    selected=p&&p.color===g.turn()?(selected===square?null:square):null;renderBoard();
  }
  async function analyzeFen(fen,token,options=null) {
    if(!host)throw Error('请在安卓 App 中使用本地 Stockfish 分析。');
    if(token!==analysisToken)throw Error('分析已暂停');
    const request='a'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    const record=current;
    const result=await new Promise((resolve,reject)=>{
      const timer=options?.infinite?null:setTimeout(()=>{pending.delete(request);reject(Error('分析响应超时，请重试。'));},50000);
      const update=value=>{if(token!==analysisToken)return;if(!options||AnalysisPolicy.accept(record.analysis[fen],value)){record.analysis[fen]=value;if(route==='review'&&current===record)render();}};
      pending.set(request,{resolve,reject,timer,update,flush:()=>{if(options)save(record);}});
      if(options&&typeof host.analyzeLive==='function')host.analyzeLive(request,isDemo(record)?'':record.id,fen,JSON.stringify(options));
      else host.analyze(request,isDemo(record)?'':record.id,fen,options?.budget||Number(settings.budget));
    });
    if(token===analysisToken&&(!options||AnalysisPolicy.accept(record.analysis[fen],result)))record.analysis[fen]=result;
    if(options&&token===analysisToken&&route==='review'&&current===record)render();
    return result;
  }
  function pauseAnalysis() {
    analysisToken++;autoEpoch++;analysisJob=null;clearTimeout(autoTimer);busy=false;autoAnalyzing=false;if(host)host.cancelAnalysis();
    pending.forEach(({reject,timer,flush})=>{clearTimeout(timer);try{flush?.();}catch(error){toast(error.message);}reject(Error('分析已暂停'));});pending.clear();
  }
  async function analyze(all,silent=false,comparison=false) {
    if(busy)return;
    if(capture.running){toast('请先结束屏幕记录，再开始复盘分析。');return;}
    if(video.state==='processing'){toast('请等录屏识别完成，再开始分析。');return;}
    busy=true;autoAnalyzing=silent;progress=0;const token=++analysisToken;const record=current;analysisJob={whole:all,record,branch:branchActive};
    render();
    try {
      const rows=activeRows();const fens=comparison?[...new Set(comparedBranches().flatMap(({b})=>S.variationRows(record,b.at,b.moves).slice(b.at).map(r=>r.fen)))]:all?(branchActive?rows.slice(branchAt):rows).map(r=>r.fen):[...(activePly()>0?[rows[activePly()-1].fen]:[]),viewGame().fen()];
      const expectedEngine=host?JSON.parse(host.status()).engine:'';
      for(let i=0;i<fens.length;i++) {
        if(token!==analysisToken)break;
        if(!record.analysis[fens[i]] || !S.probabilities(record.analysis[fens[i]]) || (!silent&&isDemo(record)&&record.analysis[fens[i]].precomputed) || record.analysis[fens[i]].budget<settings.budget || record.analysis[fens[i]].engine!==expectedEngine)await analyzeFen(fens[i],token);
        progress=Math.round((i+1)/fens.length*100);if(route==='review'&&current===record)render();
      }
      if(token===analysisToken){save(record);if(!silent)toast(comparison?'所选分支分析好了。':all?(analysisJob?.branch?'这条变化分析好了。':'这一局分析好了。'):'当前局面分析好了。');}
    }catch(error){if(token===analysisToken)toast(error.message);}
    finally{if(token===analysisToken){busy=false;analysisJob=null;render();if(branchActive)autoBranchAnalysis();}}
  }
  function importDialog() {
    modal('把棋谱带进来',`<p class="modal-copy">导入棋谱、局面截图或手记备份。重复导入会保存为副本。</p><div class="stack">${button(icon('import')+'选择棋谱文件','pickFile','full')}${button(icon('spark')+'导入棋盘截图','image','full')}</div><label class="field" for="import-text">也可以直接粘贴 PGN / FEN</label><textarea id="import-text" placeholder="1. e4 e5 2. Nf3 Nc6 …" aria-label="棋谱内容"></textarea>`,button('导入内容','importText','primary'));
  }
  function importRecords(text) {
    let data;try{data=JSON.parse(text);}catch(_){/* PGN and FEN are plain text. */}
    const importedRatings=data?.elo===undefined?null:Growth.merge(ratings,data.elo);
    const list=S.importText(text);
    if(importedRatings)saveRatings(importedRatings);
    const importedIds=new Map();list.forEach(r=>{const oldId=r.id;if(isDemo(r)){r.id=S.id();r.source='演示推演';}else if(allStored().some(x=>x.id===r.id))r.id=S.id();save(r);importedIds.set(oldId,r.id);});if(data?.library)saveLibrary(NotebookLibrary.merge(library,data.library,importedIds,S.id));
    closeModal();if(list.length)openRecord(list[0].id);else{route='growth';render();}toast('已导入 '+list.length+' 篇手记'+(importedRatings?'和 Elo 记录。':'。'));
  }
  function recordDialog() {
    if(capture.running){captureControl();return;}
    modal('让这一局，留下棋谱',`<p class="modal-copy">先开启记录，再进入多邻国。等奥斯卡你完了准备好后再走子。</p><label class="field" for="capture-mode">从哪里开始？</label><select id="capture-mode" class="full"><option value="game">完整对局 · 从初始棋盘开始</option><option value="position">练习题 · 从当前局面开始</option></select><p class="notice">已内置多邻国棋子识别。练习题可从当前局面开始，识别后确认棋子和先走方。</p><label class="field">棋盘底部是哪一方？</label>${sideOptions()}<label class="check-label"><input type="checkbox" id="overlay-check">显示小悬浮按钮（可选）</label><p class="notice">若未自动定位，可以返回本应用手动框选。录制过程无需声音。</p>`,button(icon('record')+'开启屏幕记录','startCapture','primary'));
  }
  function sideOptions() {return `<div class="side-options"><label class="side-option"><input type="radio" name="side" value="w" ${settings.side==='w'?'checked':''}><img src="${pieceUrl('w','k')}" alt="">白方在下</label><label class="side-option"><input type="radio" name="side" value="b" ${settings.side==='b'?'checked':''}><img src="${pieceUrl('b','k')}" alt="">黑方在下</label></div>`;}
  function positionDialog(fen,mode='capture') {
      const board=new Chess(fen),cells=board.board().flat();if(settings.side==='b')cells.reverse();
      modal(mode==='video'?'从这个局面开始导入':mode==='image'?'保存截图里的局面':'从这道题开始记录',`<p class="modal-copy">核对棋子位置，再选择轮到哪一方走。确认后可以复盘或继续推演。</p><div class="position-preview" aria-label="识别到的练习局面">${cells.map((p,i)=>`<div class="${(Math.floor(i/8)+i%8)%2?'dark':''}">${p?`<img src="${pieceUrl(p.color,p.type)}" alt="${p.color==='w'?'白':'黑'}${pieceNames[p.type]}">`:''}</div>`).join('')}</div><label class="field" for="position-turn">轮到谁走？</label><select id="position-turn"><option value="w" ${board.turn()==='w'?'selected':''}>白方先走</option><option value="b" ${board.turn()==='b'?'selected':''}>黑方先走</option></select><details class="position-details"><summary>题目里的易位与吃过路兵</summary><p class="notice">截图无法确定这两项权利。题目若有说明，可在下方 FEN 补充。默认均关闭。</p><textarea id="position-fen" aria-label="练习局面 FEN" rows="3">${esc(fen)}</textarea></details>`,(mode==='video'?button('重新框选','cropVideo','soft'):'')+button(mode==='video'?'确认并识别录屏':mode==='image'?'保存到小练习':'确认局面，继续记录',mode==='video'?'confirmVideo':mode==='image'?'confirmImage':'confirmPosition','primary'));
  }
  function captureControl() {
    if(capture.pendingFen){positionDialog(capture.pendingFen);return;}
    const preview=host&&host.capturePreview();
    modal('这一局，正在留存',`<div class="live-banner"><span class="live-dot"></span><div><h3 id="capture-message">${capture.paused?'已暂停':esc(capture.message)}</h3><p id="capture-count">已确认 ${capture.plies||0} 步</p></div></div>${preview?`<button class="capture-preview" data-act="cropCapture"><img src="${preview}" alt="最近采集到的棋盘画面"><span>查看识别范围 ${icon('next')}</span></button>`:''}<p class="modal-copy">整个屏幕和仅共享多邻国都可以。先看下方预览是否包含完整棋盘，切回多邻国后继续自动记录。</p>${button('回到多邻国','openDuolingo','full primary')}${button(icon('tune')+'查看采集画面 / 调整选框','cropCapture','full')}<div class="row" style="margin-top:14px">${button(capture.paused?'继续记录':'暂停记录','pauseCapture','full')}</div>`,button('结束并复盘','stopCapture','primary'));
  }
  function showCrop(mode) {
    if(!host){toast('请在安卓 App 中使用画面采集。');return;}
    cropMode=mode;crop=null;cropStart=null;cropRequest++;
    const data=mode==='video'?host.videoPreview():mode==='image'?host.imagePreview():host.capturePreview();
    if(!data){toast('还没有采集到画面，请先切到多邻国显示棋盘。');return;}
    modal(mode==='video'?'从这段录屏记谱':mode==='image'?'从截图里读出局面':'框选棋盘',`<p class="modal-copy">自动定位完整棋盘。识别范围不准时，拖动框内可移动，拖动四角可调整大小，框外拖动可重画。${mode==='video'?'选择棋子静止的一帧作为起点。录屏用于不能悔棋的对局，练习题请导入截图。':''}</p><div id="preview-wrap" class="preview-wrap"><img id="crop-image" src="${data}" alt="待定位的棋盘画面"><div id="crop-box" class="crop-box" hidden>${['nw','ne','sw','se'].map(c=>`<span class="crop-handle ${c}" data-crop-handle="${c}"></span>`).join('')}</div></div>${mode==='video'?`<label class="field" for="video-time">录屏起点 · <span id="video-time-label">${((video.previewTime||0)/1000).toFixed(1)} 秒</span></label><input id="video-time" type="range" min="0" max="${Math.max(0,(video.duration||1)-1)}" step="1" value="${video.previewTime||0}" aria-label="录屏起始时间"><div class="video-time-entry"><label><input id="video-minutes" type="number" inputmode="numeric" min="0" max="90" step="1" value="${Math.floor((video.previewTime||0)/60000)}" aria-label="起点分钟">分</label><label><input id="video-seconds" type="number" inputmode="decimal" min="0" max="59.999" step="0.001" value="${Number((((video.previewTime||0)%60000)/1000).toFixed(3))}" aria-label="起点秒数">秒</label>${button("定位","seekVideoTime","small")}</div>`:''}<label class="field">预览棋盘底部是哪一方？</label>${sideOptions()}<p class="tiny muted" style="margin-top:10px">${mode==='capture'?'调整后更新范围，再回到多邻国继续下棋。':'不框选时自动定位。下一步可核对识别结果。'}</p>`,button(mode==='capture'?'更新棋盘范围':'识别起始局面','applyCrop','primary'));
    $('#crop-image').addEventListener('load',drawCrop);
    if(typeof host.suggestCrop==='function')host.suggestCrop(mode,cropRequest);
  }
  function cropPoint(event) {const r=$('#crop-image').getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))};}
  function drawCrop() {if(!crop)return;const image=$('#crop-image'),wrap=$('#preview-wrap'),box=$('#crop-box');if(!image||!wrap)return;const r=image.getBoundingClientRect(),w=wrap.getBoundingClientRect();box.hidden=false;Object.assign(box.style,{left:(r.left-w.left+crop.left*r.width)+'px',top:(r.top-w.top+crop.top*r.height)+'px',width:(crop.right-crop.left)*r.width+'px',height:(crop.bottom-crop.top)*r.height+'px'});}
  function issuesDialog() {
    const issues=current.issues.map((x,i)=>({...x,index:i})).filter(x=>!x.resolved);
    modal('把漏掉的几步补回来',`<p class="modal-copy">先看对应画面，再从最后确认的局面补走。原来的棋谱会保留一份修订记录。</p><div class="stack">${issues.map(i=>`<div class="issue-card"><div class="grow"><strong>第 ${i.at||0} 步之后</strong><p>${esc(i.message)}</p></div>${button('查看','issue','small',`data-index="${i.index}"`)}</div>`).join('')}</div>`);
  }
  function issueDetail(index) {
    const issue=current.issues[index],data=host&&issue.image?host.evidence(issue.image):'';
    modal('核对这一个局面',`<p class="modal-copy">${esc(issue.message)}</p>${data?`<img class="issue-image" src="${data}" alt="当时记录的棋盘画面">`:''}<p class="notice">从已确认的第 ${issue.at||0} 步开始补录。若记录已断开较久，也可以导入完整 PGN 另存一局。</p>`,button('从这里补走','beginCorrection','primary',`data-index="${index}"`));
  }
  function exportText(filename,text,mime='text/plain') {
    if(host){host.exportDocument(filename,text,mime);return;}
    const blob=new Blob([text],{type:mime}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function demo() {
    if(!demoRecord)demoRecord=S.demo();
    openRecord(demoRecord.id);toast('已附整盘深度分析，试试下一步查看走法评价。');
  }
  const actions={
    allowUndo:()=>{settings.allowUndo=!settings.allowUndo;localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));render();},
    suspendBattle:()=>{pauseBattle();render();},resumeBattle:()=>{if(battle&&!battle.ended){battleError='';BattleClock.start(battle.clock,viewGame().turn(),performance.now());storeBattle();render();requestBattleMove();}},undoBattle:()=>undoBattle(),
    autoAnalysis:()=>{settings.autoAnalysis=!settings.autoAnalysis;pauseAnalysis();localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));render();},
    unlimitedAnalysis:()=>{settings.unlimitedAnalysis=!settings.unlimitedAnalysis;pauseAnalysis();localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));render();},
    startBattle:()=>{if(!host||typeof host.playMove!=='function'){toast('请在更新后的安卓 App 中使用本地人机对战。');return;}if(capture.running||video.state==='processing')throw Error('请先结束记录或等待导入完成。');const skill=Number($('input[name=play-level]:checked').value),side=$('input[name=play-side]:checked').value;const r=S.create('与 Stockfish · '+levels.find(x=>x[0]===skill)[1]+' 的对局');r.source='Stockfish 对战';r.side=side;save(r);battle={id:r.id,side,skill,ended:false,clock:BattleClock.create($('#play-time').value)};storeBattle();enterPlay();},
    pauseBattle:()=>{pauseBattle();route='home';render();},retryBattle:()=>requestBattleMove(),
    battleReview:()=>openRecord(battle.id),newBattle:()=>{pauseBattle();battle=null;storeBattle();render();},
    resignBattle:()=>modal('结束这盘对局？','<p class="modal-copy">认输后棋谱会留在完整对局手记里，随时可以复盘。</p>',button('继续下棋','close')+button('认输并保存','confirmResign','danger')),
    confirmResign:()=>{pauseBattle();current.result=battle.side==='w'?'0-1':'1-0';battle.ended=true;save();storeBattle();closeModal();render();},
    moveFeedback:()=>{settings.moveFeedback=!settings.moveFeedback;localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));if(host)host.setMoveFeedback(settings.moveFeedback);render();},
    animation:()=>{settings.animation=!settings.animation;localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));render();},
    resetPieceSize:()=>{settings.pieceSizes={...settings.pieceSizes};delete settings.pieceSizes[settings.pieceSet];localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));render();},
    pieceSet:e=>{settings.pieceSet=ChessThemes.piece(e.dataset.value).id;localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));render();},
    boardTheme:e=>{settings.boardTheme=ChessThemes.board(e.dataset.value).id;localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));render();},
    curveMode:e=>{curveMode=e.dataset.value==='win'?'win':'cp';localStorage.setItem('sprout.curveMode',curveMode);render();},
    close:closeModal,home:leave,record:recordDialog,captureControl,import:importDialog,demo,
    legacyDemos:()=>modal('旧版演示与变化',`<p class="modal-copy">以前保存的演示已移到这里。分析和变化都还在，打开后可通过管理保留为正式手记。</p><div class="record-list">${legacyDemos.map(card).join('')}</div>`),
    keepLegacy:()=>{current.source='演示推演';legacyDemos=legacyDemos.filter(r=>r.id!==current.id);actions.saveTitle();toast('已保留到棋局手记。');},
    addRating:()=>ratingDialog(),editRating:e=>ratingDialog(ratings.find(r=>r.id===e.dataset.id)),
    saveRating:()=>{const old=ratings.find(r=>r.id===ratingEditId),value=$('#rating-value').value.trim();if(!value)throw Error('请填写当前 Elo。');const entry=Growth.validate({...old,elo:Number(value),at:$('#rating-at').value,note:$('#rating-note').value});saveRatings(ratings.filter(r=>r.id!==ratingEditId).concat(entry));closeModal();render();toast('Elo 已记下。');},
    deleteRating:()=>modal('删除这条 Elo 记录？','<p class="modal-copy">其他 Elo 记录和棋局手记都会保留。</p>',button('保留','close')+button('删除记录','confirmDeleteRating','danger')),
    confirmDeleteRating:()=>{saveRatings(ratings.filter(r=>r.id!==ratingEditId));closeModal();render();toast('这条 Elo 记录已删除。');},
    curveScale:e=>{curveRange=Number(e.dataset.scale);localStorage.setItem('sprout.curveRange',curveRange);render();},
    notebook:e=>{notebook=e.dataset.book==='practice'?'practice':'game';localStorage.setItem('sprout.notebook',notebook);render();},
    image:()=>{if(!host){toast('截图识别请在安卓 App 中使用。');return;}pauseAnalysis();closeModal();host.selectImage();},
    confirmImage:()=>{
      const fields=$('#position-fen').value.trim().split(/\s+/);fields[1]=$('#position-turn').value;
      const fen=fields.join(' ');S.validate({initialFen:fen,moves:[]});
      const saved=JSON.parse(host.confirmImage(JSON.stringify({fen,side:settings.side})));if(saved.error)throw Error(saved.error);
      closeModal();refresh();openRecord(saved.id);toast('截图已保存到小练习手记。');
    },
    controls:()=>{settings.controls=!settings.controls;localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));render();},
    favorite:e=>favoriteDialog(e.dataset.id),deleteCard:e=>deleteDialog(e.dataset.id),deleteRecord:()=>deleteDialog(current.id),
    cardMenu:e=>e.closest('.record-swipe').classList.toggle('open'),
    newFolder:()=>{favoriteId=null;modal('新建收藏夹','<input id="folder-name" type="text" maxlength="40" placeholder="例如：值得再看的残局" aria-label="收藏夹名称">',button('创建','createFolder','primary'));},
    createFolder:()=>{const name=$('#folder-name').value.trim();if(!name)throw Error('给收藏夹起一个名字吧。');if(library.folders.some(f=>f.name===name))throw Error('已经有同名收藏夹了。');if(library.folders.length>=100)throw Error('最多可创建 100 个收藏夹。');const next=NotebookLibrary.validate(library),id=S.id();next.folders.push({id,name});if(favoriteId){const ids=[...document.querySelectorAll('input[name=favorite-folder]:checked')].map(e=>e.value);next.entries[favoriteId]=[...ids,id];}saveLibrary(next);if(favoriteId)favoriteDialog(favoriteId);else{closeModal();folderFilter=id;render();}},
    saveFavorite:()=>{saveLibrary(NotebookLibrary.assign(library,favoriteId,[...document.querySelectorAll('input[name=favorite-folder]:checked')].map(e=>e.value)));closeModal();render();toast('收藏已保存。');},
    confirmDelete:()=>{
      const id=deleteId;if(!id)return;pauseAnalysis();
      if(host){const error=host.deleteGame(id);if(error)throw Error(error);}
      records=records.filter(r=>r.id!==id);legacyDemos=legacyDemos.filter(r=>r.id!==id);if(!host)localStorage.setItem('sprout.games.v1',JSON.stringify(allStored()));
      saveLibrary(NotebookLibrary.assign(library,id,[]));if(battle?.id===id){battle=null;storeBattle();}if(current?.id===id){current=null;branch=[];branchActive=false;if(route==='review')route='games';}deleteId=null;closeModal();render();toast('手记已删除。');
    },
    cropVideo:()=>showCrop('video'),
    confirmVideo:()=>{
      const fields=$('#position-fen').value.trim().split(/\s+/);fields[1]=$('#position-turn').value;
      const fen=fields.join(' ');S.validate({initialFen:fen,moves:[]});
      video={state:'processing',progress:0,plies:0};videoProgress();host.runVideo(JSON.stringify({confirmFen:fen}));poll();
    },
    videoProgress,openVideo:()=>{if(video.gameId){localStorage.setItem('sprout.lastVideo',video.gameId);refresh();openRecord(video.gameId);}},
    video:()=>host?host.selectVideo():toast('请在安卓 App 中导入录屏。'),
    pickFile:()=>$('#file-input').click(),importText:()=>importRecords($('#import-text').value),
    new:()=>{const r=S.create(notebook==='practice'?'手动记录的练习':'手动记录的对局');r.notebook=notebook;save(r);openRecord(r.id);},
    curveBranch:e=>{const id=e.dataset.id;if(curveBranches.has(id))curveBranches.delete(id);else if(curveBranches.size<6)curveBranches.add(id);branchPickerOpen=true;render();},
    openCompared:e=>openCompared(e.dataset.id),analyzeCompared:()=>analyze(true,false,true),
    flip:()=>{stopPlayback();flip=!flip;selected=null;render();},first:()=>playNavigation(branchActive?branchAt:0),last:()=>playNavigation(branchActive?branchAt+branch.length:current.moves.length),next:()=>branchActive?goBranch(branchPly+1):goTo(ply+1),
    prev:()=>branchActive?goBranch(branchPly-1):goTo(ply-1),
    mainline:()=>{curveTrackId=null;stopPlayback();clearTimeout(autoTimer);pauseForNavigation();branchActive=false;correcting=false;selected=null;ply=branchAt;render();},
    resumeBranch:()=>{branchActive=true;correcting=false;branchPly=Math.min(branchPly,branch.length);render();autoBranchAnalysis();},
    explain:()=>modal('逐步复盘说明',S.explainMove(activeRows(),activePly(),viewSide()).paragraphs.map(t=>'<p class="explanation-paragraph">'+esc(t)+'</p>').join('')),
    stopPlayback:()=>{stopPlayback();render();},playKey:()=>playToKey(1),prevKey:()=>playToKey(-1),
    analyzeAll:()=>analyze(true),analyzeHere:()=>analyze(false),pauseAnalysis:()=>{pauseAnalysis();render();},
    compare:()=>{const before=S.timeline(current)[ply-1];const input=current.analysis[before.fen]?.lines?.[0]?.pv?.[0];if(!input)return;branchAt=ply-1;branch=[];branchPly=0;branchId=null;branchActive=true;correcting=false;applyMove(input);},
    engineMove:async()=>{
      if(!host){toast('请在安卓 App 中使用引擎应手。');return;}
      if(capture.running)return;
      if(autoAnalyzing)pauseAnalysis();else if(busy)return;
      const fen=viewGame().fen();if(!current.analysis[fen])await analyze(false);
      if(viewGame().fen()!==fen)return;
      const input=current.analysis[fen]?.lines?.[0]?.pv?.[0];if(input)applyMove(input);else toast('当前局面没有可走的引擎应手。');
    },
    saveBranch:()=>{storeBranch(true);render();toast(isDemo(current)?'变化已留在本次演示中。':'变化已保存。');},
    rename:()=>modal('对局信息',`<label class="field" for="game-title">对局名称</label><input type="text" id="game-title" maxlength="100" value="${esc(current.title)}"><label class="field" for="game-notebook">放在哪本手记？</label><select id="game-notebook"><option value="game" ${current.notebook==='game'?'selected':''}>完整对局</option><option value="practice" ${current.notebook==='practice'?'selected':''}>小练习</option></select><label class="field" for="game-side">你执哪一方？</label><select id="game-side"><option value="w" ${current.side==='w'?'selected':''}>白方</option><option value="b" ${current.side==='b'?'selected':''}>黑方</option></select><label class="field" for="game-result">对局结果</label><select id="game-result">${[['*','未标记'],['1-0','白方胜'],['0-1','黑方胜'],['1/2-1/2','和棋']].map(([v,t])=>`<option value="${v}" ${current.result===v?'selected':''}>${t}</option>`).join('')}</select>`,button('删除这篇手记','deleteRecord','danger')+(current.source==='演示棋谱'?button('保留为手记','keepLegacy','soft'):'')+button('保存','saveTitle','primary')),
    saveTitle:()=>{current.title=$('#game-title').value.trim()||'新的对局';current.side=$('#game-side').value;current.result=$('#game-result').value;current.notebook=$('#game-notebook').value;notebook=current.notebook;localStorage.setItem('sprout.notebook',notebook);save();closeModal();render();},
    export:()=>modal('带走这局棋',`<p class="modal-copy">PGN 方便在其他棋类软件打开。完整备份还会保留分析结果、校对信息和推演变化。</p>`,button('导出 PGN','exportPgn','soft')+button('完整备份','exportGame','primary')),
    exportPgn:()=>{exportText(current.title+'.pgn',S.toPgn(current));closeModal();},
    exportGame:()=>{exportText(current.title+'.json',JSON.stringify({schema:1,games:[current]},null,2),'application/json');closeModal();},
    backup:()=>{exportText('奥斯卡你完了备份-'+Growth.localTime().slice(0,10)+'.json',JSON.stringify({schema:1,games:allStored(),elo:ratings,library},null,2),'application/json');},
    startCapture:()=>{
      if(!host){toast('屏幕记录需要安卓 App，网页可导入棋谱和自由走子。');return;}
      settings.side=$('input[name=side]:checked').value;localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));
      const overlay=$('#overlay-check').checked;if(overlay&&!JSON.parse(host.status()).overlay){toast('先开启悬浮窗权限，或取消勾选后从通知栏控制。');host.overlayPermission();return;}
        const mode=$('#capture-mode').value;
        closeModal();pauseAnalysis();host.startCapture(JSON.stringify({side:settings.side,overlay,mode}));
    },
      confirmPosition:()=>{
        const fields=$('#position-fen').value.trim().split(/\s+/);fields[1]=$('#position-turn').value;const fen=fields.join(' ');
        S.validate({initialFen:fen,moves:[]});
        if(fields[0]!==capture.pendingFen.split(' ')[0])throw Error('棋子位置有误时，请重新框选棋盘后识别。');
        host.captureAction('configure',JSON.stringify({confirmFen:fen}));closeModal();setTimeout(()=>{poll();captureControl();},450);
      },
    pauseCapture:()=>{host.captureAction('pause','{}');closeModal();setTimeout(()=>{poll();captureControl();},400);},
    stopCapture:()=>{const gameId=capture.gameId;host.captureAction('stop','{}');closeModal();setTimeout(()=>{poll();refresh();if(gameId)openRecord(gameId);},650);},
    openDuolingo:()=>host&&host.openDuolingo(),
    seekVideoTime:()=>{
      const minutes=$('#video-minutes'),seconds=$('#video-seconds');
      if(!minutes.value.trim()||!seconds.value.trim()||!minutes.checkValidity()||!seconds.checkValidity())throw Error('请输入有效的分钟和秒数，秒数小于 60。');
      const time=Math.round((Number(minutes.value)*60+Number(seconds.value))*1000);
      if(time>Math.max(0,(video.duration||1)-1))throw Error('起点不能超过录屏时长。');
      seekVideoTime(time);
    },
    cropCapture:()=>showCrop('capture'),applyCrop:()=>{
      const side=$('input[name=side]:checked').value;settings.side=side;localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));
      if(crop&&(crop.right-crop.left<.15||crop.bottom-crop.top<.08))throw Error('框选区域太小，请重新拖动。');
      const options=JSON.stringify({side,region:crop});
      if(cropMode==='video')host.prepareVideo(options);else if(cropMode==='image')host.recognizeImage(options);else host.captureAction('configure',options);
      if(cropMode==='capture')closeModal();toast(cropMode==='video'?'正在识别起始局面。':cropMode==='image'?'正在识别图片里的局面。':'已更新棋盘范围，请切回多邻国稍候。');
    },cancelVideo:()=>host&&host.cancelVideo(),overlay:()=>host?host.overlayPermission():toast('安卓 App 可设置悬浮窗。'),
    issues:issuesDialog,issue:e=>issueDetail(Number(e.dataset.index)),
    beginCorrection:e=>{const issue=current.issues[Number(e.dataset.index)];pauseAnalysis();branchAt=Math.min(current.moves.length,issue.at||0);ply=branchAt;branch=[];branchPly=0;branchId=null;branchActive=true;correcting=true;selected=null;closeModal();window.scrollTo(0,0);render();},
    saveCorrection:()=>{
      if(!branch.length)throw Error('先在棋盘上补走缺失的走法。');
      modal('保存这段补录？',`<p class="modal-copy">保留前 ${branchAt} 步，以补录的 ${branch.length} 步替换后续 ${current.moves.length-branchAt} 步。原稿会保留在完整备份的修订记录里。</p>`,button('继续补录','close')+button('保存校对','confirmCorrection','primary'));
    },
    confirmCorrection:()=>{
      const revised=current.moves.slice(0,branchAt).concat(branch);
      const archived=(current.revisions||[]).concat({at:Date.now(),moves:current.moves.slice(),issues:current.issues.map(x=>({...x}))});
      const next=S.validate({...current,moves:revised});next.revisions=archived;
      const placements=new Set(S.timeline(next).map(r=>r.fen.split(' ')[0]));
      next.issues.forEach(i=>{if(i.placement&&placements.has(i.placement))i.resolved=true;});
      current=next;save();branchActive=false;correcting=false;branch=[];ply=current.moves.length;closeModal();render();toast('补录已保存，仍有疑点的画面会继续保留。');
    },
    licenses:()=>modal('开源组件与许可',`<p class="modal-copy">奥斯卡你完了使用 chess.js（BSD-2-Clause）、chesslib（Apache-2.0）和 Stockfish（GPLv3）。棋子为项目原创素材。奥斯卡角色原型来自 Duolingo，应用图标依照参考图生成。</p><p class="notice">ARM64 使用 Stockfish 19 官方构建。x86_64 使用 F-Droid DroidFish 1.90 内的 Stockfish 16.1。分析结果记录实际引擎版本。</p><div class="stack" style="margin-top:16px">${button('Stockfish 19 对应源码','source19','small')}${button('Stockfish 16.1 对应构建源码','source16','small')}${button('查看 GPLv3 许可证','gpl','small')}</div><p class="analysis-copy" style="margin-top:14px">Stockfish 19: github.com/official-stockfish/Stockfish/tree/sf_19<br>x86_64: f-droid.org/repo/org.petero.droidfish_100_src.tar.gz<br>chesslib: github.com/bhlangonijr/chesslib/tree/1.3.7</p>`),
    source19:()=>host?host.openSource('stockfish19'):toast('源码：github.com/official-stockfish/Stockfish/tree/sf_19'),
    source16:()=>host?host.openSource('stockfish16'):toast('源码：f-droid.org/repo/org.petero.droidfish_100_src.tar.gz'),
    gpl:()=>{if(!host){toast('许可证位于 vendor/stockfish/Copying.txt。');return;}modal('GNU GPL v3',`<textarea readonly aria-label="GPLv3 许可证" style="height:50dvh">${esc(host.readLicense('stockfish'))}</textarea>`);}
  };
  document.addEventListener('click',event=>{
    const e=event.target.closest('button,[data-ply],[data-variation-ply],[data-saved-branch]');if(!e)return;
    try {
      if(e.dataset.act){actions[e.dataset.act]?.(e);return;}
      if(e.dataset.route){stopPlayback();clearTimeout(autoTimer);if(e.dataset.route==='play'){enterPlay();return;}pauseBattle();route=e.dataset.route;refresh();window.scrollTo(0,0);render();return;}
      if(e.dataset.open){if(Date.now()<suppressCardClick)return;const wrapper=e.closest('.record-swipe');if(wrapper?.classList.contains('open')){wrapper.classList.remove('open');return;}openRecord(e.dataset.open);return;}
    if(e.dataset.square){if(Date.now()>ignoreBoardClickUntil)squareClick(e.dataset.square);return;}
      if(e.dataset.savedBranch!==undefined){
        // Overlapping hit areas should select the closest visible point, not
        // whichever branch happened to be painted last.
        const svg=e.closest('svg'),rect=svg.getBoundingClientRect();
        const nearest=[...svg.querySelectorAll('[data-saved-branch]')].map(node=>{
          const dot=node.querySelector('circle:last-of-type');
          return {node,d:Math.hypot(event.clientX-rect.left-Number(dot.getAttribute('cx')),event.clientY-rect.top-Number(dot.getAttribute('cy')))};
        }).sort((a,b)=>a.d-b.d)[0]?.node||e;
        openCompared(nearest.dataset.savedBranch,Number(nearest.dataset.branchPly));return;
      }
      if(e.dataset.variationPly!==undefined){if(branchActive)goBranch(Number(e.dataset.variationPly)-branchAt);return;}
      if(e.dataset.keyPly!==undefined){playNavigation(Number(e.dataset.keyPly));return;}
      if(e.dataset.ply!==undefined){if(Date.now()>ignoreCurveClickUntil)goTo(Number(e.dataset.ply));return;}
      if(e.dataset.tab){tab=e.dataset.tab;render();return;}
      if(e.dataset.promote){closeModal();applyMove(e.dataset.promote);return;}
      if(e.dataset.branch!==undefined){pauseForNavigation();const b=current.branches[Number(e.dataset.branch)];branchId=b.id;branchAt=b.at;branch=b.moves.slice();branchPly=branch.length;branchActive=true;correcting=false;selected=null;render();autoBranchAnalysis();return;}
      if(e.dataset.candidate!==undefined){const g=viewGame(),l=current.analysis[g.fen()]?.lines[Number(e.dataset.candidate)];if(l?.pv?.length)applyMove(l.pv[0]);}
    } catch(error){if($('#modal').open)$('#modal-error').textContent=error.message;else toast(error.message);}
  });
  document.addEventListener('input',event=>{if(event.target.id!=='piece-size')return;settings.pieceSizes={...settings.pieceSizes,[settings.pieceSet]:Number(event.target.value)};applyAppearance();$('#piece-size-value').textContent=ChessThemes.scale(settings)+'%';localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));});
  document.addEventListener('change',event=>{if(event.target.id==='appearance-mode'){settings.appearance=event.target.value;localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));render();}if(event.target.id==='auto-speed'||event.target.id==='auto-depth'){settings[event.target.id==='auto-speed'?'autoSpeed':'autoDepth']=event.target.id==='auto-speed'?event.target.value:Number(event.target.value);localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));render();}if(event.target.id==='folder-filter'){folderFilter=event.target.value;render();}if(event.target.id==='budget'){settings.budget=Number(event.target.value);localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));}});
  function seekVideoTime(time) {
    $('#video-time').value=time;
    $('#video-time-label').textContent=(time/1000).toFixed(1)+' 秒';
    $('#video-minutes').value=Math.floor(time/60000);
    $('#video-seconds').value=Number(((time%60000)/1000).toFixed(3));
    $('#modal-error').textContent='';host.seekVideo(time);
  }
  document.addEventListener('change',event=>{if(event.target.id==='video-time')seekVideoTime(Number(event.target.value));});
  document.addEventListener('keydown',event=>{if(event.key==='Enter'&&['video-minutes','video-seconds'].includes(event.target.id)){event.preventDefault();try{actions.seekVideoTime();}catch(error){$('#modal-error').textContent=error.message;}}});
  document.addEventListener('pointerdown',event=>{
    const wrap=event.target.closest('#preview-wrap');if(!wrap)return;
    const point=cropPoint(event),handle=event.target.dataset.cropHandle;
    const inside=crop&&point.x>=crop.left&&point.x<=crop.right&&point.y>=crop.top&&point.y<=crop.bottom;
    cropStart={point,original:crop?{...crop}:null,mode:handle|| (inside?'move':'new')};
    wrap.setPointerCapture(event.pointerId);event.preventDefault();
  });
  document.addEventListener('pointermove',event=>{
    if(!cropStart||!$('#crop-image'))return;
    const end=cropPoint(event),{point,original:o,mode}=cropStart;
    if(mode==='new')crop={left:Math.min(point.x,end.x),top:Math.min(point.y,end.y),right:Math.max(point.x,end.x),bottom:Math.max(point.y,end.y)};
    else if(mode==='move'){
      const dx=Math.max(-o.left,Math.min(1-o.right,end.x-point.x)),dy=Math.max(-o.top,Math.min(1-o.bottom,end.y-point.y));
      crop={left:o.left+dx,right:o.right+dx,top:o.top+dy,bottom:o.bottom+dy};
    }else{
      crop={...o};if(mode.includes('w'))crop.left=Math.min(o.right-.03,end.x);else crop.right=Math.max(o.left+.03,end.x);
      if(mode.includes('n'))crop.top=Math.min(o.bottom-.03,end.y);else crop.bottom=Math.max(o.top+.03,end.y);
    }
    drawCrop();event.preventDefault();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,()=>{cropStart=null;});
  document.addEventListener('toggle',event=>{if(event.target.matches?.('.curve-branches'))branchPickerOpen=event.target.open;},true);
  window.addEventListener('resize',drawCrop);
  function scrubTo(n){
    if(route!=='review'||!current)return;
    // A screenshot has no mainline plies. Remember the chosen comparison even
    // when scrubbing back to its fork exits variation mode.
    if(branchActive&&branchId)curveTrackId=branchId;
    if(!branchActive){
      const candidates=comparedBranches().map(({b})=>b);
      const track=candidates.find(b=>b.id===curveTrackId)||
        ((!current.moves.length||n>current.moves.length)?candidates.sort((a,b)=>(b.at+b.moves.length)-(a.at+a.moves.length))[0]:null);
      if(track&&n>track.at){skipMotion=true;openCompared(track.id,n);return;}
    }
    if(!branchActive&&ply===n)return;
    skipMotion=true;navigateActive(n);
  }
  function navigateActive(n){if(branchActive)goBranch(Math.max(0,n-branchAt));else goTo(n);}
  function keyTarget(direction){
    const at=activePly(),floor=branchActive?branchAt:0;
    const keys=S.keyMoments(activeRows()).filter(k=>k.ply>=floor);
    return direction<0?keys.filter(k=>k.ply<at).at(-1)?.ply:keys.find(k=>k.ply>at)?.ply;
  }
  function playToKey(direction=1){const target=keyTarget(direction);if(target!==undefined)playNavigation(target);}
  function playNavigation(target){
    const start=activePly(),base=branchActive?branchAt:0,rows=activeRows();
    target=Math.max(base,Math.min(rows.length-1,target));
    stopPlayback();
    if(target===start)return;
    if(!settings.animation||Math.abs(target-start)===1){navigateActive(target);return;}
    pauseForNavigation();selected=null;clearTimeout(animationRenderTimer);
    playbackRows=rows;playing=true;
    const epoch=playbackEpoch,record=current,variation=branchActive,began=performance.now(),duration=1200,distance=Math.abs(target-start),sign=Math.sign(target-start);
    let shown=start;
    const finish=()=>{
      if(epoch!==playbackEpoch)return;
      $('#chessboard')?.getAnimations({subtree:true}).forEach(a=>a.finish());
      stopPlayback();skipMotion=true;
      if(variation)goBranch(target-base);else goTo(target);
    };
    const tick=now=>{
      if(epoch!==playbackEpoch||route!=='review'||record!==current)return;
      const elapsed=now-began;
      // Sample the timeline against wall time, so a long game never accumulates
      // hundreds of per-move delays. Piece identities survive sampled moves.
      const next=start+sign*Math.min(distance,Math.floor(elapsed/duration*distance)+1);
      if(next!==shown){
        const previous=BoardMotion.snapshot($('#chessboard'));
        if(variation)branchPly=next-base;else ply=next;
        renderBoard();
        BoardMotion.play(previous,$('#chessboard'),true,{duration:Math.max(16,Math.min(duration/distance,duration-elapsed)),pairs:BoardMotion.pathPairs(rows,shown,next)});
        shown=next;
        $('.transport').outerHTML=navigationHtml();
      }
      if(elapsed>=duration){finish();return;}
      playTimer=requestAnimationFrame(tick);
    };
    playTimer=requestAnimationFrame(tick);
  }
  function videoProgress(){
    videoDialog=true;
    modal('从录屏记录',`<div class="video-progress-view" role="status" aria-live="polite"><h3 id="video-stage"></h3><progress id="video-progress" max="100"></progress><strong id="video-percent"></strong><p id="video-detail"></p><p id="video-count"></p></div>`,
      button('先收起','close','soft')+button('停止并保留','cancelVideo','', 'id="video-stop"')+button('打开手记','openVideo','primary','id="video-open" hidden')+button('重新选择录屏','video','primary','id="video-retry" hidden'));
    updateVideoProgress();
  }
  function updateVideoProgress(){
    if(!videoDialog||!$('#video-stage'))return;
    const done=video.state==='done',error=video.state==='error',loading=video.state==='loading';
    $('#video-stage').textContent=done?(video.cancelled?'已停止，记录已保留':'录屏导入完成'):error?'录屏未能完成':loading?'正在读取录屏':'正在逐帧识别';
    const bar=$('#video-progress');if(loading)bar.removeAttribute('value');else bar.value=done?100:video.progress||0;
    $('#video-percent').textContent=loading?'读取视频时长与预览…':done?'已完成':error?'请重新选择录屏':(video.progress||0)+'%';
    $('#video-detail').textContent=video.message||'识别完成后可以打开手记复盘。';
    $('#video-count').textContent='已确认 '+(video.plies||0)+' 步'+(video.duration?' · 已处理 '+Math.floor((video.processedMs||0)/1000)+' / '+Math.ceil(video.duration/1000)+' 秒':'');
    $('#video-stop').hidden=done||error||loading;$('#video-open').hidden=!video.gameId||(!done&&!error);$('#video-retry').hidden=!error;
  }
  function curvePly(event){
    const r=$('.curve').getBoundingClientRect(),left=curveMode==='win'?38:32;
    const local=event.clientX-r.left,total=curveTotal();if(local>=r.width-22)return total;if(local<=left+5)return 0;return Math.round(Math.max(0,Math.min(1,(local-left)/(r.width-left-13)))*total);
  }
  document.addEventListener('input',event=>{if(event.target.id==='curve-scrub')scrubTo(Number(event.target.value));});
  document.addEventListener('pointerdown',event=>{if(event.target.id==='curve-scrub')rangePointer=event.pointerId;});
  document.addEventListener('pointerup',event=>{if(rangePointer===event.pointerId)rangePointer=null;});
  document.addEventListener('pointercancel',event=>{if(rangePointer===event.pointerId)rangePointer=null;});
  document.addEventListener('pointerdown',event=>{
    const svg=event.target.closest('.curve');if(!svg||event.button!==0||event.target.closest('[data-saved-branch]'))return;
    curveDrag={id:event.pointerId,x:event.clientX,y:event.clientY,ply:curvePly(event),moving:event.pointerType!=='touch',element:svg.closest('.curve-interaction')};
    curveDrag.element.setPointerCapture(event.pointerId);
    if(curveDrag.moving)scrubTo(curveDrag.ply);
  });
  document.addEventListener('pointermove',event=>{
    if(!curveDrag||curveDrag.id!==event.pointerId)return;
    if(!curveDrag.moving&&Math.abs(event.clientX-curveDrag.x)>8&&Math.abs(event.clientX-curveDrag.x)>Math.abs(event.clientY-curveDrag.y))curveDrag.moving=true;
    if(!curveDrag.moving)return;
    curveDrag.ply=curvePly(event);
    if(!curveFrame)curveFrame=requestAnimationFrame(()=>{curveFrame=0;if(curveDrag)scrubTo(curveDrag.ply);});
  });
  function endCurve(event,cancel=false){
    if(!curveDrag||event.pointerId!==curveDrag.id)return;
    const n=curvePly(event);cancelAnimationFrame(curveFrame);curveFrame=0;
    if(!cancel)scrubTo(n);
    curveDrag=null;ignoreCurveClickUntil=Date.now()+350;
  }
  document.addEventListener('pointerup',event=>endCurve(event));
  document.addEventListener('pointercancel',event=>endCurve(event,true));
  function endDrag(event,cancel=false){
    if(!drag)return;
    const from=drag.square,moved=drag.moved;ghost?.remove();ghost=null;drag.element.style.opacity='';drag=null;
    if(!moved)return;
    ignoreBoardClickUntil=Date.now()+350;
    if(cancel)return;
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-square]');
    if(target){skipMotion=true;selected=from;squareClick(target.dataset.square);skipMotion=false;}
  }
  document.addEventListener('pointerdown',event=>{
    const element=event.target.closest('[data-square]');if(!element||event.button!==0||!['review','play'].includes(route))return;
    if(playing)stopPlayback();
    if(route==='play'&&(!battle||battle.ended||!battle.clock.active||battleThinking||viewGame().turn()!==battle.side))return;
    const p=viewGame().get(element.dataset.square);if(!p||p.color!==viewGame().turn())return;
    drag={square:element.dataset.square,x:event.clientX,y:event.clientY,moved:false,element,piece:p};
    element.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove',event=>{
    if(!drag)return;
    if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>8){
      drag.moved=true;ghost=document.createElement('img');ghost.src=pieceUrl(drag.piece.color,drag.piece.type);
      const size=drag.element.getBoundingClientRect().width*.91*ChessThemes.scale(settings)/100;Object.assign(ghost.style,{position:'fixed',width:size+'px',height:size+'px',zIndex:'100',pointerEvents:'none',transform:'translate(-50%,-60%)',filter:'drop-shadow(0 6px 3px #263e3744)'});document.body.append(ghost);drag.element.style.opacity='.35';
    }
    if(ghost){ghost.style.left=event.clientX+'px';ghost.style.top=event.clientY+'px';event.preventDefault();}
  });
  document.addEventListener('pointerup',event=>endDrag(event));
  document.addEventListener('pointercancel',event=>endDrag(event,true));
  document.addEventListener('keydown',event=>{if(route==='review'&&!$('#modal').open&&!['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)){const point=event.target.closest('[data-ply],[data-variation-ply],[data-saved-branch]');if(point&&['Enter',' '].includes(event.key)){if(point.dataset.savedBranch!==undefined)openCompared(point.dataset.savedBranch,Number(point.dataset.branchPly));else if(point.dataset.variationPly!==undefined)goBranch(Number(point.dataset.variationPly)-branchAt);else goTo(Number(point.dataset.ply));event.preventDefault();return;}if(event.key==='Home'){actions.first();event.preventDefault();}if(event.key==='End'){actions.last();event.preventDefault();}if(event.key==='ArrowLeft'){event.shiftKey?actions.prevKey():actions.prev();event.preventDefault();}if(event.key==='ArrowRight'){event.shiftKey?actions.playKey():actions.next();event.preventDefault();}}});
  $('#file-input').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>12*1024*1024)throw Error('请选择小于 12 MB 的棋谱文件。');const text=await file.text();importRecords(text);}catch(error){toast(error.message);}finally{event.target.value='';}});
  document.addEventListener('pointerdown',event=>{const card=event.target.closest('.record-card');if(!card||event.button!==0)return;swipe={card,x:event.clientX,y:event.clientY,id:event.pointerId,started:false};});
  document.addEventListener('pointermove',event=>{if(!swipe||swipe.id!==event.pointerId)return;const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;if(!swipe.started&&Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){swipe=null;return;}if(Math.abs(dx)>18&&Math.abs(dx)>Math.abs(dy)){swipe.started=true;swipe.card.setPointerCapture(event.pointerId);swipe.card.closest('.record-swipe').classList.toggle('open',dx<0);suppressCardClick=Date.now()+500;}});
  for(const type of ['pointerup','pointercancel'])document.addEventListener(type,()=>{swipe=null;});
  let lastStatus='',lastVideoState='idle';
  function poll() {
    if(!host)return;
    try {
      const status=JSON.parse(host.status());capture=status.capture;video=status.video;
      const key=JSON.stringify({...status,capture:{...capture,decodedFrames:undefined,repeatedFrames:undefined}});
      if($('#capture-message'))$('#capture-message').textContent=capture.paused?'已暂停':capture.message;
      if($('#capture-count'))$('#capture-count').textContent='已确认 '+(capture.plies||0)+' 步';
      if(key!==lastStatus){lastStatus=key;if(route!=='review'&&!$('#modal').open){refresh();render();}}
      if(video.state==='ready'&&lastVideoState!=='ready'&&!$('#modal').open)showCrop('video');
      if(['loading','processing'].includes(video.state)&&lastVideoState!==video.state&&!$('#modal').open)videoProgress();
      if(video.state==='done'&&lastVideoState!=='done'){refresh();if(!$('#modal').open)render();}
      updateVideoProgress();
      if(video.state==='error'&&lastVideoState!=='error')toast(video.message);
      lastVideoState=video.state;
    }catch(_){/* A lifecycle transition can temporarily disconnect the bridge; the next resume refreshes. */}
  }
  window.App={
    hostEvent(event){
      if(event.type==='appearance')updateSystemAppearance(event.nightMode);
      if(event.type==='analysisUpdate'){pending.get(event.id)?.update?.(event.result);}
      if(event.type==='analysis'||event.type==='playMove'){const task=pending.get(event.id);if(task){clearTimeout(task.timer);pending.delete(event.id);event.error?task.reject(Error(event.error)):task.resolve(event.result);}}
      if(event.type==='captureStarted'){setTimeout(()=>{poll();captureControl();toast('记录已开启，可以回到多邻国。');},600);}
      if(event.type==='cropSuggested'&&event.requestId===cropRequest&&!crop&&!cropStart&&$('#crop-image')){crop=event.region;drawCrop();}
      if(event.type==='videoRecognized'){settings.side=event.side;positionDialog(event.fen,'video');}
      if(event.type==='videoPreviewUpdated'){poll();const img=$('#crop-image');if(img){img.src=host.videoPreview();if(!crop&&typeof host.suggestCrop==='function')host.suggestCrop('video',cropRequest);}}
      if(event.type==='videoLoading'){video={state:'loading'};videoProgress();}
      if(event.type==='videoReady'){closeModal();poll();showCrop('video');}
      if(event.type==='imageReady')showCrop('image');
      if(event.type==='imageRecognized'){imageFen=event.fen;positionDialog(imageFen,'image');}
      if(event.type==='videoLoadError'){video={state:'error',message:event.message};videoProgress();}
      if(event.type==='imageError'||event.type==='videoError'){toast(event.message);if(!$('#modal').open)showCrop(event.type==='videoError'?'video':'image');$('#modal-error').textContent=event.message;}
    },
    pause(){stopPlayback();clearTimeout(autoTimer);pauseBattle();persistView();},resume(){poll();refresh();if(route==='review'&&current&&!busy){const fresh=allStored().find(r=>r.id===current.id);if(fresh){current=fresh;ply=Math.min(ply,current.moves.length);}}render();if(route==='play')requestBattleMove();else if(route==='review'&&branchActive)autoBranchAnalysis();},
    back(){if($('#modal').open){closeModal();return true;}if(route==='review'){leave();return true;}if(route!=='home'){pauseBattle();route='home';render();return true;}return false;},
    get state(){return {playing,route,current,battle,battleThinking,analysisJob,library,ply,branch,branchPly,branchAt,branchActive,correcting,busy,settings,flip,demo:isDemo(current)};}
  };
  refresh();
  try {const saved=JSON.parse(localStorage.getItem('sprout.view.v1')||'{}');if(saved.route==='review'&&allStored().some(r=>r.id===saved.id)){current=allStored().find(r=>r.id===saved.id);route='review';ply=Math.min(saved.ply||0,current.moves.length);branchAt=saved.branchAt||0;branch=saved.branch||[];branchId=saved.branchId||null;branchPly=Number.isInteger(saved.branchPly)?Math.min(branch.length,saved.branchPly):branch.length;branchActive=!!saved.branchActive;correcting=!!saved.correcting;flip=!!saved.flip;tab=saved.tab||'analysis';viewGame();if(branchActive&&branchPly===0&&!correcting){storeBranch();ply=branchAt;branchActive=false;branch=[];branchId=null;}}}catch(_){route='home';branchActive=false;}
  render();poll();setInterval(poll,1500);setInterval(tickBattle,100);
})();
