import Foundation
import JavaScriptCore

public struct OscarError: LocalizedError {
    public let message: String
    public init(_ message: String) { self.message = message }
    public var errorDescription: String? { message }
}

/// Uses the same vendored chess.js and record normalization as Android's UI.
/// JavaScriptCore contexts are confined by one lock, including exception state.
public final class ChessRules {
    private let context: JSContext
    private let lock = NSLock()
    public static let startFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

    public init(chessURL: URL, coreURL: URL) throws {
        guard let context = JSContext() else { throw OscarError("无法启动棋谱规则库") }
        self.context = context
        for url in [chessURL, coreURL] {
            context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
            if let exception = context.exception { throw OscarError(exception.toString()) }
        }
        context.evaluateScript(Self.bridge)
        if let exception = context.exception { throw OscarError(exception.toString()) }
    }

    public func call(_ method: String, _ arguments: [Any]) throws -> [String: Any] {
        lock.lock(); defer { lock.unlock() }
        context.exception = nil
        guard let value = context.objectForKeyedSubscript("OscarRules")?.invokeMethod(method, withArguments: arguments),
              let json = value.toString()?.data(using: .utf8) else { throw OscarError("棋谱计算失败") }
        if let exception = context.exception { throw OscarError(exception.toString()) }
        guard let result = try JSONSerialization.jsonObject(with: json) as? [String: Any] else {
            throw OscarError("棋谱计算返回了无效数据")
        }
        if let error = result["error"] as? String { throw OscarError(error) }
        return result
    }

    public func validate(_ record: [String: Any]) throws -> [String: Any] {
        try call("validate", [record])
    }

    public func position(_ fen: String, moves: [String] = []) throws -> [String: Any] {
        try call("position", [fen, moves])
    }

    public func successors(_ fen: String) throws -> [[String: Any]] {
        try call("successors", [fen])["positions"] as? [[String: Any]] ?? []
    }

    public func match(_ fen:String,placement:String) throws -> [String:Any] {
        try call("match",[fen,placement])
    }

    private static let bridge = """
    var OscarRules = (function () {
      function safe(fn) { return function () { try { return JSON.stringify(fn.apply(null, arguments)); }
        catch (e) { return JSON.stringify({error:String(e.message || e)}); } }; }
      function board(fen, moves) {
        var g = new Chess();
        if (!g.load(fen)) throw Error('起始 FEN 无效');
        for (var m of (moves || [])) if (!Sprout.move(g, m)) throw Error('棋谱含无法重放的走法');
        return g;
      }
      function describe(g) { return {fen:g.fen(), turn:g.turn(), check:g.in_check(),
        mate:g.in_checkmate(), draw:g.in_draw(), terminal:g.game_over(),
        result:Sprout.terminalResult(g) || '*', legal:g.moves({verbose:true}).map(Sprout.uci)}; }
      function expand(p) {return p.replace(/[1-8]/g,n=>'.'.repeat(Number(n))).replace(/\\//g,'');}
      function matches(g,target) {
        var expected=expand(g.fen().split(' ')[0]);
        if(expected===target)return true;
        var king=g.turn()==='w'?'K':'k',i=expected.indexOf(king);
        return i>=0 && (target[i]==='?' || target[i]==='.') &&
          expected.split('').every((p,j)=>j===i||p===target[j]) && g.in_checkmate();
      }
      return {
        validate:safe(function (record) { return Sprout.validate(record); }),
        match:safe(function(fen,placement) {
          var g=board(fen),target=expand(placement),original=expand(g.fen().split(' ')[0]);
          if(target.length!==64||!/^[.\\?prnbqkPRNBQK]+$/.test(target))return {kind:'unmatched'};
          if(matches(g,target))return {kind:'same'};
          var differences=original.split('').map((p,i)=>p!==target[i]?i:-1).filter(i=>i>=0);
          if(differences.length===1&&original[differences[0]]!=='.')return {kind:'same'};
          var nodes=0,limited=false,matchesFound=[],path=[];
          function search(left) {
            if(++nodes>8000){limited=true;return;}
            if(left===0){if(matches(g,target))matchesFound.push(path.slice());return;}
            for(var move of g.moves({verbose:true})) {
              // Within two alternating plies, the first mover cannot return to
              // its origin. Ignore unchanged origins without weakening matching.
              var origin=(8-Number(move.from[1]))*8+move.from.charCodeAt(0)-97;
              if(path.length===0&&!differences.includes(origin))continue;
              var code=Sprout.uci(move);g.move(move);path.push(code);
              search(left-1);path.pop();g.undo();
              if(limited||matchesFound.length>1)return;
            }
          }
          for(var depth=1;depth<=2;depth++) {
            search(depth);
            if(limited)return {kind:'unmatched'};
            if(matchesFound.length>1)return {kind:'ambiguous'};
            if(matchesFound.length===1)return {kind:'move',moves:matchesFound[0],position:describe(board(fen,matchesFound[0]))};
          }
          return {kind:'unmatched'};
        }),
        position:safe(function (fen,moves) { return describe(board(fen,moves)); }),
        successors:safe(function (fen) {
          var g=board(fen), positions=[];
          for(var m of g.moves({verbose:true})) {
            var move=Sprout.uci(m); Sprout.move(g,move);
            positions.push({move:move,fen:g.fen()}); g.undo();
          }
          return {positions:positions};
        })
      };
    })();
    """
}
