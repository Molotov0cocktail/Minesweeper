# 任务 T19：打包流水线（build-dist.cjs + setup-builder.yml + package.json v1.2.0）

## 目标
构建 v3 分发：`npm run dist` 产出 `dist/MinesweeperSetup-1.2.0-win.exe`（唯一产物，electron-builder portable），内嵌剥离版游戏文件；清理旧产物与残留副本。

## 输入文档
- `doc/detailed-design.md` §7（package.json 与打包小节）

## 待产出文件
- `scripts/build-dist.cjs`（新建）
- `scripts/setup-builder.yml`（新建）
- `package.json`（修改：version 1.0.0→1.2.0；scripts.dist = `node scripts/build-dist.cjs`；删除 build 字段；描述更新）
- `.gitignore`（追加 `.build/`）

## 实现步骤
1. `scripts/build-dist.cjs`：
   - 清理：rm -rf dist .build
   - staging 剥离版游戏 → `.build/game-app/`：index.html、styles/**、src/**（**排除 src/core/installer.js**）、electron/{main,preload,log}.cjs（**排除 setup.cjs/preload-setup.cjs/installer-runner.cjs/fs-utils.cjs**）、package.json（复制后校验 package.json.main === 'electron/main.cjs'、无 installer.js、无 setup.cjs/installer-runner.cjs，失败中止并输出中文原因）
   - `npx electron-builder --config scripts/setup-builder.yml --win portable`（需 ELECTRON_MIRROR/ELECTRON_BUILDER_BINARIES_MIRROR；非 0 中止）
   - 删除 `dist/builder-debug.yml`；输出产物摘要
2. `scripts/setup-builder.yml`：
   ```yaml
   appId: com.molotov.minesweeper
   productName: MinesweeperSetup
   directories: { output: dist }
   files:
     - electron/main.cjs
     - electron/setup.cjs
     - electron/preload-setup.cjs
     - electron/installer-runner.cjs
     - electron/fs-utils.cjs
     - electron/log.cjs
     - src/core/installer.js
     - setup/**
     - package.json
   extraResources:
     - from: .build/game-app
       to: game-app
   win:
     target: [portable]
     signAndEditExecutable: false
     artifactName: MinesweeperSetup-${version}-win.${ext}
   ```
3. 清理纪律：删除 `game/`（早期开发副本，无 install-manifest.json，安全删除）与 dist/ 旧产物。

## 测试与检查
- `npm run dist` 成功；`dist/` 内仅 `MinesweeperSetup-1.2.0-win.exe`
- 解压验证（可选）：手动运行 setup --install-dir 到临时目录，检查 resources/app/ 与 Minesweeper.exe 存在、无 resources/app.asar
- `npm test` 全绿（本 wave 无代码改动）

## 完成标准
- dist 唯一产物；staging 校验通过；game/ 与旧 dist 产物已清；git status --short 复查无冗余
