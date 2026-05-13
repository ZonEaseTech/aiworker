# Legacy Soul metadata and mounted surface hardening design

## Decision

This slice implements the selected follow-ups 1, 2 and 4 only. It does not add
PM, DevOps, finance, legal or ops official Soul Apps.

## Shape

Host remains app-only. Old local metadata is treated as migration debt, not as a
reason to restore Host built-in Souls. The migration maps known legacy HR/QA
rows to official app ids after official bootstrap has made the target apps
available.

Import isolation becomes both an authoring validation and a repository lint
gate. The lint gate discovers manifest-backed `apps/*` Soul Apps and rejects
Host-private imports, sibling app imports and Host imports of `apps/*/src`
internals.

Mounted surface confidence moves beyond API tests by adding a browser smoke
against a temporary local daemon. The smoke verifies that Worker Web can render
Host descriptor surfaces and sandboxed frame surfaces from a live mounted app.

## Non-goals

- No new official Soul App beyond HR/QA.
- No worker id or workspace path rename.
- No marketplace or remote install flow.
- No legacy `hr` alias for new worker creation.
