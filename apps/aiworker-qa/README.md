# AIWorker QA Reference Soul App

`@zonease/aiworker-qa` is the reference QA Soul App workspace. It owns the QA
manifest, protocol handlers, standalone service, Host-mounted service, schemas,
capabilities, review policy, and release-focused app definition for regression
matrices, defect evidence, and release gate review.

The app depends on the Soul App SDK only. It does not import Host API, CLI,
Worker Web private modules, raw DB handles, engine adapters, connector tokens,
vault internals, or sibling Soul Apps.

The app is intentionally different from HR: QA workspaces are release/test-suite
oriented, and its primary artifact is a release gate decision with explicit
test evidence and residual risk.
