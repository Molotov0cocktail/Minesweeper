# T26 集成与发布

- 目标：真实交互验证、1.3.0 独立安装器与发布闭环。
- 主 agent 修改 scripts/smoke.cjs、版本文件、README/AGENTS/文档；其余任务经审阅后集成。
- 审计补充：setup/index引用共享styles/main.css，但安装器files漏该资源。先以setup.packaging.test.js复现红，再补setup-builder.yml白名单；打包后验证app.asar内样式存在。
- 先补 smoke 失败判定与交互契约测试；全量 Vitest、Electron smoke、npm run dist、安装 E2E、产物验证。
- 仅提交必要文件，清理 screenshot/staging 与本次测试目录；提交推送 origin/main，tag v1.3.0，发布并公开验证附件。
- 如外部认证/网络失败真实记录，不宣称完成发布。依赖 T21~T25。
