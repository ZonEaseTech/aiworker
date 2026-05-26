---
name: aiworker-real-e2e
description: Use when running AIWorker real end-to-end audits, release-bound E2E, installed-package validation, or bug-hunt passes across CLI, local daemon, Worker Web, Soul App mounted surfaces, and external engines.
---

# AIWorker Real E2E

## Core Rule

Run the product as an operator would. Do not accept mocks, fake homes, source-only installs, or smoke tests as completion when the request asks for real E2E.

## Required Lanes

1. Source-dev lane:
   - Use `~/.aiworker-dev`.
   - Start real local daemon and Worker Web from the checkout.
   - Exercise CLI, daemon API, Worker Web, official Soul App install/enable, workspace/session creation, mounted surfaces, and real Codex/Claude Code engine calls when authenticated.

2. Release lane:
   - Confirm current npm dist-tag, GitHub release, local version, and target version before changing anything.
   - Stay below `1.0.0` unless the user explicitly approves otherwise.
   - Run focused release gates, package-content checks, and UI checks before tagging.
   - Use the formal tag/release workflow. Do not treat local tarballs or source installs as the published artifact.
   - Verify npm and GitHub Release both show the target version before installed testing.

3. Installed lane:
   - Use `~/.aiworker`.
   - Install from the published npm package or release artifact, pinned to the verified target version.
   - Repeat CLI, daemon, Worker Web, mounted Soul App, and real engine flows from the installed artifact.

## Browser Expectations

- Use browser automation for Worker Web and mounted Soul App surfaces.
- Check desktop and mobile widths.
- Record style shifts, clipped controls, overflow, unreadable states, dead clicks, confusing empty states, and blocked flows.
- Do not dismiss P2/P3 issues just because the main happy path works.

## Evidence

- Put temporary evidence under `tmp/real-e2e-audit-YYYY-MM-DD-roundN/`.
- Save command output, screenshots, API payloads, IDs, artifact paths, release run URLs, npm metadata, and GitHub release metadata.
- Report workerId, workspaceId, and sessionId when possible; names are secondary.
- Keep secrets out of logs, prompts, reports, and skill files.

## Stop Conditions

- If publish fails after the package builds and npm rejects the token or permission, stop the installed lane and report the external blocker with exact evidence.
- If a real engine call fails, separate engine readiness/auth failure from Host lifecycle or UI behavior.
- Do not mark the round complete until source-dev, formal release, and installed lanes are all handled or a true external blocker is documented.
