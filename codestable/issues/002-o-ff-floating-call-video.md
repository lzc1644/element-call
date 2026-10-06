---
kind: issue
title: Restore media dimensions in the floating call window
type: ff
status: open
created: 2026-10-06
---

# Restore media dimensions in the floating call window

The PiP branch renders SpotlightTile directly inside the media area, whereas normal layouts use Grid to position and size tiles. Without explicit sizing, the direct tile's contained media collapses to zero height. Position that tile against the media area; keep PiP layout ownership in InCallView, with no media/view-model special cases.

- Changes: `src/room/InCallView.module.css`; CSS regression stories in `src/room/PipLayout.stories.tsx` and their LiveKit pre-bundling in `.storybook/main.ts`; production resize/restore coverage in `src/room/InCallView.test.tsx`; visible/playable camera and share assertions in the existing widget e2e specs.
- Verified: both Chromium stories failed with height 0 before the CSS fix and pass at 300/600/300 after it; InCallView's 11 unit tests pass, including two production PiP/restore cycles. Full gates pass: `pnpm lint`, `pnpm format`, `pnpm test --run` (111 files, 896 passed, 9 skipped), and `pnpm i18n:check`; `git diff --check` passes.
- Pending: confirmation in the user's live call. Widget e2e has not run: its `https://app.m.localhost/` endpoint is not reachable locally. Stories verify layout, not live playback. Unit execution emits jsdom warnings for existing modern CSS syntax.
- codestable: no stable-spec change; this restores the existing container-relative layout contract. User authorized saving a local commit; no push.
