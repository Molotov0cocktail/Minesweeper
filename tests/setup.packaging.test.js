import { it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
it('安装器HTML引用的本地样式必须实际进入安装器白名单',()=>{
  const root=process.cwd();
  const html=readFileSync(path.join(root,'setup/index.html'),'utf8');
  const config=readFileSync(path.join(root,'scripts/setup-builder.yml'),'utf8');
  const entries=config.split('files:')[1].split('extraResources:')[0].split('\n').map(line=>line.trim().replace(/^- /,'')).filter(line=>!line.startsWith('#'));
  for(const match of html.matchAll(/href="([^"]+\.css)"/g)) {
    const file=path.posix.normalize(path.posix.join('setup',match[1]));
    expect(existsSync(path.join(root,file))).toBe(true);
    expect(entries.some(entry=>entry===file||(entry.endsWith('/**')&&file.startsWith(entry.slice(0,-2)))),`${file} 必须随setup一起打包`).toBe(true);
  }
});
