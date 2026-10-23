import XCTest
@testable import OscarCore

final class CoreTests: XCTestCase {
    private func rules() throws -> ChessRules {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        return try ChessRules(chessURL: root.appendingPathComponent("vendor/chess.min.js"), coreURL: root.appendingPathComponent("review/core.js"))
    }
    private func game(_ id: String = "test") -> [String: Any] {
        ["schema":1,"id":id,"title":"测试","source":"手动","initialFen":ChessRules.startFEN,
         "moves":["f2f3","e7e5","g2g4","d8h4"],"createdAt":1,"updatedAt":2,
         "result":"*","analysis":[:],"branches":[],"issues":[]]
    }
    func testRulesUseLegalMovesAndTerminalResult() throws {
        let rules = try rules()
        let start = try rules.position(ChessRules.startFEN)
        XCTAssertEqual((start["legal"] as? [String])?.count, 20)
        let end = try rules.position(ChessRules.startFEN, moves: game()["moves"] as! [String])
        XCTAssertEqual(end["result"] as? String, "0-1")
        XCTAssertEqual(end["mate"] as? Bool, true)
        XCTAssertThrowsError(try rules.position(ChessRules.startFEN, moves:["e2e5"]))
    }
    func testUniqueTwoPlyRecoveryAndTerminalKingMask() throws {
        let rules=try rules(),after=try rules.position(ChessRules.startFEN,moves:["e2e4","e7e5"])
        let matched=try rules.match(ChessRules.startFEN,placement:(after["fen"] as! String).components(separatedBy:" ")[0])
        XCTAssertEqual(matched["moves"] as? [String],["e2e4","e7e5"])
        let beforeMate=try rules.position(ChessRules.startFEN,moves:["f2f3","e7e5","g2g4"])["fen"] as! String
        let terminal=try rules.position(beforeMate,moves:["d8h4"])["fen"] as! String
        let masked=terminal.components(separatedBy:" ")[0].replacingOccurrences(of:"K",with:"?")
        let result=try rules.match(beforeMate,placement:masked)
        XCTAssertEqual(result["moves"] as? [String],["d8h4"])
        XCTAssertEqual((result["position"] as? [String:Any])?["result"] as? String,"0-1")
        let nonMate=try rules.match(ChessRules.startFEN,placement:"rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQ?BNR")
        XCTAssertNotEqual(nonMate["kind"] as? String,"move")
    }
    func testAtomicPersistenceAndTraversalRejection() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let rules = try rules(), store = try GameStore(directory:dir, rules:rules)
        defer { try? FileManager.default.removeItem(at:dir) }
        try store.save(game())
        XCTAssertEqual(try store.read("test")?["result"] as? String, "0-1")
        var invalid = game(); invalid["moves"] = ["e2e5"]
        XCTAssertThrowsError(try store.save(invalid))
        XCTAssertEqual((try store.read("test")?["moves"] as? [String])?.count, 4)
        XCTAssertThrowsError(try store.save(game("../escape")))
        XCTAssertThrowsError(try store.delete("../escape"))
        XCTAssertEqual(try store.list().count, 1)
        try store.delete("test"); XCTAssertEqual(try store.list().count, 0)
    }
    func testShallowerAnalysisDoesNotReplaceDeepResult() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = try GameStore(directory:dir, rules:rules())
        defer { try? FileManager.default.removeItem(at:dir) }
        try store.save(game())
        try store.mergeAnalysis(id:"test", fen:ChessRules.startFEN, result:["engine":"Stockfish 19","lines":[["depth":20,"cp":15,"pv":[]]]])
        try store.mergeAnalysis(id:"test", fen:ChessRules.startFEN, result:["engine":"Stockfish 19","lines":[["depth":8,"cp":30,"pv":[]]]])
        let analysis = try store.read("test")?["analysis"] as? [String:[String:Any]]
        XCTAssertEqual((analysis?[ChessRules.startFEN]?["lines"] as? [[String:Any]])?.first?["depth"] as? Int, 20)
    }
}
