# 控制 Prompt doc/prompt.md

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
