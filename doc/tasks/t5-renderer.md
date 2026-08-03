# 任务 T5：renderer 渲染与交互（render.js / ui.js / main.js）

## 目标
实现经典 3D 扫雷风渲染、全部 DOM 控件、暂停遮罩、横幅、昵称与排行榜弹窗、缩放手柄与窗口自适应装配。

## 输入文档
- `doc/proposal.md`（FR2、FR3、FR4、FR5、FR7、FR8）
- `doc/detailed-design.md` 第 6、7 节（DOM 契约 + 装配规则）
- `tests/ui.test.js`、`tests/render.test.js`（已由主 agent 先行编写）

## 待产出文件
- `src/renderer/render.js`（纯绘制函数，无事件）
- `src/renderer/ui.js`（DOM 层，可 jsdom 测试）
- `src/renderer/main.js`（装配：事件→game→重绘；拖拽缩放；resize）

## 实现步骤
1. `render.js`：
   - `drawBoard(ctx, game, cellSize, opts)`、`drawCell(ctx, x, y, size, cell, gameState)`
   - 经典 3D 浮雕：未开凸起（明/暗边）、翻开凹下、旗、问号、雷、经典数字配色（见 detailed-design）
   - 用 Canvas 2D API（fillRect/strokeRect/fillText 等）
2. `ui.js`：
   - `createUI(host, deps)` 按 DOM 契约绑定所有控件 id
   - 模式按钮/自定义应用（调用 validateCustom，失败显示错误）、防猜测 checkbox、暂停/重开、计时与剩余雷数刷新、横幅、暂停遮罩、昵称弹窗、排行榜弹窗（6 组标签页）
   - 昵称提交流程：`deps.actions.submitNickname(nickname)`（isTopTen 判断由调用方/UI 协作）
3. `main.js`：
   - 鼠标事件：左键=reveal（未开）/ chordLeft（已开），右键=cycleMark（未开）/ chordRight（已开）
   - 缩放手柄拖动：cellSize ∈ [16,48] 连续变化重绘
   - window resize：`cellSize = clamp(floor(min(w/cols, h/rows)), 16, 48)`
   - 监听 game win/lose/warning 事件 → 弹窗/横幅/重绘
   - 胜利标准模式：先 `isTopTen`，是则弹昵称；随后弹排行榜（显示排名或"未入前十"）

## 测试与检查
- `npx vitest run tests/ui.test.js tests/render.test.js` 必须全绿（jsdom + 假 ctx）
- 手动冒烟在 Wave D 统一执行
- 不得修改 `tests/` 测试文件

## 完成标准
- 三个文件存在；ui/render 测试全绿
- 汇报：DOM 控件事件、横幅/弹窗、绘制断言通过情况
- 无调试残留
