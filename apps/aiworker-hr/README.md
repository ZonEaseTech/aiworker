# AIWorker HR Reference Soul App

`@zonease/aiworker-hr` is the reference HR Soul App workspace. It owns the HR
manifest, protocol handlers, standalone service, Host-mounted service, schemas,
capabilities, review policy, and smoke coverage through the Soul App SDK.

The app boundary is intentional:

- HR domain logic depends on `@zonease/aiworker-soul-app-sdk`.
- It does not import Host API, CLI, Worker Web private modules, raw DB handles,
  engine adapters, connector tokens, vault internals, or sibling Soul Apps.
- Host-mounted shared-resource access remains brokered by the Host permission
  boundary; app-local calls stay inside this workspace.

The current UI reference is the People/Profile Workbench. The monorepo app
keeps the app boundary explicit before any later multi-repository split.
