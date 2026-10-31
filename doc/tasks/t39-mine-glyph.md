# T39 地雷矢量图元

- 只改src/renderer/render.js，新增src/renderer/mine-glyph.js（同一渲染模块）。
- 输入FR26、详细设计v1.5.1§1/2；tests/mine-glyph.test.js只读，主agent先红。
- 八短刺/石墨金属/高光，16~48px不出界，失败提示不遮主体，ctx状态恢复，隐藏雷不泄露，colors兼容。
- 不修改其他文件/tests，不提交push。跑render及mine-glyph测试，汇报真实结果。
