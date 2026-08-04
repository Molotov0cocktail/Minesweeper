# 任务 T16：core/installer.js 扩展（planInstall 映射 + relocateManifestDir InstallLocation）

## 目标
为 v3 安装语义扩展两处纯逻辑（向后兼容）：planInstall 支持 exe 重命名与内嵌游戏目录前缀映射；relocateManifestDir 支持注册表 InstallLocation 重定位。

## 输入文档
- `doc/detailed-design.md` §5c（v3 签名扩展：renames/relPrefix、registryInstallLocation 优先级链）

## 待产出文件
- `src/core/installer.js`（仅此文件）

## 实现步骤
1. `planInstall({ sourceDir, targetDir, files, excludes = [], renames = {}, relPrefix = null })`：
   - 映射优先级：renames 精确命中（如 `{ 'MinesweeperSetup.exe': 'Minesweeper.exe' }`）> relPrefix 前缀命中（如 `{ src: 'resources\\game-app', dst: 'resources\\app' }`，源 rel 以 src+\ 开头 → 换成 dst 前缀）> 原样
   - step.rel = **安装后** rel；src = join(sourceDir, 源 rel)；dst = join(targetDir, 安装 rel)
   - dirs 目录链按映射后的 dst 生成（'resources\\app' 链），自顶向下去重
   - excludes 先于映射判断（排除源 rel）
   - 缺省 renames/relPrefix → 与 v2 行为逐字节一致（既有 43 条测试不动）
2. `relocateManifestDir({ execPathDir, registryInstallLocation, registryUninstallString, existsSync })`：
   - 链：execPathDir 清单 → registryInstallLocation（去引号 trim 后原样目录）清单 → UninstallString exe dirname 清单 → null
   - registryInstallLocation 缺省 → v2 行为
3. 中文注释按模块风格（"// ---------- 内部辅助 ----------" 分区）。

## 测试与检查
- `tests/installer.test.js` 新增用例（**先行已由主 agent 编写**）：renames 重命名、relPrefix 前缀映射、优先级、step.rel 映射、dirs 链、excludes 仍生效、relocate 四级链/引号/无清单跳过/缺省兼容
- `npx vitest run tests/installer.test.js` 必须全绿；其余测试不动
- 不得修改 `tests/` 下测试文件；契约问题报告阻塞

## 完成标准
- 两处扩展实现且全绿；既有 installer 43 条不回归；无 console.log 调试残留
