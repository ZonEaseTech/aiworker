# Soul App Scaffold And Legacy Layout Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `aiworker app create` generate the v2 Soul App layout and remove active docs/tests that teach the old scattered layout as default.

**Architecture:** The scaffold should mirror official apps: `engine-assets/` is engine-facing source, `product/` is domain product source, and `host-adapter/` is the Host/runtime adapter. Validation must scan production code in v2 directories, while still catching legacy `src/` if a third-party app has it.

**Tech Stack:** TypeScript CLI, Bun tests, JSON manifests, Markdown/TS scaffold templates.

---

## Tasks

- [x] Update CLI scaffold tests to expect v2 paths.
- [x] Update scaffold file writes, file list, package scripts and tsconfig.
- [x] Update scaffold manifest refs to `engine-assets/`, `product/` and `host-adapter/`.
- [x] Add scaffold helper templates for workspace assets, native skill, API entry and product web placeholders.
- [x] Update validate source scanning from only `src/` to `host-adapter/`, `product/` and `src/`.
- [x] Update private import and raw Web Storage tests to write into v2 source directories.
- [x] Update active authoring docs and SDK/runtime examples that still teach old scaffold paths as default.
- [x] Run Phase 5 verification and close PMA/changelog.

## Self-Review

- Spec coverage: Phase 5 scaffold, docs, validator message/path and legacy removal are covered.
- Intentional gap: historical PMA/changelog/spec artifacts remain audit trails.
- Placeholder scan: no implementation step is left undefined.
