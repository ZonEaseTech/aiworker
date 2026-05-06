# Fleet Remote Mode

Use `fleet-remote` for shared remote fleet validation: gateway, Fleet Web UI,
enrollment, or a temporary local worker attached to the fleet.

## Inputs

- Target CLI version or "inspect current".
- Remote test server identity from `aissh` or the user.
- Whether upgrade/restart is in scope.
- Public ingress / Fleet Web UI scope.
- Local worker executor and session-continuity focus.

## Workflow

1. Start read-only:
   - inspect local `git status --short`;
   - discover target version;
   - verify remote access with `aissh`.
2. Check remote gateway:
   - service status;
   - local health endpoint;
   - installed CLI/package version;
   - sanitized log tail.
3. If upgrade is in scope:
   - install only from the already-published CLI package;
   - preserve existing remote env/config;
   - restart only the needed gateway service;
   - re-check status, health, and version.
4. For Fleet Web UI:
   - check direct `/admin/` shell and static assets first;
   - for public basic-auth ingress, use a local proxy that injects auth from
     local env;
   - do not embed credentials in URLs, screenshots, logs, or reports.
5. For fleet-attached worker E2E:
   - create temporary local AIWorker state;
   - enroll or pair through the current CLI flow;
   - start a local worker against the fleet;
   - wait until the fleet reports the worker online;
   - verify gateway-routed chat continuity, `/new` or `/reset`, and sessions
     list/show.
6. Cleanup:
   - stop the temporary local worker;
   - remove temporary credential-bearing state;
   - remove the temporary worker registration when the flow created one;
   - leave the remote fleet running unless explicitly instructed otherwise.

## Evidence

Capture sanitized evidence for:

- remote service status, health, installed version, and log tail;
- Fleet Web UI HTTP/asset/browser results when in scope;
- worker online/offline lifecycle in the fleet;
- gateway-routed conversation id, continuity, reset behavior, and cleanup.

## Boundaries

- Do not clone, build, or run source on the fleet server.
- Do not stop the shared fleet unless the user explicitly asks.
- Do not treat a fleet-attached worker campaign as local-only worker validation;
  local-only validation belongs in `worker-source-local` or `cli-release-local`.
