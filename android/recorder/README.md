# 奥斯卡你完了 · 独立 Android App

版本 1.3.8（15），包名 `com.jingjing.chesssprout`。Android 8.0+，支持 ARM64 与 x86_64。与原开局研习室独立安装和存储，更新保留棋芽原有数据。

## 棋谱导出

打开手记，点击右上角“导出”，可选 PGN 棋谱或代数记谱（SAN），各自支持“导出文件”和“复制”。PGN 保存为 `.pgn`，包含对局信息和起始 FEN；SAN 保存为 `.txt`，如 `1. e4 e5 2. Nf3 Nc6 *`。从练习局面开始的棋谱如需在其他软件还原，应选择 PGN。

导出内容为已保存的实战主线全谱，不随回放游标或当前试走变化。单局完整备份按钮已移除，全局备份仍可从手记、设置或成长页导出，旧 JSON 备份仍可导入。iOS 共享界面及原生复制桥接同步更新，本轮只构建并发布 Android 安装包。

## 记录与复盘

1. 下棋前点“记录一局”，选棋盘底部颜色并授权本次屏幕采集。切到多邻国标准初始棋盘，等通知显示已就绪后开始走子。
2. 下完从通知栏、悬浮按钮或应用内结束记录，再分析整盘或当前局面。推荐变化可以直接点击推演，也可以自由走子、要求引擎应手并保存分支。
3. 局面曲线、分数、候选和表现统计采用棋盘底部一方视角，翻转时同步切换，默认 ±2 兵，可切换 ±5 / ±10 兵并点选回到对应步。边缘箭头表示超出范围或将杀。已分析走法在棋子右上角和棋谱中同步显示：书本为已收录理论走法、`★` 引擎首选、`!` 好棋、`✓` 稳健、`?!` 不够准确、`?` 失误、`??` 严重失误。
4. 识别疑点保留棋盘裁剪，允许从最后确认的一步补走校对，修订前主线保留在完整备份中。

首页 18 回合演示内置 Stockfish 19 深度 20 的整盘三候选分析。演示不写入手记，分析与推演保留到关闭应用。旧版已保存演示位于首页独立入口，原有变化保留。分析来源与生成方法见 `review/demo-analysis.md`。

## 练习与截图

已内置多邻国日夜棋子识别。选择“从当前练习局面开始”，确认题目局面和先走方后记录后续棋谱。易位和吃过路兵权利在高级 FEN 中填写。

“导入棋谱 → 导入棋盘截图”打开系统图片选择器。选图、框选或自动识别、确认局面后，保存到“小练习”手记。只保存确认后的棋盘裁剪，外部原图保持原样。

完整对局、小练习分栏显示，可在“管理”中改名、移动分类或确认删除。删除同时移除该手记的分析、变化和内部校对图片。

支持不能悔棋的对局录屏、PGN、FEN、JSON。练习题建议上传截图。完整备份包含手记、分析、变化、修订与 Elo 历史，导入上限 12 MB。

## Elo 成长手记

“成长 → 记一笔”手动输入多邻国当前 Elo，填写记录时间和可选备注。支持补记、修改和确认删除。曲线按本地时间绘制，首页显示最近值。Elo 与 Stockfish 复盘表现分独立保存。

## 开发与验证

```powershell
npm test
npm run test:ui
node tests/review-notebooks-smoke.js
node tests/review-growth-smoke.js
node tests/review-perspective-smoke.js
Set-Location android
.\gradlew.bat :recorder:testDebugUnitTest :recorder:lintDebug :recorder:assembleDebug
```

`review/` 为共享静态界面，直接打开 `review/index.html` 可导入、回放和手动推演。屏幕采集和 Stockfish 为原生能力。生成资产与 APK 均在 `android/recorder/build/`，不手工编辑。

真实 Android 画面回归：`:recorder:connectedDebugAndroidTest`，使用本地 `build/reports/` 中已有的多邻国样本。设备测试见 `tests/review-android-smoke.js`、`review-capture-smoke.js`、`review-image-smoke.js`、`review-video-smoke.js`。它们会操作当前测试模拟器，请先确认目标设备。

ARM64 使用官方 Stockfish 19。x86_64 使用 F-Droid DroidFish 1.90 中的 Stockfish 16.1 与对应 NNUE。来源、许可、哈希见 `vendor/chess-sprout-sources.json`，设置中提供许可证与对应源码入口。

应用使用网络权限检查 GitHub 正式版本。棋谱、截图、录屏与分析仍在设备上处理。自动检查默认开启，可在设置中关闭，也可手动检查。发现新版后前往 Release 页面下载安装包。不申请麦克风或全相册读取权限。每次屏幕采集需系统授权。当前为 debug 签名的 Android 测试版。已验证模拟器实际多邻国完整对局与升后练习，物理手机适配仍需实机检查。

1.2.0：走子动画开关、默认圆润棋子与灰白棋盘、三套棋子和四套棋盘、兵值 / 获胜概率切换、连续拖动游标及固定复盘评价区。WDL 来自引擎并以白方胜／和／负千分比保存，旧分析可以补算。新增检查 `node tests/review-interaction-smoke.js` 和 `node tests/review-interaction-android.js`。

## 1.3.7 审查与更新

修复补录撤回后的保存范围、低深度覆盖深度分析、暂停后的部分分析保存、备份副本的续录关联、异常可选字段导致手记不可见，以及正在录屏导入时的编辑冲突。复盘统计和推荐走法更易读，弹窗按钮适应窄屏。详细审查和测试见 `docs/oscar-audit-1.3.7.md`。

更新检查读取固定仓库 `Nephelium/oscar-youre-done` 的最新正式 Release，每天最多一次成功检查。失败不会阻止使用，设置中可重试。它只请求版本信息，不发送棋谱、截图或视频。下载和安装由用户选择。
