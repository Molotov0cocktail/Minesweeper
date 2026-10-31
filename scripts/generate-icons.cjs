// 从唯一矢量源生成应用图标；每个尺寸直接由 Chromium 栅格化，无 PNG 缩放链。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const ICON_SIZES = Object.freeze([16, 20, 24, 32, 48, 64, 128, 256]);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** 将 [{size, png:Buffer}] 封装为标准 ICO；各帧保持原始 32 位 RGBA PNG。 */
function encodeIco(frames) {
  if (!Array.isArray(frames) || frames.length === 0 || frames.length > 65535) {
    throw new Error('图标帧列表无效');
  }
  const directory = Buffer.alloc(6 + frames.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(frames.length, 4);
  let offset = directory.length;
  const seen = new Set();
  const images = frames.map(({ size, png }, index) => {
    if (!Number.isInteger(size) || size < 1 || size > 256 || seen.has(size) || !Buffer.isBuffer(png) ||
        png.length < 33 || !png.subarray(0, 8).equals(PNG_SIGNATURE) ||
        png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size || png[24] !== 8 || png[25] !== 6) {
      throw new Error(`图标第 ${index + 1} 帧不是尺寸一致的 RGBA PNG`);
    }
    seen.add(size);
    const entry = 6 + index * 16;
    directory[entry] = size === 256 ? 0 : size;
    directory[entry + 1] = size === 256 ? 0 : size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
    return png;
  });
  return Buffer.concat([directory, ...images]);
}

function cleanupTemp(tempDir) {
  // 仅清理本脚本在系统临时目录中明确创建的目录。
  const resolved = path.resolve(tempDir);
  const relative = path.relative(path.resolve(os.tmpdir()), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) ||
      path.dirname(relative) !== '.' || !path.basename(resolved).startsWith('minesweeper-icons-')) return;
  try { fs.rmSync(resolved, { recursive: true, force: true }); }
  catch { console.warn('图标生成临时目录仍被占用，将由系统清理'); }
}

function runNodeEntry() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minesweeper-icons-'));
  const env = { ...process.env, MINESWEEPER_ICON_TEMP: tempDir };
  delete env.ELECTRON_RUN_AS_NODE;
  let electronPath;
  try { electronPath = require('electron'); }
  catch {
    cleanupTemp(tempDir);
    console.error('图标生成失败：尚未安装 Electron');
    process.exitCode = 1;
    return;
  }
  const child = spawn(electronPath, [__filename], { cwd: ROOT, env, stdio: 'inherit', windowsHide: true });
  child.once('error', () => {
    cleanupTemp(tempDir);
    console.error('图标生成失败：无法启动 Electron');
    process.exitCode = 1;
  });
  child.once('exit', code => {
    cleanupTemp(tempDir);
    process.exitCode = typeof code === 'number' ? code : 1;
  });
}

async function runElectronEntry() {
  const { app, BrowserWindow } = require('electron');
  const inheritedTemp = process.env.MINESWEEPER_ICON_TEMP;
  const tempDir = inheritedTemp || fs.mkdtempSync(path.join(os.tmpdir(), 'minesweeper-icons-'));
  fs.mkdirSync(path.join(tempDir, 'session'), { recursive: true });
  app.setPath('userData', tempDir);
  app.setPath('sessionData', path.join(tempDir, 'session'));
  app.setAppLogsPath(path.join(tempDir, 'logs'));
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  let win = null;
  let exitCode = 0;
  try {
    const svg = fs.readFileSync(path.join(ASSETS, 'icon.svg'), 'utf8');
    await app.whenReady();
    win = new BrowserWindow({
      width: 512,
      height: 512,
      show: false,
      frame: false,
      transparent: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; script-src \'self\'"></head><body></body></html>'));
    const sizes = [...ICON_SIZES, 512];
    const encoded = await win.webContents.executeJavaScript(`(async () => {
      const source = ${JSON.stringify(svg)};
      const result = [];
      for (const size of ${JSON.stringify(sizes)}) {
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
          source.replace('<svg ', '<svg width="' + size + '" height="' + size + '" '));
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) throw new Error('画布不可用');
        context.drawImage(image, 0, 0, size, size);
        result.push(canvas.toDataURL('image/png').split(',')[1]);
      }
      return result;
    })()`);
    const frames = ICON_SIZES.map((size, index) => ({ size, png: Buffer.from(encoded[index], 'base64') }));
    const ico = encodeIco(frames);
    const png = Buffer.from(encoded[ICON_SIZES.length], 'base64');
    if (!png.subarray(0, 8).equals(PNG_SIGNATURE) || png.readUInt32BE(16) !== 512 ||
        png.readUInt32BE(20) !== 512 || png[25] !== 6) throw new Error('512 像素 PNG 校验失败');
    fs.writeFileSync(path.join(ASSETS, 'minesweeper.png'), png);
    fs.writeFileSync(path.join(ASSETS, 'minesweeper.ico'), ico);
    console.log(`应用图标已生成：512 像素 PNG，ICO 含 ${ICON_SIZES.join('/')} 像素八帧`);
  } catch (error) {
    console.error(`图标生成失败：${error.message}`);
    exitCode = 1;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    if (!inheritedTemp) cleanupTemp(tempDir);
    app.exit(exitCode);
  }
}

module.exports = { encodeIco };

// Electron 的主模块可能是内部启动器，不能仅依赖 require.main === module。
const isEntry = process.argv.slice(1).some(argument => path.resolve(argument) === __filename);
if (isEntry) {
  if (process.versions.electron && !process.env.ELECTRON_RUN_AS_NODE) {
    runElectronEntry().catch(error => {
      console.error(`图标生成失败：${error.message}`);
      require('electron').app.exit(1);
    });
  } else {
    runNodeEntry();
  }
}
