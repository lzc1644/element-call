---
kind: issue
title: Restore the official screen-share carousel
type: ff
status: open
created: 2026-10-06
---

# Restore the official screen-share carousel

Restore the share-only spotlight data path from `element-hq/element-call` main (`9b3c3569`): multiple screen shares can be switched in the main area while cameras remain in the participant rail. Remove camera/share pairing and the separate carousel-media state; preserve fullscreen controls, scoped media selection and the floating-window sizing fix.

- Changes: `src/state/CallViewModel/CallViewModel.ts`, layout media types/builders and `TileStore`/`TileViewModel`; matching view-model and tile tests, `src/tile/SpotlightTile.stories.tsx`, and `playwright/widget/screen-share.test.ts`.
- Verified: the share-only regression failed before the fix in both MatrixRTC modes; 98 related unit tests and 6 Chromium stories pass. Full gates pass: `pnpm lint`, `pnpm format`, `pnpm test --run` (111 files, 896 passed, 9 skipped), and `pnpm i18n:check`; `git diff --check` passes.
- Pending: confirmation in a live call. Widget e2e has not run because `https://app.m.localhost/` is unreachable locally. User authorized saving the first implementation as a local commit; no push.
- codestable: no stable-spec change; the current project spec has no conflicting carousel contract. Previous floating-window issue remains open and unchanged.
