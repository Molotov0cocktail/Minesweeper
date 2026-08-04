# 任务 T13：打包绿色版 + 全量验证 + README + AGENTS.md 收尾

## 目标
- `package.json` build.win.target 改 `["dir","zip"]`（移除 NSIS），`npm run dist` 出 win-unpacked + zip。
- 全量验证：`npm test`（现有 111 + v2 新增）全绿 → 冒烟 → dist 打包。
- 手动验收清单逐项勾验（安装向导/卸载清单式删除/移动目录/控制面板卸载/旧残留/高级防猜测/美化）。
- README.md 更新（v2 功能与分发说明）；**AGENTS.md §4/§5/§6/§7 收尾刷新**（结构/接口速查/命令/测试约定）。

## 输入文档
- `doc/proposal.md`、`doc/high-level-design.md`、`doc/detailed-design.md`（v2 版本）
- 全部已实现模块

## 待产出文件
- `package.json`（build 配置）、`README.md`、`AGENTS.md`
- `dist/`（构建产物，gitignore）

## 实现步骤
1. package.json build.win.target 改 `["dir","zip"]`；保持 signAndEditExecutable=false。
2. `npm run dist`（需 ELECTRON_MIRROR / ELECTRON_BUILDER_BINARIES_MIRROR 镜像环境变量）。
3. 手动验收清单（在 dist/win-unpacked 下执行）：
   - [ ] 侧栏默认收起，汉堡展开/收起，展开时棋盘自动缩放不溢出
   - [ ] 等级/自定义/防猜测设置在侧栏操作生效，刷新后设置持久化
   - [ ] 排行榜按钮 → 主页面板 6 组 tab 切换正常
   - [ ] 安装向导：默认 D:\Minesweeper 可改、快捷方式勾选、确认后复制+注册表+快捷方式齐全
   - [ ] 移动安装目录后程序正常运行、可正常卸载（自动重定位）
   - [ ] 卸载：清单式删除；放入外来文件 → 跳过并提示；删除报告分类正确
   - [ ] 控制面板"卸载"入口（--uninstall）静默执行并写日志
   - [ ] 旧 NSIS 残留（%LOCALAPPDATA%\Programs\minesweeper）检测并可清理
   - [ ] 高级防猜测：侧栏切高级 → 首点无猜测；失败回退标准 + 横幅文案正确
   - [ ] 美化效果人工验收（不破坏经典风）
4. README 更新：v2 功能、绿色版分发说明、安装/卸载使用说明、设置说明。
5. AGENTS.md 收尾：项目结构（§4）、接口速查（§5：solve/game/新增 settings/installer、renderer ui API、IPC）、命令（§6）、测试约定（§7）同步现实。
6. 每步完成即 commit + push。

## 测试与检查
- `npm test` 全绿（全量）
- 冒烟通过（含新断言）
- `npm run dist` 成功出包
- 手动验收清单全部勾验通过

## 完成标准
- 全量测试 + 冒烟 + 打包 + 手动验收全部通过
- README 与 AGENTS.md 与现实代码一致（`grep -n "^export" src/core/*.js` 对照 §5）
- 全部 commit + push 完成
