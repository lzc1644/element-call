/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";
import { constant, type LocalMedia } from "@element-hq/matrixrtc-sdk";
import { map } from "rxjs";

import { useMediaDevices } from "../MediaDevicesContext";
import { type MuteStates } from "../state/MuteStates";
import { ObservableScope } from "../state/ObservableScope";
import {
  createLobbyMediaViewModel,
  type LobbyMediaViewModel,
} from "../state/LobbyMediaViewModel";
import { useBackgroundEffectsState$ } from "../tracks/BackgroundEffectsContext";
import { useBehavior } from "../useBehavior";
import { captureSettings } from "./InCallView";

const notReady = constant(false);

/** Runs the lobby's device preparation before a direct join, on the media it will publish. */
export function usePrejoinMedia(
  muteStates: MuteStates,
  media: LocalMedia,
): { ready: boolean } {
  const devices = useMediaDevices();
  const backgroundEffectsState$ = useBackgroundEffectsState$();
  const [vm, setVm] = useState<LobbyMediaViewModel | null>(null);

  useEffect(() => {
    const scope = new ObservableScope();
    setVm(
      createLobbyMediaViewModel(
        scope,
        media,
        muteStates,
        devices,
        captureSettings(),
        scope.behavior(
          backgroundEffectsState$.pipe(map((state) => state.processor)),
        ),
      ),
    );
    return (): void => scope.end();
  }, [media, muteStates, devices, backgroundEffectsState$]);

  return { ready: useBehavior(vm?.ready$ ?? notReady) };
}
