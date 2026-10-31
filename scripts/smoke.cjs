// 游戏真实窗口冒烟：隔离用户数据、检查加载与交互、失败返回非零退出码。
// PowerShell: Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx electron scripts/smoke.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');

function collectSmokeFailures(result = {}) {
  const failures = [];
  if (!Array.isArray(result.consoleLines) || result.consoleLines.length) failures.push('控制台出现错误或警告');
  if (result.rendererGone !== null) failures.push('渲染进程异常退出');
  if (result.failLoad !== null) failures.push('页面加载失败');
  const c = result.cells || {};
  if (!c.canvasExists || !(c.canvasW > 0 && c.canvasH > 0)) failures.push('棋盘画布为空');
  if (c.modeButtons !== 3) failures.push('难度按钮缺失');
  for (const key of ['hasGetVersion', 'noInstallerApi', 'noInstallerOpenBtn', 'hasSidebarToggle']) {
    if (c[key] !== true) failures.push(`页面接口检查失败：${key}`);
  }
  if (c.bodyClass?.includes('sidebar-open')) failures.push('默认侧栏未收起');
  for (const key of ['modeFits', 'keyboardMark', 'keyboardReveal', 'pauseRestart', 'sidebar', 'leaderboard', 'workerGeneration', 'controller', 'controllerMenu', 'rebind', 'focusView', 'helpPage']) {
    if (result.checks?.[key] !== true) failures.push(`交互检查失败：${key}`);
  }
  return failures;
}

async function runSmoke() {
  const { app, BrowserWindow } = require('electron');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'Minesweeper-smoke-'));
  app.setPath('userData', tempDir);
  let win;
  const result = { consoleLines: [], rendererGone: null, failLoad: null, cells: {}, checks: {} };
  let exitCode = 1;
  try {
    await app.whenReady();
    win = new BrowserWindow({
      width: 900, height: 640, show: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, '..', 'electron', 'preload.cjs') },
    });
    win.webContents.on('console-message', (_e, level, message) => {
      if (level >= 1) result.consoleLines.push(message);
    });
    win.webContents.on('render-process-gone', (_e, details) => { result.rendererGone = details.reason; });
    win.webContents.on('did-fail-load', (_e, code, desc) => { result.failLoad = `${code} ${desc}`; });
    await win.loadFile(path.join(__dirname, '..', 'index.html'));
    for (let i = 0; i < 100; i++) {
      if (await win.webContents.executeJavaScript("!!document.getElementById('game-status')")) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    result.cells = await win.webContents.executeJavaScript(`(() => {
      const c = document.getElementById('board-canvas');
      return { canvasExists: !!c, canvasW: c?.width, canvasH: c?.height,
        modeButtons: document.querySelectorAll('.ms-mode').length,
        hasGetVersion: typeof window.minesweeperAPI?.app?.getVersion === 'function',
        noInstallerApi: !window.minesweeperAPI?.installer,
        noInstallerOpenBtn: !document.getElementById('installer-open'),
        hasSidebarToggle: !!document.getElementById('sidebar-toggle'), bodyClass: document.body.className };
    })()`);
    result.checks = await win.webContents.executeJavaScript(`(() => {
      const $ = id => document.getElementById(id), c = $('board-canvas');
      const key = k => c.dispatchEvent(new KeyboardEvent('keydown', {key:k,bubbles:true,cancelable:true}));
      const originalRandom = Math.random;
      let seed = 123;
      Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
      try {
        $('anti-guess-toggle').checked = false;
        $('anti-guess-toggle').dispatchEvent(new Event('change'));
        document.querySelector('.ms-mode[data-mode="expert"]').click();
        const modeFits = parseFloat(c.style.width) <= innerWidth - 40 && $('game-meta').textContent.includes('高级');
        document.querySelector('.ms-mode[data-mode="beginner"]').click();
        c.focus(); key('ArrowRight'); key('f');
        const keyboardMark = $('mine-count').textContent === '9' && c.getAttribute('aria-label').includes('旗');
        key('f'); key('f'); key('Enter');
        const keyboardReveal = $('game-status').textContent.includes('进行中');
        $('pause-btn').click();
        const paused = !$('pause-overlay').classList.contains('hidden');
        $('restart-btn').click();
        const pauseRestart = paused && $('pause-overlay').classList.contains('hidden') && $('timer').textContent === '00:00';
        $('sidebar-toggle').click();
        const sidebar = $('sidebar-toggle').getAttribute('aria-expanded') === 'true' && !$('sidebar').inert;
        $('leaderboard-open').click();
        const leaderboard = !$('leaderboard-modal').classList.contains('hidden');
        $('leaderboard-close').click();
        $('sidebar-toggle').click();
        return {modeFits, keyboardMark, keyboardReveal, pauseRestart, sidebar, leaderboard};
      } finally { Math.random = originalRandom; }
    })()`);
    // 真正启动module Worker，并经浏览器Gamepad轮询模拟输入；不直接调用游戏内部函数。
    win.focus();
    Object.assign(result.checks, await win.webContents.executeJavaScript(`(async () => {
      const $ = id => document.getElementById(id), c = $('board-canvas');
      const key = k => c.dispatchEvent(new KeyboardEvent('keydown', {key:k,bubbles:true,cancelable:true}));
      const NativeWorker = window.Worker;
      const gamepadDescriptor = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
      let completed = false;
      const frames = async () => { for(let i=0;i<3;i++) await new Promise(requestAnimationFrame); };
      try {
        window.Worker = class extends NativeWorker {
          constructor(...args) { super(...args); this.addEventListener('message', event => { if(event.data?.result) completed = true; }); }
        };
        $('anti-guess-toggle').checked = true;
        $('anti-guess-toggle').dispatchEvent(new Event('change'));
        $('restart-btn').click(); c.focus(); key('Enter');
        const showedGenerating = c.getAttribute('aria-busy') === 'true';
        const deadline = Date.now()+10000;
        while(c.getAttribute('aria-busy') === 'true' && Date.now()<deadline) await new Promise(r=>setTimeout(r,25));
        const workerGeneration = showedGenerating && completed && c.getAttribute('aria-busy') === 'false';
        $('anti-guess-toggle').checked = false;
        $('anti-guess-toggle').dispatchEvent(new Event('change'));
        $('restart-btn').click(); c.focus();
        const p={id:'模拟标准手柄',index:0,connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
        Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[p]});
        await frames();
        const pulse=async button=>{p.buttons[button].pressed=true;await frames();p.buttons[button].pressed=false;await frames();};
        await pulse(15);await pulse(1);
        const controller=$('controller-status').textContent.includes('模拟标准手柄') && $('mine-count').textContent==='9' && c.getAttribute('aria-label').includes('第 2 列') && c.getAttribute('aria-label').includes('旗');
        await pulse(2);await pulse(13);await pulse(0);
        // 从选中的中级向下走到自定义行数，用右方向真实编辑数值。
        await pulse(13);await pulse(13);await pulse(15);
        const controllerMenu=document.body.classList.contains('sidebar-open') && $('game-meta').textContent.includes('中级') && $('custom-rows').value==='10';
        const seek=async id=>{for(let i=0;i<35;i++){if(document.activeElement.id===id)return;await pulse(13);}throw Error('手柄导航未到达 '+id);};
        await seek('leaderboard-open');await pulse(0);const lbOpened=!$('leaderboard-modal').classList.contains('hidden');await pulse(1);
        await pulse(8);const helpOpened=!$('help-page').classList.contains('hidden') && $('board-wrap').classList.contains('hidden');await pulse(1);
        const helpPage=lbOpened && helpOpened && $('help-page').classList.contains('hidden') && !document.querySelector('.ms-main > footer');
        await pulse(11);const focused=document.body.classList.contains('focus-view') && getComputedStyle(document.querySelector('.ms-topbar')).display==='none' && getComputedStyle($('game-progress')).display!=='none';await pulse(11);
        const focusView=focused && !document.body.classList.contains('focus-view');
        await pulse(2);await seek('controls-open');await pulse(0);await seek('binding-mark');await pulse(15);
        const swapped=$('binding-mark').value==='2' && $('binding-menu').value==='1';
        // 新mark键X关闭设置，再按X须给棋盘标记；菜单随交换改为B。
        await pulse(2);await pulse(2);const remappedMark=$('mine-count').textContent==='39';
        await pulse(1);await seek('controls-open');await pulse(0);await seek('bindings-reset');await pulse(0);
        const reset=$('binding-mark').value==='1' && $('binding-menu').value==='2';await pulse(1);
        return {workerGeneration,controller,controllerMenu,rebind:swapped&&remappedMark&&reset,focusView,helpPage};
      } finally {
        window.Worker=NativeWorker;
        if(gamepadDescriptor) Object.defineProperty(navigator,'getGamepads',gamepadDescriptor); else delete navigator.getGamepads;
      }
    })()`));
    const failures = collectSmokeFailures(result);
    result.failures = failures;
    exitCode = failures.length ? 1 : 0;
    fs.writeFileSync(path.join(__dirname, '..', 'smoke-screenshot.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.getElementById('focus-toggle').click()");
    fs.writeFileSync(path.join(__dirname, '..', 'smoke-focus-screenshot.png'), (await win.webContents.capturePage()).toPNG());
    console.log('SMOKE_RESULT ' + JSON.stringify(result));
  } catch (error) {
    console.error('冒烟失败：' + (error?.stack || String(error)));
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    try { fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
    catch { /* Chromium句柄尚未释放时，由验收收尾回收临时目录。 */ }
    // Electron app.quit会覆盖普通Node的exitCode，必须使用原生退出接口。
    app.exit(exitCode);
  }
}

module.exports = { collectSmokeFailures, runSmoke };
// Electron 的主脚本由内部 bootstrap 加载，require.main 不一定等于当前模块。
if (require.main === module || (process.versions?.electron && process.type === 'browser')) runSmoke();
