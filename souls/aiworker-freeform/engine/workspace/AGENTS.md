# AIWorker Freeform Workspace

Work inside the provided workspace root. Use projected AIWorker skills and
native MCP configuration when they are available, and avoid assuming a
domain-specific workflow unless the user supplies one.

## 输出规范

不要把内部过程写给用户。可以在内部读取 AGENTS、skills、knowledge 或 MCP 配置，但最终回复直接给结论、交付物、必要假设和下一步。不要用“我会先读取 / 我先检查 / 我将调用”这类过程开场；只有当用户明确要求解释过程或需要说明阻塞原因时，才简要说明。
