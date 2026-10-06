/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  createRoomWidgetClient,
  type IEvent,
  type IRoomTimelineData,
  type MatrixClient,
  MatrixEvent,
  RoomEvent as MatrixRoomEvent,
  type Room as MatrixRoom,
} from "matrix-js-sdk";
import { WidgetApi, WidgetApiToWidgetAction } from "matrix-widget-api";
import { expect, onTestFinished, test, vi } from "vitest";

import {
  CallTerminationEventType,
  createCallTerminationContent,
  ElementCallTerminateEventType,
  isCallTerminationEvent,
  parseCallTerminationEvent,
} from ".";
import { CallTerminationReader } from "./CallTerminationReader";
import {
  localRtcMember,
  localRtcMemberDevice2,
  aliceRtcMember,
  alice,
  local,
} from "../utils/test-fixtures";
import { MockRTCSession, testScope } from "../utils/test";
import { getBasicRTCSession } from "../utils/test-viewmodel";
import { ReactionsReader } from "../reactions/ReactionsReader";

// The native Rust SDK grants this call-event type, NOT arbitrary requested types.
// get_element_call_required_permissions: matrix-sdk-ffi/src/widget.rs.
const nativeCallEventTypes = new Set(["io.element.call.reaction"]);

test("native widget rejects the old custom type but sends the shared envelope to a web participant", async () => {
  const { client, room, sentEvents } = await createNativeWidgetClient();
  await expect(
    client.sendEvent(
      room.roomId,
      ElementCallTerminateEventType,
      {
        terminated_by: localRtcMember.userId,
        timestamp: Date.now(),
      },
      "legacy",
    ),
  ).rejects.toThrow("Not allowed to send event");
  client.cancelPendingEvent(room.getEventForTxnId("legacy")!);

  await client.sendEvent(
    room.roomId,
    CallTerminationEventType,
    createCallTerminationContent(localRtcMember.userId),
  );
  expect(sentEvents).toHaveLength(1);
  expect(sentEvents[0].type).toBe("io.element.call.reaction");

  const { rtcSession } = getBasicRTCSession([local, alice]);
  const reader = new CallTerminationReader(
    testScope(),
    rtcSession.asMockedSession(),
    rtcSession.room.client,
  );
  const onTermination = vi.fn();
  reader.termination$.subscribe(onTermination);
  const event = new MatrixEvent({
    ...sentEvents[0],
    room_id: rtcSession.room.roomId,
  });
  rtcSession.room.emit(
    MatrixRoomEvent.Timeline,
    event,
    rtcSession.room,
    false,
    false,
    {
      liveEvent: true,
    } as IRoomTimelineData,
  );
  expect(onTermination).toHaveBeenCalledExactlyOnceWith({
    terminatedBy: localRtcMember.userId,
    reason: undefined,
    timestamp: expect.any(Number),
  });
});

test.each([aliceRtcMember.userId, localRtcMember.userId])(
  "web termination from %s reaches a native widget through the SDK live timeline",
  async (sender) => {
    const { client, room, receive } = await createNativeWidgetClient();
    const rtcSession = new MockRTCSession(room, [
      localRtcMember,
      localRtcMemberDevice2,
      aliceRtcMember,
    ]);
    const scope = testScope();
    const reader = new CallTerminationReader(
      scope,
      rtcSession.asMockedSession(),
      client,
    );
    const reactions = new ReactionsReader(scope, rtcSession.asMockedSession());
    const onTermination = vi.fn();
    const onReaction = vi.fn();
    reader.termination$.subscribe(onTermination);
    reactions.reactions$.subscribe(onReaction);
    const event = {
      room_id: room.roomId,
      event_id: "$web-termination:example.org",
      origin_server_ts: Date.now(),
      sender,
      type: CallTerminationEventType,
      content: createCallTerminationContent(sender),
    };

    expect(
      await receive({ ...event, type: ElementCallTerminateEventType }),
    ).toBe(false);
    expect(onTermination).not.toHaveBeenCalled();
    expect(await receive(event)).toBe(true);
    expect(onTermination).toHaveBeenCalledExactlyOnceWith({
      terminatedBy: sender,
      reason: undefined,
      timestamp: expect.any(Number),
    });
    // The control envelope neither adds a visible emoji nor starts a reaction sound.
    expect(onReaction).toHaveBeenCalledExactlyOnceWith({});
  },
);

test.each([
  { emoji: "👍", name: "thumbsup" },
  { terminated_by: localRtcMember.userId, timestamp: 12345 },
  { [ElementCallTerminateEventType]: null },
  { [ElementCallTerminateEventType]: "invalid" },
  {
    [ElementCallTerminateEventType]: {
      terminated_by: "@forged:example.org",
      timestamp: 12345,
    },
  },
])(
  "ordinary or malformed call-event content cannot terminate: %j",
  (content) => {
    const event = new MatrixEvent({
      type: CallTerminationEventType,
      event_id: "$event",
      sender: localRtcMember.userId,
      origin_server_ts: 12345,
      content,
    });
    expect(parseCallTerminationEvent(event)).toBeUndefined();
  },
);

test("only the explicit namespace identifies a termination on the call-event transport", () => {
  const event = new MatrixEvent({
    type: CallTerminationEventType,
    content: { emoji: "👍" },
  });
  expect(isCallTerminationEvent(event)).toBe(false);
  event.event.content = createCallTerminationContent(localRtcMember.userId);
  expect(isCallTerminationEvent(event)).toBe(true);
  event.event.type = "m.room.message";
  expect(isCallTerminationEvent(event)).toBe(false);
});

async function createNativeWidgetClient(): Promise<{
  client: MatrixClient;
  room: MatrixRoom;
  sentEvents: Partial<IEvent>[];
  receive: (event: Partial<IEvent>) => Promise<boolean>;
}> {
  const roomId = "!native-call:example.org";
  const api = new WidgetApi("native-widget", "https://host.example.org");
  const sentEvents: Partial<IEvent>[] = [];
  vi.spyOn(api, "start").mockImplementation(() => {
    api.emit("ready");
  });
  vi.spyOn(api, "getClientVersions").mockResolvedValue([]);
  vi.spyOn(api.transport, "reply").mockImplementation(() => {});
  vi.spyOn(api, "sendRoomEvent").mockImplementation(async (type, content) => {
    if (!nativeCallEventTypes.has(type))
      throw new Error("Not allowed to send event");
    const event_id = `$native-${sentEvents.length}:example.org`;
    sentEvents.push({
      room_id: roomId,
      event_id,
      sender: localRtcMember.userId,
      origin_server_ts: Date.now(),
      type,
      content: content as IEvent["content"],
    });
    await Promise.resolve();
    return { room_id: roomId, event_id };
  });
  const client = createRoomWidgetClient(
    api,
    {
      // Even explicitly requesting the old type cannot make the host grant it.
      sendEvent: [CallTerminationEventType, ElementCallTerminateEventType],
      receiveEvent: [CallTerminationEventType, ElementCallTerminateEventType],
    },
    roomId,
    {
      baseUrl: "https://matrix.example.org",
      userId: localRtcMember.userId,
      deviceId: localRtcMemberDevice2.deviceId,
      timelineSupport: true,
    },
    false,
  );
  await client.startClient({ clientWellKnownPollPeriod: 0 });
  onTestFinished(() => client.stopClient());
  const room = client.getRoom(roomId)!;

  async function receive(event: Partial<IEvent>): Promise<boolean> {
    if (!nativeCallEventTypes.has(event.type!)) return false;
    const acknowledged = Promise.withResolvers<void>();
    vi.mocked(api.transport.reply).mockImplementationOnce(() =>
      acknowledged.resolve(),
    );
    api.emit(
      `action:${WidgetApiToWidgetAction.SendEvent}`,
      new CustomEvent("send_event", {
        cancelable: true,
        detail: { data: event },
      }),
    );
    await acknowledged.promise;
    return true;
  }

  return { client, room, sentEvents, receive };
}
