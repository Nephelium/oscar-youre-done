# 奥斯卡你完了 · 独立 Android App

版本 1.1.0（3），包名 `com.jingjing.chesssprout`。Android 8.0+，支持 ARM64 与 x86_64。与原开局研习室独立安装和存储，更新保留棋芽原有数据。

## 记录与复盘

1. 下棋前点“记录一局”，选棋盘底部颜色并授权本次屏幕采集。切到多邻国标准初始棋盘，等通知显示已就绪后开始走子。
2. 下完从通知栏、悬浮按钮或应用内结束记录，再分析整盘或当前局面。推荐变化可以直接点击推演，也可以自由走子、要求引擎应手并保存分支。
3. 局面曲线采用白方视角，默认 ±2 兵，可切换 ±5 / ±10 兵并点选回到对应步。边缘箭头表示超出范围或将杀。已分析走法在棋子右上角和棋谱中同步显示：`!` 最佳、`✓` 好棋 / 稳健、`?!` 不够准确、`?` 失误、`??` 严重失误。
4. 识别疑点保留棋盘裁剪，允许从最后确认的一步补走校对，修订前主线保留在完整备份中。

## 练习与截图

先用标准初始棋盘准备一次当前主题的棋子样式。以后选择“从当前练习局面开始”，确认题目局面和先走方后记录后续棋谱。易位和吃过路兵权利在高级 FEN 中填写。

“导入棋谱 → 导入棋盘截图”打开系统图片选择器。选图、框选或自动识别、确认局面后，保存到“小练习”手记。只保存确认后的棋盘裁剪，外部原图保持原样。

完整对局、小练习分栏显示，可在“管理”中改名、移动分类或确认删除。删除同时移除该手记的分析、变化和内部校对图片。

支持从标准初始局面开始的录屏、PGN、FEN、JSON。完整备份包含手记、分析、变化、修订与 Elo 历史，导入上限 12 MB。

## Elo 成长手记

“成长 → 记一笔”手动输入多邻国当前 Elo，填写记录时间和可选备注。支持补记、修改和确认删除。曲线按本地时间绘制，首页显示最近值。Elo 与 Stockfish 复盘表现分独立保存。

## 开发与验证

```powershell
npm test
npm run test:review
npm run test:mobile
node tests/review-notebooks-smoke.js
node tests/review-growth-smoke.js
Set-Location android
.\gradlew.bat :recorder:testDebugUnitTest :recorder:lintDebug :recorder:assembleDebug
```

`review/` 为共享静态界面，直接打开 `review/index.html` 可导入、回放和手动推演。屏幕采集和 Stockfish 为原生能力。生成资产与 APK 均在 `android/recorder/build/`，不手工编辑。

真实 Android 画面回归：`:recorder:connectedDebugAndroidTest`，使用本地 `build/reports/` 中已有的多邻国样本。设备测试见 `tests/review-android-smoke.js`、`review-capture-smoke.js`、`review-image-smoke.js`、`review-video-smoke.js`。它们会操作当前测试模拟器，请先确认目标设备。

ARM64 使用官方 Stockfish 19。x86_64 使用 F-Droid DroidFish 1.90 中的 Stockfish 16.1 与对应 NNUE。来源、许可、哈希见 `vendor/chess-sprout-sources.json`，设置中提供许可证与对应源码入口。

应用不申请网络、麦克风或全相册读取权限。每次屏幕采集需系统授权。当前为 debug 签名的 Android 测试版。已验证模拟器实际多邻国完整对局与升后练习，物理手机适配仍需实机检查。
