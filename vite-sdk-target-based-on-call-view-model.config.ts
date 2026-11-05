/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { defineConfig } from "vite";

import { vitePluginsConfig } from "./vite.config";

// Config for the legacy SDK bundle that predates the sdk/ package: a single
// bundle of Element Call's CallViewModel for a plain web page or widget. It is
// in production use, so it keeps building on top of the sdk/ package until its
// consumers have moved to that package directly.
export default defineConfig(({ mode }) => ({
  ...vitePluginsConfig({ mode, html: false }),
  worker: { format: "es" as const },
  // Relative URLs, so the bundle can be hosted under any path
  base: "./",
  // Otherwise the developer's own config.json in `public` is copied into the output
  publicDir: false,
  build: {
    sourcemap: true,
    manifest: true,
    lib: {
      formats: ["es" as const],
      entry: "./sdk-target-based-on-call-view-model/main.ts",
      name: "MatrixrtcSdk",
      fileName: "matrixrtc-sdk",
    },
  },
}));
