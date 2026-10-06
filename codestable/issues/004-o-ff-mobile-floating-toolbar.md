---
kind: issue
title: Restore floating mobile call controls over participant tiles
type: ff
status: open
created: 2026-10-07
---

# Restore floating mobile call controls over participant tiles

User-approved local bug scope: supplied mobile screenshots show a full-width background seam, unused gradient space below a long two-column participant grid even with controls hidden, and additional reserved space around a pill toolbar when controls show. Restore individually surfaced controls floating directly over continuing tiles, preserving the intended root gradient, safe areas, focus access, and access to the final participant. This records local user authorization only; no upstream approval or issue is claimed.

Bounded seams: `CallFooter.module.css` overlay positioning/decoration and `InCallView` scrolling-member footer geometry/background. Reuse existing components and provider/container-relative layout. Preserve desktop, PiP sizing (issue 002), and the share-only carousel (issue 003); both existing issues remain open and unchanged.

Acceptance: focused unit, browser story, and mobile e2e regressions for visible/hidden controls and long-grid bottom access, plus narrow/short and iOS/Android coverage where the harness allows. First implementation handoff uses targeted checks only. Live-device and integration validation must be reported honestly; no commit, push, deployment, or issue closure.

- First implementation: mobile overlays remain absolute, surrounding toolbar/footer paint is removed without touching root gradients or button surfaces, and scrolling members retain full viewport height. Additional bottom scroll travel applies only while overflowing controls are visible, including keyboard focus reveal. Desktop geometry, fixed PiP sizing, and share carousel logic are unchanged.
- Verified: 14 InCallView unit tests and 31 related Chromium stories pass; original CSS fails all three new mobile grid geometry stories. Type checking and touched-file lint/format checks pass. Architecture code re-review reports no blockers.
- Pending: new two-device long-grid e2e and existing share-layout e2e were not executed (local app/backend probes refused connections). Physical-device/WebKit, nonzero safe-area insets, screenshot comparison, and live standalone/widget/component checks remain. Full gates intentionally deferred until first-handoff feedback.
