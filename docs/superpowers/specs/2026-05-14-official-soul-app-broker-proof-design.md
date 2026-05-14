# Official Soul App broker proof design

## Decision

The next convergence step is not another platform abstraction. It is a proof
closure: official HR/QA Soul Apps must exercise the Host broker and security
review capabilities that already exist.

## Current State

- Host has a manifest/protocol/search broker path.
- Shared manifest schema accepts `search` permissions.
- Core broker enforces `search:read/write:<appId>`.
- Official HR/QA manifests do not declare search permissions.
- HR/QA mounted search returns app-local static results instead of broker index
  records.
- Settings shows permission information but enables apps without using
  security-review `canEnable` as a gate.

## Target Design

Host remains the platform boundary:

- validate descriptor `requiredPermissions`, including `search`;
- expose broker search routes and security review;
- block enable when security review says the app cannot be enabled;
- never interpret HR profile or QA release semantics.

Soul Apps remain the domain owners:

- declare search read/write permissions in manifest;
- decide when actions publish descriptors;
- publish only non-authoritative title/summary/reference/scope metadata through
  SDK broker helpers;
- query broker index in mounted search, with app-local fallback when no Host
  broker context is present.

## Scope

This design covers HR/QA official apps, API descriptor permission parsing, Web
Settings enable gating, tests, PMA records and verification. It intentionally
does not implement a full standalone product shell or persistent search storage.

## Risks

- Broker search must stay descriptor-only; storing domain payloads would violate
  the Host/Soul boundary.
- Settings must not become an HR/QA-specific approval workflow.
- Tests should prove official manifests, not only synthetic test manifests.

## Acceptance

- Official HR/QA validate and smoke pass with search permissions.
- Mounted actions write search descriptors through Host broker when mounted.
- Mounted search can return broker-indexed results.
- Security review blocks enable for `canEnable=false`.
- Focused and root gates pass.
