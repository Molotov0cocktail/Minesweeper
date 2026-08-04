# 任务 T8：core/installer.js 安装/卸载纯逻辑模块

## 目标
实现安装/卸载决策纯逻辑（零 fs 副作用）：清单构建/解析（防路径穿越）、卸载比对计划（清单式删除+保留外来文件）、错误分类（中文全表）、安装目录建议/校验、清单重定位、旧版残留检测、自删脚本生成、注入式执行器、日志行格式化。

## 输入文档
- `doc/proposal.md`（FR10）
- `doc/detailed-design.md` 第 5c 节（接口契约、错误分类表、边界清单）
- `tests/installer.test.js`（已由主 agent 先行编写）

## 待产出文件
- `src/core/installer.js`（仅此文件；可依赖 `node:path` 做字符串处理，禁止真实 fs/child_process 副作用）

## 实现步骤
1. 严格按 detailed-design 第 5c 节实现全部导出（toManifestPath/buildManifest/parseManifest/classifyFsError/classifyOpError/planInstall/planUninstall/relocateManifestDir/suggestInstallDir/validateInstallDir/detectLegacy/buildUninstallCleanupScript/executeSteps/formatLogLine）。
2. `toManifestPath` 拒绝：空、绝对路径（盘符/UNC/`\` 开头）、`..` 段、`:`。
3. `parseManifest`：损坏 JSON/version≠1/路径逃逸 baseDir → `{ok:false, error:中文}`。
4. `planUninstall` 删除顺序：文件全部在前、目录自底向上；清单外文件/含清单外内容的目录 → skippedExtraneous；清单内缺失 → skippedMissing（非错误）。
5. `executeSteps` 异步（注入 fsOps），单步失败归类记录继续；删除 NOT_FOUND 计入 done 不进 errors。
6. 中文文案逐条对齐错误分类表（测试精确断言）。

## 测试与检查
- `npx vitest run tests/installer.test.js` 必须全绿
- 不得修改 `tests/` 下测试文件；契约问题报告阻塞而非改测试

## 完成标准
- 源文件存在且仅含设计契约中的导出
- vitest 命令全绿，汇报通过用例数
- 无 console.log / 调试残留
