/*
Copyright 2026 Element Creations Ltd.
Copyright 2024-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixEvent } from "matrix-js-sdk/lib/models/event";

import { ElementCallReactionEventType } from "../reactions/events";

/** Legacy standalone event type, also the namespace of the termination payload. */
export const ElementCallTerminateEventType = "io.element.call.terminate";

/**
 * Native widget hosts grant this existing call-event transport, but do not
 * grant arbitrary custom event types. Every integration sends the same envelope.
 */
export const CallTerminationEventType = ElementCallReactionEventType;

export interface CallTerminationEventContent {
  [ElementCallTerminateEventType]: CallTerminateEventContent;
}

/**
 * Content structure for the call termination event.
 */
export interface CallTerminateEventContent {
  /** The user ID of the person who initiated the termination */
  terminated_by: string;
  /** Unix timestamp when the termination was initiated */
  timestamp: number;
  /** Optional reason for ending the call */
  reason?: string;
}

/**
 * Parsed termination event data for use in the application.
 */
export interface TerminationEvent {
  /** The user ID of the person who terminated the call */
  terminatedBy: string;
  /** Optional reason for ending the call */
  reason?: string;
  /** The timestamp when termination was initiated */
  timestamp: number;
}

/** A control envelope, deliberately without emoji or a reaction relation. */
export function createCallTerminationContent(
  terminatedBy: string,
): CallTerminationEventContent {
  return {
    [ElementCallTerminateEventType]: {
      terminated_by: terminatedBy,
      timestamp: Date.now(),
    },
  };
}

/** Recognise both the shared transport and the earlier standalone encoding. */
export function isCallTerminationEvent(event: MatrixEvent): boolean {
  return (
    event.getType() === ElementCallTerminateEventType ||
    (event.getType() === CallTerminationEventType &&
      event.getContent()[ElementCallTerminateEventType] !== undefined)
  );
}

/** Parse the sender-bound payload; session admission remains the reader's job. */
export function parseCallTerminationEvent(
  event: MatrixEvent,
): TerminationEvent | undefined {
  if (!isCallTerminationEvent(event) || event.isState()) return undefined;

  const content = (
    event.getType() === ElementCallTerminateEventType
      ? event.getContent()
      : event.getContent()[ElementCallTerminateEventType]
  ) as CallTerminateEventContent | null;
  if (
    !content ||
    !isPositiveFiniteNumber(event.getTs()) ||
    typeof content.terminated_by !== "string" ||
    content.terminated_by.length === 0 ||
    content.terminated_by !== event.getSender() ||
    !isPositiveFiniteNumber(content.timestamp) ||
    (content.reason !== undefined && typeof content.reason !== "string")
  ) {
    return undefined;
  }

  return {
    terminatedBy: content.terminated_by,
    reason: content.reason,
    timestamp: content.timestamp,
  };
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
