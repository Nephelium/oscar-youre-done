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
              depth: Math.max(0, Number(l.depth) || 0), terminal: !!l.terminal, pv: Array.isArray(l.pv) ? l.pv.filter(x => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(x)).slice(0, 80) : []}))};
        }
      });
    }
    (raw.branches || []).slice(0, 200).forEach(b => {
      if (!Number.isInteger(b.at) || b.at < 0 || b.at > moves.length || !Array.isArray(b.moves) || b.moves.length > 600) return;
      try { const g = position(record, b.at, b.moves); if (g) record.branches.push({id: String(b.id || id()), at: b.at, name: String(b.name || '新的变化').slice(0,80), moves: b.moves.slice()}); } catch (_) { /* Invalid optional variation is not a valid mainline. */ }
    });
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
    const incomplete = record.issues.some(x => !x.resolved);
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
      rows.push({ply: i+1, moveNumber, move: input, san: m.san, color: m.color, piece:m.piece, captured:m.captured, flags:m.flags, check:g.in_check(), mate:g.in_checkmate(), fen: g.fen(), evaluation: record.analysis[g.fen()], review});
    });
    return rows;
  }
  function moveSymbol(review) {return !review?'':review.book?'▤':review.best?'★':review.loss>=350?'??':review.loss>=180?'?':review.loss>=90?'?!':review.loss<30?'!':'✓';}
  function summary(record, side = record.side) {
    const rows = timeline(record).slice(1), own = rows.filter(r => r.color === side), ready = own.filter(r => r.review);
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
  function addBranch(record, at, moves) {
    position(record, at, moves);
    if (!moves.length) throw Error('先在棋盘上走出一条变化。');
    const existing=record.branches.find(b=>b.at===at&&JSON.stringify(b.moves)===JSON.stringify(moves));if(existing)return existing;
    if(record.branches.length>=200)throw Error('这局已保存 200 条变化，请另存为一局继续推演。');
    const branch = {id: id(), at, moves: moves.slice(), name: '第 ' + position(record,at).fen().split(' ')[5] + ' 回合的变化'};
    record.branches.push(branch); return branch;
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
  return {START, id, uci, move, position, validate, create, importText, toPgn, lineSan, numeric, viewNumeric, displayScore, assess, timeline, summary, moveFacts, addBranch, fromPlacement, moveSymbol, demo};
});
