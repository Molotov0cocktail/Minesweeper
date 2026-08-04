// electron/fs-utils.cjs —— 纯 fs 枚举/删除工具（无业务决策，供 installer-runner 使用）。
// 枚举源树：相对路径数组；扫描目标树：{ files, dirs } 绝对路径；递归删除：旧版残留清理。
// 必须用 original-fs：Electron 补丁 fs 会把「路径以 .asar 结尾的文件」误当 asar 容器（见 runner 注释）。

const fs = require('original-fs');
const path = require('path');

// 源树顶层允许安装的条目：镜像 package.json build.files（electron/**、src/**、index.html、styles/**、package.json）。
// 排除 node_modules/dist/.git/scripts/doc/tests 等开发期内容。
const SOURCE_ALLOW_TOP = new Set(['index.html', 'styles', 'src', 'electron', 'package.json']);

/**
 * 枚举源树（安装用）：返回相对路径数组（'\\' 分隔、无前导 '\\'，含子目录文件）。
 * - whitelist=true（开发/源码形态）：顶层按 SOURCE_ALLOW_TOP 白名单过滤（源码树无运行时）。
 * - whitelist=false（打包形态）：枚举整个目录（完整运行时：exe/dll/resources/locales 等）。
 * excludes：需要排除的相对路径（如 install-manifest.json）。
 * 目录递归；符号链接与异常目录跳过。
 */
function enumSourceTree(root, { excludes = [], whitelist = true } = {}) {
  const out = [];
  const skip = new Set(excludes);
  const walk = (cur) => {
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      const rel = path.relative(root, full).split(path.sep).join('\\');
      if (skip.has(rel)) continue;
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        out.push(rel);
      }
    }
  };
  if (whitelist) {
    for (const top of SOURCE_ALLOW_TOP) {
      const full = path.join(root, top);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) out.push(top);
    }
  } else {
    walk(root);
  }
  return out;
}

/**
 * 扫描目标树（卸载用）：{ files: 绝对路径[], dirs: 绝对路径[]（含安装根目录） }。
 * 符号链接一律按文件处理（不递归，防删除链接目标）；异常目录跳过。
 */
function scanTree(root) {
  const absRoot = path.resolve(root);
  const files = [];
  const dirs = [absRoot];
  const walk = (cur) => {
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        dirs.push(full);
        walk(full);
      } else {
        files.push(full);
      }
    }
  };
  walk(absRoot);
  return { files, dirs };
}

/**
 * 递归删除目录树（旧版残留清理用）；onError(err, path) 逐条收集失败（可空）。
 */
function removeTree(root, onError) {
  if (!fs.existsSync(root)) return;
  const walk = (cur) => {
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch (err) {
      if (onError) onError(err, cur);
      return;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        walk(full);
        try {
          fs.rmdirSync(full);
        } catch (err) {
          if (onError) onError(err, full);
        }
      } else {
        try {
          fs.unlinkSync(full);
        } catch (err) {
          if (onError) onError(err, full);
        }
      }
    }
  };
  walk(root);
  try {
    fs.rmdirSync(root);
  } catch (err) {
    if (onError) onError(err, root);
  }
}

module.exports = { enumSourceTree, scanTree, removeTree };
