/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { type MatrixClient, type Room } from "matrix-js-sdk";
import { EventType } from "matrix-js-sdk/lib/@types/event";
import { type MatrixEvent } from "matrix-js-sdk/lib/models/event";
import {
  type RoomState,
  RoomStateEvent,
} from "matrix-js-sdk/lib/models/room-state";

import { createRTCSlot } from "./RTCSlot";
import { type RTCSlotOptions } from "./api";
import { MatrixRTCSessionEvent } from "matrix-js-sdk/lib/matrixrtc";
import { MatrixRTCMode } from "./config";
import { E2eeType } from "./encryption";
import {
  mockEmitter,
  mockMatrixRoomMember,
  mockRtcMembership,
  MockRTCSession,
  testScope,
} from "./utils/test";

const options: RTCSlotOptions = {
  matrixRTCMode: MatrixRTCMode.Compatibility,
  encryptionSystem: { kind: E2eeType.NONE },
};

function setup(): {
  client: MatrixClient;
  room: Room;
  session: MockRTCSession;
} {
  const room = {
    ...mockEmitter(),
    roomId: "!room:example.org",
    getMembersWithMembership: (): [] => [],
  } as unknown as Room;
  const session = new MockRTCSession(room);
  const client = {
    getUserId: (): string => "@alice:example.org",
    getDeviceId: (): string => "AAAA",
    matrixRTC: { getRoomSession: (): MockRTCSession => session },
  } as unknown as MatrixClient;
  return { client, room, session };
}

describe("createRTCSlot", () => {
  it("keeps membership event metadata current when a legacy member is reused", () => {
    const { client, room, session } = setup();
    const first = mockRtcMembership("@alice:example.org", "AAAA", {
      membership: { created_ts: 1000 },
    });
    const renewed = mockRtcMembership("@alice:example.org", "AAAA", {
      membership: { created_ts: 5000 },
    });
    room.getMembersWithMembership = () => [mockMatrixRoomMember(first)];
    session.memberships = [first];
    const slot = createRTCSlot(testScope(), client, room, options);
    const member = slot.members$.value[0];
    expect(member.membershipEvent$.value).toEqual({
      eventId: first.eventId,
      createdTs: 1000,
    });

    session.memberships = [renewed];
    session.emit(MatrixRTCSessionEvent.MembershipsChanged, [first], [renewed]);

    expect(slot.members$.value[0]).toBe(member);
    expect(member.membershipEvent$.value).toEqual({
      eventId: renewed.eventId,
      createdTs: 5000,
    });
  });

  describe("status$", () => {
    it("is undefined while the room has no slot event", () => {
      const { client, room } = setup();
      const slot = createRTCSlot(testScope(), client, room, options);
      expect(slot.status$.value).toBeUndefined();
    });

    it("follows the slot event", () => {
      const { client, room, session } = setup();
      session.rtcSlot = { status: "open" };
      const slot = createRTCSlot(testScope(), client, room, options);
      expect(slot.status$.value).toBe("open");

      session.rtcSlot = { status: "closed" };
      room.emit(
        RoomStateEvent.Events,
        { getType: (): string => EventType.RTCSlot } as MatrixEvent,
        {} as RoomState,
        null,
      );
      expect(slot.status$.value).toBe("closed");
    });
  });
});
