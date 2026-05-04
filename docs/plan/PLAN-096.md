# PLAN-096 Project scope business-scope boundary docs

- **status**: completed
- **createdAt**: 2026-05-04 13:13
- **completedAt**: 2026-05-04 13:33
- **relatedTask**: FEAT-053

## 现状

远端已经完成 FEAT-050 / PLAN-088，并把 Project Brain 的五类资产模型、
brain-first onboarding 与 admission roadmap 收口为 completed。继续编辑这些已完成
PMA 槽位会让扫盘误判该工作已经包含本会话新增的 scope 语义决策。

同时，Project Brain 的 “Project” 容易被误读为 software project 或代码仓库；
但产品语义应是 worker 在 host/workspace 维度绑定的业务作用域。

## 方案

新建独立 PMA 槽位，补充 Project scope 边界：

1. 在 AGENTS.md 写成协作硬约束：Project scope 是 worker-bound business scope。
2. 在 README 顶部定位与 Features 中说明 Project Brain 是每个业务作用域一份。
3. 在 docs/architecture.md Product Positioning、topology 和 brain layout 旁说明
   Soul 才解释领域对象、审核、归档、备份和审计语义。
4. 在 changelog 中以 FEAT-053 / PLAN-096 记录该决策。

## 范围

- AGENTS.md。
- README.md。
- docs/architecture.md。
- docs/changelog.md。
- docs/task/FEAT-053.md。
- docs/plan/PLAN-096.md。
- docs/task/index.md。
- docs/plan/index.md。

## 非范围

- 不修改 completed 的 FEAT-050 / PLAN-088 文件内容。
- 不新增代码、schema、CLI 命令或 UI。
- 不实现 HR/legal/finance/ops 的具体 Soul schema。

## 风险

1. Project 名称沿用历史 filesystem layout，仍可能造成误读；文档必须同时写明
   `<project>/.aiworker/` 是 layout 命名，产品语义是 business scope。
2. developer 相关示例容易继续主导设计；非 developer Soul 示例必须出现在
   AGENTS.md / README / architecture 这些高权重入口。

## 验证

- `git diff --cached --check`。
- conflict marker scan。

## 进度

- 2026-05-04 13:13：文档改动已 staged；等待本会话 review 后再收口 completed。
- 2026-05-04 13:33：本会话 review 完成，收口为 completed。验证：
  - `git diff --check` ✅ 无 trailing whitespace / mixed indentation
  - `rg -n "^<{7}|^>{7}|^={7}$" --glob '!**/node_modules/**' --glob '!**/dist/**'` ✅ 无真实 conflict marker
  - AC1/2/3 grep 全部命中：AGENTS.md line 23-24/75、README.md line 60、docs/architecture.md topology 节点 / Product Positioning / filesystem layout 段
  - 已 completed 的 FEAT-050 / PLAN-088 文件与 changelog 条目均未被回写
