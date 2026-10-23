import Foundation

/// One atomic JSON file per game. No asynchronous "saved" acknowledgement.
public final class GameStore {
    private let directory: URL
    private let rules: ChessRules
    private let lock = NSRecursiveLock()
    private let files = FileManager.default
    public static let maxRecordBytes = 12 * 1024 * 1024

    public init(directory: URL, rules: ChessRules) throws {
        self.directory = directory; self.rules = rules
        try files.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func url(_ id: String) throws -> URL {
        guard id.range(of: "^[A-Za-z0-9_-]{1,80}$", options: .regularExpression) != nil else {
            throw OscarError("手记编号无效")
        }
        return directory.appendingPathComponent(id + ".json")
    }

    public func read(_ id: String) throws -> [String: Any]? {
        lock.lock(); defer { lock.unlock() }
        let file = try url(id)
        guard files.fileExists(atPath: file.path) else { return nil }
        let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size <= Self.maxRecordBytes else { throw OscarError("手记文件过大") }
        guard let record = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any] else {
            throw OscarError("手记格式无效")
        }
        return try rules.validate(record)
    }

    public func list() throws -> [[String: Any]] {
        lock.lock(); defer { lock.unlock() }
        let urls = try files.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles])
        var result = [[String: Any]]()
        for file in urls where file.pathExtension == "json" {
            guard (try file.resourceValues(forKeys: [.isRegularFileKey])).isRegularFile == true else { continue }
            // A damaged file is reported; silently skipping it could look like data loss.
            if let record = try read(file.deletingPathExtension().lastPathComponent) { result.append(record) }
        }
        return result.sorted { ($0["updatedAt"] as? Double ?? 0) > ($1["updatedAt"] as? Double ?? 0) }
    }

    @discardableResult public func save(_ raw: [String: Any]) throws -> [String: Any] {
        lock.lock(); defer { lock.unlock() }
        guard let id = raw["id"] as? String else { throw OscarError("手记编号缺失") }
        let target = try url(id)
        guard JSONSerialization.isValidJSONObject(raw) else { throw OscarError("手记格式无效") }
        guard try JSONSerialization.data(withJSONObject: raw).count <= Self.maxRecordBytes else { throw OscarError("手记文件过大") }
        let record = try rules.validate(raw)
        let bytes = try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys])
        guard bytes.count <= Self.maxRecordBytes else { throw OscarError("手记文件过大") }
        try bytes.write(to: target, options: [.atomic])
        return record
    }

    public func delete(_ id: String) throws {
        lock.lock(); defer { lock.unlock() }
        let target = try url(id)
        if files.fileExists(atPath: target.path) { try files.removeItem(at: target) }
    }

    public static func accepts(_ next: [String: Any], over old: [String: Any]?) -> Bool {
        guard let old, old["engine"] as? String == next["engine"] as? String else { return true }
        func depth(_ value: [String: Any]) -> Int { (value["lines"] as? [[String: Any]])?.first?["depth"] as? Int ?? 0 }
        return depth(next) >= depth(old)
    }

    public func mergeAnalysis(id: String, fen: String, result: [String: Any]) throws {
        lock.lock(); defer { lock.unlock() }
        guard var record = try read(id) else { return }
        var analyses = record["analysis"] as? [String: [String: Any]] ?? [:]
        if Self.accepts(result, over: analyses[fen]) {
            analyses[fen] = result; record["analysis"] = analyses
            try save(record)
        }
    }
}
