# PLAN-100 Soul-specific schema packs and validation samples

- **status**: draft
- **createdAt**: 2026-05-04 13:52
- **approvedAt**: (pending)
- **relatedTask**: FEAT-054

## 现状

Soul 已有职责和边界描述，但缺少可执行的领域 schema。没有 schema pack 时，
Brain Kernel 无法知道 HR 的 candidate / resume / screening decision 与
developer 的 module / test rule / architecture decision 是不同业务对象，也无法
用多 Soul 样本验证架构没有重新偏回 software project。

## 方案

为内置 Soul 建立最小 schema pack：

1. 每个 Soul module 声明自己的 `artifactTypes`、`entityTypes`、`proposalTypes`、
   `workflowStates` 和 `defaultRetention`。
2. 第一阶段至少完整覆盖 developer 与 hr-recruiting，finance/support 提供轻量
   skeleton。
3. Schema pack 只定义领域对象和校验，不直接实现业务自动化。
4. validation samples 放在测试 fixture 中，覆盖 developer repo 与 HR resume pool。

## 范围

- Soul-specific schema pack 类型。
- developer / HR 最小 schema。
- finance / support skeleton。
- static validation tests。
- docs examples。

## 非范围

- 不实现实际简历筛选模型。
- 不实现财务对账或工单流转自动化。
- 不做 UI 表单生成。

## 风险

1. 中央 schema 文件会重新把 Soul 揉在一起；每个 Soul 的 schema pack 必须独立维护。
2. HR / finance 示例涉及敏感数据想象；fixtures 只能用 synthetic sample。
3. Schema 太具体会阻碍用户自定义 Soul；第一版保留 extension metadata。

## 验证

- Soul registry tests 覆盖 schema pack loading。
- synthetic developer / HR validation fixtures。
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`
