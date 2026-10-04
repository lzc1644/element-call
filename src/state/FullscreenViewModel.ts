/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fromEvent, map, startWith } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { type Behavior, constant } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";

export interface FullscreenViewModel {
  fullscreen$: Behavior<boolean>;
  toggleFullscreen$: Behavior<(() => void) | undefined>;
}

/** Browser fullscreen belongs to this call's root, not to the hosting page. */
export function createFullscreenViewModel(
  scope: ObservableScope,
  root: HTMLElement,
): FullscreenViewModel {
  const document = root.ownerDocument;
  const fullscreen$ = scope.behavior(
    fromEvent(document, "fullscreenchange").pipe(
      startWith(undefined),
      map(() => document.fullscreenElement === root),
    ),
  );
  const supported =
    document.fullscreenEnabled &&
    typeof root.requestFullscreen === "function" &&
    typeof document.exitFullscreen === "function";

  const toggleFullscreen = (): void => {
    const request = fullscreen$.value
      ? document.exitFullscreen()
      : root.requestFullscreen();
    void request.catch((error: unknown) => {
      // Do not optimistically change state: denied iframe permissions and
      // failed requests must leave the button reflecting the browser's state.
      logger.warn("Could not toggle call fullscreen", error);
    });
  };

  return {
    fullscreen$,
    toggleFullscreen$: constant(supported ? toggleFullscreen : undefined),
  };
}
