// scripts/build-dist.cjs —— v3 分发打包流水线（npm run dist 入口）。
// 流程：
//   1) 从 assets/icon.svg 重建 PNG/ICO（失败立即停止）
//   2) 清理 dist/ 与 .build/（旧产物与 staging，遵守清理纪律）
//   3) staging 剥离版游戏 → .build/game-app/（白名单复制：排除 src/core/installer.js 与
//      setup 侧 electron 文件；复制后校验 package.json.main 与无 installer 面，失败中止）
//   4) electron-builder --config scripts/setup-builder.yml --win portable
//      （产物 dist/MinesweeperSetup-<version>-win.exe；需
//      ELECTRON_MIRROR / ELECTRON_BUILDER_BINARIES_MIRROR 镜像环境变量，失败非 0 中止）
//   5) 清理 dist/builder-debug.yml 等辅助产物，输出摘要
// 用法：npm run dist（无参数）；失败退出码非 0。

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(ROOT, '.build', 'game-app');

// ---------- 游戏剥离版白名单（staging 源 → 安装包内资源） ----------
// 与 doc/detailed-design.md §7「package.json 与打包」一致：
// 游戏只含 index.html、assets/**、styles/**、src/**（排除 src/core/installer.js）、
// electron/{main,preload,log}.cjs、package.json。
const GAME_TOP = new Set(['index.html', 'assets', 'styles', 'src', 'electron', 'package.json']);
const SRC_EXCLUDES = new Set(['src\\core\\installer.js']);
const ELECTRON_KEEP = new Set(['main.cjs', 'preload.cjs', 'log.cjs']);

/** 递归复制目录/文件到 staging（遵循白名单与排除规则） */
function stageFile(abs, rel) {
  const dst = path.join(STAGE, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(abs, dst);
}

function stage() {
  for (const top of GAME_TOP) {
    const absTop = path.join(ROOT, top);
    let st;
    try {
      st = fs.statSync(absTop);
    } catch {
      throw new Error(`staging 失败：白名单条目不存在 ${top}`);
    }
    if (st.isFile()) {
      stageFile(absTop, top);
      continue;
    }
    // 目录条目：walk 起点 relDir = top（保留顶层前缀，如 electron\main.cjs）
    const walk = (cur, relDir) => {
      for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
        const full = path.join(cur, e.name);
        const rel = relDir ? `${relDir}\\${e.name}` : e.name;
        if (e.isDirectory()) {
          walk(full, rel);
        } else if (e.isFile()) {
          if (SRC_EXCLUDES.has(rel)) continue; // 安装/卸载纯逻辑不进游戏包
          if (top === 'electron' && !ELECTRON_KEEP.has(e.name)) continue; // setup 侧文件不进游戏包
          stageFile(full, rel);
        }
      }
    };
    walk(absTop, top);
  }
}

/** staging 校验：package.json.main 指向存在文件；无 installer 面文件 */
function validateStage() {
  const pkg = JSON.parse(fs.readFileSync(path.join(STAGE, 'package.json'), 'utf8'));
  if (pkg.main !== 'electron/main.cjs') {
    throw new Error(`staging 校验失败：package.json.main=${pkg.main}（应为 electron/main.cjs）`);
  }
  const mainPath = path.join(STAGE, ...pkg.main.split('/'));
  if (!fs.existsSync(mainPath)) {
    throw new Error(`staging 校验失败：main 指向文件不存在 ${pkg.main}`);
  }
  const forbidden = [
    'src\\core\\installer.js',
    'electron\\setup.cjs',
    'electron\\preload-setup.cjs',
    'electron\\installer-runner.cjs',
    'electron\\fs-utils.cjs',
  ];
  for (const rel of forbidden) {
    if (fs.existsSync(path.join(STAGE, rel))) {
      throw new Error(`staging 校验失败：游戏包不应包含 ${rel}`);
    }
  }
  for (const icon of ['minesweeper.png', 'minesweeper.ico']) {
    const target = path.join(STAGE, 'assets', icon);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile() || fs.statSync(target).size === 0) {
      throw new Error(`staging 校验失败：应用图标缺失或为空 ${icon}`);
    }
  }
  console.log(`  staging 校验通过：package.json v${pkg.version}，main=${pkg.main}`);
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

(async () => {
  console.log('== MinesweeperSetup 分发打包 ==');
  console.log('[1/5] 从矢量源重建应用图标');
  const iconResult = spawnSync(process.execPath, [path.join(__dirname, 'generate-icons.cjs')], {
    cwd: ROOT, stdio: 'inherit', windowsHide: true,
  });
  if (iconResult.error || iconResult.status !== 0) throw new Error('图标生成失败，已停止打包');

  console.log('[2/5] 清理 dist/ 与 .build/');
  rmrf(DIST);
  rmrf(path.join(ROOT, '.build'));
  fs.mkdirSync(path.join(ROOT, '.build'), { recursive: true });

  console.log('[3/5] staging 剥离版游戏 → .build/game-app/');
  stage();
  validateStage();

  console.log('[4/5] electron-builder --win portable（setup-builder.yml）');
  // win32：npx.cmd 是批处理，Node spawn 不经 shell 直启会 EINVAL（Node ≥24 实测），
  // 必须经 cmd.exe 执行；命令为静态常量无注入面，cwd 透传不变
  const cmd = process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', 'npx.cmd electron-builder --config scripts/setup-builder.yml --win portable']]
    : ['npx', ['electron-builder', '--config', 'scripts/setup-builder.yml', '--win', 'portable']];
  const r = spawnSync(cmd[0], cmd[1], { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', shell: false });
  if (r.error || r.status !== 0) {
    console.error(`打包失败（退出码 ${r.status}）`);
    process.exit(r.status || 1);
  }

  console.log('[5/5] 清理辅助产物并校验 dist');
  // portable 构建经 win-unpacked 中间目录生成，产物只保留单 exe
  rmrf(path.join(DIST, 'win-unpacked'));
  for (const name of ['builder-debug.yml']) {
    try {
      fs.unlinkSync(path.join(DIST, name));
    } catch { /* 不存在则跳过 */ }
  }
  const files = fs.readdirSync(DIST).filter((n) => !n.endsWith('.blockmap'));
  if (files.length !== 1 || !/^MinesweeperSetup-\d+\.\d+\.\d+-win\.exe$/.test(files[0])) {
    console.error(`dist 产物校验失败：期望唯一 MinesweeperSetup-<version>-win.exe，实际：${JSON.stringify(files)}`);
    process.exit(1);
  }
  const sizeMB = (fs.statSync(path.join(DIST, files[0])).size / 1024 / 1024).toFixed(1);
  console.log(`== 打包完成：dist/${files[0]}（${sizeMB} MB）==`);
})().catch((err) => {
  console.error('打包流水线失败：', err && err.message ? err.message : err);
  process.exit(1);
});
