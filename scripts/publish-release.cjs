// scripts/publish-release.cjs —— 发布 Gitee Release（v1.2.0 起）。
// 用法：node scripts/publish-release.cjs
// 凭据读取顺序：环境变量 GITEE_TOKEN → .local/gitee-token（.gitignore 已忽略，严禁入库）。
// 幂等：同名 tag 的 Release 已存在则报错退出（绝不覆盖已有发布）。
// 安全：令牌只出现在请求参数中，绝不打进输出/日志；失败信息不含令牌。
// 发布内容：dist 唯一 MinesweeperSetup-<version>-win.exe 作为附件 + tag v<version>。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OWNER = 'Molotov0coaktail';
const REPO = 'minesweeper';
const API = 'https://gitee.com/api/v5';

function getToken() {
  if (process.env.GITEE_TOKEN) return process.env.GITEE_TOKEN.trim();
  const file = path.join(ROOT, '.local', 'gitee-token');
  try {
    const t = fs.readFileSync(file, 'utf8').trim();
    if (t) return t;
  } catch { /* 未创建则走下方统一报错 */ }
  throw new Error('未找到 Gitee 令牌：设置环境变量 GITEE_TOKEN 或写入 .local/gitee-token（更新要求见 AGENTS.md）');
}

async function api(pathname, { method = 'GET', token, json, form } = {}) {
  // pathname 可能已含查询参数（如 ?per_page=100），此时用 & 拼接 access_token
  const sep = pathname.includes('?') ? '&' : '?';
  const url = `${API}/repos/${OWNER}/${REPO}${pathname}${sep}access_token=${token}`;
  const res = await fetch(url, {
    method,
    headers: json ? { 'Content-Type': 'application/json' } : undefined,
    body: json ? JSON.stringify(json) : form || undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 非 JSON 响应（如 413 纯文本） */ }
  if (!res.ok) {
    const detail = data && (data.message || data.error_description) ? `（${data.message || data.error_description}）` : '';
    throw new Error(`Gitee API ${method} ${pathname} 失败：HTTP ${res.status}${detail}`);
  }
  return data;
}

(async () => {
  const token = getToken();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const tag = `v${pkg.version}`;
  const exeName = `MinesweeperSetup-${pkg.version}-win.exe`;
  const exePath = path.join(ROOT, 'dist', exeName);

  if (!fs.existsSync(exePath)) {
    throw new Error(`dist 产物不存在：${exeName}（请先 npm run dist）`);
  }

  // 幂等检查：以 releases 列表为准（releases/tags/{tag} 对已推送的 git tag 也会返回 200，
  // 不能据此判断 Release 是否已发布——2026-08-04 实测踩坑）
  const releases = await api('/releases?per_page=100', { token });
  if ((releases || []).some((r) => r.tag_name === tag)) {
    throw new Error(`tag ${tag} 已存在同名 Release，终止（不覆盖既有发布；如需更新请先在 gitee 删除旧 Release）`);
  }

  const sizeMB = (fs.statSync(exePath).size / 1024 / 1024).toFixed(1);
  const release = await api('/releases', {
    method: 'POST',
    token,
    json: {
      tag_name: tag,
      target_commitish: 'main',
      name: `MinesweeperSetup ${tag}`,
      body: `# MinesweeperSetup ${tag}\n\n经典扫雷 Windows 便携安装器（单文件，双击未安装=安装向导，已安装=卸载确认；支持 \`--uninstall\` 静默卸载）。\n\n- 产物：\`${exeName}\`（${sizeMB} MB，未签名，SmartScreen 可能提示"更多信息→仍要运行"）\n- 系统要求：Windows 10/11 x64\n- 仓库：https://gitee.com/${OWNER}/${REPO}`,
      prerelease: false,
    },
  });
  console.log(`Release 已创建：${release.tag_name}（id=${release.id}）`);

  // 上传附件（multipart：字段名 file）
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(exePath)]), exeName);
  const attach = await api(`/releases/${release.id}/attach_files`, { method: 'POST', token, form });
  const attached = attach && attach.browser_download_url ? attach.browser_download_url : attach;
  console.log('附件已上传（browser_download_url 见 Release 页面）');
  console.log(`发布完成：https://gitee.com/${OWNER}/${REPO}/releases`);
  console.log(`附件：${JSON.stringify(attached).slice(0, 200)}`);
})().catch((err) => {
  console.error(`发布失败：${err.message}`);
  // 不用 process.exit(1)：Windows 下 Node ≥24 会因挂起的 fetch/FormData 句柄
  // 触发 libuv assertion 崩溃（async.c:94）；exitCode 让事件循环自然排空
  process.exitCode = 1;
});
