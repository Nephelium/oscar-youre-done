# 演示棋谱与预置分析

演示采用测试模拟器中实际完成的 18 回合对局，以 `18. Qxh7#` 结束。只保留走法，不包含账号资料。新的演示会话、分支与重分析只存在内存中。

`demo-analysis.js` 由 `tests/prepare-demo-analysis.cjs` 生成。包含 36 个局面的 Stockfish 19 分析。非终局使用深度 20、MultiPV 3、4 线程、256 MiB Hash。分数统一转换为白方视角，终局按规则确定胜负。完整主线和每条候选变化均经过合法走法核验。

1.2.0 重新生成时启用了 `UCI_ShowWDL`。每条候选变化的 `wdl` 为白方胜／和／负千分比，三项之和为 1000。曲线的胜率表示所选一方获胜的概率，和棋单独列出，翻转后交换胜负概率。模型来自 Stockfish 自对弈统计，不根据用户 Elo 预测个人实战结果。旧分析没有 WDL 时，重新分析即可补齐。依据：[Stockfish 官方 WDL 模型说明](https://github.com/official-stockfish/WDL_model)。

来源：[Stockfish 19 官方发行](https://github.com/official-stockfish/Stockfish/releases/tag/sf_19)。生成工具使用 Windows x86-64 官方包，SHA-256：

`3c8bf1f9ea66a09350a40df4f632288285ac206d99f33ab5842c408fc30b48a7`

在 UI 中，预置分析带有明确标识。用户选择重新分析时，按照本机引擎和用时设置重新搜索，结果只在本次演示中保留。

书本角标限于从标准起点严格匹配的意大利开局经典走序前缀：

`1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3`

数据来源：[Lichess chess-openings，C53 Italian Game: Classical Variation](https://github.com/lichess-org/chess-openings/blob/a6189a30dc273ccb21fc2536a9a2fefd5592a67a/c.tsv)，提交 `a6189a30dc273ccb21fc2536a9a2fefd5592a67a`，CC0。只匹配这一小段已收录理论，未覆盖其他开局。评级损失达到不准确阈值时仍优先显示问题标记。

★ 表示引擎首选，! 表示评价损失小于 30 厘兵的其他好棋，✓ 表示 30–89 厘兵，?! / ? / ?? 分别从 90 / 180 / 350 厘兵起。相邻局面引擎版本不同时不计算着法评级。书本、星形与标点同时用于棋盘落点右上角和棋谱。
