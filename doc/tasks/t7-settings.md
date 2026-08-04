# 任务 T7：core/settings.js 防猜测设置持久化

## 目标
实现防猜测等用户设置（开关/实现方式/最大重置轮数/区域重排次数）的 localStorage 持久化模块：读取全字段 sanitize（损坏/越界回退默认）、update 非法字段忽略、reset、storage 抛错内存降级。

## 输入文档
- `doc/proposal.md`（FR6.6/FR6.7）
- `doc/detailed-design.md` 第 5b 节（契约与边界清单）
- `tests/settings.test.js`（已由主 agent 先行编写）

## 待产出文件
- `src/core/settings.js`（仅此文件，不碰其他模块）

## 实现步骤
1. 严格按 detailed-design 第 5b 节实现常量（SETTINGS_KEY/DEFAULT_SETTINGS/LIMITS）与 `createSettings(storage)`。
2. sanitize 规则逐字段实现（boolean 校验、method ∈ {'standard','advanced'}、整数 [1,200]）。
3. `get()` 返回浅拷贝；`update(patch)` 逐字段校验（非法忽略保留现值），写入成功才持久化；`reset()` 恢复默认并持久化。
4. 读/写抛错一律捕获降级（不向上抛）。
5. 纯 ESM，零 DOM，零副作用。

## 测试与检查
- `npx vitest run tests/settings.test.js` 必须全绿
- 不得修改 `tests/` 下测试文件；契约问题报告阻塞而非改测试

## 完成标准
- 源文件存在且仅含设计契约中的导出
- vitest 命令全绿，汇报通过用例数
- 无 console.log / 调试残留
