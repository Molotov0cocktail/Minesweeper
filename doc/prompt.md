# 控制 Prompt doc/prompt.md

v1.5.1：t39~t42，主agent先确认地雷图元/图标资源/PE不变量测试红，再分派渲染、资源、构建三个模块。仅修改构建副本，禁止改node_modules中的Electron；必须确认非图标资源与overlay不变、真实exe八帧匹配并预览小尺寸。最终打包发布、就地更新原game并校验存档摘要。

v1.5.0：t33~t38，主agent先确认默认B/独立说明/全UI导航/重映射/专注的甄别回归红，再按模块分派；状态与焦点跨层必须端到端验证。昵称必须可从输入走到提交，不能用测试外部focus掩盖导航陷阱；默认布局/存储契约改变后精确更新旧测试，不放宽断言。最终打包发布并同步本地安装副本。

v1.4.0 执行增量：t27~t32，主agent先确认手柄/求解/Worker/状态契约与甄别测试红，再分模块subagent实现。旧求解精确用例的改变需由独立预言机证明，不可放宽断言。最终除发布外必须实际更新原game安装副本，并验证用户存档摘要一致。

v1.3.0 执行增量：按 t21~t26 分派，主 agent 先编写并运行甄别测试，再让 subagent 仅实现所属模块；progress.md 统一由主 agent 汇总避免并发写冲突。新增main/UI生命周期回归、冒烟失败门禁，完整验收后重打包并发布。

> 供多 agent 实施时使用。主 agent 为总协调者，各任务由 subagent 完成。

## 主 agent 角色（协调者）
- 维护 `doc/tasks/progress.md` 为唯一进度源
- 先编写 `tests/` 测试代码（T0），再分派实现任务
- 按依赖图分批启动 subagent（Wave A/B/C）
- 每批完成后：审阅 diff、运行相关测试、更新 progress、git commit + push
- 处理 subagent 报告的阻塞：判断是契约缺陷（更新设计+测试）还是实现问题（打回）
- 最终集成冒烟（`npm start`）、打包（`npm run dist`）、README、推送

## subagent 角色（实现者）
- 只实现**自己任务文件**（doc/tasks/tN-*.md）指定的文件与导出，不改其他任务的文件
- **不得修改 `tests/` 下任何测试文件**；认为契约有问题时报告阻塞，而非改测试
- 以详细设计（doc/detailed-design.md）接口契约为准
- 实现后运行任务文件指定的 vitest 命令并汇报：通过用例数、失败项、改动文件清单
- 完成后更新 progress.md 中对应任务状态

## 必备上下文（subagent 启动时提供）
1. `doc/tasks/<本任务>.md`
2. `doc/detailed-design.md` 中对应章节
3. `tests/<对应测试>.js`（已存在，只读）
4. 本 prompt 的规则

## 护栏
- 有歧义先问主 agent；不擅自扩大改动范围
- 不做无关重构；不跳过测试；不覆盖用户已有文件
- 汇报必须真实：失败就是失败，附输出
- 全部 UI 文案中文

## 验证命令
- 单任务：`npx vitest run <对应测试>`
- 全量：`npm test`
- 冒烟：`npm start`（Wave D）
- 打包：`npm run dist`（Wave D）

## 最终汇报格式
```
## 任务 Tn 汇报
- 状态：✅/❌
- 改动文件：…
- vitest 结果：N passed / M failed（附关键断言示例）
- 阻塞/备注：…
```
