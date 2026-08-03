# 任务进度 progress.md

> 全流程唯一进度源。主 agent 负责维护；subagent 完成一个任务后更新。
> 状态：⬜ 未开始 / 🟨 进行中 / ✅ 完成 / ❌ 阻塞

## 依赖图
```
T6 ───────────┐
T1 ──▶ T2 ──▶ T3 ──▶ T5
T4 ─────────────────▶ T5
```
Wave A: T1, T4, T6（并行）；Wave B: T2, T3；Wave C: T5；Wave D: 集成/打包/文档

## 任务清单

| 任务 | 内容 | 依赖 | 状态 | 测试命令 | 备注 |
|---|---|---|---|---|---|
| T1 | core/board.js 棋盘模型 | 无 | ⬜ | `npx vitest run tests/board.test.js tests/modes.test.js` | Wave A |
| T4 | core/leaderboard.js 排行榜 | 无 | ⬜ | `npx vitest run tests/leaderboard.test.js` | Wave A |
| T6 | electron 壳 + package.json + index.html + css | 无 | ⬜ | `node -e "require('./electron/main.cjs')"` 语法检查 / npm install | Wave A |
| T2 | core/solve.js 可解性+防猜测 | T1 | ⬜ | `npx vitest run tests/solve.test.js` | Wave B |
| T3 | core/game.js 状态机+计时 | T1+T2 | ⬜ | `npx vitest run tests/game.test.js` | Wave B |
| T5 | renderer（render/ui/main） | T1-T3+T6 | ⬜ | `npx vitest run tests/ui.test.js tests/render.test.js` | Wave C |
| T0 | tests/ 全套测试（主 agent 先写） | 无 | 🟨 | `npm test` | 先行 |

## 运行日志
- 2026-08-03 需求确认完成（4 轮提问，12 项决策）。
- 2026-08-03 proposal / high-level-design / detailed-design 已提交。
- 2026-08-03 git 初始化并 push 到 gitee 成功。
