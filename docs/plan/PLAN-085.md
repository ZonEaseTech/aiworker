# PLAN-085 Executor capability overlay semantics

- **status**: draft
- **createdAt**: 2026-05-04 11:22
- **relatedTask**: FEAT-049

## 现状

`.aiworker/executor-capabilities.json` 目前被实现为 executor-native capability
manifest，包含 MCP、engine plugin、engine skill 和 engine policy descriptor。
这套设计仍然容易把 AIWorker 带向维护外部 executor 生态的方向。

## 方案

把该文件的产品语义降级为 **project executor overlay / bootstrap hints**：

1. 只表达项目希望外部 executor 具备的建议或声明。
2. 不声明这是 effective capability source of truth。
3. 不承诺屏蔽 user/host 级 MCP、skill、plugin 或 native session。
4. 对支持官方 project config 的 engine，保留 best-effort projection helper。

## 范围

- shared schema 命名/注释和文档语义。
- CLI 输出中 “declared executor-native capabilities” 的措辞收口。
- 旧 projection 行为的兼容说明。

## 非范围

- 不删除现有 manifest 文件。
- 不实现 hermetic executor mode。
- 不迁移已有 project 文件。

## 风险

旧用户可能已经把该 manifest 当作 project config helper；收口时保留命令但改变文案，避免破坏工作流。

## 验证

- schema tests 保持通过。
- CLI executor tests 根据新文案更新。
- docs grep 不再出现“完整能力来源”类承诺。
