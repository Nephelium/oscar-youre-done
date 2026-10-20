(function () {
  'use strict';
  const S = Sprout, host = window.SproutHost, $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const markContent = review => review?.book ? icon('book') : S.moveSymbol(review);
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const button = (text, action, cls = '', extra = '') => `<button class="button ${cls}" data-act="${action}" ${extra}>${text}</button>`;
  let legacyDemos = [], demoRecord = null;
  const isDemo = record => record?.id === 'oscar-demo-v1';
  const viewSide = () => flip ? 'b' : 'w';
  const viewLabel = () => flip ? '黑方' : '白方';
  const score = evaluation => S.displayScore(evaluation, viewSide());
  const numeric = evaluation => S.viewNumeric(evaluation, viewSide());
  const allStored = () => records.concat(legacyDemos);
  let records = [], route = 'home', current = null, ply = 0, branch = [], branchAt = 0, branchActive = false, correcting = false;
  let selected = null, flip = false, tab = 'analysis', busy = false, progress = 0, analysisToken = 0, toastTimer, capture = {running:false}, video = {state:'idle'};
  let cropMode = 'capture', crop = null, cropStart = null;
  let imageFen=null,notebook=localStorage.getItem('sprout.notebook')==='practice'?'practice':'game';
  let ratings=[],ratingEditId=null,curveRange=Number(localStorage.getItem('sprout.curveRange'))||2;
  let curveMode=localStorage.getItem('sprout.curveMode')==='win'?'win':'cp',curveDrag=null,rangePointer=null,curveFrame=0,ignoreCurveClickUntil=0,skipMotion=false,frameRows=null;
  const reviewRows=()=>frameRows||(frameRows=S.timeline(current));
  try{ratings=Growth.list(JSON.parse(localStorage.getItem('sprout.elo.v1')||'[]'));}catch(_){toast('Elo 记录读取失败，请保留数据并恢复备份。');}
  function saveRatings(next){const valid=Growth.list(next);localStorage.setItem('sprout.elo.v1',JSON.stringify(valid));ratings=valid;}
  let drag=null,ghost=null,ignoreBoardClickUntil=0;
  const pending = new Map();
  let settings;
  try { settings = JSON.parse(localStorage.getItem('sprout.settings.v1') || '{}'); } catch (_) { settings = {}; }
  settings = {budget:600,side:'w',animation:!matchMedia('(prefers-reduced-motion: reduce)').matches,pieceSet:'duo',boardTheme:'duo',...settings};
  settings.pieceSet=ChessThemes.piece(settings.pieceSet).id;settings.boardTheme=ChessThemes.board(settings.boardTheme).id;
  const pieceUrl=(color,type)=>ChessThemes.url(settings.pieceSet,color,type);
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
    localStorage.setItem('sprout.view.v1',JSON.stringify(isDemo(current)&&route==='review'?{route:'home'}:{route,id:current?.id,ply,branch,branchAt,branchActive,correcting,flip,tab}));
  }
  function modal(title, content, actions = '') {
    $('#modal-content').innerHTML=`<div class="modal-inner"><div class="modal-heading"><h2>${title}</h2><button class="icon-button" data-act="close" aria-label="关闭">${icon('close')}</button></div>${content}${actions?`<div class="modal-actions">${actions}</div>`:''}<p class="modal-error" role="alert" id="modal-error"></p></div>`;
    if(!$('#modal').open) $('#modal').showModal();
  }
  function closeModal() { $('#modal').close(); }
  const brandMark=()=>'<span class="brand-mark"><img src="assets/oscar-panic.png" alt="奥斯卡抱头惊恐，黑王倒下"></span>';
  function header() { return `<header class="topbar"><div class="brand">${brandMark()}<div><div class="brand-name">奥斯卡你完了</div><div class="brand-en">OSCAR, YOU’RE DONE</div></div></div><div class="offline"><span></span>在手机里，慢慢进步</div></header>`; }
  function nav() { return `<nav class="bottom-nav" aria-label="主导航">${[['home','home','开始'],['games','book','手记'],['growth','trend','成长'],['settings','tune','设置']].map(([r,i,t])=>`<button class="nav-button ${route===r?'active':''}" data-route="${r}" ${route===r?'aria-current="page"':''}>${icon(i)}<span>${t}</span></button>`).join('')}</nav>`; }
  function date(time) {return new Date(time).toLocaleDateString('zh-CN',{month:'short',day:'numeric'});}
  function card(r) {
    const summary=S.summary(r), issues=r.issues.filter(i=>!i.resolved).length;
    return `<button class="record-card" data-open="${esc(r.id)}"><span class="record-stamp"><img src="${pieceUrl(r.side,'n')}" alt=""></span><span class="grow"><h3>${esc(r.title)}</h3><p>${date(r.createdAt)} · ${r.moves.length} 步 · ${r.result==='*'?'未标记结果':esc(r.result)}</p><span class="pill ${issues?'warn':'gray'}">${issues?'待校对 '+issues+' 处':esc(r.source)}</span></span><span class="record-score">${summary.score??'—'}<small>${summary.score===null?'待分析':'表现分'}</small></span>${icon('next')}</button>`;
  }
  function liveBanner() {
    if(capture.running)return `<div class="live-banner"><span class="live-dot"></span><div class="grow"><h3>${capture.paused?'记录已暂停':capture.awaitingPosition?'请先确认练习局面':'正在记录这一局'}</h3><p>${esc(capture.message)}</p></div>${button('控制','captureControl','small')}</div>`;
    if(video.state==='processing')return `<div class="live-banner"><span class="live-dot"></span><div class="grow"><h3>正在识别录屏 · ${video.progress||0}%</h3><p>${esc(video.message)}</p></div>${button('停止','cancelVideo','small')}</div>`;
    return '';
  }
  function home() {
    const unresolved=records.filter(r=>r.issues.some(i=>!i.resolved)).length;
    const analyzed=records.filter(r=>{const a=S.summary(r);return a.total>0&&a.analyzed===a.total;}).length;
    return `${header()}<main class="page">${liveBanner()}<section class="hero"><div class="hero-copy"><div class="eyebrow">A LITTLE BETTER, EVERY GAME</div><h1>下完一局，<br>再进步一点。</h1><p>留住双方的每一步，<br>下完，再慢慢看懂。</p>${button(icon('record')+'记录一局','record','primary')}</div><div class="hero-art" aria-hidden="true"><div class="art-disc"></div><div class="art-tiles"></div><span class="art-star">✧</span><img class="hero-knight" src="${pieceUrl('w','n')}" alt=""><div class="art-leaf">${icon('spark')}</div><div class="art-label">记谱 · 复盘 · 自由推演</div></div></section><div class="quick-actions"><button class="quick-card" data-act="import"><span class="quick-icon">${icon('import')}</span><span><strong>导入棋谱</strong><small>棋谱 / 截图 / 备份</small></span>${icon('next')}</button><button class="quick-card" data-act="video"><span class="quick-icon">${icon('video')}</span><span><strong>从录屏记谱</strong><small>下完再导入，也可以</small></span>${icon('next')}</button></div>${eloHome()}<div class="stats"><div class="stat"><strong>${records.length}</strong><span>已存对局</span></div><div class="stat"><strong>${analyzed}</strong><span>完成分析</span></div><div class="stat"><strong>${unresolved}</strong><span>待校对</span></div></div><div class="section-heading"><h2>最近的棋局</h2><button class="text-button" data-route="games">全部对局 ${icon('next')}</button></div><div class="record-list">${records.length?records.slice(0,3).map(card).join(''):`<div class="empty-card">${icon('book')}<h3>第一局，从这里开始</h3><p>下棋前开启记录，结束后就能回看。</p></div>`}</div><div class="section-heading"><h2>先试一试</h2></div><button class="demo-card" data-act="demo">${icon('spark')}<div class="grow"><h3>18 回合的王翼攻势</h3><p>从开局到将杀，试试复盘与自由推演。</p></div>${icon('next')}</button>${legacyDemos.length?`<button class="text-button legacy-demos" data-act="legacyDemos">旧版演示与变化 · ${legacyDemos.length}</button>`:''}</main>${nav()}`;
  }
  function gamesPage() {
    const selectedRecords=records.filter(r=>r.notebook===notebook);
    return `${header()}<main class="page"><div class="page-heading"><div><h1>你的棋局手记</h1><p>完整对局，慢慢复盘。日常练习，随手记下。</p></div><button class="icon-button" data-act="import" aria-label="导入棋谱">${icon('plus')}</button></div>${liveBanner()}<div class="notebook-tabs" role="tablist" aria-label="手记分类">${[['game','完整对局'],['practice','小练习']].map(([key,title])=>`<button role="tab" aria-selected="${notebook===key}" class="${notebook===key?'active':''}" data-act="notebook" data-book="${key}">${title}<span>${records.filter(r=>r.notebook===key).length}</span></button>`).join('')}</div><div class="record-list records-grid">${selectedRecords.length?selectedRecords.map(card).join(''):`<div class="empty-card">${icon('book')}<h3>${notebook==='practice'?'把好奇的局面留在这里':'还没有保存的完整对局'}</h3><p>${notebook==='practice'?'从练习题开始记录，或导入一张截图。':'记录一局，或者导入已有棋谱。'}</p></div>`}</div><div class="row" style="margin-top:22px">${button(icon('plus')+'手动记一局','new','soft')}${button(icon('export')+'导出备份','backup')}</div></main>${nav()}`;
  }
  function appearanceSettings() {
    const sample=(set)=>['k','q','r','b','n','p'].map((p,i)=>`<span><img src="${ChessThemes.url(set,i<3?'w':'b',p)}" alt=""></span>`).join('');
    return `<section class="setting-card appearance-card"><h2>你的棋盘，你的风格</h2><p class="setting-intro">棋子和棋盘可以自由搭配。</p><h3 class="setting-label">棋子</h3><div class="piece-choices">${ChessThemes.pieces.map(p=>`<button class="theme-choice ${settings.pieceSet===p.id?'active':''}" data-act="pieceSet" data-value="${p.id}" aria-pressed="${settings.pieceSet===p.id}"><span class="piece-sample">${sample(p.id)}</span><span class="theme-name">${p.name}<small>${p.note}</small></span><span class="theme-check">${settings.pieceSet===p.id?'✓':''}</span></button>`).join('')}</div><h3 class="setting-label">棋盘</h3><div class="board-choices">${ChessThemes.boards.map(b=>`<button class="board-choice ${settings.boardTheme===b.id?'active':''}" data-act="boardTheme" data-value="${b.id}" aria-pressed="${settings.boardTheme===b.id}"><span class="board-sample" style="--sample-light:${b.colors[0]};--sample-dark:${b.colors[1]}">${Array.from({length:8},(_,i)=>`<i>${[1,6].includes(i)?`<img src="${pieceUrl(i===1?'b':'w',i===1?'k':'n')}" alt="">`:''}</i>`).join('')}</span><strong>${b.name}</strong><small>${b.note}${settings.boardTheme===b.id?' · ✓':''}</small></button>`).join('')}</div></section>`;
  }
  function settingsPage() {
    return `${header()}<main class="page"><div class="page-heading"><div><h1>按自己的节奏</h1><p>棋谱与分析，保存在这台设备里。</p></div></div>${appearanceSettings()}<section class="setting-card"><div class="setting-row"><div class="grow"><strong>走子动画</strong><p>平滑移动棋子，方便看清每一步</p></div><button role="switch" aria-checked="${!!settings.animation}" class="toggle ${settings.animation?'on':''}" data-act="animation" aria-label="走子动画"><span></span></button></div><div class="setting-row"><div class="grow"><strong>分析用时</strong><p>每个局面的搜索时间，越久越充分</p></div><select id="budget" aria-label="分析用时">${[[600,'轻快 · 0.6 秒'],[1500,'细看 · 1.5 秒'],[3500,'深入 · 3.5 秒']].map(([n,t])=>`<option value="${n}" ${settings.budget===n?'selected':''}>${t}</option>`).join('')}</select></div><div class="setting-row"><div class="grow"><strong>记录时的小悬浮按钮</strong><p>可选，也可以从通知栏暂停与结束</p></div>${button('去设置','overlay','small')}</div><div class="setting-row"><div class="grow"><strong>保存一份棋谱备份</strong><p>包含手记、分析、推演与 Elo 历史</p></div><button class="icon-button" data-act="backup" aria-label="导出备份">${icon('export')}</button></div><div class="setting-row"><div class="grow"><strong>恢复备份 / 导入棋谱</strong><p>导入为副本，保留已有对局</p></div><button class="icon-button" data-act="import" aria-label="导入备份">${icon('import')}</button></div></section><section class="setting-card" style="margin-top:18px"><h3>表现分怎样计算？</h3><p class="analysis-copy" style="margin-top:10px">根据自己每步的局面评价损失计算：100 × exp(−平均损失 / 250)，损失以百分之一兵为单位，每步最多计 2000。它是奥斯卡你完了的复盘指标。尚未分析完整时，会显示已分析手数。</p><p class="analysis-copy" style="margin-top:8px">局面分数随棋盘底部颜色切换视角。正数表示该方占优，负数表示该方落后；M 表示将杀距离。翻转棋盘也会切换该方的表现统计。</p><p class="analysis-copy" style="margin-top:8px">棋子角标与棋谱采用同一套评级：书本表示已收录的开局理论走法，★ 表示引擎首选，! 表示好棋，✓ 表示稳健，?! / ? / ?? 表示逐级增加的评价损失。</p></section><div class="about-mark">${brandMark()}</div><p class="about-copy">奥斯卡你完了 1.2.0 · 离线记谱与复盘<br>chess.js · chesslib · Stockfish<br><button class="text-button" data-act="licenses">开源组件与许可</button></p></main>${nav()}`;
  }
  function viewGame() {return S.position(current,branchActive?branchAt:ply,branchActive?branch:[]);}
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
  function chart(rows) {
    const scale=[2,5,10].includes(curveRange)?curveRange:2;
    const controls=`<div class="curve-tools"><div role="group" aria-label="局面曲线指标">${[['cp','兵值'],['win','胜率']].map(([v,t])=>`<button data-act="curveMode" data-value="${v}" aria-pressed="${curveMode===v}" class="${curveMode===v?'active':''}">${t}</button>`).join('')}</div><div role="group" aria-label="局面曲线纵轴范围" class="${curveMode==='win'?'probability-label':''}">${curveMode==='win'?viewLabel()+'获胜概率':[2,5,10].map(n=>`<button data-act="curveScale" data-scale="${n}" aria-pressed="${n===scale}" class="${n===scale?'active':''}">±${n}</button>`).join('')}</div></div>`;
    const available=rows.some(r=>curveMode==='win'?S.probabilities(r.evaluation):S.numeric(r.evaluation)!==null);
    const missing=curveMode==='win'&&rows.some(r=>!S.probabilities(r.evaluation));
    return `${controls}<div class="curve-interaction"><svg class="curve" role="group" aria-label="${viewLabel()}视角的${curveMode==='win'?'获胜概率曲线':'局面评价曲线，纵轴正负 '+scale+' 兵'}" data-empty="${!available}"></svg><input id="curve-scrub" class="curve-scrub" type="range" min="0" max="${rows.length-1}" step="1" value="${branchActive?branchAt:ply}" aria-label="拖动查看局面"><div class="curve-readout"></div></div><p class="curve-caption">${curveMode==='win'?'Stockfish 自对弈模型估计 · 和棋概率单独显示':'兵值 · '+viewLabel()+'视角 · 边缘箭头表示超出范围或将杀'}</p>${missing?`<button class="text-button" data-act="analyzeAll">${busy?'正在补充胜率…':'补充分析，查看'+(available?'剩余局面':'整盘')+'的胜率'}</button>`:''}`;
  }
  function drawCurve(svg) {
    const {width,height}=svg.getBoundingClientRect();if(!width||!height)return;
    const rows=reviewRows(),win=curveMode==='win',scale=[2,5,10].includes(curveRange)?curveRange:2,limit=scale*100;
    const left=win?38:32,right=width-13,top=17,bottom=height-33,mid=(top+bottom)/2,span=(bottom-top)/2;
    const x=i=>left+i/Math.max(1,rows.length-1)*(right-left),y=n=>win?bottom-n/100*(bottom-top):mid-Math.max(-limit,Math.min(limit,n))/limit*span;
    const points=rows.map((r,i)=>{const n=win?S.probabilities(r.evaluation,viewSide())?.win??null:numeric(r.evaluation);return n===null?null:{x:x(i),y:y(n),ply:i,n,label:win?n.toFixed(1)+'%':score(r.evaluation),mate:!win&&Number.isFinite(r.evaluation?.lines?.[0]?.mate)};});
    const segments=[];let segment=[];points.forEach(p=>{if(p)segment.push(p);else{if(segment.length)segments.push(segment);segment=[];}});if(segment.length)segments.push(segment);
    const cursor=branchActive?branchAt:ply,ticks=win?[100,75,50,25,0]:[scale,scale/2,0,-scale/2,-scale];
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    svg.setAttribute('aria-label',viewLabel()+'视角的'+(win?'获胜概率曲线':'局面评价曲线，纵轴正负 '+scale+' 兵'));
    svg.innerHTML=`${ticks.map(v=>`<path d="M${left} ${y(win?v:v*100)}H${right}" stroke="${v===0&&!win?'#aebd9c':'#e4e8da'}" ${v===0&&!win?'':'stroke-dasharray="3 4"'}/><text x="${left-8}" y="${y(win?v:v*100)}" dominant-baseline="middle" text-anchor="end">${win?v+'%':(v>0?'+':'')+v}</text>`).join('')}<path class="curve-cursor" d="M${x(cursor)} ${top-4}V${bottom+5}" stroke="#c39b3d" stroke-dasharray="4 4"/>${segments.map(list=>`<polyline points="${list.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#507c3e" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}${points.filter(Boolean).map(p=>`<g role="button" tabindex="0" data-ply="${p.ply}" aria-label="第 ${p.ply} 步，${esc(p.label)}"><circle cx="${p.x}" cy="${p.y}" r="10" fill="transparent"/>${!win&&(p.mate||Math.abs(p.n)>limit)&&(p.ply===cursor||!points[p.ply-1]||(Math.abs(points[p.ply-1].n)<=limit&&!points[p.ply-1].mate)||Math.sign(points[p.ply-1].n)!==Math.sign(p.n))?`<path d="${p.n>0?`M${p.x-4} ${p.y+6}L${p.x} ${p.y}L${p.x+4} ${p.y+6}`:`M${p.x-4} ${p.y-6}L${p.x} ${p.y}L${p.x+4} ${p.y-6}`}" fill="none" stroke="#a9852d" stroke-width="1.8"/>`:`<circle cx="${p.x}" cy="${p.y}" r="${p.ply===cursor?4:2}" fill="${p.ply===cursor?'#c39b3d':'#507c3e'}"/>`}<title>第 ${p.ply} 步 · ${esc(p.label)}</title></g>`).join('')}${points.some(Boolean)?'':`<text x="${(left+right)/2}" y="${mid}" text-anchor="middle">${win?'补充分析后显示胜率':'分析后显示局面起伏'}</text>`}<text x="${left}" y="${height-5}">起始</text><text x="${right}" y="${height-5}" text-anchor="end">${rows.length-1} 步</text>`;
    const wrap=svg.closest('.curve-interaction'),slider=wrap.querySelector('#curve-scrub'),prob=S.probabilities(rows[cursor]?.evaluation,viewSide());
    slider.style.marginLeft=(left-12.5)+'px';slider.style.width=`calc(100% - ${left-12}px)`;
    slider.max=rows.length-1;slider.value=cursor;slider.setAttribute('aria-valuetext',`第 ${cursor} 步${rows[cursor]?.san?' '+rows[cursor].san:''}`);
    wrap.querySelector('.curve-readout').innerHTML=`<strong>${cursor?'第 '+rows[cursor].moveNumber+' 回合 · '+(rows[cursor].color==='w'?'白':'黑')+' '+esc(rows[cursor].san):'起始局面'}</strong><span>${win?(prob?`胜 ${prob.win.toFixed(1)}% · 和 ${prob.draw.toFixed(1)}% · 负 ${prob.loss.toFixed(1)}%`:'等待胜率分析'):viewLabel()+' '+score(rows[cursor]?.evaluation)}</span>`;
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
    const evaluation=current.analysis[game.fen()],row=branchActive?null:rows[ply],before=ply>0?rows[ply-1]:null;
    const terminal=game.game_over(),mate=game.in_checkmate();
    let heading='看看这一局',copy='点击分析，让 Stockfish 帮你看清局面。你也可以直接在棋盘上走子，试试自己的想法。',tone='';
    if(branchActive) {heading=correcting?'正在补录棋谱':'在自己的变化里';copy=correcting?'按当时的顺序补走双方着法，保存时会核对留存画面。':'这条变化独立于实战对局。点推荐走法可继续推演，随时回到实战。';}
    else if(row?.review) {
      heading=row.review.label+' · '+row.san;tone=row.review.tone;
      const loss=row.review.loss,a=S.viewNumeric(current.analysis[before.fen],row.color),b=S.viewNumeric(evaluation,row.color);
      copy=row.review.book?'这一步属于意大利开局的经典走序。可以从这里认识中心争夺和轻子发展。':row.review.best?'这一步与当前搜索的首选走法一致。可以继续看看对手最有力的应对。':loss<90?'这一步保持了局面。对照推荐变化，看看是否还有更顺手的处理。':a>90000?(b<-90000?'这一步让将杀机会变成了对手的将杀。':'这一步错过了引擎找到的强制将杀。'):b<-90000?'这一步让对手获得了强制将杀机会。':`这一步相较走子前的评价损失约 ${(loss/100).toFixed(1)} 个兵值。对照推荐变化，看看局面从哪里发生了变化。`;
    } else if(evaluation) {
      const value=numeric(evaluation),other=flip?'白方':'黑方';
      heading=value>80?viewLabel()+'局面较好':value<-80?other+'局面较好':'双方局面接近';
      copy='下面是当前局面的候选走法。点击任意一条，直接在棋盘上推演。';
    }
    if(before&&row?.review&&!row.review.best&&!row.review.book) {
      const best=current.analysis[before.fen]?.lines?.[0]?.pv;
      if(best?.length)copy+=` 当时可以考虑 ${esc(S.lineSan(before.fen,best,1)[0]||best[0])}。`;
    }
    if(!branchActive&&row)copy+=' '+S.moveFacts(row,rows[ply+1]).map(esc).join(' ');
    if(terminal) {
      heading=mate?(game.turn()==='w'?'黑方完成将杀':'白方完成将杀'):'和棋局面';
      if(row?.san)heading+=' · '+row.san;
      tone=mate?(game.turn()===viewSide()?'bad':'good'):'soft';
      copy=mate?'王已被将军，且没有合法解法。本局到此结束，可回到前面寻找其他选择。':game.in_stalemate()?'没有合法走法，王也未被将军，形成逼和。可以回到前面继续推演。':'当前局面满足和棋条件。可以回看前面的走法，寻找不同的变化。';
    }
    const subtitle=branchActive?'自由推演':ply?'第 '+row.moveNumber+' 回合 · '+(row.color==='w'?'白方':'黑方'):'起始局面';
    const depth=evaluation?.lines?.[0]?.depth||0;
    return `<div class="analysis-card review-assessment"><div class="analysis-heading"><span class="analysis-badge ${tone}">${icon(row?.review?.book?'book':row?.review?.best?'check':'spark')}</span><div class="analysis-title"><h2>${heading}</h2><small>${subtitle}</small></div><span class="score-chip">${positionScore(game,evaluation)}</span></div><p class="analysis-copy review-copy" tabindex="0" aria-label="走法说明">${copy}</p><div class="analysis-actions">${button(busy?icon('pause')+'暂停分析':icon('spark')+(isDemo(current)?'重新分析整盘':'分析整盘'),busy?'pauseAnalysis':'analyzeAll','primary')}${terminal?button('回看上一步','prev','',((branchActive?branch.length===0:ply===0)||busy)?'disabled':''):button('分析此处','analyzeHere','',busy?'disabled':'')}</div><div class="compare-slot"></div><div class="progress-slot">${busy?`<div class="analyze-progress"><div style="width:${progress}%"></div></div><p class="tiny muted" style="margin-top:6px">正在分析 · ${progress}%</p>`:''}</div><p class="analysis-depth">${icon('sprout')}${evaluation?(evaluation.precomputed?'预置分析 · ':'')+esc(evaluation.engine)+(terminal?' · 终局':depth?' · 深度 '+depth:'')+' · ':''}${viewLabel()}视角</p></div>${`<div class="analysis-card candidates-card"><div class="row spread"><h3>可以试试</h3><span class="tiny muted">点击走法推演</span></div>${!terminal&&evaluation?.lines?.some(l=>l.pv.length)?evaluation.lines.map((l,i)=>{if(!l.pv.length)return '';const san=S.lineSan(game.fen(),l.pv,6);return `<button class="candidate" data-candidate="${i}"><span class="candidate-number">${i+1}</span><span class="candidate-moves"><strong>${esc(san[0])}</strong> ${esc(san.slice(1).join(' '))}</span><span class="candidate-score">${score({lines:[l]})}</span></button>`;}).join(''):`<p class="analysis-copy" style="margin-top:12px">${terminal?'本局已结束。回到前面一步，看看还有哪些选择。':'分析当前局面后，这里会列出推荐变化。'}</p>`}</div>`}`;
  }
  function reviewPage() {
    const g=viewGame(),rows=reviewRows(),sum=S.summary(current,viewSide(),rows),issues=current.issues.filter(i=>!i.resolved);
    return `<main class="review-page"><header class="review-header"><button class="icon-button" data-act="home" aria-label="返回对局">${icon('back')}</button><div class="review-title grow"><h1>${esc(current.title)}</h1><p>${branchActive?(correcting?'校对棋谱':'自由推演'):esc(current.source)+' · '+current.moves.length+' 步'+(isDemo(current)?' · 不计入手记':'')}</p></div>${isDemo(current)?'<span class="pill gray">演示</span>':button('管理','rename','small')}${button(icon('export')+'导出','export','small')}</header><div class="review-grid"><section class="board-section"><div class="board-toolbar"><span class="turn-chip">${g.in_checkmate()?(g.turn()==='w'?'黑方胜 · 将死':'白方胜 · 将死'):g.in_draw()?'和棋':g.turn()==='w'?'○ 白方走':'● 黑方走'}</span>${branchActive?'<span class="pill warn">'+(correcting?'补录中':'变化')+'</span>':''}<button class="text-button" data-act="flip">${icon('flip')}翻转棋盘</button></div><div class="board-wrap"><div class="evaluation-bar ${flip?'black-view':''}" aria-label="${viewLabel()}局面评价"><div class="evaluation-white" style="height:${g.in_checkmate()?(g.turn()===viewSide()?0:100):g.in_draw()?50:numeric(current.analysis[g.fen()])===null?50:50+Math.tanh(numeric(current.analysis[g.fen()])/450)*46}%"></div></div><div id="chessboard" class="chessboard" role="group" aria-label="国际象棋棋盘"></div></div><div class="board-caption"><span>${branchActive?'在棋盘上继续走子':selected?'选择落点':'点选棋子，试试另一种走法'}</span><span class="score-chip">${viewLabel()} ${positionScore(g,current.analysis[g.fen()])}</span></div><div class="transport"><button class="icon-button" data-act="first" aria-label="回到开局">${icon('first')}</button><button class="icon-button" data-act="prev" aria-label="上一步" ${(branchActive?branch.length===0:ply===0)?'disabled':''}>${icon('back')}</button><span class="ply-counter">${branchActive?branch.length+' 步变化':ply+' / '+current.moves.length}</span><button class="icon-button primary-transport" data-act="next" aria-label="下一步" ${branchActive||ply===current.moves.length?'disabled':''}>${icon('next')}</button><button class="icon-button" data-act="last" aria-label="跳到最后">${icon('last')}</button></div>${branchActive?`<div class="branch-banner"><strong>${correcting?'按实战顺序补齐双方的走法':'好奇这条路，会走向哪里？'}</strong><p>${esc(S.lineSan(S.position(current,branchAt).fen(),branch,8).join(' '))||'在棋盘上走出第一步。'}</p><div class="row">${button(correcting?'保存校对':isDemo(current)?'暂存变化':'保存变化',correcting?'saveCorrection':'saveBranch','small soft')}${button('回到实战','mainline','small')}</div></div>`:''}</section><section class="analysis-section"><div class="stats"><div class="stat"><strong>${sum.score??'—'}</strong><span>${viewLabel()}表现分</span></div><div class="stat"><strong>${sum.mistakes}</strong><span>失误 / 严重失误</span></div><div class="stat"><strong>${sum.analyzed}/${sum.total}</strong><span>已分析的${viewLabel()}走法</span></div></div>${issues.length?`<div class="issue-card"><div class="grow"><strong>${issues.length} 处棋谱需要校对</strong><p>保留了对应画面，可从这里补录。</p></div>${button('查看','issues','small')}</div>`:''}<div class="review-tabs"><button class="review-tab ${tab==='analysis'?'active':''}" data-tab="analysis">复盘</button><button class="review-tab ${tab==='moves'?'active':''}" data-tab="moves">棋谱</button><button class="review-tab ${tab==='branches'?'active':''}" data-tab="branches">变化 <small>${current.branches.length}</small></button></div>${tab==='analysis'?analysisHtml(g,rows):tab==='moves'?`<div class="analysis-card"><div class="row spread"><h3>局面起伏</h3><span class="tiny muted">${viewLabel()}视角</span></div>${chart(rows)}<div class="row spread" style="margin-top:10px"><h3>实战棋谱</h3><button class="text-button" data-act="rename">改名</button></div><div class="move-list">${movesHtml(rows)}</div></div>`:`<div class="analysis-card"><h3>留住新的想法</h3><p class="analysis-copy" style="margin-top:7px">从任何一步在棋盘上走子，就会开启一条独立变化。</p><div class="branch-list">${current.branches.length?current.branches.map((b,i)=>`<button class="branch-item" data-branch="${i}"><strong>${esc(b.name)}</strong><p>${esc(S.lineSan(S.position(current,b.at).fen(),b.moves,8).join(' '))}</p></button>`).join(''):'<p class="tiny muted">还没有保存的变化。</p>'}</div></div>`}${tab==='analysis'?`<div class="analysis-card"><div class="row spread"><h3>局面起伏</h3><button class="text-button" data-tab="moves">查看棋谱 ${icon('next')}</button></div>${chart(rows)}</div>`:''}</section></div></main>`;
  }
  function render() {
    const scroll=window.scrollY,previous=BoardMotion.snapshot($('#chessboard'));
    const retainedCurve=(curveDrag||rangePointer!==null||document.activeElement?.id==='curve-scrub')?$('.curve-interaction'):null;
    frameRows=null;ChessThemes.apply(settings);
    const html=route==='review'&&current?reviewPage():route==='games'?gamesPage():route==='growth'?growthPage():route==='settings'?settingsPage():home();
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
    if(route==='review'&&current){
      renderBoard();
      BoardMotion.play(previous,$('#chessboard'),settings.animation&&!skipMotion);skipMotion=false;
      if(branchActive&&!correcting){
        const reply=document.createElement('button');reply.className='button small soft';reply.dataset.act='engineMove';reply.innerHTML=icon('spark')+'引擎应手';reply.style.flexBasis='100%';reply.disabled=busy||viewGame().game_over();
        $('.branch-banner .row').append(reply);
      }
      if(!branchActive&&tab==='analysis'&&ply>0){
        const rows=reviewRows(),review=rows[ply].review;
        if(review&&!review.best&&review.loss>=90&&current.analysis[rows[ply-1].fen]?.lines?.[0]?.pv?.length){
          const compare=document.createElement('button');compare.className='button small soft';compare.dataset.act='compare';compare.textContent='对照这一步的推荐走法';compare.style.flexBasis='100%';$('.compare-slot').append(compare);
        }
      }
      const slot=$('.compare-slot');
      if(slot&&!slot.children.length)slot.innerHTML=`<span class="compare-hint">${icon('spark')}${viewGame().game_over()?'回到前面，寻找另一种选择':'直接在棋盘上推演，试试其他选择'}</span>`;
    }
    curveObserver.disconnect();document.querySelectorAll('.curve').forEach(svg=>{drawCurve(svg);curveObserver.observe(svg);});
    window.scrollTo(0,scroll);persistView();
  }
  function renderBoard() {
    const element=$('#chessboard');if(!element)return;
    const g=viewGame(),legal=selected?g.moves({square:selected,verbose:true}).map(m=>m.to):[];
    const last=branchActive?branch[branch.length-1]:current.moves[ply-1];
    const review=!branchActive&&ply>0?reviewRows()[ply]?.review:null;
    const badge=review&&last?`<span class="piece-review ${review.tone}" role="img" aria-label="${esc(review.label)}：${S.moveSymbol(review)}">${markContent(review)}</span>`:'';
    const squares=[];for(let row=0;row<8;row++)for(let col=0;col<8;col++) {
      const file=flip?7-col:col,rank=flip?row+1:8-row,square='abcdefgh'[file]+rank,p=g.get(square);
      squares.push(`<button class="square ${(row+col)%2?'dark':''} ${selected===square?'selected':''} ${legal.includes(square)?'legal':''} ${last&&(last.slice(0,2)===square||last.slice(2,4)===square)?'last':''}" data-square="${square}" aria-label="${square}${p?' '+(p.color==='w'?'白':'黑')+pieceNames[p.type]:' 空格'}">${p?`<img data-piece="${p.color+p.type}" src="${pieceUrl(p.color,p.type)}" alt="" draggable="false">`:''}${p&&last?.slice(2,4)===square?badge:''}${col===0?`<span class="coord rank">${rank}</span>`:''}${row===7?`<span class="coord file">${'abcdefgh'[file]}</span>`:''}</button>`);
    }
    const candidate=current.analysis[g.fen()]?.lines?.[0]?.pv?.[0];
    if(candidate&&!selected){const coord=s=>{const f='abcdefgh'.indexOf(s[0]),r=8-Number(s[1]);return [((flip?7-f:f)+.5)*100,((flip?7-r:r)+.5)*100];},a=coord(candidate.slice(0,2)),b=coord(candidate.slice(2,4));squares.push(`<svg class="arrows" viewBox="0 0 800 800"><defs><marker id="arrowhead" markerWidth="3" markerHeight="3" refX="2.2" refY="1.5" orient="auto"><path d="M0 0L3 1.5L0 3Z" fill="#d89b36"/></marker></defs><path d="M${a[0]},${a[1]} L${b[0]},${b[1]}" stroke="#d89b36" stroke-width="13" opacity=".8" marker-end="url(#arrowhead)" stroke-linecap="round"/></svg>`);}
    element.dataset.fen=g.fen();element.dataset.record=current.id;element.dataset.flip=String(flip);
    element.innerHTML=squares.join('');
  }
  function openRecord(id) {
    pauseAnalysis();current=isDemo({id})?demoRecord:allStored().find(r=>r.id===id);if(!current)return;closeModal();
    notebook=current.notebook;localStorage.setItem('sprout.notebook',notebook);
    route='review';ply=0;branch=[];branchActive=false;correcting=false;selected=null;flip=current.side==='b';tab='analysis';window.scrollTo(0,0);render();
  }
  function leave() {pauseAnalysis();route=current?.source==='演示棋谱'?'home':'games';selected=null;refresh();window.scrollTo(0,0);render();}
  function goTo(n) {branchActive=false;correcting=false;branch=[];selected=null;ply=Math.max(0,Math.min(current.moves.length,n));render();}
  function applyMove(input) {
    const g=viewGame(),m=S.move(g,input);if(!m){toast('这一步不符合当前局面的规则。');return;}
    const value=S.uci(m);selected=null;
    if(current.source==='手动录入'&&!branchActive&&ply===current.moves.length) {
      current.moves.push(value);ply++;
      if(g.in_checkmate())current.result=g.turn()==='w'?'0-1':'1-0';else if(g.in_draw())current.result='1/2-1/2';
      save();
    }
    else {if(!branchActive){branchAt=ply;branch=[];branchActive=true;}branch.push(value);}
    render();
  }
  function squareClick(square) {
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
  async function analyzeFen(fen,token) {
    if(!host)throw Error('请在安卓 App 中使用本地 Stockfish 分析。');
    if(token!==analysisToken)throw Error('分析已暂停');
    const request='a'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    const record=current;
    const result=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(request);reject(Error('分析响应超时，请重试。'));},50000);
      pending.set(request,{resolve,reject,timer});host.analyze(request,isDemo(record)?'':record.id,fen,Number(settings.budget));
    });
    record.analysis[fen]=result;
    return result;
  }
  function pauseAnalysis() {
    analysisToken++;busy=false;if(host)host.cancelAnalysis();
    pending.forEach(({reject,timer})=>{clearTimeout(timer);reject(Error('分析已暂停'));});pending.clear();
  }
  async function analyze(all) {
    if(busy)return;
    if(capture.running){toast('请先结束屏幕记录，再开始复盘分析。');return;}
    if(video.state==='processing'){toast('请等录屏识别完成，再开始分析。');return;}
    busy=true;progress=0;const token=++analysisToken;const record=current;
    render();
    try {
      const fens=all?S.timeline(record).map(r=>r.fen):[viewGame().fen()];
      const expectedEngine=host?JSON.parse(host.status()).engine:'';
      for(let i=0;i<fens.length;i++) {
        if(token!==analysisToken)break;
        if(!record.analysis[fens[i]] || (curveMode==='win'&&!S.probabilities(record.analysis[fens[i]])) || (isDemo(record)&&record.analysis[fens[i]].precomputed) || record.analysis[fens[i]].budget<settings.budget || record.analysis[fens[i]].engine!==expectedEngine)await analyzeFen(fens[i],token);
        progress=Math.round((i+1)/fens.length*100);if(route==='review'&&current===record)render();
      }
      if(token===analysisToken){save(record);toast(all?'这一局分析好了。':'当前局面分析好了。');}
    }catch(error){if(token===analysisToken)toast(error.message);}
    finally{if(token===analysisToken){busy=false;render();}}
  }
  function importDialog() {
    modal('把棋谱带进来',`<p class="modal-copy">导入棋谱、局面截图或手记备份。重复导入会保存为副本。</p><div class="stack">${button(icon('import')+'选择棋谱文件','pickFile','full')}${button(icon('spark')+'导入棋盘截图','image','full')}</div><label class="field" for="import-text">也可以直接粘贴 PGN / FEN</label><textarea id="import-text" placeholder="1. e4 e5 2. Nf3 Nc6 …" aria-label="棋谱内容"></textarea>`,button('导入内容','importText','primary'));
  }
  function importRecords(text) {
    let data;try{data=JSON.parse(text);}catch(_){/* PGN and FEN are plain text. */}
    const importedRatings=data?.elo===undefined?null:Growth.merge(ratings,data.elo);
    const list=S.importText(text);
    if(importedRatings)saveRatings(importedRatings);
    list.forEach(r=>{if(isDemo(r)){r.id=S.id();r.source='演示推演';}else if(allStored().some(x=>x.id===r.id))r.id=S.id();save(r);});
    closeModal();if(list.length)openRecord(list[0].id);else{route='growth';render();}toast('已导入 '+list.length+' 篇手记'+(importedRatings?'和 Elo 记录。':'。'));
  }
  function recordDialog() {
    if(capture.running){captureControl();return;}
    const learned=host&&JSON.parse(host.status()).themeReady;
    modal('让这一局，留下棋谱',`<p class="modal-copy">先开启记录，再进入多邻国。等奥斯卡你完了准备好后再走子。</p><label class="field" for="capture-mode">从哪里开始？</label><select id="capture-mode" class="full"><option value="game">完整对局 · 从初始棋盘开始</option><option value="position">练习题 · 从当前局面开始</option></select><p class="notice">${learned?'已保存棋子样式，可直接识别练习题。识别后回本应用确认局面和先走方。':'首次使用先在标准初始棋盘准备一次棋子样式，之后可直接记录练习题。'}</p><label class="field">棋盘底部是哪一方？</label>${sideOptions()}<label class="check-label"><input type="checkbox" id="overlay-check">显示小悬浮按钮（可选）</label><p class="notice">若未自动定位，可以返回本应用手动框选。录制过程无需声音。</p>`,button(icon('record')+'开启屏幕记录','startCapture','primary'));
  }
  function sideOptions() {return `<div class="side-options"><label class="side-option"><input type="radio" name="side" value="w" ${settings.side==='w'?'checked':''}><img src="${pieceUrl('w','k')}" alt="">白方在下</label><label class="side-option"><input type="radio" name="side" value="b" ${settings.side==='b'?'checked':''}><img src="${pieceUrl('b','k')}" alt="">黑方在下</label></div>`;}
  function positionDialog(fen,mode='capture') {
      const board=new Chess(fen),cells=board.board().flat();if(settings.side==='b')cells.reverse();
      modal(mode==='image'?'保存截图里的局面':'从这道题开始记录',`<p class="modal-copy">核对棋子位置，再选择轮到哪一方走。确认后可以复盘或继续推演。</p><div class="position-preview" aria-label="识别到的练习局面">${cells.map((p,i)=>`<div class="${(Math.floor(i/8)+i%8)%2?'dark':''}">${p?`<img src="${pieceUrl(p.color,p.type)}" alt="${p.color==='w'?'白':'黑'}${pieceNames[p.type]}">`:''}</div>`).join('')}</div><label class="field" for="position-turn">轮到谁走？</label><select id="position-turn"><option value="w">白方先走</option><option value="b">黑方先走</option></select><details class="position-details"><summary>题目里的易位与吃过路兵</summary><p class="notice">截图无法确定这两项权利。题目若有说明，可在下方 FEN 补充。默认均关闭。</p><textarea id="position-fen" aria-label="练习局面 FEN" rows="3">${esc(fen)}</textarea></details>`,button(mode==='image'?'保存到小练习':'确认局面，继续记录',mode==='image'?'confirmImage':'confirmPosition','primary'));
  }
  function captureControl() {
    if(capture.pendingFen){positionDialog(capture.pendingFen);return;}
    modal('这一局，正在留存',`<div class="live-banner"><span class="live-dot"></span><div><h3>${capture.paused?'已暂停':esc(capture.message)}</h3><p>已确认 ${capture.plies||0} 步</p></div></div><p class="modal-copy">可以继续切回多邻国。若没有识别到棋盘，请保持初始局面，手动框选后重新校准。</p>${button(icon('tune')+'框选棋盘 / 重新校准','cropCapture','full')}<div class="row" style="margin-top:14px">${button(capture.paused?'继续记录':'暂停记录','pauseCapture','full')}</div>`,button('结束并复盘','stopCapture','primary'));
  }
  function showCrop(mode) {
    if(!host){toast('请在安卓 App 中使用画面采集。');return;}
    cropMode=mode;crop=null;
    const data=mode==='video'?host.videoPreview():mode==='image'?host.imagePreview():host.capturePreview();
    if(!data){toast('还没有采集到画面，请先切到多邻国显示棋盘。');return;}
    modal(mode==='video'?'从这段录屏记谱':mode==='image'?'从截图里读出局面':'框选棋盘',`<p class="modal-copy">拖动框出完整的 8 × 8 棋盘，边缘贴齐棋格。${mode==='image'?'识别后会让你确认棋子和先走方。':'初次准备棋子样式时需显示标准初始棋盘。'}</p><div id="preview-wrap" class="preview-wrap"><img id="crop-image" src="${data}" alt="待定位的棋盘画面"><div id="crop-box" class="crop-box" hidden></div></div><label class="field">棋盘底部</label>${sideOptions()}<p class="tiny muted" style="margin-top:10px">不框选时，将尝试自动定位。</p>`,button(mode==='video'?'开始识别':mode==='image'?'识别截图':'校准棋盘','applyCrop','primary'));
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
    animation:()=>{settings.animation=!settings.animation;localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));render();},
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
    deleteRecord:()=>modal('删除这篇手记？',`<p class="modal-copy">${esc(current.title)}</p><p class="notice">棋谱、分析、推演和对应的校对图片会一起删除。</p>`,button('保留','close')+button('删除手记','confirmDelete','danger')),
    confirmDelete:()=>{
      pauseAnalysis();const id=current.id;
      if(host){const error=host.deleteGame(id);if(error)throw Error(error);}
      records=records.filter(r=>r.id!==id);legacyDemos=legacyDemos.filter(r=>r.id!==id);if(!host)localStorage.setItem('sprout.games.v1',JSON.stringify(allStored()));
      current=null;branch=[];branchActive=false;route='games';closeModal();render();toast('手记已删除。');
    },
    video:()=>host?host.selectVideo():toast('请在安卓 App 中导入录屏。'),
    pickFile:()=>$('#file-input').click(),importText:()=>importRecords($('#import-text').value),
    new:()=>{const r=S.create(notebook==='practice'?'手动记录的练习':'手动记录的对局');r.notebook=notebook;save(r);openRecord(r.id);},
    flip:()=>{flip=!flip;selected=null;render();},first:()=>goTo(0),last:()=>goTo(current.moves.length),next:()=>goTo(ply+1),
    prev:()=>{if(branchActive){branch.pop();selected=null;render();}else goTo(ply-1);},
    mainline:()=>{branchActive=false;correcting=false;branch=[];selected=null;ply=branchAt;render();},
    analyzeAll:()=>analyze(true),analyzeHere:()=>analyze(false),pauseAnalysis:()=>{pauseAnalysis();render();},
    compare:()=>{const before=S.timeline(current)[ply-1];const input=current.analysis[before.fen]?.lines?.[0]?.pv?.[0];if(!input)return;branchAt=ply-1;branch=[];branchActive=true;correcting=false;applyMove(input);},
    engineMove:async()=>{
      if(!host){toast('请在安卓 App 中使用引擎应手。');return;}
      if(busy||capture.running)return;
      const fen=viewGame().fen();if(!current.analysis[fen])await analyze(false);
      if(viewGame().fen()!==fen)return;
      const input=current.analysis[fen]?.lines?.[0]?.pv?.[0];if(input)applyMove(input);else toast('当前局面没有可走的引擎应手。');
    },
    saveBranch:()=>{S.addBranch(current,branchAt,branch);save();render();toast(isDemo(current)?'变化已留在本次演示中。':'变化已保存。');},
    rename:()=>modal('对局信息',`<label class="field" for="game-title">对局名称</label><input type="text" id="game-title" maxlength="100" value="${esc(current.title)}"><label class="field" for="game-notebook">放在哪本手记？</label><select id="game-notebook"><option value="game" ${current.notebook==='game'?'selected':''}>完整对局</option><option value="practice" ${current.notebook==='practice'?'selected':''}>小练习</option></select><label class="field" for="game-side">你执哪一方？</label><select id="game-side"><option value="w" ${current.side==='w'?'selected':''}>白方</option><option value="b" ${current.side==='b'?'selected':''}>黑方</option></select><label class="field" for="game-result">对局结果</label><select id="game-result">${[['*','未标记'],['1-0','白方胜'],['0-1','黑方胜'],['1/2-1/2','和棋']].map(([v,t])=>`<option value="${v}" ${current.result===v?'selected':''}>${t}</option>`).join('')}</select>`,button('删除这篇手记','deleteRecord','danger')+(current.source==='演示棋谱'?button('保留为手记','keepLegacy','soft'):'')+button('保存','saveTitle','primary')),
    saveTitle:()=>{current.title=$('#game-title').value.trim()||'新的对局';current.side=$('#game-side').value;current.result=$('#game-result').value;current.notebook=$('#game-notebook').value;notebook=current.notebook;localStorage.setItem('sprout.notebook',notebook);save();closeModal();render();},
    export:()=>modal('带走这局棋',`<p class="modal-copy">PGN 方便在其他棋类软件打开。完整备份还会保留分析结果、校对信息和推演变化。</p>`,button('导出 PGN','exportPgn','soft')+button('完整备份','exportGame','primary')),
    exportPgn:()=>{exportText(current.title+'.pgn',S.toPgn(current));closeModal();},
    exportGame:()=>{exportText(current.title+'.json',JSON.stringify({schema:1,games:[current]},null,2),'application/json');closeModal();},
    backup:()=>{exportText('奥斯卡你完了备份-'+Growth.localTime().slice(0,10)+'.json',JSON.stringify({schema:1,games:allStored(),elo:ratings},null,2),'application/json');},
    startCapture:()=>{
      if(!host){toast('屏幕记录需要安卓 App，网页可导入棋谱和自由走子。');return;}
      settings.side=$('input[name=side]:checked').value;localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));
      const overlay=$('#overlay-check').checked;if(overlay&&!JSON.parse(host.status()).overlay){toast('先开启悬浮窗权限，或取消勾选后从通知栏控制。');host.overlayPermission();return;}
        const mode=$('#capture-mode').value;
        if(mode==='position'&&!JSON.parse(host.status()).themeReady){toast('先记录一次标准初始棋盘，准备好棋子样式。');return;}
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
    cropCapture:()=>showCrop('capture'),applyCrop:()=>{
      const side=$('input[name=side]:checked').value;settings.side=side;localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));
      if(crop&&(crop.right-crop.left<.15||crop.bottom-crop.top<.08))throw Error('框选区域太小，请重新拖动。');
      const options=JSON.stringify({side,region:crop});
      if(cropMode==='video')host.runVideo(options);else if(cropMode==='image')host.recognizeImage(options);else host.captureAction('configure',options);
      closeModal();toast(cropMode==='video'?'开始识别录屏，可以在这里查看进度。':cropMode==='image'?'正在识别图片里的局面。':'已更新棋盘范围，请切回题目或初始棋盘稍候。');
    },cancelVideo:()=>host&&host.cancelVideo(),overlay:()=>host?host.overlayPermission():toast('安卓 App 可设置悬浮窗。'),
    issues:issuesDialog,issue:e=>issueDetail(Number(e.dataset.index)),
    beginCorrection:e=>{const issue=current.issues[Number(e.dataset.index)];pauseAnalysis();branchAt=Math.min(current.moves.length,issue.at||0);ply=branchAt;branch=[];branchActive=true;correcting=true;selected=null;closeModal();window.scrollTo(0,0);render();},
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
    const e=event.target.closest('button,[data-ply]');if(!e)return;
    try {
      if(e.dataset.act){actions[e.dataset.act]?.(e);return;}
      if(e.dataset.route){pauseAnalysis();route=e.dataset.route;refresh();window.scrollTo(0,0);render();return;}
      if(e.dataset.open){openRecord(e.dataset.open);return;}
    if(e.dataset.square){if(Date.now()>ignoreBoardClickUntil)squareClick(e.dataset.square);return;}
      if(e.dataset.ply!==undefined){if(Date.now()>ignoreCurveClickUntil)goTo(Number(e.dataset.ply));return;}
      if(e.dataset.tab){tab=e.dataset.tab;render();return;}
      if(e.dataset.promote){closeModal();applyMove(e.dataset.promote);return;}
      if(e.dataset.branch!==undefined){const b=current.branches[Number(e.dataset.branch)];branchAt=b.at;branch=b.moves.slice();branchActive=true;correcting=false;selected=null;render();return;}
      if(e.dataset.candidate!==undefined){const g=viewGame(),l=current.analysis[g.fen()]?.lines[Number(e.dataset.candidate)];if(l?.pv?.length)applyMove(l.pv[0]);}
    } catch(error){if($('#modal').open)$('#modal-error').textContent=error.message;else toast(error.message);}
  });
  document.addEventListener('change',event=>{if(event.target.id==='budget'){settings.budget=Number(event.target.value);localStorage.setItem('sprout.settings.v1',JSON.stringify(settings));}});
  document.addEventListener('pointerdown',event=>{if(event.target.closest('#preview-wrap')){cropStart=cropPoint(event);event.target.setPointerCapture(event.pointerId);event.preventDefault();}});
  document.addEventListener('pointermove',event=>{if(cropStart&&$('#crop-image')){const end=cropPoint(event);crop={left:Math.min(cropStart.x,end.x),top:Math.min(cropStart.y,end.y),right:Math.max(cropStart.x,end.x),bottom:Math.max(cropStart.y,end.y)};drawCrop();}});
  document.addEventListener('pointerup',()=>{cropStart=null;});
  function scrubTo(n){
    if(route!=='review'||!current)return;
    if(!branchActive&&ply===n)return;
    skipMotion=true;goTo(n);
  }
  function curvePly(event){
    const r=$('.curve').getBoundingClientRect(),left=curveMode==='win'?38:32;
    return Math.round(Math.max(0,Math.min(1,(event.clientX-r.left-left)/(r.width-left-13)))*current.moves.length);
  }
  document.addEventListener('input',event=>{if(event.target.id==='curve-scrub')scrubTo(Number(event.target.value));});
  document.addEventListener('pointerdown',event=>{if(event.target.id==='curve-scrub')rangePointer=event.pointerId;});
  document.addEventListener('pointerup',event=>{if(rangePointer===event.pointerId)rangePointer=null;});
  document.addEventListener('pointercancel',event=>{if(rangePointer===event.pointerId)rangePointer=null;});
  document.addEventListener('pointerdown',event=>{
    const svg=event.target.closest('.curve');if(!svg||event.button!==0)return;
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
    const element=event.target.closest('[data-square]');if(!element||event.button!==0||route!=='review')return;
    const p=viewGame().get(element.dataset.square);if(!p||p.color!==viewGame().turn())return;
    drag={square:element.dataset.square,x:event.clientX,y:event.clientY,moved:false,element,piece:p};
    element.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove',event=>{
    if(!drag)return;
    if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>8){
      drag.moved=true;ghost=document.createElement('img');ghost.src=pieceUrl(drag.piece.color,drag.piece.type);
      const size=drag.element.getBoundingClientRect().width;Object.assign(ghost.style,{position:'fixed',width:size+'px',height:size+'px',zIndex:'100',pointerEvents:'none',transform:'translate(-50%,-60%)',filter:'drop-shadow(0 6px 3px #263e3744)'});document.body.append(ghost);drag.element.style.opacity='.35';
    }
    if(ghost){ghost.style.left=event.clientX+'px';ghost.style.top=event.clientY+'px';event.preventDefault();}
  });
  document.addEventListener('pointerup',event=>endDrag(event));
  document.addEventListener('pointercancel',event=>endDrag(event,true));
  document.addEventListener('keydown',event=>{if(route==='review'&&!$('#modal').open&&!['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)){const point=event.target.closest('[data-ply]');if(point&&['Enter',' '].includes(event.key)){goTo(Number(point.dataset.ply));event.preventDefault();return;}if(event.key==='ArrowLeft'){actions.prev();event.preventDefault();}if(event.key==='ArrowRight'){actions.next();event.preventDefault();}}});
  $('#file-input').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>12*1024*1024)throw Error('请选择小于 12 MB 的棋谱文件。');const text=await file.text();importRecords(text);}catch(error){toast(error.message);}finally{event.target.value='';}});
  let lastStatus='',lastVideoState='idle';
  function poll() {
    if(!host)return;
    try {
      const status=JSON.parse(host.status());capture=status.capture;video=status.video;
      const key=JSON.stringify(status);
      if(key!==lastStatus){lastStatus=key;if(route!=='review'&&!$('#modal').open){refresh();render();}}
      if(video.state==='ready'&&lastVideoState!=='ready'&&!$('#modal').open)showCrop('video');
      if(video.state==='done'&&lastVideoState!=='done'&&localStorage.getItem('sprout.lastVideo')!==video.gameId){refresh();if(video.gameId){localStorage.setItem('sprout.lastVideo',video.gameId);openRecord(video.gameId);}}
      if(video.state==='error'&&lastVideoState!=='error')toast(video.message);
      lastVideoState=video.state;
    }catch(_){/* A lifecycle transition can temporarily disconnect the bridge; the next resume refreshes. */}
  }
  window.App={
    hostEvent(event){
      if(event.type==='analysis'){const task=pending.get(event.id);if(task){clearTimeout(task.timer);pending.delete(event.id);event.error?task.reject(Error(event.error)):task.resolve(event.result);}}
      if(event.type==='captureStarted'){setTimeout(()=>{poll();toast('记录已开启，请切到多邻国的初始棋盘。');},600);}
      if(event.type==='videoReady'){poll();if(!$('#modal').open)showCrop('video');}
      if(event.type==='imageReady')showCrop('image');
      if(event.type==='imageRecognized'){imageFen=event.fen;positionDialog(imageFen,'image');}
      if(event.type==='imageError'){toast(event.message);showCrop('image');$('#modal-error').textContent=event.message;}
    },
    pause(){pauseAnalysis();persistView();},resume(){poll();refresh();if(route==='review'&&current&&!busy){const fresh=allStored().find(r=>r.id===current.id);if(fresh){current=fresh;ply=Math.min(ply,current.moves.length);}}render();},
    back(){if($('#modal').open){closeModal();return true;}if(route==='review'){leave();return true;}if(route!=='home'){route='home';render();return true;}return false;},
    get state(){return {route,current,ply,branch,branchAt,branchActive,correcting,busy,settings,flip,demo:isDemo(current)};}
  };
  refresh();
  try {const saved=JSON.parse(localStorage.getItem('sprout.view.v1')||'{}');if(saved.route==='review'&&allStored().some(r=>r.id===saved.id)){current=allStored().find(r=>r.id===saved.id);route='review';ply=Math.min(saved.ply||0,current.moves.length);branchAt=saved.branchAt||0;branch=saved.branch||[];branchActive=!!saved.branchActive;correcting=!!saved.correcting;flip=!!saved.flip;tab=saved.tab||'analysis';viewGame();}}catch(_){route='home';branchActive=false;}
  render();poll();setInterval(poll,1500);
})();
