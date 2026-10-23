import Foundation

public enum EngineInfo {
    public static func parse(_ text: String, whiteToMove: Bool) -> (Int, [String: Any])? {
        let words = text.split(separator: " ").map(String.init)
        guard words.first == "info", !words.contains("lowerbound"), !words.contains("upperbound"),
              let score = words.firstIndex(of:"score"), score + 2 < words.count,
              let value = Int(words[score + 2]), let pv = words.firstIndex(of:"pv") else { return nil }
        func integer(_ key: String) -> Int? {
            guard let i = words.firstIndex(of:key), i + 1 < words.count else { return nil }
            return Int(words[i + 1])
        }
        let kind = words[score + 1], sign = whiteToMove ? 1 : -1
        guard ["cp", "mate"].contains(kind) else { return nil }
        let moves = words.dropFirst(pv + 1).prefix { $0.range(of:"^[a-h][1-8][a-h][1-8][qrbn]?$",options:.regularExpression) != nil }
        var line: [String: Any] = ["depth":integer("depth") ?? 0, "pv":Array(moves),
            "cp":kind == "cp" ? value * sign : NSNull(), "mate":kind == "mate" ? value * sign : NSNull()]
        if let i = words.firstIndex(of:"wdl"), i + 3 < words.count {
            let values = words[(i + 1)...(i + 3)].compactMap(Int.init)
            if values.count == 3, values.allSatisfy({ (0...1000).contains($0) }), values.reduce(0,+) == 1000 {
                line["wdl"] = whiteToMove ? values : Array(values.reversed())
            }
        }
        return (integer("multipv") ?? 1, line)
    }

    public static func terminal(_ state: [String: Any]) -> [String: Any]? {
        guard state["terminal"] as? Bool == true else { return nil }
        let mate = state["mate"] as? Bool == true, whiteTurn = state["turn"] as? String == "w"
        return ["engine":"Stockfish 19", "budget":0, "lines":[[
            "depth":0, "terminal":true, "pv":[], "cp":mate ? (whiteTurn ? -100000 : 100000) : 0,
            "mate":mate ? 0 : NSNull(), "wdl":mate ? (whiteTurn ? [0,0,1000] : [1000,0,0]) : [0,1000,0]
        ] as [String:Any]]]
    }
}
