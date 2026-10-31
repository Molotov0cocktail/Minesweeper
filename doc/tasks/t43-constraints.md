# T43 有界约束求解

目标：实现详细设计v1.6.0 inferForced，避免把截断枚举当确定结论。
范围仅src/core/constraints.js；输入proposal/design及tests/constraints.test.js。主agent先写测试并确认缺模块红。
步骤：校验、约束连通分量、剪枝枚举、完备分量求交、预算安全返回。
验收：独立穷举/非子集约束/歧义/无解/预算/输入不变全部通过；不改测试、不提交。无依赖。
