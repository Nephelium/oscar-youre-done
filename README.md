<div align="center">
  <img src="review/assets/oscar-panic.png" width="112" alt="奥斯卡抱头惊恐，黑王倒下" />
  <h1>奥斯卡你完了</h1>
  <p>给多邻国国际象棋，补上一个复盘搭子。</p>
  <p>
    <img alt="Android 8.0+" src="https://img.shields.io/badge/Android-8.0%2B-507c3e?style=flat-square" />
    <img alt="Local Stockfish" src="https://img.shields.io/badge/Stockfish-on_device-66899b?style=flat-square" />
    <img alt="GPL v3" src="https://img.shields.io/badge/License-GPL_v3-b29435?style=flat-square" />
  </p>
  <p><a href="https://github.com/Nephelium/oscar-youre-done/releases/tag/v1.1.1"><b>下载 Android 安装包</b></a> · <a href="#开始使用">开始使用</a> · <a href="#从源码构建">从源码构建</a></p>
</div>

---

下完一局，还想知道刚才那步为什么不行？

把双方的走法留下来，交给本地 Stockfish。看局面变化、找更好的选择，再回到棋盘试自己的想法。

<p align="center">
  <img src="docs/images/home.png" width="31%" alt="开始记录与最近手记" />
  <img src="docs/images/review.png" width="31%" alt="真实记录对局的 Stockfish 复盘" />
  <img src="docs/images/growth.png" width="31%" alt="Elo 手动记录与成长曲线" />
</p>

<p align="center"><sub>复盘图来自模拟器真实对局。成长页分数为演示数据。</sub></p>

## 能做什么

| 功能 | 用法 |
| --- | --- |
| 自动记谱 | 下棋前手动开启系统屏幕采集，记录双方走法，结束后保存棋谱 |
| 练习题手记 | 从题目当前局面开始，确认先走方后只记录后续走法 |
| 截图与录屏 | 选择棋盘截图识别局面，或导入从初始局面开始的录屏 |
| 本地 Stockfish | 整盘 / 单局面分析、三条推荐变化、着法评价、将杀距离 |
| 看得见的评价 | 棋子右上角与棋谱同步显示书本、★、!、✓、?!、?、??，曲线可切换范围与视角 |
| 自由推演 | 点选或拖动走子、引擎应手、保存独立变化，随时回到实战 |
| 开箱演示 | 18 回合完整对局，内置 Stockfish 19 深度 20、三候选分析，逐步回看即见角标 |
| 两本手记 | 完整对局与小练习分开管理，支持改名、移动分类与删除 |
| Elo 成长曲线 | 手动填写当前分数，支持补记日期、备注、修改和删除 |
| 导入与备份 | PGN / FEN / JSON，完整备份包含分析、变化与 Elo 历史 |

识别、记谱和分析均在手机里完成。App 不申请网络、麦克风或全相册读取权限。

## 开始使用

1. 从 [v1.1.1 Release](https://github.com/Nephelium/oscar-youre-done/releases/tag/v1.1.1) 下载 APK 并安装。最低 Android 8.0，支持 ARM64 与 x86_64。
2. 点 **记录一局**，选棋盘底部颜色，授权本次屏幕采集，再切到多邻国初始棋盘。
3. 等通知显示棋盘已就绪，再开始走子。下完从通知栏、悬浮按钮或 App 内结束记录。
4. 打开手记，点 **分析整盘**。点推荐变化或直接在棋盘走子，开始自己的推演。

### 记一道练习题

先用标准初始棋盘准备一次当前主题的棋子样式。以后可选 **从当前练习局面开始**，也可在 **导入棋谱 → 导入棋盘截图** 中选图。确认棋子位置和先走方后，保存到小练习手记。

截图看不出易位与吃过路兵权利，需要时在高级 FEN 中填写。识别疑点会保留对应棋盘画面，供补走校对。删除手记仅移除该手记与内部裁剪，外部原图保留。

### 看懂分数

- 局面分数跟随棋盘底部颜色，`+1.0` 表示该方评价领先约一兵。翻转后，分数、候选分数、曲线、评价条和表现统计一起切换。`M` 表示将杀距离。纵轴可切换 ±2 / ±5 / ±10 兵，坐标文字保持正常比例。
- 走法符号来自相邻局面的引擎评价。书本表示已收录的理论走法，★ 表示引擎首选，! 表示好棋，✓ 表示稳健，?! / ? / ?? 表示递增的评价损失。[预置分析、开局来源与评级细则](review/demo-analysis.md)。
- 复盘表现分按当前视角一方的平均评价损失计算。Elo 由用户手动记录，保存在独立历史中。
- 首页演示的分析和推演只在本次运行保留，不计入手记。旧版保存过的演示可从首页“旧版演示与变化”找回，也可主动保留为正式手记。

## 验证记录

v1.1.1 聚焦坐标文字、双向评价、终局提示与演示体验。新增六种宽度下的等比例文字检查、视角转换与数据不变检查、黑方先走的回合编号，以及预置分析与模拟器演示存储隔离回归。

v1.1.0 已在 Android 16 x86_64 模拟器、实际安装的多邻国 6.102.3 中完成：

- 一盘新的完整实时对局，35 步，以 `Qh7#` 结束，棋谱与胜负正确，零待校对项。
- 对这盘棋的全部 36 个局面调用 Stockfish，验证独立分支、重开保留与 PGN 导出。
- 从残缺局面开始记录升后练习，9 步包含 `d7d8q`，升变选择框恢复后疑点自动消除。
- 系统截图选择器、识别、局面确认、本地分析、推演、删除和外部原图保留。
- 4 项 Android 实际画面流水线回归，以及规则、手记、Elo、手机布局与交互测试。

当前为 debug 签名的 Android 测试版。物理手机上的系统采集和不同棋盘主题仍需实机验证，反馈请附 Android 版本与可复现步骤。

## 从源码构建

需要 Android SDK（API 36）、兼容 Gradle 9.2.1 / Android Gradle Plugin 9.0 的 JDK。先在 Android Studio 打开 `android/` 完成 SDK 定位，或在当前终端设置 `ANDROID_HOME` 为本机 SDK 路径。Gradle Wrapper 已包含在仓库中。

```powershell
Set-Location android
.\gradlew.bat :recorder:testDebugUnitTest :recorder:lintDebug :recorder:assembleDebug
```

APK：`android/recorder/build/outputs/apk/debug/recorder-debug.apk`。

界面为原生 HTML / CSS / JavaScript，共享源码在 `review/`。可以直接打开 `review/index.html` 查看、导入和推演，跨应用采集与引擎由 Android 提供。

```powershell
npm install
npm test
npm run test:ui
```

UI 测试使用 Playwright，Windows 默认运行已安装的 Edge。设备测试脚本会操作连接的测试模拟器。

Android 真实画面回归所需样本单独附在 Release 的 `duolingo-vision-fixtures.zip` 中，解压到 `android/recorder/build/reports/`，再执行：

```powershell
.\gradlew.bat :recorder:connectedDebugAndroidTest
```

### 目录

```text
review/                  共享界面、棋谱业务、Elo 与正式图标
android/recorder/        屏幕采集、图片 / 视频识别、存储、引擎与测试
vendor/                 规则库、棋子、引擎、NNUE、许可和来源哈希
tests/                  规则、界面与 Android 链路测试
docs/                   截图、验证说明与发布记录
```

## 开源与致谢

本项目软件源码采用 [GPL-3.0](LICENSE)。第三方组件沿用其各自许可，见 [NOTICE](NOTICE) 与 `vendor/`。

- [Stockfish](https://github.com/official-stockfish/Stockfish)：ARM64 使用官方 Stockfish 19，x86_64 使用 F-Droid DroidFish 1.90 中的 Stockfish 16.1。Release 附对应源码材料，App 设置中也提供许可与源码入口。
- [chess.js](https://github.com/jhlywa/chess.js)：BSD-2-Clause。
- [chesslib](https://github.com/bhlangonijr/chesslib)：Apache-2.0。

这是独立项目，与 Duolingo 无隶属关系。Duolingo 与奥斯卡角色的权利归原权利人；图标根据角色参考图生成，角色图像不纳入本项目软件 GPL 授权。公开测试截图仅作为兼容性验证材料。
