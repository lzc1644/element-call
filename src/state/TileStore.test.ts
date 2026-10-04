/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, it } from "vitest";

import { TileStore } from "./TileStore";
import {
  mockRemoteScreenShare,
  mockRemoteMedia,
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

it("keeps carousel cameras in the grid while reusing scoped spotlight selection", () => {
  const scope = testScope();
  const membership = mockRtcMembership("@alice:example.org", "A");
  const participant = mockRemoteParticipant({});
  const camera = mockRemoteMedia(membership, {}, participant);
  const share = mockRemoteScreenShare(membership, {}, participant);
  const add = TileStore.empty(scope).from(Infinity);
  add.registerSpotlight([share], false, "solid", [share, camera]);
  add.registerGridTile(camera);
  let tiles = add.build();
  const spotlight = tiles.spotlightTile!;
  expect(spotlight.layoutMedia$.value).toEqual([share]);
  expect(spotlight.media$.value).toEqual([share, camera]);
  expect(tiles.gridTilesByMedia.has(camera)).toBe(true);

  spotlight.setVisibleMedia(camera.id);
  const reuse = tiles.from(Infinity);
  reuse.registerSpotlight([share], true, "solid", [share, camera]);
  reuse.registerGridTile(camera);
  tiles = reuse.build();
  expect(tiles.spotlightTile).toBe(spotlight);
  expect(spotlight.selectedMedia$.value).toBe(camera);

  const stopSharing = tiles.from(Infinity);
  stopSharing.registerSpotlight([camera], false);
  stopSharing.registerGridTile(camera);
  tiles = stopSharing.build();
  expect(spotlight.media$.value).toEqual([camera]);
  expect(spotlight.layoutMedia$.value).toEqual([camera]);
  expect(spotlight.selectedMedia$.value).toBe(camera);
  spotlight.setVisibleMedia(share.id);
  expect(spotlight.selectedMedia$.value).toBe(camera);
  expect(tiles.gridTiles).toHaveLength(0);

  tiles.from(Infinity).build();
  expect(spotlight.media$.observed).toBe(false);
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
