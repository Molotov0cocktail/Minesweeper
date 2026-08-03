# 任务 T6：Electron 壳 + 工程配置 + 静态骨架

## 目标
搭建 Electron 工程骨架：package.json（ESM + vitest + electron-builder）、electron/main.cjs、index.html（含全部 DOM id 契约）、styles/main.css（经典 3D 风）、vitest 配置。安装依赖并保证 `npm test` 可运行。

## 输入文档
- `doc/proposal.md`（FR8）
- `doc/detailed-design.md` 第 6、7 节（DOM 契约 + package.json 要点）

## 待产出文件
- `package.json`
- `electron/main.cjs`
- `index.html`
- `styles/main.css`
- `vitest.config.js`（如有需要；test.environment 默认 node，jsdom 用文件头注释切换）
- `README.md`（先写骨架，内容在 Wave D 补全）—— 可选，也可留到 Wave D

## 实现步骤
1. `package.json`：按 detailed-design 第 7 节；脚本 `start/test/test:watch/dist`。
2. 安装依赖：`npm install`（若 Electron 二进制下载失败，使用
   `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install`）。
3. `electron/main.cjs`：BrowserWindow（900×640，min 480×360），loadFile('index.html')。
4. `index.html`：全部 DOM id 契约（mode-buttons、custom-rows/cols/mines、custom-apply、
   anti-guess-toggle、pause-btn、restart-btn、mine-count、timer、board-canvas、board-wrap、
   scale-handle、pause-overlay、warning-banner、nickname-modal、leaderboard-modal）；
   `<script type="module" src="./src/renderer/main.js">`。
5. `styles/main.css`：经典灰底 + 3D 浮雕格子、遮罩、弹窗、横幅样式。
6. 验证 `npm test`（此时测试可能因 core 未实现而失败——本任务只要求
   **vitest 能正常启动**、node_modules 就绪；core 模块由后续任务补齐）。
7. **不实现** 任何 src/core、src/renderer 逻辑（其他任务负责）；只保证壳与骨架就绪。

## 测试与检查
- `node -e "require('./electron/main.cjs')"` 语法检查通过
- `npx vitest --version` 正常
- index.html 中所有契约 id 存在（用 grep 自检）

## 完成标准
- 工程可 `npm install`（或已装好）、`npm test` 可启动 vitest
- 汇报：安装是否需镜像、vitest 启动结果、契约 id 齐全
