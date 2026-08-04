# 任务 T14：v3 文档链 + 任务文件 + progress 更新（主 agent，W0）

## 目标
按 vibe-coding 工作流先行更新文档链，为"安装剥离重构（独立 MinesweeperSetup 便携 exe v1.2.0）"建立唯一需求/设计来源与任务清单。

## 待产出文件
- `doc/proposal.md`：FR9.1 去安装入口；FR10 整节重写为"独立安装器 MinesweeperSetup"（双击语义/安装动作/清单式卸载/零痕迹/移动自愈/旧版残留/剥离）；§2/§6 验收更新；§7 决策记录追加 v3 行
- `doc/high-level-design.md`：§1 双应用架构（共享 main.cjs IS_SETUP 分派）；模块职责表更新（setup.cjs/preload-setup.cjs/setup/ui.js 等）；§4.5 重写；§5/§6 更新
- `doc/detailed-design.md`：§5c planInstall（renames/relPrefix）与 relocateManifestDir（registryInstallLocation）签名扩展；§6 游戏 DOM 契约删除安装 id；新增 §6b setup UI（createSetupUI/startSetupApp/DOM 契约）；§7 重写（main.cjs 分派+自愈、setup.cjs CLI、preload 拆分、runner 打包态语义、package.json/打包）；§8 测试规格；§9 依赖图 v3
- `doc/tasks/t15~t20.md`：6 个任务文件（见各文件）
- `doc/tasks/progress.md`：依赖图 v3 + 任务清单追加 T14~T20 + 运行日志 W0 行

## 实现步骤
1. 按上述清单逐文件更新（先 proposal → HLD → DD → 任务文件 → progress）。
2. 任务文件遵循 t8-installer.md 模板：目标/输入文档/待产出文件/实现步骤/测试与检查/完成标准。

## 测试与检查
- 文档链一致性：proposal（FR）→ HLD（架构）→ DD（接口契约）编号互相引用可查
- `git status --short` 仅文档改动；不碰代码/测试

## 完成标准
- 6 个文档/文件全部更新；progress.md 记录 W0 完成
- 无代码改动（本任务纯文档）
