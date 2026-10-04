/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, it } from "vitest";

import { TileStore } from "./TileStore";
import {
  mockRemoteScreenShare,
  mockRemoteParticipant,
  mockRtcMembership,
  testScope,
} from "../utils/test";

it("reuses spotlight subscriptions, but releases each removed spotlight", () => {
  const scope = testScope();
  const alice = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "A"),
    {},
    mockRemoteParticipant({}),
  );
  let tiles = TileStore.empty(scope);
  for (let i = 0; i < 10; i++) {
    const add = tiles.from(Infinity);
    add.registerSpotlight([alice], false);
    tiles = add.build();
    const spotlight = tiles.spotlightTile!;
    expect(spotlight.media$.observed).toBe(true);
    const reuse = tiles.from(Infinity);
    reuse.registerSpotlight([alice], true);
    tiles = reuse.build();
    expect(tiles.spotlightTile).toBe(spotlight);
    expect(spotlight.media$.observed).toBe(true);
    tiles = tiles.from(Infinity).build();
    expect(tiles.spotlightTile).toBeUndefined();
    expect(spotlight.media$.observed).toBe(false);
  }
});

it("releases an active spotlight when the call scope ends", () => {
  const scope = testScope();
  const update = TileStore.empty(scope).from(Infinity);
  update.registerSpotlight([], false);
  const spotlight = update.build().spotlightTile!;
  expect(spotlight.media$.observed).toBe(true);
  scope.end();
  expect(spotlight.media$.observed).toBe(false);
});
