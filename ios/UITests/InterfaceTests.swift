import XCTest

final class InterfaceTests:XCTestCase {
    @MainActor func testPhotosPickerFlow() throws {
        guard Bundle(for:Self.self).object(forInfoDictionaryKey:"OscarPhotoFixture") as? String == "prepared" else {
            throw XCTSkip("Generate with OSCAR_IOS_TEST_FIXTURES and add its image to this test simulator's Photos first")
        }
        let app=XCUIApplication();app.launch()
        XCTAssertTrue(app.buttons["导入一局"].waitForExistence(timeout:15))
        app.buttons["导入一局"].tap()
        app.buttons["导入棋盘截图"].tap()
        // iOS 27 exposes PHPicker accessibility through its system process.
        let picker=XCUIApplication(bundleIdentifier:"com.apple.mobileslideshow.photospicker")
        XCTAssertTrue(picker.buttons["Cancel"].waitForExistence(timeout:15))
        picker.buttons["Cancel"].tap()
        XCTAssertTrue(app.buttons["导入一局"].waitForExistence(timeout:5))
        app.buttons["导入一局"].tap();app.buttons["导入棋盘截图"].tap()
        let photo=picker.images.matching(identifier:"PXGGridLayout-Info").firstMatch
        XCTAssertTrue(photo.waitForExistence(timeout:15))
        photo.tap()
        XCTAssertTrue(app.buttons["识别起始局面"].waitForExistence(timeout:15))
        app.buttons["识别起始局面"].tap()
        XCTAssertTrue(app.buttons["保存到小练习"].waitForExistence(timeout:15))
        let shot=XCTAttachment(screenshot:XCUIScreen.main.screenshot())
        shot.name="ios-image-confirmation";shot.lifetime = .keepAlways;add(shot)
        app.buttons["保存到小练习"].tap()
        XCTAssertTrue(app.buttons["翻转棋盘"].waitForExistence(timeout:5))
        XCTAssertTrue(app.buttons["e4 白兵"].exists)
        XCTAssertTrue(app.buttons["e5 黑兵"].exists)
        app.buttons["返回对局"].tap()
    }
    @MainActor func testTouchNavigationAndLandscape() throws {
        let app=XCUIApplication()
        app.launch()
        defer { XCUIDevice.shared.orientation = .portrait }
        XCTAssertTrue(app.buttons["导入一局"].waitForExistence(timeout:15))
        app.buttons["导入一局"].tap()
        XCTAssertTrue(app.textViews["棋谱内容"].waitForExistence(timeout:5))
        app.textViews["棋谱内容"].tap()
        app.textViews["棋谱内容"].typeText("1. e4 e5 2. Nf3 Nc6 *")
        app.buttons["导入内容"].tap()
        XCTAssertTrue(app.buttons["翻转棋盘"].waitForExistence(timeout:5))
        app.buttons["翻转棋盘"].tap()
        XCTAssertTrue(app.buttons["h1 白车"].isHittable)
        XCTAssertTrue(app.buttons["a8 黑车"].isHittable)
        Thread.sleep(forTimeInterval:0.5)
        let portrait=XCTAttachment(screenshot:XCUIScreen.main.screenshot())
        portrait.name="ios-review-portrait";portrait.lifetime = .keepAlways;add(portrait)
        XCUIDevice.shared.orientation = .landscapeLeft
        let horizontal=NSPredicate { _,_ in app.frame.width > app.frame.height }
        expectation(for:horizontal,evaluatedWith:app)
        waitForExpectations(timeout:5)
        Thread.sleep(forTimeInterval:0.6)
        let landscape=XCTAttachment(screenshot:XCUIScreen.main.screenshot())
        landscape.name="ios-review-landscape";landscape.lifetime = .keepAlways;add(landscape)
        XCTAssertTrue(app.buttons["翻转棋盘"].isHittable)
        XCTAssertTrue(app.buttons["h1 白车"].isHittable)
        XCTAssertTrue(app.buttons["a8 黑车"].isHittable)
        app.buttons["返回对局"].tap()
        XCTAssertTrue(app.buttons["设置"].waitForExistence(timeout:5))
        app.buttons["设置"].tap()
        XCTAssertTrue(app.staticTexts["日夜模式"].waitForExistence(timeout:5))
    }
}
