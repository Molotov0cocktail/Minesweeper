# T41 应用图标接线与PE资源

- 按模块顺序实现：scripts/icon-resources.cjs纯PE逻辑；scripts/icon-after-pack.cjs钩子与build-dist.cjs/setup-builder.yml构建模块；electron/main.cjs/setup.cjs窗口图标。
- 输入v1.5.1详细设计§4~6；tests/icon.packaging.test.js只读，主agent先红。
- resedit已在node_modules，主agent稍后加devDependency固定1.7.2；require('resedit')包含NtExecutable等，无需额外pe-library直接依赖。
- 保留非图标资源/overlay，所有组替换、校验再写；不能修改node_modules/electron/dist/electron.exe或开签名流程。
- 不改tests/package/文档，不提交push。逐模块验证，汇报实际PE检查和阻塞。
