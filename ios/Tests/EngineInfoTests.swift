import XCTest
@testable import OscarCore

final class EngineInfoTests: XCTestCase {
    func testPerspectiveAndBounds() {
        let value = EngineInfo.parse("info depth 20 multipv 1 score cp 123 wdl 700 200 100 pv e7e5 g1f3", whiteToMove:false)
        XCTAssertEqual(value?.1["cp"] as? Int, -123)
        XCTAssertEqual(value?.1["wdl"] as? [Int], [100,200,700])
        XCTAssertNil(EngineInfo.parse("info depth 9 score cp 5 lowerbound pv e2e4", whiteToMove:true))
        let invalid = EngineInfo.parse("info depth 10 score cp 5 wdl 900 300 5 pv e2e4", whiteToMove:true)
        XCTAssertNil(invalid?.1["wdl"])
    }
    func testMateZeroKeepsWinnerAndStalemateIsDraw() {
        let result = EngineInfo.terminal(["terminal":true,"mate":true,"turn":"w"])
        XCTAssertEqual((result?["lines"] as? [[String:Any]])?.first?["cp"] as? Int, -100000)
        let draw = EngineInfo.terminal(["terminal":true,"mate":false,"turn":"b"])
        XCTAssertEqual((draw?["lines"] as? [[String:Any]])?.first?["wdl"] as? [Int], [0,1000,0])
    }
}
