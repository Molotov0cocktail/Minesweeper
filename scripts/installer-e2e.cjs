// 临时端到端验证脚本（T13 验收用，用后即删，不入库）：
// 驱动打包版应用（dist/win-unpacked/Minesweeper.exe）经 CDP 执行真实安装/移动目录/卸载全流程。
// 场景：
//   A. 安装 → 校验文件/注册表/快捷方式 → 移动目录 → 从移动目录 --uninstall（静默，同时验证移动后可运行）
//   B. 再安装 → 放入外来文件 → IPC 卸载 → 校验外来文件保留 + 报告分类
//   C. 旧版残留检测（只检测不清理）
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..', 'dist', 'win-unpacked', 'Minesweeper.exe');
const TEST_DIR = 'D:\\MinesweeperE2E';
const MOVED_DIR = 'D:\\MinesweeperE2E-moved';
const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Minesweeper';
const PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passCount = 0;
let failCount = 0;
function check(name, cond, extra = '') {
  if (cond) { passCount++; console.log(`  ✅ ${name}`); }
  else { failCount++; console.log(`  ❌ ${name} ${extra}`); }
}

async function launchApp(args = [], port = PORT) {
  // 本机 shell 预设 ELECTRON_RUN_AS_NODE=1（Node 模式拒绝 Chromium 参数），必须删除该键
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const proc = spawn(APP, [...args, `--remote-debugging-port=${port}`], { stdio: 'ignore', env });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) return proc;
    } catch { /* 未就绪 */ }
    await sleep(500);
  }
  throw new Error('应用启动超时（CDP 未就绪）');
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

async function connect(port = PORT) {
  for (let i = 0; i < 30; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url));
      if (!page) throw new Error('无页面目标');
      // 等待 WebSocket open 后再返回
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

function killApp() {
  try { execSync('taskkill /IM Minesweeper.exe /F', { stdio: 'ignore' }); } catch { /* 未运行 */ }
}
function regQueryUninstallString() {
  try {
    const out = execSync(`reg query "${UNINSTALL_KEY}" /v UninstallString`, { encoding: 'utf8' });
    const m = out.match(/UninstallString\s+REG_SZ\s+(.+)/);
    return m ? m[1].trim() : null;
  } catch { return null; }
}
function regKeyExists() {
  try { execSync(`reg query "${UNINSTALL_KEY}"`, { stdio: 'ignore' }); return true; } catch { return false; }
}
function cleanTestDirs() {
  for (const d of [TEST_DIR, MOVED_DIR]) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }
}

(async () => {
  console.log('== 端到端验收：打包版安装/卸载 ==');
  cleanTestDirs();
  killApp();

  // ===== 阶段 A：安装 → 校验 → 移动 → --uninstall =====
  console.log('\n[A1] 安装到 ' + TEST_DIR);
  let proc = await launchApp([]);
  let ws = await connect();
  let status = await evaluate(ws, 'window.minesweeperAPI.installer.getStatus()');
  check('初始未安装', status.installed === false, JSON.stringify(status));
  // 旧版残留检测按现状报告（用户已手动删除旧 NSIS 目录；检测机制由 installer.test.js 覆盖）
  check('残留检测结构完整（oldNsisDir/oldShortcuts/oldRegistry）', !!status.legacy && Array.isArray(status.legacy.oldShortcuts), JSON.stringify(status.legacy));

  const report = await evaluate(ws, `window.minesweeperAPI.installer.install(${JSON.stringify({ dir: TEST_DIR, desktopShortcut: true, startMenuShortcut: true })})`);
  check('安装 ok', report.ok === true, JSON.stringify(report.errors || ''));
  check('安装目录已生成', fs.existsSync(TEST_DIR));
  check('安装副本 exe 存在（完整运行时）', fs.existsSync(path.join(TEST_DIR, 'Minesweeper.exe')));
  check('resources/app.asar 存在', fs.existsSync(path.join(TEST_DIR, 'resources', 'app.asar')));
  check('install-manifest.json 存在', fs.existsSync(path.join(TEST_DIR, 'install-manifest.json')));
  const regStr = regQueryUninstallString();
  check('注册表 UninstallString 指向安装副本', regStr && regStr.includes(TEST_DIR) && regStr.includes('Minesweeper.exe'), String(regStr));
  check('桌面快捷方式存在', fs.existsSync(path.join(process.env.USERPROFILE, 'Desktop', 'Minesweeper.lnk')));
  ws.close();
  killApp();

  console.log('\n[A2] 移动安装目录（修复崩溃 bug 的场景）');
  fs.renameSync(TEST_DIR, MOVED_DIR);
  check('目录已移动', fs.existsSync(path.join(MOVED_DIR, 'Minesweeper.exe')) && !fs.existsSync(TEST_DIR));

  console.log('\n[A3] 从移动后的目录启动并执行 --uninstall（静默，控制面板入口）');
  // 静默卸载不创建窗口 → 无 CDP 页面，直接等待进程退出
  const env2 = { ...process.env };
  delete env2.ELECTRON_RUN_AS_NODE;
  const proc3 = spawn(path.join(MOVED_DIR, 'Minesweeper.exe'), ['--uninstall'], { stdio: 'ignore', env: env2 });
  await Promise.race([
    new Promise((r) => proc3.on('exit', r)),
    sleep(30000).then(() => { console.log('  ⚠ 静默卸载进程 30s 未退出'); }),
  ]);
  check('卸载后注册表键已删除', !regKeyExists());
  // 延迟清理 bat：等待应用进程完全退出后目录解锁，重试删除（轮询至多 90s）
  let dirGone = !fs.existsSync(MOVED_DIR);
  for (let i = 0; i < 18 && !dirGone; i++) {
    await sleep(5000);
    dirGone = !fs.existsSync(MOVED_DIR);
  }
  check('移动目录已删除（延迟清理成功）', dirGone, '目录仍有残留');
  check('桌面快捷方式已删除', !fs.existsSync(path.join(process.env.USERPROFILE, 'Desktop', 'Minesweeper.lnk')));
  killApp();

  // ===== 阶段 B：再安装 → 外来文件 → IPC 卸载 =====
  console.log('\n[B1] 再安装（用于外来文件场景）');
  proc = await launchApp([]);
  ws = await connect();
  const report2 = await evaluate(ws, `window.minesweeperAPI.installer.install(${JSON.stringify({ dir: TEST_DIR, desktopShortcut: true, startMenuShortcut: true })})`);
  check('再安装 ok', report2.ok === true, JSON.stringify(report2.errors || ''));

  console.log('\n[B2] 放入外来文件后卸载');
  const foreign = path.join(TEST_DIR, 'user-notes.txt');
  fs.writeFileSync(foreign, '用户自己的文件，不应被删除', 'utf8');
  const uninstallReport = await evaluate(ws, 'window.minesweeperAPI.installer.uninstall()');
  check('卸载报告已返回', !!uninstallReport, JSON.stringify(uninstallReport));
  const busyErr = (uninstallReport.errors || []).find((e) => e.code === 'BUSY' || e.code === 'EXTRANEOUS');
  check('外来文件被保留（根目录因非空报 BUSY/保留提示）', fs.existsSync(foreign) && busyErr, JSON.stringify(uninstallReport.errors));
  check('清单内文件已删除', !fs.existsSync(path.join(TEST_DIR, 'Minesweeper.exe')));
  check('注册表键已删除', !regKeyExists());
  check('快捷方式已删除', !fs.existsSync(path.join(process.env.USERPROFILE, 'Desktop', 'Minesweeper.lnk')));
  ws.close();
  killApp();

  console.log('\n[B3] 清理测试残留');
  cleanTestDirs();
  check('测试目录已清理', !fs.existsSync(TEST_DIR) && !fs.existsSync(MOVED_DIR));

  console.log(`\n== 结果：${passCount} 通过 / ${failCount} 失败 ==`);
  process.exit(failCount === 0 ? 0 : 1);
})().catch((err) => {
  console.error('E2E 异常：', err);
  killApp();
  cleanTestDirs();
  process.exit(2);
});
