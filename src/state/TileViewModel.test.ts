/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, it } from "vitest";
import { BehaviorSubject } from "rxjs";

import { SpotlightTileViewModel } from "./TileViewModel";
import { constant } from "./Behavior";
import { type MediaViewModel } from "./media/MediaViewModel";
import {
  mockRemoteScreenShare,
  mockRemoteParticipant,
  mockRtcMembership,
  testScope,
} from "../utils/test";

it("keeps the selected share on list updates and falls back when it ends", () => {
  const alice = share("@alice:example.org");
  const bob = share("@bob:example.org");
  const media$ = new BehaviorSubject<MediaViewModel[]>([alice, bob]);
  const vm = new SpotlightTileViewModel(
    testScope(),
    media$,
    constant(false),
    constant("solid"),
  );
  expect(vm.selectedMedia$.value).toBe(alice);
  vm.setVisibleMedia(bob.id);
  media$.next([bob, alice]);
  expect(vm.selectedMedia$.value).toBe(bob);
  media$.next([alice]);
  expect(vm.selectedMedia$.value).toBe(alice);
  media$.next([]);
  expect(vm.selectedMedia$.value).toBeUndefined();
  media$.next([bob]);
  expect(vm.selectedMedia$.value).toBe(bob);
});

it("does not select the last share for a stale observer ID", () => {
  const alice = share("@alice:example.org");
  const bob = share("@bob:example.org");
  const vm = new SpotlightTileViewModel(
    testScope(),
    constant([alice, bob]),
    constant(false),
    constant("solid"),
  );
  vm.setVisibleMedia("ended-share");
  expect(vm.selectedMedia$.value).toBe(alice);
});

function share(userId: string): MediaViewModel {
  return mockRemoteScreenShare(
    mockRtcMembership(userId, "DEVICE"),
    {},
    mockRemoteParticipant({ identity: userId }),
  );
}
