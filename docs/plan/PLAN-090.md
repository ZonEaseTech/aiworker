# PLAN-090 Brain admission and approval roadmap

- **status**: draft
- **createdAt**: 2026-05-04 11:22
- **relatedTask**: FEAT-050

## 现状

Architecture 已经规定 generated memory / brain skill / policy proposal 写入
filesystem 前必须经 operator approval，但还没有可执行 roadmap。

## 方案

1. 定义 pending brain proposal model。
2. 每个 proposal 必须包含 evidence、scope、confidence、rollback。
3. CLI / API / UI approval surface 分阶段实现。
4. pre-compaction memory flush 继续作为已允许 runtime 写入路径，其他 mutating brain command 另开任务。

## 范围

- roadmap docs。
- future schema/API plan。

## 非范围

- 本计划不直接落 DB migration。
- 不接入 executor capability。

## 风险

如果 admission 太重，会损害轻量定位；只对 generated durable changes 上 approval，普通 read-only brain inspection 保持简单。

## 验证

- docs/task + docs/plan review。
