// 只替换 electron-builder 输出副本的资源；绝不改开发环境中的 Electron。
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { embedIcon, readIconGroups } = require('./icon-resources.cjs');

module.exports = async function iconAfterPack(context) {
  if (context.electronPlatformName && context.electronPlatformName !== 'win32') return;
  let temporary = null;
  try {
    const root = path.resolve(__dirname, '..');
    const name = context.packager?.appInfo?.productFilename;
    if (typeof name !== 'string' || !name || /[/\\]/.test(name)) throw new Error();
    const output = fs.realpathSync(context.appOutDir);
    const exePath = path.join(output, `${name}.exe`);
    const realExe = fs.realpathSync(exePath);
    const relative = path.relative(output, realExe);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error();
    const developmentExe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
    if (fs.existsSync(developmentExe) && realExe === fs.realpathSync(developmentExe)) throw new Error();

    const ico = fs.readFileSync(path.join(root, 'assets', 'minesweeper.ico'));
    const updated = embedIcon(fs.readFileSync(realExe), ico);
    const expected = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
      const offset = 6 + index * 16;
      const start = ico.readUInt32LE(offset + 12);
      return { width: ico[offset] || 256, height: ico[offset + 1] || 256,
        data: ico.subarray(start, start + ico.readUInt32LE(offset + 8)) };
    });
    const groups = readIconGroups(updated);
    if (!groups.length || groups.some(group => group.icons.length !== expected.length || group.icons.some((icon, index) =>
      icon.width !== expected[index].width || icon.height !== expected[index].height || !icon.data.equals(expected[index].data)))) {
      throw new Error();
    }
    // 校验通过后原子替换副本，也避免输出文件恰为硬链接时连带修改原始运行时。
    temporary = path.join(output, `.minesweeper-icon-${randomUUID()}.tmp`);
    fs.writeFileSync(temporary, updated, { flag: 'wx', mode: fs.statSync(realExe).mode });
    fs.renameSync(temporary, exePath);
    temporary = null;
    console.log(`应用图标已写入：${name}.exe（${groups.length} 组，每组 ${expected.length} 帧）`);
  } catch {
    throw new Error('应用程序图标写入失败，请检查构建目录及图标资源');
  } finally {
    if (temporary) {
      try { fs.unlinkSync(temporary); } catch { /* 失败的构建目录由下次流水线清理。 */ }
    }
  }
};
