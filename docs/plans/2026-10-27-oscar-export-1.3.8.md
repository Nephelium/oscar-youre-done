# 棋谱导出与 1.3.8 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 单局棋谱提供 PGN 和代数记谱（SAN）两种格式，每种均可保存文件或复制，移除单局完整备份按钮，发布 Android 1.3.8。

**Architecture:** `review/` 继续作为 Android/iOS 唯一共享界面。PGN 保持可导入和起始局面信息，纯 SAN 使用现有 chess.js 合法重放生成走法、正确回合数和结果。复制优先走原生系统剪贴板，浏览器使用 Clipboard API 并提供本地文件页面的复制兼容路径。

**Tech Stack:** 原生 JavaScript、chess.js、Kotlin Android WebView、Swift WKWebView、现有 Node/Playwright 测试、Gradle、GitHub CLI。

## 方案与范围

- 导出弹窗按格式分两组：PGN（`.pgn`）和代数记谱 SAN（`.txt`），每组有导出文件、复制按钮。
- SAN 示例 `1. e4 e5 2. Nf3 Nc6 *`，保留将军、将死、吃子、易位、升变和消歧义符号。中途起录使用真实先走方和回合数。纯 SAN 的起始 FEN 不在正文内，弹窗提示需要还原非标准起始局面时选 PGN。
- 导出的内容为已保存主线全谱，不随棋盘游标、翻转或当前试走改变。有未校对位置时明确提示只包含已确认主线。
- 移除单局 JSON 完整备份入口。手记列表、设置、成长页的全局备份入口和 JSON 导入继续兼容，既有数据不迁移。
- Android 与 iOS 的复制写入系统剪贴板，只有成功才提示已复制，失败保留导出弹窗并给出错误。
- 版本 1.3.8，Android versionCode 15；iOS 源码版本同步，仅发布 Android 新包。旧 iOS 1.3.7 安装包继续在旧版 Release 获取。

## Task 1: 核心导出

**Files:** `review/core.js`、`tests/review.test.js`。

1. 添加 SAN 编号、黑先中局、易位、消歧义、吃过路兵、升变、将军/将死和非法主线测试。
2. 运行新增测试确认缺失功能，再实现 `toSan(record)`，复用 chess.js 的 PGN movetext 格式化，不手写棋规。
3. 保持 PGN 导出和导入往返一致，运行 `npm test`。

## Task 2: 两端共享弹窗和复制

**Files:** `review/app.js`、`review/style.css`、`android/recorder/src/main/java/com/jingjing/chesssprout/MainActivity.kt`、`ios/App/NativeBridge.js`、`ios/App/OscarViewController.swift`、`tests/review-ios.test.js`、`tests/review-export-options-smoke.js`。

1. 两组格式各有文件与复制入口，使用明确的按钮可访问名称。文件使用正确扩展名、UTF-8 和 MIME。
2. 原生桥接复制返回实际结果。浏览器复制失败可回退到隐藏文本选择复制，失败不显示成功。
3. 浏览器验证四个入口、复制错误、PGN 往返、SAN 内容、主线范围、320px/横屏/夜间布局及 iOS 桥接。

## Task 3: Android 构建与发布

**Files:** `android/recorder/build.gradle.kts`、`ios/scripts/generate_project.py`、README/应用说明、公开发布快照。

1. 运行两个模块 `testDebugUnitTest lintDebug assembleDebug`，构建 1.3.8，模拟器覆盖安装并验证版本、本地 Stockfish、原生复制及两种系统文件保存。
2. 同步到现有独立公开仓库快照，仅上传明确的源码和文档，检查 diff、测试、包内共享资产与签名一致性。
3. 上传 Android APK、SHA-256 和引擎对应源码到 v1.3.8 草稿，核验附件后发布，并检查公开下载与源码提交。
4. iOS 仅执行当前 Windows 可用的共享逻辑/桥接测试，不声称编译、打包或设备验证通过。

## 验收结果

- `npm test`：56 项测试通过，并通过核心行为、控制格、12 条国际象棋和 8 条中国象棋开局校验。
- `npm run test:review`、`npm run test:mobile`、`node tests/review-audit-smoke.js`、`node tests/review-export-options-smoke.js`：通过。审查脚本使用现有 bundled Playwright 的 `NODE_PATH`，未安装依赖。
- 两模块 `testDebugUnitTest lintDebug assembleDebug` 与 `:recorder:assembleDebugAndroidTest`：通过。
- 模拟器覆盖安装为 1.3.8 / 15，`ClipboardExportTest` 1 项通过，实际系统剪贴板内容匹配 PGN 和 SAN。
- `node tests/review-export-native-smoke.js`：实际系统文件选择器保存 PGN/SAN，逐字节内容、黑先回合数、自定义起始 FEN 往返全部通过。验证等待文件异步写入完成后读取。
- `node tests/review-android-smoke.js`：实际本地 Stockfish 分析、逐局面保存、WebView 重载与分支通过。
- `inspect_apk.py`：199 个共享资源与引擎文件匹配，主 APK 无私有测试图。1.3.8 与 1.3.7 签名证书 SHA-256 一致。
- `ios/scripts/test_device_packaging.py`：3 项通过。iOS 本轮未编译/打包、未做模拟器或真机验证。Android 物理手机也未连接。
- 独立发布快照 `npm test` 42 项通过，`npm run test:ui` 13 个界面脚本全部通过。原生测试脚本显式选择完整对局分类，确保从小练习导出后仍能正确继续验证。
- 最终 APK 的 SHA-256 为 `4a8aba3034fe6759b0669dbbcc3caed3f412fbdb1b64b034784eabfc88b9ae4c`，178422520 字节。最终包重新安装后，剪贴板、两种系统文件导出与本地引擎验证通过；与独立仓库源码的 199 项资源检查也通过。
- 发布目标为 GitHub `Nephelium/oscar-youre-done` 的 `v1.3.8`，只附 Android APK、校验文件和引擎对应源码。发布结果以 Release 页面和远端 tag 为准。
