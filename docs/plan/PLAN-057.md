# PLAN-057 清理陈旧 PMA 待办状态

- **status**: completed
- **createdAt**: 2026-05-01 14:53
- **approvedAt**: 2026-05-01 14:53
- **completedAt**: 2026-05-01 14:53
- **relatedTask**: DOC-004

## 现状

DOC-003 / PLAN-056 已经关闭最危险的 FEAT-031 / PLAN-021 旧 master epic，并标明 Brain capability 与 Executor capability 的边界。继续检查索引后，仍有一批 pending / in_progress 事项会误导后续开发：

1. FEAT-032 / PLAN-022 和 FEAT-037 / PLAN-028 已被子任务实质完成，但大 epic 还停留在 in_progress。
2. FEAT-039 / PLAN-041 已完成 init / Soul / doctor / capability 静态 validation / executor 边界拆分；剩余 S4-S6 已经不适合继续挂在同一大计划里。
3. FEAT-002、FEAT-007、FEAT-008 是早期远期占位，缺少当前需求锚点。
4. FEAT-010 引用旧 dashboard registry REST/OpenAPI 结构，当前 fleet control plane 已改为 gateway WS。
5. BUG-006、BUG-010、BUG-038 和 FEAT-042 仍有当前代码证据，应该保留。

## 方案

1. 完成已吸收的 epic：
   - FEAT-032 / PLAN-022 标记 completed，记录 Web UI 已由后续 phase 交付。
   - FEAT-037 / PLAN-028 标记 completed，记录 S1-S5 已完成，剩余事项另起。
2. 关闭过宽计划：
   - FEAT-039 / PLAN-041 标记 closed / rejected，说明当前 MVP 已完成，剩余 S4-S6 按新边界重开。
3. 关闭陈旧占位：
   - FEAT-002、FEAT-007、FEAT-008、FEAT-010 标记 closed。
4. 保留有效项：
   - BUG-006、BUG-010、BUG-038 保持 pending，补 current-scope note。
   - FEAT-042 保持 pending；PLAN-051 status 从 `proposed` 规范为 `draft`，补边界说明。

## 风险

1. **误关真实需求**：所有关闭项都保留重开条件，未来可以按新上下文重新发起。
2. **completed 与 closed 混淆**：已由子任务交付的 epic 用 completed；范围过宽或陈旧的入口用 closed/rejected。
3. **能力边界漂移**：保留项全部加 current-scope note，尤其 executable skill 与 executor plugin、brain/runtime MCP 与 executor-native MCP 不混用。

## 工作量

文档状态治理，不涉及代码、schema、测试数据或发布产物。

## 备选方案

1. 保留所有 pending 作为 backlog：不采用，会继续误导开发成员。
2. 删除旧任务文件：不采用，PMA 历史需要保留。
3. 为每个剩余方向立即新建替代任务：暂不采用，用户倾向需要时重新发起；本轮只清理旧入口。

## 批注

- 2026-05-01 14:53：用户确认按建议处理。
