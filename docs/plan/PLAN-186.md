# PLAN-186 Worker Admin Cases UI

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 05:55
- **task**: FEAT-057

## Context

Worker Admin currently surfaces Brain summary, admission proposals, artifacts,
and chat. It does not provide a Case-centered review workflow.

## Proposal

Add a Cases view with:

- review queue grouped by decision status;
- case detail showing Outcome, Evidence, Risk, Lessons;
- links/actions for rerun and lesson proposal;
- raw Journal available as secondary/debug detail.

## Scope

- Worker Admin UI only.
- Reuse existing shared UI primitives and design tokens.
- No Fleet UI changes in this plan.

## Risks

- UI can become a trace dashboard if it over-emphasizes event streams.
- Text density must stay useful for repeated operator review.

## Verification

- Web build.
- Focused component/query behavior tests if existing patterns support them.
- Manual browser smoke if a dev server is started.

## Notes

- 2026-05-09 06:45：完成 Worker Admin `/cases` 视图。面板以 Case list +
  Case detail 为主入口，展示 Review Decision、Work Order、Risk、Evidence 和
  Lessons Queue，并提供 rerun / propose lessons operator action。Web API client、
  React Query hooks、route/nav、routeTree 和 focused UI/API tests 已同步。
