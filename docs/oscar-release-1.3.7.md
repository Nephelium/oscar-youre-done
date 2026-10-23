# 奥斯卡你完了 1.3.7 · iPhone IPA 与复盘修复

## 下载

- **Android**：安装 `oscar-youre-done-1.3.7.apk`。Android 8.0+，ARM64 / x86_64，可覆盖升级并保留已有手记，沿用测试签名。此附件未更改。
- **iPhone / iPad**：下载 `Oscar-iOS-1.3.7-build2-unsigned.ipa`。iOS 17.0+、真机 arm64，使用 Windows / Mac 与自己的免费 Apple 账号签名安装。此 IPA 未签名，不能在手机中直接点开安装。

[iPhone 免费侧载安装说明](https://github.com/Nephelium/oscar-youre-done/blob/ios-v1.3.7-build2/docs/oscar-ios-installation.md)

## iOS 构建 2

- 将本 Release 的模拟器 ZIP 替换为真机 IPA。模拟器仍可从源码构建。
- 支持 PGN / FEN、本地手记、系统相册选图、截图识别与局面确认。
- 本地 Stockfish 19 复盘、推荐变化、逐步自动分析、分支、AI 对战和时钟。
- 保留棋子棋盘、收藏、Elo 与备份格式，以及日夜、横竖屏适配。
- 补齐隐私清单、iPad 方向配置和构建编号，增加独立真机归档、IPA 打包与包体核查脚本。

安装者无需付费开发者会员，可使用 Sideloadly 或 AltStore Classic。免费签名 7 天后需刷新。此包尚未经过 iPhone 真机安装与运行验证，iOS 录屏导入和跨应用实时采集尚未接入，未发布 TestFlight。

[iOS 构建 2 对应源码](https://github.com/Nephelium/oscar-youre-done/tree/ios-v1.3.7-build2) · [iOS 构建说明](https://github.com/Nephelium/oscar-youre-done/blob/ios-v1.3.7-build2/ios/README.md)

## Android 与共享复盘

- **自动检查更新**：启动后在后台读取本仓库正式 Release，发现新版后提醒下载。设置中可关闭或手动检查。不会上传棋谱或媒体，下载、安装由用户确认。
- **补录撤回**：保存时只保留当前游标之前的补走，已撤回的走法不会再次写入。
- **备份导入**：重复导入后，副本之间的续录和校对关联正确指向副本。
- **分析保存**：较浅结果不再覆盖同一引擎已有的深度分析，退出自动分析的间隙也会保留已完成结果。
- **记录保护**：录屏仍在识别时，避免修改、删除同一手记与后台保存冲突。
- **旧数据兼容**：跳过异常的可选条目，保留合法棋谱与正常收藏。
- **界面**：增大复盘统计文字与候选点击区域，调整窄屏按钮、长标题和夜间控制格按钮。

## 验证

Android 1.3.7 沿用已发布并验证的 APK，原有核心、界面、原生与安装验证见审查记录。iOS 构建 2 本轮通过：52 项共享核心测试、3 项打包测试、6 项 Swift 核心测试，以及 4 项模拟器原生集成测试（引擎、取消、WebKit 保存与外观、分支及 AI 对战）。iPhoneOS arm64 Release 归档和 IPA CRC 通过，隐私清单、资源哈希、调试符号及私有样本隔离已检查。没有执行 iPhone 真机签名安装与运行验证。

识别采样、解码与分类算法本轮没有更改，也没有重新测试完整私有视频的速度。iOS 的 19 张画面样本恢复出 37 个半回合，与参考棋谱完全一致；这不包含视频解码，也不代表 iPhone 实时采集性能。

[Android 审查与验证](https://github.com/Nephelium/oscar-youre-done/blob/v1.3.7/docs/oscar-audit-1.3.7.md) · [iOS 模拟器验收](https://github.com/Nephelium/oscar-youre-done/blob/v1.3.7/docs/oscar-ios-simulator-verification.md) · [Android 对应源码](https://github.com/Nephelium/oscar-youre-done/tree/v1.3.7)

附件提供 `SHA256SUMS.txt` 及所用 Stockfish 的对应源码材料。Android APK 的最终哈希以本次 Release 附件为准，早期本地候选的哈希保留在审查记录中。

Android APK SHA-256：`4b97235dabbbdd9b22ab870c0f6a7aa30830865e78ffddba42ad62b6832b98c5`。
iOS 构建 2 未签名 IPA SHA-256：`cd925a08b3bb5391db3829166e597cdc063c06f74488af9fcbadc920329f2579`。

本次 IPA 构建补充验证见 [iOS 真机包检查](https://github.com/Nephelium/oscar-youre-done/blob/ios-v1.3.7-build2/docs/oscar-ios-ipa-verification.md)。真机归档成功、签名安装成功、App Store 校验成功是三个独立状态，本次仅完成第一项及离线结构检查。
