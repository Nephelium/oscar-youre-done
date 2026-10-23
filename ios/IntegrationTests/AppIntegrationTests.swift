import XCTest
import WebKit
@testable import Oscar

final class AppIntegrationTests: XCTestCase {
    private func resources() throws -> (ChessRules, URL) {
        let root = try XCTUnwrap(Bundle.main.url(forResource:"web",withExtension:nil))
        let rules = try ChessRules(chessURL:root.appendingPathComponent("vendor/chess.min.js"),coreURL:root.appendingPathComponent("review/core.js"))
        return (rules,try XCTUnwrap(Bundle.main.url(forResource:"nn-1a298aa575a0",withExtension:"nnue")))
    }
    func testEngineAnalysisAndLegalReply() throws {
        let (rules,network) = try resources(), service = StockfishService(rules:rules,networkURL:network)
        let done = expectation(description:"real Stockfish analysis")
        service.search(fen:ChessRules.startFEN,budget:350,depth:10,update:{_ in},completion:{ result in
            do {
                let value = try result.get(), lines = try XCTUnwrap(value["lines"] as? [[String:Any]])
                XCTAssertGreaterThan(lines.first?["depth"] as? Int ?? 0,0)
                XCTAssertEqual((lines.first?["wdl"] as? [Int])?.reduce(0,+),1000)
                let pv = try XCTUnwrap(lines.first?["pv"] as? [String])
                _ = try rules.position(ChessRules.startFEN,moves:pv)
            } catch { XCTFail(error.localizedDescription) }
            done.fulfill()
        })
        wait(for:[done],timeout:30)
        let moveDone = expectation(description:"legal skill reply")
        service.search(fen:ChessRules.startFEN,moves:["e2e4"],budget:200,skill:0,play:true,update:{_ in},completion:{ result in
            do {
                let move = try XCTUnwrap(result.get()["move"] as? String)
                _ = try rules.position(ChessRules.startFEN,moves:["e2e4",move])
            } catch { XCTFail(error.localizedDescription) }
            moveDone.fulfill()
        })
        wait(for:[moveDone],timeout:10)
    }
    func testCancelInfiniteAndRestart() throws {
        let (rules,network) = try resources(), service = StockfishService(rules:rules,networkURL:network)
        let stopped = expectation(description:"infinite search stopped")
        let began = expectation(description:"search produced real data")
        var requestedStop = false
        service.search(fen:ChessRules.startFEN,budget:100,depth:1,infinite:true,update:{_ in
            if !requestedStop { requestedStop = true; began.fulfill(); service.cancel() }
        },completion:{ result in
            if case .success = result { XCTFail("Cancelled search returned success") }; stopped.fulfill()
        })
        wait(for:[began,stopped],timeout:30)
        let resumed = expectation(description:"next search succeeds")
        service.search(fen:ChessRules.startFEN,budget:100,depth:6,update:{_ in},completion:{ result in
            if case .failure(let error) = result { XCTFail(error.localizedDescription) }; resumed.fulfill()
        })
        wait(for:[resumed],timeout:10)
    }
    @MainActor private func evaluate(_ code: String, web: WKWebView) async throws -> Any? {
        try await web.evaluateJavaScript(code)
    }
    @MainActor private func openedWeb() async throws -> WKWebView {
        let root=try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first?.rootViewController }.first)
        let web=try XCTUnwrap(root.view.subviews.compactMap { $0 as? WKWebView }.first)
        for _ in 0..<100 {
            if (try? await evaluate("!!window.App",web:web)) as? Bool == true {return web}
            try await Task.sleep(nanoseconds:100_000_000)
        }
        throw OscarError("Web UI did not become ready")
    }
    @MainActor private func waitFor(_ expression:String,web:WKWebView) async throws {
        for _ in 0..<100 {
            if try await evaluate(expression,web:web) as? Bool == true {return}
            try await Task.sleep(nanoseconds:100_000_000)
        }
        throw OscarError("UI did not reach: "+expression)
    }
    func testScreenshotRecognitionConfirmationAndStorage() throws {
        guard let fixture=Bundle(for:Self.self).url(forResource:"duolingo-game-01",withExtension:"png") else {
            throw XCTSkip("Supply OSCAR_IOS_TEST_FIXTURES to test private screenshots")
        }
        let (rules,_)=try resources(),root=try XCTUnwrap(Bundle.main.url(forResource:"web",withExtension:nil))
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent("oscar-image-test-"+UUID().uuidString)
        defer {try? FileManager.default.removeItem(at:directory)}
        let store=try GameStore(directory:directory.appendingPathComponent("games"),rules:rules)
        let importer=ImageImporter(webRoot:root)
        try importer.select(fixture)
        XCTAssertTrue(importer.preview().hasPrefix("data:image/jpeg;base64,"))
        XCTAssertNotNil(importer.suggested())
        let fen=try importer.recognize(["side":"w"])
        let expected=try rules.position(ChessRules.startFEN,moves:["e2e4","e7e5"])["fen"] as! String
        XCTAssertEqual(fen.components(separatedBy:" ")[0],expected.components(separatedBy:" ")[0])
        XCTAssertThrowsError(try importer.confirm(["fen":ChessRules.startFEN],store:store,rules:rules,evidence:directory.appendingPathComponent("evidence")))
        let game=try importer.confirm(["fen":fen,"side":"w"],store:store,rules:rules,evidence:directory.appendingPathComponent("evidence"))
        XCTAssertEqual(game["notebook"] as? String,"practice")
        XCTAssertEqual(try store.list().count,1)
        let capture=try XCTUnwrap(game["capture"] as? [String:Any]),name=try XCTUnwrap(capture["image"] as? String)
        XCTAssertTrue(FileManager.default.fileExists(atPath:directory.appendingPathComponent("evidence").appendingPathComponent(name).path))
        XCTAssertThrowsError(try importer.confirm(["fen":fen],store:store,rules:rules,evidence:directory.appendingPathComponent("evidence")))
    }
    @MainActor func testDemoVariationAutoAnalysisAndBattle() async throws {
        let web=try await openedWeb()
        _ = try await evaluate("while(App.back()){}; App.state.settings.autoAnalysis=true; App.state.settings.unlimitedAnalysis=false; document.querySelector('[data-act=demo]').click(); true",web:web)
        let count=try await evaluate("App.state.current.moves.length",web:web) as? Int
        XCTAssertEqual(count,35)
        _ = try await evaluate("document.querySelector('[data-act=next]').click(); true",web:web)
        let ply=try await evaluate("App.state.ply",web:web) as? Int
        XCTAssertEqual(ply,1)
        _ = try await evaluate("document.querySelector('[data-act=prev]').click(); document.querySelector('[data-square=d2]').click(); document.querySelector('[data-square=d4]').click(); true",web:web)
        let branch=try await evaluate("App.state.branchActive",web:web) as? Bool
        XCTAssertEqual(branch,true)
        var analyzed=false
        for _ in 0..<150 {
            analyzed=(try await evaluate("!!App.state.current.analysis[Sprout.variationRows(App.state.current,App.state.branchAt,App.state.branch).at(-1).fen]?.lines?.length",web:web)) as? Bool == true
            if analyzed {break};try await Task.sleep(nanoseconds:100_000_000)
        }
        XCTAssertTrue(analyzed,"A new variation must receive actual automatic native analysis")
        _ = try await evaluate("while(App.back()){}; document.querySelector('[data-route=play]').click(); if(document.querySelector('[data-act=resignBattle]')){document.querySelector('[data-act=resignBattle]').click();document.querySelector('[data-act=confirmResign]').click();} true",web:web)
        try await waitFor("!!document.querySelector('[data-act=newBattle],[data-act=startBattle]')",web:web)
        _ = try await evaluate("if(document.querySelector('[data-act=newBattle]'))document.querySelector('[data-act=newBattle]').click(); document.querySelector('[data-act=startBattle]').click(); document.querySelector('[data-square=e2]').click(); document.querySelector('[data-square=e4]').click(); true",web:web)
        var moves=0
        for _ in 0..<150 {
            moves=try await evaluate("App.state.current.moves.length",web:web) as? Int ?? 0
            if moves>=2 {break};try await Task.sleep(nanoseconds:100_000_000)
        }
        XCTAssertEqual(moves,2)
        let legal=try await evaluate("!!Sprout.position(App.state.current).fen()",web:web) as? Bool
        XCTAssertEqual(legal,true)
        _ = try await evaluate("document.querySelector('[data-act=suspendBattle]').click(); true",web:web)
        let active=try await evaluate("App.state.battle.clock.active===null",web:web) as? Bool
        XCTAssertEqual(active,true)
        let savedID=try await evaluate("App.state.current.id",web:web) as? String
        let testID=try XCTUnwrap(savedID)
        _ = try await evaluate("document.querySelector('[data-act=resignBattle]').click(); document.querySelector('[data-act=confirmResign]').click(); true",web:web)
        try await waitFor("!!document.querySelector('[data-act=newBattle]')",web:web)
        _ = try await evaluate("document.querySelector('[data-act=newBattle]').click(); SproutHost.deleteGame('\(testID)'); while(App.back()){}; true",web:web)
    }
    @MainActor func testWebKitPersistenceDemoAndAppearance() async throws {
        let root = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first?.rootViewController }.first)
        let web = try XCTUnwrap(root.view.subviews.compactMap { $0 as? WKWebView }.first)
        for _ in 0..<100 {
            if (try? await evaluate("!!window.App",web:web)) as? Bool == true { break }
            try await Task.sleep(nanoseconds:100_000_000)
        }
        let platform = try await evaluate("SproutHost.platform",web:web) as? String
        XCTAssertEqual(platform,"ios")
        let answer = try await evaluate("""
        (function(){let r=Sprout.validate({id:'ios-integration',source:'iOS test',moves:['f2f3','e7e5','g2g4','d8h4']});
        const error=SproutHost.saveGame(JSON.stringify(r)); if(error)throw Error(error);
        return JSON.parse(SproutHost.listGames()).find(x=>x.id===r.id).result;})()
        """,web:web)
        XCTAssertEqual(answer as? String,"0-1")
        web.reload()
        for _ in 0..<100 {
            try await Task.sleep(nanoseconds:100_000_000)
            if (try? await evaluate("!!window.App",web:web)) as? Bool == true { break }
        }
        let persisted = try await evaluate("JSON.parse(SproutHost.listGames()).some(x=>x.id==='ios-integration')",web:web) as? Bool
        XCTAssertEqual(persisted,true)
        let deleted = try await evaluate("SproutHost.deleteGame('ios-integration')",web:web) as? String
        XCTAssertEqual(deleted,"")
        _ = try await evaluate("document.querySelector('[data-route=settings]').click(); true",web:web)
        let updates = try await evaluate("document.querySelectorAll('[data-act=checkUpdate]').length",web:web) as? Int
        XCTAssertEqual(updates,0)
        _ = try await evaluate("document.querySelector('#appearance-mode').value='dark'; document.querySelector('#appearance-mode').dispatchEvent(new Event('change',{bubbles:true})); true",web:web)
        try await Task.sleep(nanoseconds:200_000_000)
        XCTAssertEqual(root.preferredStatusBarStyle,.lightContent)
        let renderer = UIGraphicsImageRenderer(bounds:root.view.bounds)
        let shot = renderer.image { _ in root.view.drawHierarchy(in:root.view.bounds,afterScreenUpdates:true) }
        let attachment = XCTAttachment(image:shot); attachment.name = "iOS-settings-night"; attachment.lifetime = .keepAlways; add(attachment)
        _ = try await evaluate("document.querySelector('#appearance-mode').value='light'; document.querySelector('#appearance-mode').dispatchEvent(new Event('change',{bubbles:true})); true",web:web)
        try await Task.sleep(nanoseconds:200_000_000)
        XCTAssertEqual(root.preferredStatusBarStyle,.darkContent)
    }
}
