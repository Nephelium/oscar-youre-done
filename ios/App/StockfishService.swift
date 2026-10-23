import Foundation
import CryptoKit

private final class SearchResult {
    var lines = [Int:[String:Any]]()
    var lastUpdate = Date.distantPast
    let whiteToMove: Bool
    let update: ([String:Any]) -> Void
    let shouldContinue: () -> Bool
    let started = Date()
    init(whiteToMove: Bool, shouldContinue: @escaping () -> Bool, update: @escaping ([String:Any]) -> Void) {
        self.whiteToMove = whiteToMove; self.update = update; self.shouldContinue = shouldContinue
    }
    func value() -> [String:Any] {
        ["engine":"Stockfish 19","budget":Int(Date().timeIntervalSince(started) * 1000),
         "lines":lines.keys.sorted().prefix(3).compactMap { lines[$0] }]
    }
    func consume(_ line: String) {
        guard shouldContinue() else { return }
        guard let (rank, value) = EngineInfo.parse(line, whiteToMove:whiteToMove) else { return }
        lines[rank] = value
        if rank == 1, Date().timeIntervalSince(lastUpdate) >= 0.18 {
            lastUpdate = Date(); update(self.value())
        }
    }
}

final class StockfishService {
    private let queue = DispatchQueue(label:"oscar.stockfish", qos:.userInitiated)
    private let lock = NSLock()
    private var generation = 0
    private var pointer: UnsafeMutableRawPointer?
    private let rules: ChessRules
    private let networkURL: URL
    init(rules: ChessRules, networkURL: URL) { self.rules = rules; self.networkURL = networkURL }
    deinit { if let pointer { oscar_engine_destroy(pointer) } }

    func cancel() {
        lock.lock(); generation += 1; let engine = pointer; lock.unlock()
        if let engine { oscar_engine_stop(engine) }
    }
    private func current(_ token: Int) -> Bool {
        lock.lock(); defer { lock.unlock() }; return generation == token
    }
    private func engine() throws -> UnsafeMutableRawPointer {
        if let pointer { return pointer }
        // Verify the bundled network before upstream's fatal-on-invalid verification.
        let input = try FileHandle(forReadingFrom:networkURL)
        defer { try? input.close() }
        var digest = SHA256()
        while let bytes = try input.read(upToCount:1024 * 1024), !bytes.isEmpty { digest.update(data:bytes) }
        let hex = digest.finalize().map { String(format:"%02x",$0) }.joined()
        guard hex == "1a298aa575a085434d29027978dc36867fe9c5bcea9376654b7a8eba1e52dfc2",
              let created = oscar_engine_create(networkURL.path) else {
            throw OscarError("引擎资源不完整，请重新安装应用")
        }
        lock.lock(); pointer = created; lock.unlock()
        return created
    }

    func search(fen: String, moves: [String] = [], budget: Int, depth: Int = 20,
                skill: Int = 20, infinite: Bool = false, play: Bool = false,
                update: @escaping ([String:Any]) -> Void,
                completion: @escaping (Result<[String:Any], Error>) -> Void) {
        lock.lock(); let token = generation; lock.unlock()
        queue.async { [self] in
            do {
                guard current(token) else { throw OscarError("分析已暂停") }
                let state = try rules.position(fen, moves:moves)
                if let terminal = EngineInfo.terminal(state) {
                    if play { throw OscarError("这一局已结束") }
                    completion(.success(terminal)); return
                }
                let engine = try engine()
                guard current(token) else { throw OscarError("分析已暂停") }
                let collected = SearchResult(whiteToMove:state["turn"] as? String == "w", shouldContinue:{
                    if self.current(token) { return true }
                    oscar_engine_stop(engine); return false
                }) { result in
                    if self.current(token) { update(result) }
                }
                let context = Unmanaged.passRetained(collected)
                defer { context.release() }
                let returned = oscar_engine_search(engine, fen, moves.joined(separator:" "),
                    Int32(max(100,min(budget,10000))), Int32(max(1,min(depth,40))),
                    Int32(max(0,min(skill,20))), infinite ? 1 : 0, { line, context in
                        guard let line, let context else { return }
                        Unmanaged<SearchResult>.fromOpaque(context).takeUnretainedValue().consume(String(cString:line))
                    }, context.toOpaque())
                guard let returned else { throw OscarError("引擎返回失败") }
                defer { oscar_engine_free(returned) }
                guard current(token) else { throw OscarError("分析已暂停") }
                let response = try JSONSerialization.jsonObject(with:Data(String(cString:returned).utf8)) as? [String:Any] ?? [:]
                if let error = response["error"] as? String { throw OscarError(error) }
                if play {
                    guard let move = response["move"] as? String,
                          (state["legal"] as? [String])?.contains(move) == true else { throw OscarError("引擎未返回合法走法") }
                    completion(.success(["move":move,"skill":skill,"engine":"Stockfish 19"]))
                } else {
                    guard !collected.lines.isEmpty else { throw OscarError("本次未得到评分，请重新分析") }
                    completion(.success(collected.value()))
                }
            } catch { completion(.failure(error)) }
        }
    }
}
