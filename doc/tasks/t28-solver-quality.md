# T28 求解与重排正确性

- 只改src/core/solve.js；输入FR17、详细设计§3、tests/solve.quality.test.js（只读）。
- 双向子集、邻居表复用、非法输入安全返回、高级试排失败不污染基准、预算不越界。
- 测试预言机独立实现双向NSS/SNS，语义契约优先；若旧精确随机用例因更强推理变化，报告主agent，不修改测试。
- 验证所有solve测试；不改其他文件或commit/push。依赖无。
