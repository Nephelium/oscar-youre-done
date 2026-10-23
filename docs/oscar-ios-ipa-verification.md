# iOS 1.3.7 构建 2 · 真机 IPA 检查

2026-10-23。构建目标为 iPhoneOS，使用 Xcode 27.1 / iPhoneOS SDK 27.1、Apple M4。没有开发者会员、签名身份或连接的 iPhone。本次产物供用户自行签名侧载，未提交 TestFlight。

## 产物

| 项目 | 结果 |
| --- | --- |
| 文件 | `Oscar-iOS-1.3.7-build2-unsigned.ipa` |
| 版本 / 构建 | 1.3.7 / 2 |
| 平台 / 架构 | iPhoneOS / arm64 |
| 最低系统 | iOS 17.0 |
| 大小 | 114,833,226 字节，约 109.5 MiB |
| 签名 | 无签名，安装前需用自己的 Apple 账号重签 |
| SHA-256 | `cd925a08b3bb5391db3829166e597cdc063c06f74488af9fcbadc920329f2579` |

## 实际执行

- `npm test`：52 项测试通过，同时完成两个棋种的数据与核心校验。共享前端本轮未改。
- `python3 ios/scripts/test_device_packaging.py`：3 项测试通过，覆盖拒绝模拟器平台、签名参数校验、IPA 目录结构与防止覆盖。
- `swift test --package-path ios --scratch-path ios/build/swift-tests`：6 项核心测试通过。
- iPhoneOS Release archive 成功，归档及结构检查耗时 12.62 秒。该数值来自已有本地构建缓存，不代表首次构建耗时。
- iPhone 18 Pro / iOS 27.0 模拟器：4 项原生集成测试通过，覆盖 Stockfish 合法应手、取消并重启计算、WebKit 保存与外观、演示/分支自动分析及 AI 对战。
- 归档核查：Mach-O 平台是 iOS，架构为 arm64；dSYM UUID 与可执行文件相同；NNUE 与官方已核对的 SHA-256 相同。
- `PrivacyInfo.xcprivacy`、棋谱规则、共享界面、图标与许可文件均进入 App；没有测试图片、测试 bundle、录屏或证书私钥。
- IPA 为标准 `Payload/Oscar.app/` 结构，ZIP CRC 校验通过。图标 1024 × 1024，未带透明通道。

## 变更

增加真机归档、IPA 打包与核查脚本。补齐隐私清单、iPad 全部方向、非豁免加密声明及可配置构建编号。相册用途文案明确为当前支持的截图功能。没有更改共享业务、识别算法或 Stockfish 源码。

隐私声明依据：`UserDefaults` 仅保存应用偏好，`CA92.1`；原生与引擎读取应用资源/容器文件元数据，`C617.1`；Stockfish 计算计时，`35F9.1`。这些数据不用于跟踪，不上传。说明依据 [Apple Required Reason API 文档](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)。

## 尚未验证

没有执行 iPhone 真机签名安装、长时间运行、耗电与实际性能测试。没有执行 App Store Connect 在线验证或 TestFlight 审核。当前 iOS 录屏导入与跨应用实时采集尚未实现。

上一阶段的模拟器功能验收单独见 [模拟器记录](oscar-ios-simulator-verification.md)。安装方法见 [iPhone 侧载说明](oscar-ios-installation.md)。
