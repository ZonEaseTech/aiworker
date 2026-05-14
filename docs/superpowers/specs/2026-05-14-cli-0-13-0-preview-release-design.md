# CLI 0.13.0 preview release design

## Decision

Publish `@zonease/aiworker-cli@0.13.0` as a 0.x preview minor release.

The release target is the CLI npm package and the tag-triggered GitHub Release
assets. The release does not publish `@zonease/aiworker-soul-app-sdk` or
`@zonease/aiworker-soul-app-runtime` as standalone npm packages.

This is a minor release because `0.12.2..HEAD` adds a user-visible npm preview
runtime path: external users can start the local Host Web/API from the package
and bootstrap the bundled official HR/QA Soul Apps without cloning the source
repository.

This release is not a 1.0 GA release.

## Scope

In scope:

- bump the CLI package version from `0.12.2` to `0.13.0`;
- publish the CLI npm package through the existing tag-triggered release
  workflow;
- attach GitHub Release binary tarballs for the existing platform matrix;
- prove the packaged preview path through local dist checks and post-release
  published-package checks;
- record PMA release evidence in `REL-032` and `PLAN-316`;
- keep `FEAT-082` as the completed readiness slice and make this a separate
  release execution slice.

Out of scope:

- no independent SDK/runtime npm publication;
- no third-party Soul App authoring guarantee outside the monorepo;
- no Host auth implementation;
- no cloud marketplace, remote control plane or gateway/fleet scope;
- no 1.0 GA claim.

## CLI usability boundary

The CLI is usable for the preview surface because the CLI package carries the
official app runtime resources it needs.

`apps/cli/scripts/build-publish-manifest.ts` builds and copies the official
HR/QA app release resources into `apps/cli/dist/official-apps`. It patches
their manifests so Host-mounted and standalone entries point at bundled
`dist/host-mounted.js` and `dist/standalone.js` files.

The published package therefore must not need standalone SDK/runtime npm
packages to bootstrap official HR/QA. The SDK/runtime code used by official
apps is bundled into the official app runtime files during the CLI package
build.

The release does not promise that an external app author can create a new Soul
App in a separate npm project by installing SDK/runtime packages. That is a
future authoring/package-publication task.

## Release gates

### Source and build gate

Before tagging, run:

```bash
bun run check
bun run test
bun run build
git diff --check
```

The version bump must make the source CLI package and generated dist package
report `0.13.0`.

### Dist and pack gate

Before tagging, run:

```bash
bun run --filter '@zonease/aiworker-cli' build:bundle
cd apps/cli/dist && npm pack --dry-run --json
bun run --filter '@zonease/aiworker-cli' smoke:dist-release
```

The dist directory and npm pack output must include:

- `aiworker.js`;
- `aiworker-bun.js`;
- `web/`;
- `drizzle/`;
- `official-apps/aiworker-hr/dist/host-mounted.js`;
- `official-apps/aiworker-hr/dist/standalone.js`;
- `official-apps/aiworker-qa/dist/host-mounted.js`;
- `official-apps/aiworker-qa/dist/standalone.js`.

`smoke:dist-release` must prove that a fresh temp home can start the daemon,
serve Host Web, return `/api/local/apps`, run `app bootstrap official`, list
apps, list Souls and list HR templates from the dist CLI.

### Post-release gate

After pushing the annotated tag `v0.13.0`, verify:

```bash
npm view @zonease/aiworker-cli version
bunx @zonease/aiworker-cli@0.13.0 --version
gh release view v0.13.0 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url
```

The GitHub Actions release workflow must complete successfully and include npm
publish plus four uploaded binary tarballs:

- `aiworker-darwin-arm64.tar.gz`;
- `aiworker-darwin-x64.tar.gz`;
- `aiworker-linux-arm64.tar.gz`;
- `aiworker-linux-x64.tar.gz`.

The published-package validation must run a real package smoke. If the compact
governance harness still matches the current Host/Soul preview path, run it
against `0.13.0`; otherwise record why it is no longer representative and use
the dist/published package smoke as the release-specific replacement.

## Failure handling

If a local gate fails, do not tag or publish. Fix the release blocker, rerun the
gate and only then continue.

If the GitHub release workflow fails before npm publish, keep the release task
open, fix the workflow or release prep commit, and retry with a clean tag
strategy.

If npm has already published `0.13.0` and post-release smoke fails, do not try
to overwrite the version. Record the regression and publish a `0.13.1` patch
after the fix.

## Acceptance

The release is accepted when an external user can run:

```bash
bunx @zonease/aiworker-cli@0.13.0 daemon foreground --host 127.0.0.1 --port 9217
```

or:

```bash
npx @zonease/aiworker-cli@0.13.0 daemon foreground --host 127.0.0.1 --port 9217
```

and reach a working local Host Web/API that can bootstrap the bundled official
HR/QA Soul Apps and expose app-projected catalog data, without a source checkout
and without independently published SDK/runtime packages.

