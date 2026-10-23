# iPhone 安装：免费签名侧载

下载文件为 `Oscar-iOS-1.3.7-build2-unsigned.ipa`，要求 **iOS 17.0 或更新版本**。它包含真机 arm64 程序，安装前需要用自己的 Apple 账号签名。直接在 iPhone 的“文件”中点开 IPA 不会安装。

发布方和测试者均无需购买开发者会员。安装者需要一台 Windows 或 Mac 电脑、自己的 iPhone 和 Apple 账号。此包尚未经过 iPhone 真机安装与运行验证，欢迎测试者反馈机型、系统版本及错误提示。

## 使用 Sideloadly

1. 从 [GitHub v1.3.7 Release](https://github.com/Nephelium/oscar-youre-done/releases/tag/v1.3.7) 下载上述 IPA，保留文件原名。
2. 从 [Sideloadly 官网](https://sideloadly.io/) 下载适合 Windows / macOS 的版本，按官方说明安装。Windows 的 Apple 驱动、iTunes / iCloud 组件要求以官网当前说明为准。
3. 用数据线连接 iPhone，解锁并选择信任这台电脑。在 Sideloadly 中选中自己的设备，导入 IPA。
4. 在本机工具中使用自己的 Apple 账号完成签名和安装。不要把密码、验证码或证书发送给项目作者。
5. 如果系统提示，前往“设置 → 通用 → VPN 与设备管理”信任本人的开发者签名，再在“设置 → 隐私与安全性”开启开发者模式，并按提示重启确认。
6. 打开奥斯卡你完了。先尝试演示棋谱、本地分析、AI 对战，再尝试导入自己的棋盘截图。

**免费签名有效期为 7 天。** 需要定期刷新签名，工具可以在电脑与手机连接条件满足时自动刷新。不要通过删除 App 来刷新，删除可能连同本地手记一起移除。升级或更换签名账号前先导出完整备份。

## 使用 AltStore Classic

也可以使用 [AltStore Classic](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows)。先在电脑安装 AltServer、在 iPhone 安装 AltStore，再从 My Apps 导入本项目 IPA。

免费账号通常最多同时启用 3 个侧载 App，AltStore 本身占用一个。应用 7 天后到期，需要与 AltServer 配合刷新。详见 [AltStore 刷新与数量限制](https://faq.altstore.io/altstore-classic/your-altstore)。

## 本版能做什么

- PGN / FEN 与截图导入，本地棋谱手记、收藏及备份。
- 本地 Stockfish 19 分析、推荐走法、分支与自动分析。
- AI 对战、时钟、Elo 记录，以及日夜、横屏与棋盘主题。

**iOS 录屏导入及跨应用实时采集尚未接入。** 本包没有 TestFlight 邀请链接，也没有苹果分发签名。模拟器已通过功能测试，真机包已通过编译和结构核验；这两项不等于真机测试。

## 从源码构建与后续 TestFlight

构建说明见 [iOS README](../ios/README.md)。后续若开通 Apple Developer Program，可使用同一工程重新生成签名归档，上传 App Store Connect，再配置 TestFlight。测试者届时可通过 TestFlight 邀请链接安装。

## 官方参考

- [Apple 免费账号与签名有效期](https://developer.apple.com/help/account/basics/about-your-developer-account)
- [Apple 开发者模式](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)
- [Sideloadly 官方下载与说明](https://sideloadly.io/)
- [AltStore Classic 官方说明](https://faq.altstore.io/altstore-classic/your-altstore)
