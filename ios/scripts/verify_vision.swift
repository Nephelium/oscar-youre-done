import Foundation
import ImageIO

@main struct VisionVerification {
    static func main() throws {
        guard CommandLine.arguments.count==3 else {throw OscarError("Usage: verify-vision ROOT FIXTURES")}
        let root=URL(fileURLWithPath:CommandLine.arguments[1]),fixtures=URL(fileURLWithPath:CommandLine.arguments[2])
        let rules=try ChessRules(chessURL:root.appendingPathComponent("vendor/chess.min.js"),coreURL:root.appendingPathComponent("review/core.js"))
        let profiles=["duolingo-board-profile","duolingo-night-profile"].map{root.appendingPathComponent("ios/build/resources/web/review/assets/\($0).json")}
        let reference=try JSONSerialization.jsonObject(with:Data(contentsOf:fixtures.appendingPathComponent("duolingo-reference.json"))) as! [String:Any]
        let frames=reference["frames"] as! [[String:Any]],moves=reference["moves"] as! [String]
        let vision=try BoardVision(profiles:profiles)
        var results=[[String:Any]](),failures=0,fen=ChessRules.startFEN,recovered=[String]()
        for frame in frames {
            let name=frame["image"] as! String,url=fixtures.appendingPathComponent(name)
            guard let source=CGImageSourceCreateWithURL(url as CFURL,nil),let image=CGImageSourceCreateImageAtIndex(source,0,nil) else {throw OscarError("Missing fixture: \(name)")}
            let state=try rules.position(ChessRules.startFEN,moves:Array(moves.prefix(frame["plies"] as! Int)))
            let expected=(state["fen"] as! String).components(separatedBy:" ")[0]
            let start=Date(),pixels=try BoardPixels(image:image),observed=vision.recognize(pixels)
            let exact=observed?.placement==expected
            // The final frame can hide the losing king. Report this separately,
            // never silently count it as an exact complete-board recognition.
            let matched=try rules.match(fen,placement:observed?.placement ?? "")
            if matched["kind"] as? String == "move" {
                recovered += matched["moves"] as? [String] ?? []
                fen=(matched["position"] as! [String:Any])["fen"] as! String
            }
            let verified=recovered==Array(moves.prefix(frame["plies"] as! Int))
            if !verified {failures+=1}
            results.append(["image":name,"exact":exact,"rulesVerified":verified,"expected":expected,"observed":observed?.placement ?? "unrecognized","seconds":Date().timeIntervalSince(start)])
        }
        let report:[String:Any] = ["count":results.count,"failures":failures,"recoveredMoves":recovered,"frames":results]
        print(String(decoding:try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]),as:UTF8.self))
        if failures>0 {exit(1)}
    }
}
