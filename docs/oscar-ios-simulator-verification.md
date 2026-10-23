# 奥斯卡你完了 · iOS 模拟器基础版验证

日期：2026-10-23。版本：1.3.7，构建 1。当前交付为 Apple Silicon Mac 上的 iOS Simulator App。

## 环境与交付物

- Mac：Apple M4、16 GiB 内存，Xcode 27.1（27A9275）。
- 实际测试设备：iPhone 18 Pro，iOS 27.0 模拟器。iOS 27.1 runtime 同时可用，但未将其计入本次测试。
- Xcode 工程：`ios/build/Oscar.xcodeproj`。
- Release App：`ios/build/Release/Build/Products/Release-iphonesimulator/Oscar.app`。
- 打包文件：`ios/build/Oscar-iOS-Simulator-1.3.7.zip`，113436294 字节，约 108.2 MiB。
- SHA-256：`d25ff6de43c80d43e6786f137d989a42e3423c1e89a9929d9b1bf875cdf33ce8`。
- 安装平台已检查为 `iPhoneSimulator`。Release App 不含 XCTest bundle 或私有棋局截图。

启动：在 Mac 项目目录执行 `bash ios/scripts/run_simulator.sh`。首次构建或源码修改后加 `--build`。Xcode 27 的模拟器窗口由 DeviceHub 承载，启动脚本也兼容旧版 Simulator 路径。

## 已执行的检查

| 范围 | 结果与证据 |
| --- | --- |
| 共享业务 | `npm test`：52 项通过，随后国际象棋、中国象棋规则与课程校验通过。日志 `ios/build/shared-tests.log`。 |
| 共享界面 | `review-mobile-smoke.js`、`review-session-smoke.js` 通过，覆盖导入、分支、保存、分析时浏览、计时与横屏。 |
| Android 兼容 | 两个模块的单元测试、lint、APK 构建通过。日志 `android/recorder/build/reports/ios-shared-final.log`。 |
| Swift 核心 | 6 项通过，覆盖合法走法、终局、两步补全、将死动画遮挡、原子保存、非法路径与深浅分析缓存。 |
| iOS 原生集成 | 5 项通过，使用实际 Stockfish 和 WebKit，覆盖引擎分析与合法应手、无限分析取消与重启、演示变化自动分析、AI 对战、截图确认保存、重新加载后读取、删除与日夜模式。报告 `integration-6.xcresult`。 |
| 实际触摸 | PGN 输入、导入、翻转、竖屏四角棋子可点击、横屏四角棋子可点击、设置入口通过。报告 `ui-7.xcresult`。 |
| 系统相册 | 打开、取消、重新选择测试截图、自动定位、识别、确认保存，以及保存后 e4 白兵 / e5 黑兵位置核查通过。最终测试报告 `photos-13.xcresult`，1 项通过、0 跳过、0 失败。 |
| Release | 全新派生目录构建通过，测试后重新安装并启动正式模拟器 App。日志 `release-build.log`、`release-launch-final.log`。 |

远程原生报告位于项目 `ios/build/reports/`。截图识别的私有测试资源单独提供，没有加入共享源码或主应用。

## 识别样本

使用已有多邻国实战的 19 张画面，18 张棋子位置完全匹配。最后一张将死动画遮挡了黑王，通过唯一合法走法与将死状态核查，恢复出的全部 37 个半回合与参考棋谱一致，零差异。

优化后的 Mac 样本中，19 帧的图像转换、识别与规则匹配累计计时 2.14 秒，最慢一帧 0.21 秒。这里处理的是已有 PNG 画面，没有执行录屏解码，也不能据此承诺 iPhone 的实时性能。详细结果为 `vision-optimized.json`。

## 本次修复

- 接入 iOS 27 所需的 Scene 生命周期，解决启动失败。
- 按编译架构选择 Stockfish 指令集，避免给 x86 模拟器传入 ARM NEON 定义。
- 处理分析启动前后的取消竞争，清理 C++ 回调，避免旧搜索继续占用引擎或使用失效上下文。
- iOS 输入框使用至少 16px 字号，避免输入 PGN 后保留系统自动缩放、裁掉棋盘右侧。
- 真实界面按平台能力显示入口，隐藏未实现的跨应用采集、录屏导入和 Android 更新入口。
- 识别匹配先筛选确实发生变化的走子起点，减少两步补全的搜索量，保留唯一合法匹配要求。
- 完整校验 NNUE SHA-256，资源损坏时显示错误。

## 当前边界

本轮包含本地棋谱、截图识别、复盘、分支、Elo、收藏、主题与 AI 对战基础能力。尚未接通 iOS 视频导入或 ReplayKit 跨应用实时采集，没有制作已签名的 iPhone 安装包，也没有执行真机测试。iPad 和其他系统版本尚未纳入本轮验证。

截图识别测试范围限于现有多邻国画面，不代表任意棋盘网站、皮肤或手机截图均可识别。相册触摸流程已实测通过。早期测试只查询 App 自身的控件，未查到 iOS 27 独立 PhotosPicker 进程中的窗口，调整测试定位后验证了完整流程，未修改产品代码绕过系统选图。
