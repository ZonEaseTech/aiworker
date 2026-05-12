# PLAN-289 Soul App developer onboarding and validation harness

- **status**: pending
- **owner**: local
- **createdAt**: 2026-05-12 21:00
- **relatedTask**: FEAT-065

## Current State

AIWorker 目前适合熟悉仓库的核心开发者继续推进，但对新开发者而言，Host runtime、
Worker Web、Soul workbench、engine adapter、artifact/review/memory 等概念仍然过重。
Soul App 架构要吸引更多开发者，必须提供可执行的 authoring path 和 validation harness。

## Decision

把开发者入口设计成 app authoring workflow：

```text
create app
-> edit manifest/domain/capabilities/UI/API
-> run local validation
-> run standalone smoke
-> mount into Host smoke
-> submit with PMA plan and review evidence
```

开发者不需要理解 Host 私有模块，只需要遵守 Soul App protocol、SDK 和 brokered
permissions。

## Proposal

### 1. Scaffold Command

提供：

```text
aiworker app create <id>
```

生成：

- manifest；
- domain system；
- capability template；
- artifact schema；
- review rubric；
- UI route/panel stub；
- API handler stub；
- tests；
- README and PMA checklist。

### 2. Validation Command

提供：

```text
aiworker app validate <path>
aiworker app smoke <path>
```

校验：

- manifest schema；
- protocol handlers；
- permission declarations；
- artifact schemas；
- UI contribution entries；
- standalone boot；
- Host mounted boot。

### 3. Developer Documentation

新增或刷新 docs，覆盖：

- Host vs Soul App ownership；
- Soul Pack vs Soul App；
- manifest examples；
- UI slot rules；
- connector broker rules；
- storage namespace rules；
- review/memory admission；
- testing and review checklist。

### 4. Acceptance Harness

Harness 输出机器和人都能读的结果：

- manifest status；
- standalone status；
- mounted status；
- artifact smoke status；
- review/memory smoke status；
- permission and connector warnings；
- browser smoke URL/screenshot path if relevant。

### 5. Contribution Workflow

把 PMA 和 code-review-graph 连接到 Soul App 贡献：

- 每个新 app 必须有 FEAT + PLAN；
- 每个 app 必须有 standalone and mounted evidence；
- UI app 必须有 browser smoke；
- code changes must run code-review-graph review before final。

## Scope

In scope:

- CLI scaffold and validation commands.
- Template app files.
- Local validation harness.
- Standalone and mounted smoke fixtures.
- Developer docs and contribution checklist.
- Failure reporting and UX.

Out of scope:

- Marketplace publishing.
- Automatic app code generation beyond stubs.
- Remote CI service.
- Third-party security review program.

## Risks

- **模板过度复杂**：新开发者被示例吓退。
  Mitigation: scaffold minimal app first, add optional examples separately.
- **验证不够真实**：只校验 schema 无法发现 mount/UX 问题。
  Mitigation: require standalone and mounted smoke plus browser check for UI apps.
- **贡献绕过架构边界**：开发者直接改 Host private modules。
  Mitigation: docs and checks flag Host-private imports from app packages.

## Verification Plan

- Scaffold snapshot tests。
- Validation command tests with valid and invalid fixtures。
- Generated app standalone smoke。
- Generated app Host mounted smoke。
- Browser smoke for generated UI。
- Docs link check or focused doc review。
- `git diff --check`。
- code-review-graph update/review after code changes。

## Progress

- 2026-05-12 21:00: Drafted as a full developer onboarding and validation
  feature plan. No implementation started.
