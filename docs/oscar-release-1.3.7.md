# 奥斯卡你完了 1.3.7 · iOS 模拟器版与复盘修复

## 下载

- **Android**：安装 `oscar-youre-done-1.3.7.apk`，可覆盖升级并保留已有手记。Android 8.0+，ARM64 / x86_64，沿用测试签名。
- **iOS 模拟器**：下载 `Oscar-iOS-Simulator-1.3.7.zip`，解压得到 `Oscar.app`，在 Apple Silicon Mac 的 iPhone 模拟器安装。此包不能直接安装到 iPhone。

## iOS 模拟器基础版

- PGN / FEN 导入、本地保存、系统相册选图、棋盘识别与局面确认。
- 本地 Stockfish 19 复盘、推荐变化、逐步自动分析、分支、AI 对战和时钟。
- 复用 Android 的界面、棋子棋盘、收藏、Elo 与备份格式，适配安全区域、日夜和横竖屏。
- 解决输入 PGN 后的系统自动缩放造成棋盘右侧被裁切的问题。
- 同步 Swift / C++ 源码及可复现的 Xcode 工程生成脚本。

模拟器中启动：

```bash
xcrun simctl install booted Oscar.app
xcrun simctl launch booted com.jingjing.chesssprout.ios
```

当前尚未接入 iOS 录屏导入或 ReplayKit 跨应用实时采集，未提供真机签名安装包。已测试 Apple M4、Xcode 27.1、iPhone 18 Pro / iOS 27.0 模拟器。

## Android 与共享复盘

- **自动检查更新**：启动后在后台读取本仓库正式 Release，发现新版后提醒下载。设置中可关闭或手动检查。不会上传棋谱或媒体，下载、安装由用户确认。
- **补录撤回**：保存时只保留当前游标之前的补走，已撤回的走法不会再次写入。
- **备份导入**：重复导入后，副本之间的续录和校对关联正确指向副本。
- **分析保存**：较浅结果不再覆盖同一引擎已有的深度分析，退出自动分析的间隙也会保留已完成结果。
- **记录保护**：录屏仍在识别时，避免修改、删除同一手记与后台保存冲突。
- **旧数据兼容**：跳过异常的可选条目，保留合法棋谱与正常收藏。
- **界面**：增大复盘统计文字与候选点击区域，调整窄屏按钮、长标题和夜间控制格按钮。

## 验证

共享业务与界面回归、Android 两模块的单元测试 / lint / 构建、已安装 APK 的引擎与校对流程通过。iOS Swift 核心 6 项、实际 WebKit / Stockfish 集成 5 项、触摸与系统相册流程 2 项通过。发布快照另通过 38 项核心测试、12 组界面脚本和 Android 原生测试 / lint / 构建。最终 APK 实际安装后，引擎、补录及在线检查通过；199 个关键包内文件与发布源码 / 引擎一致。iOS 端另外核对了 204 个源码及资源文件，保留实际已测的安装包。

识别采样、解码与分类算法本轮没有更改，也没有重新测试完整私有视频的速度。iOS 的 19 张画面样本恢复出 37 个半回合，与参考棋谱完全一致；这不包含视频解码，也不代表 iPhone 实时采集性能。

[Android 审查与验证](https://github.com/Nephelium/oscar-youre-done/blob/v1.3.7/docs/oscar-audit-1.3.7.md) · [iOS 模拟器验收](https://github.com/Nephelium/oscar-youre-done/blob/v1.3.7/docs/oscar-ios-simulator-verification.md) · [源码](https://github.com/Nephelium/oscar-youre-done/tree/v1.3.7)

附件提供 `SHA256SUMS.txt` 及所用 Stockfish 的对应源码材料。Android APK 的最终哈希以本次 Release 附件为准，早期本地候选的哈希保留在审查记录中。

Android APK SHA-256：`4b97235dabbbdd9b22ab870c0f6a7aa30830865e78ffddba42ad62b6832b98c5`。
iOS Simulator ZIP SHA-256：`d25ff6de43c80d43e6786f137d989a42e3423c1e89a9929d9b1bf875cdf33ce8`。
