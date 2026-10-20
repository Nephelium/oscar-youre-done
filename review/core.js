(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('../vendor/chess.min.js').Chess : root.Chess,
    typeof module === 'object' ? require('./demo-analysis.js') : root.OscarDemo);
  if (typeof module === 'object') module.exports = api; else root.Sprout = api;
})(typeof window !== 'undefined' ? window : globalThis, function (Chess, demoData) {
  'use strict';
  const START = new Chess().fen();
  // Lichess chess-openings, C53 Classical Variation (CC0), pinned in demo-analysis.md.
  const OPENING = ['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5','c2c3'];
  const id = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const uci = m => m.from + m.to + (m.promotion || '');
  function move(game, input) {
    if (typeof input !== 'string' || input.length > 24) return null;
    return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(input)
      ? game.move({from: input.slice(0, 2), to: input.slice(2, 4), promotion: input[4] || 'q'})
      : game.move(input, {sloppy: true});
  }
  function position(record, ply = record.moves.length, branch = []) {
    const game = new Chess(record.initialFen || START);
    for (const m of record.moves.slice(0, ply).concat(branch)) if (!move(game, m)) throw Error('棋谱含无法重放的走法，请先校对。');
    return game;
  }
  function validate(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.moves) || raw.moves.length > 6000) throw Error('对局格式不正确。');
    const initialFen = raw.initialFen || START;
    const check = new Chess();
    if (!check.validate_fen(initialFen).valid) throw Error('起始 FEN 无效。');
    const game = new Chess(initialFen), moves = [];
    for (const side of ['w','b']) if (game.board().flat().filter(p=>p?.color===side&&p.type==='k').length!==1) throw Error('局面需要白王和黑王各一枚。');
    for (const input of raw.moves) { const m = move(game, input); if (!m) throw Error('第 ' + (moves.length + 1) + ' 步无法合法重放。'); moves.push(uci(m)); }
    const record = {
      schema: 1, id: /^[a-zA-Z0-9_-]{1,80}$/.test(raw.id || '') ? raw.id : id(),
      title: String(raw.title || '新的对局').slice(0, 100), source: String(raw.source || '手动录入').slice(0, 50),
      createdAt: Number(raw.createdAt) || Date.now(), updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now(), initialFen, moves,
      result: ['1-0', '0-1', '1/2-1/2', '*'].includes(raw.result) ? raw.result : '*',
      side: raw.side === 'b' ? 'b' : 'w', analysis: {}, branches: [], issues: [],
      notebook: ['game','practice'].includes(raw.notebook)?raw.notebook:(raw.capture?.mode==='position'||initialFen!==START?'practice':'game'),
      capture: raw.capture && typeof raw.capture === 'object' ? raw.capture : null
    };
    if (raw.analysis && typeof raw.analysis === 'object') {
      Object.entries(raw.analysis).slice(0, 7000).forEach(([fen, value]) => {
        if (check.validate_fen(fen).valid && value && Array.isArray(value.lines)) {
          record.analysis[fen] = {engine: String(value.engine || 'Stockfish').slice(0,80), budget: Number(value.budget) || 0,
            lines: value.lines.slice(0, 3).map(l => ({cp: Number.isFinite(l.cp) ? l.cp : null, mate: Number.isFinite(l.mate) ? l.mate : null,
              depth: Math.max(0, Number(l.depth) || 0), terminal: !!l.terminal, ...(validWdl(l.wdl)?{wdl:l.wdl.slice()}:{}),
              pv: Array.isArray(l.pv) ? l.pv.filter(x => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(x)).slice(0, 80) : []}))};
        }
      });
    }
    (raw.branches || []).slice(0, 200).forEach(b => {
      if (!Number.isInteger(b.at) || b.at < 0 || b.at > moves.length || !Array.isArray(b.moves) || !b.moves.length || b.moves.length > 600) return;
      try { const g = position(record, b.at, b.moves); if (g) record.branches.push({id: String(b.id || id()), at: b.at, name: String(b.name || '新的变化').slice(0,80), moves: b.moves.slice()}); } catch (_) { /* Invalid optional variation is not a valid mainline. */ }
    });
    compactBranches(record);
    record.issues = (raw.issues || []).slice(0, 500).filter(x => x && typeof x === 'object').map(x => ({...x, message: String(x.message || '请核对这段棋谱').slice(0,300)}));
    record.revisions = Array.isArray(raw.revisions) ? raw.revisions : [];
    record.undoEvents = Array.isArray(raw.undoEvents) ? raw.undoEvents : [];
    return record;
  }
  function create(title = '新的对局') { return validate({title, moves: []}); }
  function importText(text) {
    text = String(text).trim();
    if (!text || new TextEncoder().encode(text).length > 12 * 1024 * 1024) throw Error('请选择小于 12 MB 的棋谱或备份。');
    if (text[0] === '{' || text[0] === '[' && !/^\[\w+\s+"/.test(text)) {
      let data; try { data = JSON.parse(text); } catch (_) { throw Error('JSON 内容不完整。'); }
      const records = data.games || (Array.isArray(data) ? data : [data]);
      if (!Array.isArray(records) || records.length > 500) throw Error('一次最多导入 500 局。');
      return records.map(validate);
    }
    const g = new Chess();
    if (g.validate_fen(text).valid) return [validate({title: '导入的局面', source: 'FEN', initialFen: text, moves: []})];
    if (!g.load_pgn(text, {sloppy: true})) throw Error('PGN 无法解析，请检查走法或改用 FEN。');
    const h = g.header();
    return [validate({title: h.Event || '导入的棋谱', source: 'PGN', initialFen: h.FEN || START,
      result: h.Result || '*', notebook:h.Notebook, moves: g.history({verbose: true}).map(uci)})];
  }
  function toPgn(record) {
    const g = position(record);
    const date=new Date(record.createdAt), localDate=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('.');
    g.header('Event', record.title.replace(/["\r\n\\]/g, ' '), 'Date', localDate,
      'White', record.side === 'w' ? 'You' : 'Opponent', 'Black', record.side === 'b' ? 'You' : 'Opponent', 'Result', record.result);
    if (record.initialFen !== START) g.header('SetUp', '1', 'FEN', record.initialFen);
    g.header('Notebook',record.notebook==='practice'?'practice':'game');
    const incomplete = record.issues.some(x => !x.resolved) || !!record.capture?.previousId;
    if (incomplete) g.header('Annotator', 'Chess Sprout: capture requires correction');
    return g.pgn({max_width: 80}) + (incomplete ? '\n{ Capture has unresolved positions; this is the confirmed segment. }' : '');
  }
  function lineSan(fen, moves, limit = 8) {
    const g = new Chess(fen), out = [];
    for (const input of (moves || []).slice(0, limit)) { const m = move(g, input); if (!m) break; out.push(m.san); }
    return out;
  }
  function numeric(evaluation) {
    const l = evaluation?.lines?.[0];
    if (!l) return null;
    if (l.terminal && l.mate === 0) return l.cp;
    if (Number.isFinite(l.mate)) return l.mate > 0 ? 100000 - Math.min(1000, Math.abs(l.mate)) : -100000 + Math.min(1000, Math.abs(l.mate));
    return Number.isFinite(l.cp) ? l.cp : null;
  }
  function viewNumeric(evaluation, side = 'w') {
    const value = numeric(evaluation);
    return value === null ? null : value * (side === 'b' ? -1 : 1);
  }
  function validWdl(wdl) {
    return Array.isArray(wdl)&&wdl.length===3&&wdl.every(n=>Number.isInteger(n)&&n>=0&&n<=1000)&&wdl.reduce((a,b)=>a+b,0)===1000;
  }
  function probabilities(evaluation, side = 'w') {
    const wdl=evaluation?.lines?.[0]?.wdl;
    if(!validWdl(wdl))return null;
    const [win,draw,loss]=side==='b'?wdl.slice().reverse():wdl;
    return {win:win/10,draw:draw/10,loss:loss/10};
  }
  function displayScore(evaluation, side = 'w') {
    const l = evaluation?.lines?.[0];
    if (!l) return '—';
    if (l.terminal && l.mate === 0) return '将死';
    if (Number.isFinite(l.mate)) return (l.mate * (side === 'b' ? -1 : 1) < 0 ? '−' : '') + 'M' + Math.abs(l.mate);
    const value = viewNumeric(evaluation, side);
    if(value===null)return '—';
    const rounded=Number((value/100).toFixed(1));
    return (rounded>0?'+':'')+rounded.toFixed(1);
  }
  function assess(before, after, side, played) {
    if (before?.engine && after?.engine && before.engine !== after.engine) return null;
    const a = numeric(before), b = numeric(after);
    if (a === null || b === null) return null;
    const loss = Math.max(0, (a - b) * (side === 'w' ? 1 : -1));
    const best = before.lines[0].pv?.[0] === played;
    const label = best ? '最佳走法' : loss < 30 ? '好棋' : loss < 90 ? '稳健' : loss < 180 ? '不够准确' : loss < 350 ? '失误' : '严重失误';
    const tone = best || loss < 90 ? 'good' : loss < 180 ? 'soft' : 'bad';
    return {loss, label, tone, best};
  }
  function timeline(record) {
    const g = new Chess(record.initialFen), rows = [{ply: 0, fen: g.fen(), evaluation: record.analysis[g.fen()]}];
    let book = record.initialFen === START;
    record.moves.forEach((input, i) => {
      const before = g.fen(), moveNumber = Number(before.split(' ')[5]), m = move(g, input); if (!m) throw Error('棋谱无法重放。');
      book = book && OPENING[i] === uci(m);
      const review = assess(record.analysis[before], record.analysis[g.fen()], m.color, input);
      if(book && review && review.loss < 90)Object.assign(review,{book:true,label:'理论走法',tone:'book'});
      rows.push({ply: i+1, moveNumber, move: input, san: m.san, color: m.color, piece:m.piece, from:m.from, to:m.to, promotion:m.promotion, captured:m.captured, flags:m.flags, check:g.in_check(), mate:g.in_checkmate(), fen: g.fen(), evaluation: record.analysis[g.fen()], review});
    });
    return rows;
  }
  function moveSymbol(review) {return !review?'':review.book?'▤':review.best?'★':review.loss>=350?'??':review.loss>=180?'?':review.loss>=90?'?!':review.loss<30?'!':'✓';}
  function summary(record, side = record.side, cachedRows = null) {
    const rows = (cachedRows || timeline(record)).slice(1), own = rows.filter(r => r.color === side), ready = own.filter(r => r.review);
    return {plies: rows.length, analyzed: ready.length, total: own.length,
      score: ready.length ? Math.round(100 * Math.exp(-ready.reduce((n,r) => n + Math.min(2000,r.review.loss), 0) / ready.length / 250)) : null,
      mistakes: ready.filter(r => r.review.loss >= 180).length};
  }
  function moveFacts(row,next) {
    if(!row?.move)return [];
    const names={p:'兵',n:'马',b:'象',r:'车',q:'后',k:'王'}, facts=[];
    if(row.mate)facts.push('这一步完成了将杀。');
    else if(row.check)facts.push('这一步形成将军，对方必须先解除将军。');
    if(row.flags?.includes('k')||row.flags?.includes('q'))facts.push('这一步完成王车易位。');
    if(row.captured)facts.push('这一步吃掉了对手的'+names[row.captured]+'。');
    if(next?.captured)facts.push('实战下一手，'+(next.color==='w'?'白方':'黑方')+'的'+names[next.piece]+'吃掉了'+(row.color==='w'?'白方':'黑方')+'的'+names[next.captured]+'。');
    return facts;
  }
  function variationRows(record, at, moves) {
    return timeline({...record,moves:record.moves.slice(0,at).concat(moves)}).map(r=>({...r,variation:r.ply>at}));
  }
  function evaluationChange(before, after, side='w') {
    if(!before || !after || (before.engine&&after.engine&&before.engine!==after.engine))return null;
    const a=before.lines?.[0],b=after.lines?.[0],sign=side==='b'?-1:1;
    const cp=a&&b&&!Number.isFinite(a.mate)&&!Number.isFinite(b.mate)&&Number.isFinite(a.cp)&&Number.isFinite(b.cp)?(b.cp-a.cp)*sign:null;
    const pa=probabilities(before,side),pb=probabilities(after,side);
    const win=pa&&pb?pb.win-pa.win:null;
    return {cp,win,mateChanged:!!a&&!!b&&((Number.isFinite(a.mate)!==Number.isFinite(b.mate))||(Number.isFinite(a.mate)&&Number.isFinite(b.mate)&&Math.sign(a.mate)!==Math.sign(b.mate)))};
  }
  function keyMoments(rows) {
    return rows.slice(1).flatMap((r,i)=>{
      const delta=evaluationChange(rows[i].evaluation,r.evaluation);
      if(!delta || !(Math.abs(delta.cp??0)>=150 || Math.abs(delta.win??0)>=15 || delta.mateChanged || r.mate))return [];
      return [{ply:r.ply,san:r.san,...delta,reason:r.mate?'将杀':delta.mateChanged?'将杀转折':Math.abs(delta.win??0)>=15?'胜率转折':'兵值转折'}];
    });
  }
  const PIECES={p:'兵',n:'马',b:'象',r:'车',q:'后',k:'王'},VALUES={p:1,n:3,b:3,r:5,q:9,k:0};
  const sideName=c=>c==='w'?'白方':'黑方';
  function describeMove(m) {
    if(m.flags?.includes('k'))return sideName(m.color)+'短易位，王与车同时调位';
    if(m.flags?.includes('q'))return sideName(m.color)+'长易位，王与车同时调位';
    return sideName(m.color)+PIECES[m.piece]+'从 '+m.from+' 到 '+m.to+
      (m.captured?'，吃掉'+(m.flags?.includes('e')?'途经兵':PIECES[m.captured]):'')+
      (m.promotion?'，升变为'+PIECES[m.promotion]:'');
  }
  function explainMove(rows,index,side='w') {
    const row=rows[index],before=rows[index-1],paragraphs=[];
    if(!row)return {paragraphs:[],delta:null,key:null};
    const game=new Chess(row.fen),delta=before?evaluationChange(before.evaluation,row.evaluation,side):null;
    if(row.move) {
      paragraphs.push(describeMove(row)+'。'+(row.mate?'这一手完成将杀。':row.check?'同时形成将军，对手须先解将。':''));
      if(row.review)paragraphs.push(row.review.label+'。'+(row.review.book?'符合已收录的意大利开局理论走序。':row.review.best?'这是当前搜索的首选走法。':row.review.loss<90?'与引擎首选的评价差距较小。':''));
    }else paragraphs.push('这是'+(row.variation?'变化':'记录')+'的起始局面，轮到'+sideName(game.turn())+'走。');
    if(delta) {
      const parts=[];
      if(delta.cp!==null)parts.push(sideName(side)+'兵值 '+displayScore(before.evaluation,side)+' → '+displayScore(row.evaluation,side)+'，'+(delta.cp>=0?'增加':'减少')+' '+(Math.abs(delta.cp)/100).toFixed(2)+' 兵');
      if(delta.win!==null)parts.push('胜率 '+probabilities(before.evaluation,side).win.toFixed(1)+'% → '+probabilities(row.evaluation,side).win.toFixed(1)+'%，'+(delta.win>=0?'上升':'下降')+' '+Math.abs(delta.win).toFixed(1)+' 个百分点');
      if(parts.length)paragraphs.push(parts.join('；')+'。');
      if(delta.mateChanged)paragraphs.push('引擎的将杀判断发生变化：'+sideName(side)+'视角 '+displayScore(before.evaluation,side)+' → '+displayScore(row.evaluation,side)+'。');
    }else if(row.move&&!row.review)paragraphs.push('补齐走子前后的同版本分析后，会显示评级、兵值与胜率变化。');
    if(delta?.cp!==null&&delta?.cp!==undefined&&row.review&&!row.review.best){const loss=evaluationChange(before.evaluation,row.evaluation,row.color)?.cp;if(loss<0)paragraphs.push('这一步使'+sideName(row.color)+'的局面评价损失 '+(-loss/100).toFixed(2)+' 兵。');}
    if(row.review && before && !row.review.best) {
      const pv=before.evaluation?.lines?.[0]?.pv||[],best=lineSan(before.fen,pv,3);
      if(best.length)paragraphs.push('当时优先考虑 '+best[0]+'，推荐线为 '+best.join(' → ')+'。');
    }
    if(game.in_checkmate())paragraphs.push(sideName(game.turn())+'王已无合法解法，对局结束。');
    else if(game.in_draw())paragraphs.push(game.in_stalemate()?'当前无合法走法且未被将军，形成逼和。':'当前局面满足和棋条件。');
    else {
      const captures=game.moves({verbose:true}).filter(m=>m.captured&&m.captured!=='k').sort((a,b)=>VALUES[b.captured]-VALUES[a.captured]);
      const seen=new Set(),danger=[];
      for(const m of captures) {if(seen.has(m.to))continue;seen.add(m.to);danger.push(sideName(m.color)+PIECES[m.piece]+'可从 '+m.from+' 吃 '+m.to+' 的'+PIECES[m.captured]);if(danger.length===2)break;}
      if(danger.length)paragraphs.push('当前可合法吃子：'+danger.join('，')+'。能吃到不等于值得吃，还要看接下来的交换。');
      const pv=row.evaluation?.lines?.[0]?.pv||[],g=new Chess(row.fen),continuation=[];
      for(const input of pv.slice(0,3)){const m=move(g,input);if(!m)break;continuation.push(m.san+'（'+describeMove(m)+'）');if(g.in_checkmate())break;}
      if(continuation.length)paragraphs.push('引擎预计的应对：'+continuation.join(' → ')+'。');
    }
    if(rows[index+1]?.captured)paragraphs.push('这条棋谱下一步：'+describeMove(rows[index+1])+'。');
    const key=keyMoments(rows).find(k=>k.ply===row.ply)||null;
    if(key){const changes=[];if(delta?.cp!==null&&delta?.cp!==undefined)changes.push(sideName(side)+'评价'+(delta.cp>=0?'上升':'下降')+(Math.abs(delta.cp)/100).toFixed(2)+'兵');if(delta?.win!==null&&delta?.win!==undefined)changes.push('获胜概率'+(delta.win>=0?'上升':'下降')+Math.abs(delta.win).toFixed(1)+'个百分点');paragraphs.unshift('关键节点 · '+key.reason+'。'+(changes.length?changes.join('，')+'。':'')+(row.captured?'这一步涉及吃'+PIECES[row.captured]+'，结合后续应手看交换结果。':row.mate?'对方已无法解除将军。':row.check?'这步带将军，先看对方有哪些合法解将。':'建议对照推荐线，检查这一手留下的机会。'));}
    return {paragraphs,delta,key};
  }
  function addBranch(record, at, moves) {
    position(record, at, moves);
    if (!moves.length) throw Error('先在棋盘上走出一条变化。');
    const prefix=(a,b)=>a.length<=b.length&&a.every((m,i)=>m===b[i]);
    const existing=record.branches.find(b=>b.at===at&&prefix(moves,b.moves));if(existing)return existing;
    const shorter=record.branches.filter(b=>b.at===at&&prefix(b.moves,moves));
    if(shorter.length){
      const kept=shorter[0];kept.moves=moves.slice();
      record.branches=record.branches.filter(b=>b===kept||!shorter.includes(b));
      return kept;
    }
    if(record.branches.length>=200)throw Error('这局已保存 200 条变化，请另存为一局继续推演。');
    const branch = {id: id(), at, moves: moves.slice(), name: '第 ' + position(record,at).fen().split(' ')[5] + ' 回合的变化'};
    record.branches.push(branch); return branch;
  }
  function compactBranches(record) {
    record.branches=record.branches.filter((b,i,all)=>!all.some((other,j)=>b.at===other.at&&
      (other.moves.length>b.moves.length || other.moves.length===b.moves.length&&j<i)&&
      b.moves.every((m,k)=>m===other.moves[k])));
    return record.branches;
  }
  function fromPlacement(placement, turn = 'w', castling = '-', ep = '-') {
    const fen = placement + ' ' + turn + ' ' + castling + ' ' + ep + ' 0 1';
    const test = new Chess(); if (!test.validate_fen(fen).valid) throw Error('局面格式不正确。'); return fen;
  }
  function demo() {
    const record = importText('[Event "18 回合的王翼攻势"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 d6 5. d4 Nf6 6. dxc5 Bg4 7. h3 O-O 8. hxg4 Qd7 9. Be2 Rad8 10. Nbd2 d5 11. Nh2 Rde8 12. g5 Ng4 13. Nxg4 b5 14. exd5 Qe7 15. Ne4 Nb8 16. Qd3 Qxg5 17. Nef6+ gxf6 18. Qxh7# 1-0')[0];
    record.id = 'oscar-demo-v1'; record.source = '演示棋谱';
    if(demoData && JSON.stringify(record.moves)===JSON.stringify(demoData.moves))record.analysis=JSON.parse(JSON.stringify(demoData.analysis));
    return record;
  }
  return {START, id, uci, move, position, validate, create, importText, toPgn, lineSan, numeric, viewNumeric, displayScore, probabilities, validWdl, assess, timeline, summary, moveFacts, variationRows, evaluationChange, keyMoments, explainMove, addBranch, compactBranches, fromPlacement, moveSymbol, demo};
});
