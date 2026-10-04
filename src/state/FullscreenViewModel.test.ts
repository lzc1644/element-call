/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, it, vi } from "vitest";

import { createFullscreenViewModel } from "./FullscreenViewModel";
import { testScope } from "../utils/test";

it("tracks only this root's fullscreen events, including Escape", () => {
  const { document, root, exit } = fullscreenEnvironment();
  const scope = testScope();
  const vm = createFullscreenViewModel(scope, root);
  vm.toggleFullscreen$.value!();
  expect(root.requestFullscreen).toHaveBeenCalledOnce();
  expect(vm.fullscreen$.value).toBe(false);

  document.fullscreenElement = document.createElement("div");
  document.dispatchEvent(new Event("fullscreenchange"));
  expect(vm.fullscreen$.value).toBe(false);
  document.fullscreenElement = root;
  document.dispatchEvent(new Event("fullscreenchange"));
  expect(vm.fullscreen$.value).toBe(true);
  vm.toggleFullscreen$.value!();
  expect(exit).toHaveBeenCalledOnce();

  document.fullscreenElement = null;
  document.dispatchEvent(new Event("fullscreenchange"));
  expect(vm.fullscreen$.value).toBe(false);
  scope.end();
  document.fullscreenElement = root;
  document.dispatchEvent(new Event("fullscreenchange"));
  expect(vm.fullscreen$.value).toBe(false);
});

it("does not offer fullscreen without API support or iframe permission", () => {
  const { document, root } = fullscreenEnvironment();
  document.fullscreenEnabled = false;
  expect(
    createFullscreenViewModel(testScope(), root).toggleFullscreen$.value,
  ).toBeUndefined();
  document.fullscreenEnabled = true;
  Object.defineProperty(root, "requestFullscreen", { value: undefined });
  expect(
    createFullscreenViewModel(testScope(), root).toggleFullscreen$.value,
  ).toBeUndefined();
});

it("handles a rejected request without changing fullscreen state", async () => {
  const { root } = fullscreenEnvironment();
  vi.mocked(root.requestFullscreen).mockRejectedValue(new Error("Denied"));
  const vm = createFullscreenViewModel(testScope(), root);
  vm.toggleFullscreen$.value!();
  await Promise.resolve();
  expect(vm.fullscreen$.value).toBe(false);
});

function fullscreenEnvironment(): {
  document: Document & {
    fullscreenElement: Element | null;
    fullscreenEnabled: boolean;
  };
  root: HTMLElement;
  exit: ReturnType<typeof vi.fn>;
} {
  const document =
    window.document.implementation.createHTMLDocument() as Document & {
      fullscreenElement: Element | null;
      fullscreenEnabled: boolean;
    };
  Object.defineProperty(document, "fullscreenElement", {
    value: null,
    writable: true,
  });
  Object.defineProperty(document, "fullscreenEnabled", {
    value: true,
    writable: true,
  });
  const root = document.createElement("div");
  const exit = vi.fn().mockResolvedValue(undefined);
  document.exitFullscreen = exit;
  root.requestFullscreen = vi.fn().mockResolvedValue(undefined);
  return { document, root, exit };
}
