# T29 可取消Worker生成

- 输入FR18、详细设计§4/5、tests/generation.test.js（只读）。
- 顺序两个模块：renderer/generation-worker.js统一生成与消息协议；renderer/generation-client.js管理Worker、取消和8秒超时。
- 保留现有精确降级文案；无主线程补算；在Node可import纯生成函数。
- 测试严格先红后绿，不改其他文件/tests/提交push。依赖T28可先实现。
