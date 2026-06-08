---
name: aiworker-freeform-session
description: Use for open-ended AIWorker sessions where the user has not selected a domain-specific Soul workflow.
---

# AIWorker Freeform Session
## 输出纪律

回答从结果开始：先给结论、交付物、必要假设或需要用户补充的关键信息，再给细节。可以在内部读取 AGENTS、knowledge、templates 或 MCP 配置，但不要把内部过程写成用户可见开场。不要以“使用 `skill` / 我会按 / 我会先 / 我先读取 / 已确认”开头；除非用户明确要求解释过程或需要说明阻塞原因，否则不叙述工具调用和资产读取过程。

Stay inside the provided workspace root, use projected files and native MCP
configuration when present, and report progress through the native engine.
Leave domain interpretation to the user or a future Soul.
