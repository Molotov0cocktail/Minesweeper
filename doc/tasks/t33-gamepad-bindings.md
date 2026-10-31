# T33 可配置手柄

- 只改src/core/gamepad.js、src/renderer/gamepad.js，按模块顺序实施。输入FR21/22、v1.5详细设计§1/2。
- tests/gamepad.test.js、gamepad.bindings.test.js、gamepad.poller.test.js均只读，主agent先红。
- B标记/X菜单、7动作map严格校验、冲突交换、动态setBindings、中立重锁；轮询getBindings变化只重置一次。
- 不提交push/不碰其他文件。完成跑相关测试并汇报。
