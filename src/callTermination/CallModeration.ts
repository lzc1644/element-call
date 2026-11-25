/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

export const CALL_CONTROL_KEY = "io.element.call.moderate";

export type CallModerationAction = "mute" | "remove";
export type CallModerationErrorCode = "unavailable" | "gone" | "failed";

export type CallControlMember = {
  user_id: string;
  member_id: string;
  joined_ts: number | null;
};

type CallControlPacket = {
  id: string;
  from: CallControlMember;
  to: CallControlMember;
} & (
  | { kind: "request"; action: CallModerationAction }
  | { kind: "response"; result: "ok" | "failed" }
);

const TIMEOUT_MS = 10_000;
const MAX_EVENT_AGE_MS = 30_000;

export function callControlMember(
  userId: string,
  deviceId: string,
  memberId: string,
  joinedTs: number,
): CallControlMember {
  return {
    user_id: userId,
    member_id: memberId,
    // State memberships reuse this ID across calls. Sticky membership IDs are
    // unique per join and survive event refreshes with a new server timestamp.
    joined_ts: memberId === `${userId}:${deviceId}` ? joinedTs : null,
  };
}

function sameMember(a: CallControlMember, b: CallControlMember): boolean {
  return (
    a.user_id === b.user_id &&
    a.member_id === b.member_id &&
    a.joined_ts === b.joined_ts
  );
}

function isMember(value: unknown): value is CallControlMember {
  return (
    typeof value === "object" &&
    value !== null &&
    "user_id" in value &&
    typeof value.user_id === "string" &&
    value.user_id.length > 0 &&
    "member_id" in value &&
    typeof value.member_id === "string" &&
    value.member_id.length > 0 &&
    "joined_ts" in value &&
    (value.joined_ts === null ||
      (typeof value.joined_ts === "number" &&
        Number.isSafeInteger(value.joined_ts) &&
        value.joined_ts > 0))
  );
}

function parsePacket(value: unknown): CallControlPacket | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    value.id.length > 64 ||
    !("from" in value) ||
    !isMember(value.from) ||
    !("to" in value) ||
    !isMember(value.to) ||
    !("kind" in value)
  )
    return undefined;
  const packet = { id: value.id, from: value.from, to: value.to };
  if (
    value.kind === "request" &&
    "action" in value &&
    (value.action === "mute" || value.action === "remove")
  ) {
    return { ...packet, kind: "request", action: value.action };
  }
  if (
    value.kind === "response" &&
    "result" in value &&
    (value.result === "ok" || value.result === "failed")
  ) {
    return { ...packet, kind: "response", result: value.result };
  }
  return undefined;
}

export type CallModerationEventContent = {
  [CALL_CONTROL_KEY]: CallControlPacket;
};

type CallControlOptions = {
  local: () => CallControlMember | undefined;
  members: () => readonly CallControlMember[];
  send: (content: CallModerationEventContent) => Promise<unknown>;
  mute: () => Promise<boolean>;
  remove: () => void;
};

export function createCallModeration({
  local,
  members,
  send,
  mute,
  remove,
}: CallControlOptions) {
  let pending:
    | {
        packet: CallControlPacket;
        finish: (error: CallModerationErrorCode | null) => void;
      }
    | undefined;
  let disposed = false;
  const received = new Map<string, number>();

  return {
    async request(
      target: CallControlMember,
      action: CallModerationAction,
    ): Promise<CallModerationErrorCode | null> {
      const from = local();
      if (disposed || pending) return "unavailable";
      if (
        !from ||
        sameMember(from, target) ||
        !members().some((member) => sameMember(member, target))
      )
        return "gone";
      const packet = {
        id: crypto.randomUUID(),
        from,
        to: target,
        kind: "request",
        action,
      } as const;
      return new Promise((resolve) => {
        const timer = setTimeout(() => finish("unavailable"), TIMEOUT_MS);
        const finish = (error: CallModerationErrorCode | null) => {
          if (pending?.packet !== packet) return;
          pending = undefined;
          clearTimeout(timer);
          resolve(error);
        };
        pending = { packet, finish };
        void send({ [CALL_CONTROL_KEY]: packet }).catch(() => finish("failed"));
      });
    },

    async receive(
      content: unknown,
      sender: string,
      eventTs: number,
    ): Promise<void> {
      const own = local();
      const packet = parsePacket(content);
      if (
        disposed ||
        !own ||
        !packet ||
        sender !== packet.from.user_id ||
        !sameMember(packet.to, own) ||
        sameMember(packet.from, own) ||
        !Number.isSafeInteger(eventTs) ||
        eventTs <= 0 ||
        Math.abs(Date.now() - eventTs) > MAX_EVENT_AGE_MS
      )
        return;

      if (packet.kind === "response") {
        if (
          pending?.packet.id === packet.id &&
          sameMember(pending.packet.to, packet.from)
        )
          pending.finish(packet.result === "ok" ? null : "failed");
        return;
      }

      if (!members().some((member) => sameMember(member, packet.from))) return;
      for (const [key, ts] of received) {
        if (Date.now() - ts > MAX_EVENT_AGE_MS) received.delete(key);
      }
      const key = JSON.stringify([
        packet.from.user_id,
        packet.from.member_id,
        packet.from.joined_ts,
        packet.id,
      ]);
      if (received.has(key)) return;
      if (received.size >= 256) return;
      received.set(key, eventTs);

      const ok = packet.action === "remove" || (await mute());
      const current = local();
      if (disposed || !current || !sameMember(current, own)) return;
      const response = send({
        [CALL_CONTROL_KEY]: {
          id: packet.id,
          from: own,
          to: packet.from,
          kind: "response",
          result: ok ? "ok" : "failed",
        },
      }).catch(() => {});
      if (packet.action !== "remove") return;
      // An embedded client can be destroyed as soon as it hangs up. Let the
      // response reach its host first, but never block removal on the network.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2_000);
        void response.then(() => {
          clearTimeout(timer);
          resolve();
        });
      });
      const remaining = local();
      if (!disposed && remaining && sameMember(remaining, own)) remove();
    },

    dispose(): void {
      disposed = true;
      pending?.finish("gone");
      received.clear();
    },
  };
}
