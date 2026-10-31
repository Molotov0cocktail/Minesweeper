# T31 游戏输入与生成装配

- 只改src/renderer/main.js；输入FR16/18、详细设计§2/7、tests/main.controller.test.js（只读）。
- main复用现有鼠标/键盘操作，接手柄语义、模态确认、后台守卫、Worker世代取消与ready刷新。
- startApp增加可选generationClient/gamepadFactory；无Worker环境保留原同步测试路径。
- 验证main两个文件，其他模块不改、不提交push。依赖T27/T29/T30与UI新API。
