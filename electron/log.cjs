// electron/log.cjs —— 按日轮转日志（%LOCALAPPDATA%\Minesweeper\logs\）。
// 行格式使用 src/core/installer.js 的 formatLogLine（ESM，本文件为 CommonJS，
// 无法同步 require，故动态 import 加载；加载完成前日志行进缓冲队列，加载后统一落盘）。
// appendFileSync 写失败静默降级 console，日志模块本身绝不抛错。

const fs = require('fs');
const path = require('path');

// ---------- 内部辅助 ----------

const pad = (n, len = 2) => String(n).padStart(len, '0');

/** 时间戳 'YYYY-MM-DD HH:mm:ss.SSS' */
function timestamp(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

/** 日期戳 'YYYY-MM-DD' */
function dateStamp(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 默认日志目录：%LOCALAPPDATA%\Minesweeper\logs（LOCALAPPDATA 缺失时兜底 AppData\Local） */
function defaultDir() {
  const base = process.env.LOCALAPPDATA ||
    path.join(process.env.USERPROFILE || '.', 'AppData', 'Local');
  return path.join(base, 'Minesweeper', 'logs');
}

// formatLogLine 动态加载（缓存 promise）；失败兜底为同格式内联实现（绝不阻塞日志）。
// 注意：flush（createLogger 内）与 setter 都必须注册在原始 loader promise 上——若注册在
// 链式 .then().catch() 之后，其他直接 await import() 的消费者（main.cjs）会先于 flush 执行，
// 导致日志行落盘顺序错乱。
const loader = import('../src/core/installer.js');
let formatLine = null;
loader.then((m) => { formatLine = m.formatLogLine; }).catch(() => {
  formatLine = (level, module, message, ts) => `[${ts}] [${level}] [${module}] ${message}`;
});

/** 启动清理：删除日志目录下 7 天前的 minesweeper-YYYY-MM-DD.log 文件（尽力而为） */
function cleanupOld(dir) {
  try {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const names = fs.readdirSync(dir);
    for (const name of names) {
      if (!/^minesweeper-\d{4}-\d{2}-\d{2}\.log$/.test(name)) continue;
      const full = path.join(dir, name);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      } catch { /* 单个文件清理失败不影响其他 */ }
    }
  } catch { /* 目录不存在/不可读 → 跳过清理 */ }
}

/**
 * createLogger({dir}) -> { info, warn, error, getLogPath }
 * info/warn/error(module, message)：level 分别映射 INFO/WARN/ERROR（formatLogLine 约定）。
 */
function createLogger({ dir } = {}) {
  const logDir = dir || defaultDir();

  try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* 目录创建失败 → 降级 console */ }
  cleanupOld(logDir);

  const filePath = () => path.join(logDir, `minesweeper-${dateStamp()}.log`);

  /** 落盘一条日志（写失败降级 console，全程不抛错） */
  const emit = (line) => {
    try {
      fs.appendFileSync(filePath(), line + '\n', 'utf8');
    } catch {
      try { console.log(line); } catch { /* 双降级也失败 → 放弃 */ }
    }
  };

  const queue = []; // formatLogLine 加载完成前缓冲
  const write = (level, module, message) => {
    const ts = timestamp();
    if (formatLine) {
      emit(formatLine(level, module, message, ts));
    } else {
      queue.push({ level, module, message, ts });
    }
  };

  loader.then(() => {
    while (queue.length > 0) {
      const { level, module, message, ts } = queue.shift();
      emit(formatLine(level, module, message, ts));
    }
  }).catch(() => { /* 加载失败已由 setter 兜底，无需处理 */ });

  return {
    info: (module, message) => write('INFO', module, message),
    warn: (module, message) => write('WARN', module, message),
    error: (module, message) => write('ERROR', module, message),
    getLogPath: () => filePath(),
  };
}

module.exports = { createLogger };
