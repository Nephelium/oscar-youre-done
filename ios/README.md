# 奥斯卡你完了 · iOS

Swift / WKWebView 基础版，支持模拟器与 iPhoneOS 构建。网页资源来自项目根目录 `review/`，不在此目录维护副本。本地 Stockfish 19 由 C++ 源码编译进 App。

当前提供棋谱与 FEN 导入、本地保存、截图识别和起始局面确认、复盘与分支、自动分析、六档 AI 对战、时钟和日夜主题。视频导入及 ReplayKit 跨应用实时记录尚未接入，首页按能力显示入口。公开 IPA 供用户自行签名侧载，尚未经过 iPhone 真机运行测试，也未发布 TestFlight / App Store。

1.3.8 源码同步加入 PGN 与代数记谱（SAN）的文件导出和系统剪贴板复制，移除单局完整备份按钮，保留全局备份。本轮按 Android 发布范围执行，未编译、打包或验证 iOS 设备。现有可下载 IPA 仍为 [1.3.7 构建 2](https://github.com/Nephelium/oscar-youre-done/releases/tag/v1.3.7)，不包含这些导出更新。

## 在 iPhone 上安装

需要 iOS 17.0+，使用 Windows / Mac 与免费 Apple 账号签名安装。详见 [iPhone 安装说明](../docs/oscar-ios-installation.md)。现有 IPA 是真机 arm64 构建，名称中的 `unsigned` 表示尚未签名，不能直接点开安装。

## 构建真机 IPA

在 Mac 项目根目录执行，无需付费账号或连接 iPhone：

```bash
python3 ios/scripts/test_device_packaging.py
python3 ios/scripts/archive_device.py --unsigned --package-for-resigning --build-number 2
```

脚本在 `ios/build/device/build-2-<UTC时间>/` 生成独立 `.xcarchive`、未签名 IPA、SHA-256、编译日志与 `verification.json`。核查 iPhoneOS / arm64、最低系统版本、隐私清单、NNUE 哈希、dSYM 匹配和私有样本隔离。已存在产物不会被覆盖。不会登录账号、上传或创建证书。

可单独重新检查归档：

```bash
python3 ios/scripts/verify_device_archive.py ios/build/device/<本次目录>/Oscar.xcarchive
```

有付费团队且在 Xcode 完成证书准备后，使用 `--team-id <团队编号>` 替换 `--unsigned`，去掉 `--package-for-resigning`，即可生成签名归档。随后在 Xcode Organizer 中验证和分发到 App Store Connect。脚本不自动更新开发者门户。每次上传使用新的 `--build-number`；直接调用工程生成器时可设置 `OSCAR_BUILD_NUMBER`，默认保留为 1。

`PrivacyInfo.xcprivacy` 声明本地偏好、应用容器内文件信息及引擎计算计时。应用不跟踪、不上传用户数据。导出加密声明基于当前应用只使用系统提供的通信能力，新增独立加密实现后需重新核对。

## 在 Mac 上启动

需要完整 Xcode、已完成首次初始化，并下载一个 iOS Simulator 平台。不需要开发者签名。

在项目根目录运行：

```bash
bash ios/scripts/run_simulator.sh --build
```

以后运行 `bash ios/scripts/run_simulator.sh` 会安装并打开已有的 Release 模拟器 App。使用 `OSCAR_SIMULATOR_ID=<UUID>` 可指定模拟器。默认优先使用已启动的 iPhone 模拟器。

生成工程位于 `ios/build/Oscar.xcodeproj`。资源同步后需要重新执行 `python3 ios/scripts/generate_project.py`，再构建。生成脚本只使用 Python 标准库及 Xcode 工具，不要求 XcodeGen 或 CocoaPods。第一次构建会从官方 Stockfish 仓库下载 NNUE，核对完整 SHA-256 后保存在 `ios/build/networks/`。

## 验证

```bash
swift test --package-path ios --scratch-path ios/build/swift-tests
python3 ios/scripts/generate_project.py
xcodebuild -project ios/build/Oscar.xcodeproj -scheme Oscar \
  -configuration Release -destination 'platform=iOS Simulator,id=<UUID>' \
  -derivedDataPath ios/build/DerivedData CODE_SIGNING_ALLOWED=NO \
  ENABLE_TESTABILITY=YES ONLY_ACTIVE_ARCH=YES test
```

`Core` 测试覆盖规则、终局、原子存储与评分视角；`IntegrationTests` 使用实际 WebKit 和 Stockfish，`UITests` 执行系统触摸与旋转。截图识别测试需在生成工程时指定 `OSCAR_IOS_TEST_FIXTURES`，指向含 `duolingo-game-01.png` 的本地测试画面目录。未提供时截图及相册测试明确跳过。私有图片只进入测试 bundle，独立 Release 构建不包含这些图片。

相册触摸测试需先在专用测试模拟器中导入该图片，并确保它位于相册第一项：

```bash
xcrun simctl addmedia <UUID> "$OSCAR_IOS_TEST_FIXTURES/duolingo-game-01.png"
OSCAR_IOS_TEST_FIXTURES="$OSCAR_IOS_TEST_FIXTURES" python3 ios/scripts/generate_project.py
```

该测试覆盖打开相册、取消、重新选图、自动定位、识别、核对并保存。iOS 27 的相册控件位于独立 PhotosPicker 进程，测试通过系统进程查询。使用其他系统版本时需要核对相册的辅助功能标识。

模拟器使用 Mac 的处理器，性能结果不能等同于 iPhone。实际验证平台及结果见 [模拟器验收记录](../docs/oscar-ios-simulator-verification.md)。

## 引擎与许可

引擎源码、GPLv3 许可及对应源码压缩包保存在项目 `vendor/stockfish/`。`ios/build/engine-manifest.json` 记录本次构建的源码及 NNUE 哈希。此目录没有上传接口，截图识别与棋谱分析均在应用内完成。

构建生成物、第三方源码解包、测试报告放 `build/`。不在仓库保存 Apple 账号、证书、配置描述文件或用户截图。
