// 端到端验收脚本（v3，常驻入库）：驱动便携安装器 dist/MinesweeperSetup-<version>-win.exe
// 执行真实安装/移动/自愈/卸载全流程。场景：
//   A. 静默安装（--install-dir）→ 校验文件/manifest/注册表/快捷方式
//   B. 运行安装副本（CDP 冒烟：无 installer 面）→ 移动目录 → 短启触发 InstallLocation 自愈
//      → 静默卸载（--uninstall，验证重定位链 + 延迟清理 bat）
//   C. 再安装 → 放入外来文件 → CDP 驱动 GUI 卸载确认 → 外来文件保留 + 清单式删除
//   D. 清理测试残留
// 运行：npm run dist 后 node scripts/installer-e2e.cjs
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const APP = path.join(ROOT, 'dist', `MinesweeperSetup-${PKG.version}-win.exe`);
const TEST_DIR = 'D:\\MinesweeperE2E';
const MOVED_DIR = 'D:\\MinesweeperE2E-moved';
const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Minesweeper';
const GAME_PORT = 9333;
const SETUP_PORT = 9334;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passCount = 0;
let failCount = 0;
function check(name, cond, extra = '') {
  if (cond) { passCount++; console.log(`  ✅ ${name}`); }
  else { failCount++; console.log(`  ❌ ${name} ${extra}`); }
}

// ---------- 进程与 CDP 辅助 ----------
function envNoRunAsNode() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // 本机 shell 预设该键，Node 模式拒绝 Chromium 参数
  return env;
}

/** 启动可执行（便携 setup 或安装副本）并等待 CDP 页面就绪 */
async function launchApp(exe, args = [], port) {
  const proc = spawn(exe, [...args, `--remote-debugging-port=${port}`], { stdio: 'ignore', env: envNoRunAsNode() });
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) return proc;
    } catch { /* 未就绪（便携解压需数秒） */ }
    await sleep(500);
  }
  throw new Error(`应用启动超时（CDP 未就绪）：${exe}`);
}

/** 启动并等待进程退出（静默路径），返回 { code, signal }；超时 → null */
async function runAndWait(exe, args = [], timeoutMs = 60000) {
  return new Promise((resolve) => {
    let done = false;
    const proc = spawn(exe, args, { stdio: 'ignore', env: envNoRunAsNode() });
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        try { proc.kill(); } catch { /* 已退出 */ }
        resolve(null);
      }
    }, timeoutMs);
    proc.on('exit', (code, signal) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve({ code, signal });
      }
    });
  });
}

let evalId = 0;
async function evaluate(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = ++evalId;
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.removeEventListener('message', onMsg);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result.result.value);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
}

async function connect(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url));
      if (!page) throw new Error('无页面目标');
      const ws = await new Promise((resolve, reject) => {
        const w = new WebSocket(page.webSocketDebuggerUrl);
        w.addEventListener('open', () => resolve(w));
        w.addEventListener('error', () => reject(new Error('WS 连接失败')));
      });
      return ws;
    } catch { /* 未就绪 */ }
    await sleep(500);
  }
  throw new Error('CDP 页面连接失败');
}

/** 轮询等待页面条件成立（module 脚本执行完成后 UI 才生成，需等 DOM 就绪） */
async function waitFor(ws, expr, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await evaluate(ws, expr);
    if (v) return v;
    await sleep(500);
  }
  return null;
}

function killApps() {
  for (const img of ['Minesweeper.exe', 'MinesweeperSetup.exe']) {
    try { execSync(`taskkill /IM ${img} /F`, { stdio: 'ignore' }); } catch { /* 未运行 */ }
  }
}

// ---------- 注册表 / 文件系统辅助 ----------
function regQuery(name) {
  try {
    const out = execSync(`reg query "${UNINSTALL_KEY}" /v ${name}`, { encoding: 'utf8' });
    const m = out.match(new RegExp(`${name}\\s+REG_SZ\\s+(.+)`));
    return m ? m[1].trim() : null;
  } catch { return null; }
}
function regKeyExists() {
  try { execSync(`reg query "${UNINSTALL_KEY}"`, { stdio: 'ignore' }); return true; } catch { return false; }
}
function readManifest(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'install-manifest.json'), 'utf8')); } catch { return null; }
}
function cleanTestDirs() {
  for (const d of [TEST_DIR, MOVED_DIR]) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }
}
function cleanRegistry() {
  try { execSync(`reg delete "${UNINSTALL_KEY}" /f`, { stdio: 'ignore' }); } catch { /* 无键 */ }
}

(async () => {
  console.log('== 端到端验收：便携安装器 MinesweeperSetup ' + PKG.version + ' ==');
  if (!fs.existsSync(APP)) {
    console.error(`未找到 ${APP}，请先 npm run dist`);
    process.exit(2);
  }
  cleanTestDirs();
  cleanRegistry();
  killApps();

  // ===== 阶段 A：静默安装（--install-dir） =====
  console.log('\n[A1] 静默安装到 ' + TEST_DIR);
  const r = await runAndWait(APP, ['--install-dir', TEST_DIR]);
  check('安装进程已退出', !!r, `超时/异常：${JSON.stringify(r)}`);
  check('安装副本 exe 存在（重命名 Minesweeper.exe）', fs.existsSync(path.join(TEST_DIR, 'Minesweeper.exe')));
  check('resources/app 为 unpacked 目录（package.json + index.html）',
    fs.existsSync(path.join(TEST_DIR, 'resources', 'app', 'package.json')) &&
    fs.existsSync(path.join(TEST_DIR, 'resources', 'app', 'index.html')));
  check('安装副本无 setup 自身 app.asar', !fs.existsSync(path.join(TEST_DIR, 'resources', 'app.asar')));
  check('install-manifest.json 存在', fs.existsSync(path.join(TEST_DIR, 'install-manifest.json')));

  const manifest = readManifest(TEST_DIR);
  check('清单可解析', !!manifest, 'manifest 读取失败');
  if (manifest) {
    check('清单 files 含重命名后的 Minesweeper.exe', manifest.files.includes('Minesweeper.exe'), JSON.stringify(manifest.files));
    check('清单 files 含 resources\\app\\index.html', manifest.files.includes('resources\\app\\index.html'));
    check('清单不含 setup 面（MinesweeperSetup.exe/app.asar/game-app）',
      !manifest.files.some((f) => /MinesweeperSetup\.exe|resources\\app\.asar|resources\\game-app/.test(f)));
  }
  const uninstallStr = regQuery('UninstallString');
  const installLoc = regQuery('InstallLocation');
  check('注册表 UninstallString 指向 setup 磁盘 exe --uninstall',
    !!uninstallStr && uninstallStr.includes('"' + APP + '" --uninstall'), String(uninstallStr));
  check('注册表 InstallLocation === 安装目录', installLoc === TEST_DIR, String(installLoc));
  const desktopLnk = path.join(process.env.USERPROFILE, 'Desktop', 'Minesweeper.lnk');
  check('桌面快捷方式存在', fs.existsSync(desktopLnk));

  // ===== 阶段 B：安装副本冒烟 → 移动 → 自愈 → 静默卸载 =====
  console.log('\n[B1] 运行安装副本（CDP 冒烟：游戏无 installer 面）');
  let proc = await launchApp(path.join(TEST_DIR, 'Minesweeper.exe'), [], GAME_PORT);
  let ws = await connect(GAME_PORT);
  const uiReady = await waitFor(ws, `!!document.getElementById('sidebar-toggle')`);
  const smoke = await evaluate(ws, `(() => ({
    hasSidebarToggle: !!document.getElementById('sidebar-toggle'),
    hasGetVersion: typeof (window.minesweeperAPI && window.minesweeperAPI.app && window.minesweeperAPI.app.getVersion) === 'function',
    noInstallerApi: !window.minesweeperAPI || !window.minesweeperAPI.installer,
    canvasW: (document.getElementById('board-canvas') || {}).width || -1,
    canvasH: (document.getElementById('board-canvas') || {}).height || -1,
    title: document.title,
  }))()`);
  check('安装副本可运行（侧栏 toggle 存在）', uiReady === true && smoke.hasSidebarToggle === true, JSON.stringify(smoke));
  check('preload 仅 app.getVersion（installer 面不存在）', smoke.hasGetVersion === true && smoke.noInstallerApi === true);
  check('棋盘画布正常（W/H > 0）', smoke.canvasW > 0 && smoke.canvasH > 0);
  ws.close();
  killApps();

  console.log('\n[B2] 移动安装目录');
  fs.renameSync(TEST_DIR, MOVED_DIR);
  check('目录已移动', fs.existsSync(path.join(MOVED_DIR, 'Minesweeper.exe')) && !fs.existsSync(TEST_DIR));

  console.log('\n[B3] 从移动目录短启游戏（触发 InstallLocation 自愈）');
  proc = await launchApp(path.join(MOVED_DIR, 'Minesweeper.exe'), [], GAME_PORT);
  ws = await connect(GAME_PORT);
  const movedSmoke = await waitFor(ws, `!!document.getElementById('sidebar-toggle')`);
  check('移动目录仍可运行', movedSmoke === true);
  ws.close();
  killApps();
  await sleep(1000);
  check('注册表 InstallLocation 已自愈为移动目录', regQuery('InstallLocation') === MOVED_DIR, String(regQuery('InstallLocation')));

  console.log('\n[B4] 静默卸载（--uninstall，控制面板入口；重定位链=InstallLocation）');
  const ru = await runAndWait(APP, ['--uninstall']);
  check('卸载进程已退出', !!ru, `超时/异常：${JSON.stringify(ru)}`);
  check('注册表卸载键已删除', !regKeyExists());
  let dirGone = !fs.existsSync(MOVED_DIR);
  for (let i = 0; i < 18 && !dirGone; i++) { // 延迟清理 bat 轮询（最长 90s）
    await sleep(5000);
    dirGone = !fs.existsSync(MOVED_DIR);
  }
  check('移动目录已删除（清单式 + 延迟清理）', dirGone, '目录仍有残留');
  check('桌面快捷方式已删除', !fs.existsSync(desktopLnk));
  killApps();

  // ===== 阶段 C：再安装 → 外来文件 → GUI 卸载确认 =====
  console.log('\n[C1] 再安装（用于外来文件场景）');
  const r2 = await runAndWait(APP, ['--install-dir', TEST_DIR]);
  check('再安装完成', !!r2 && fs.existsSync(path.join(TEST_DIR, 'Minesweeper.exe')), JSON.stringify(r2));
  const foreign = path.join(TEST_DIR, 'user-notes.txt');
  fs.writeFileSync(foreign, '用户自己的文件，不应被删除', 'utf8');

  console.log('\n[C2] 启动 setup GUI（已安装 → 卸载确认视图）');
  proc = await launchApp(APP, [], SETUP_PORT);
  ws = await connect(SETUP_PORT);
  const modeReady = await waitFor(ws, `!!document.getElementById('setup-mode')`);
  const view = await evaluate(ws, `(() => ({
    mode: document.getElementById('setup-mode') ? document.getElementById('setup-mode').dataset.mode : null,
    dir: document.getElementById('uninstall-dir') ? document.getElementById('uninstall-dir').textContent : null,
    version: document.getElementById('uninstall-version') ? document.getElementById('uninstall-version').textContent : null,
    hasConfirm: !!document.getElementById('uninstall-confirm-btn'),
  }))()`);
  check('GUI 显示卸载确认视图（mode=uninstall）', modeReady === true && view.mode === 'uninstall', JSON.stringify(view));
  check('卸载视图显示安装目录', view.dir === TEST_DIR, String(view.dir));
  check('卸载视图显示版本 1.2.0', view.version === PKG.version, String(view.version));

  console.log('\n[C3] 点击确认卸载');
  await evaluate(ws, `document.getElementById('uninstall-confirm-btn').click(); true`);
  // 等待报告渲染完成（清单式删除 + 注册表 + 快捷方式，最多 30s）
  const reportDone = await waitFor(ws, `document.querySelector('#install-report li') ? true : false`, 30000);
  check('卸载报告已渲染', reportDone === true);
  check('外来文件被保留', fs.existsSync(foreign));
  check('清单内文件已删除', !fs.existsSync(path.join(TEST_DIR, 'Minesweeper.exe')));
  check('注册表卸载键已删除', !regKeyExists());
  check('桌面快捷方式已删除', !fs.existsSync(desktopLnk));
  ws.close();
  killApps();

  console.log('\n[D1] 清理测试残留');
  await sleep(2000);
  cleanTestDirs();
  check('测试目录已清理', !fs.existsSync(TEST_DIR) && !fs.existsSync(MOVED_DIR));

  console.log(`\n== 结果：${passCount} 通过 / ${failCount} 失败 ==`);
  process.exit(failCount === 0 ? 0 : 1);
})().catch((err) => {
  console.error('E2E 异常：', err);
  killApps();
  cleanTestDirs();
  process.exit(2);
});
