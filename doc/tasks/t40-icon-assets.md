# T40 应用图标源与生成

- 只改assets/icon.svg、assets/minesweeper.png、assets/minesweeper.ico及scripts/generate-icons.cjs。
- 输入FR27、v1.5.1详细设计§3；tests/icon.assets.test.js只读，主agent先红。
- 自包含SVG，深蓝底/银色浮雕方格/金属八向雷，设计简洁，高光与棋盘图元同系；可加小红旗点缀但16px须清楚。
- Electron隐藏窗口每尺寸渲染SVG，ICO8帧，PNG512透明边；Node封装调用Electron，清RUN_AS_NODE，正确处理Electron require.main差异。可导出纯encodeIco帮助函数用于测试，ICO每帧32bit PNG。
- 不改package/其他脚本/tests/文档，不提交push。完成生成并测试、告知预览路径，由主agent视觉审阅。
