/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@vector-im/compound-web";
import { userEvent } from "@testing-library/user-event";

import { CallFooter } from "./CallFooter";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";
import { alice, local } from "../utils/test-fixtures";
import { constant } from "../state/Behavior";
import { initializeWidget } from "../widget";

initializeWidget();
vi.mock("livekit-client/e2ee-worker?worker");

it("shows send progress, disables repeated termination and keeps leave-only available", async () => {
  const { footerVm } = getBasicCallViewModelEnvironment([local, alice]);
  const hangup = vi.fn();
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <CallFooter
        vm={{
          ...footerVm,
          reactionIdentifier$: constant(undefined),
          terminationState$: constant("sending"),
          terminateCall$: constant(undefined),
          hangup$: constant(hangup),
        }}
      />
    </TooltipProvider>,
  );

  expect(screen.getByRole("status")).toHaveTextContent(
    "Sending end notification…",
  );
  await user.click(screen.getByRole("button", { name: "End call" }));
  expect(
    screen.getByRole("menuitem", { name: "End for everyone" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("menuitem", { name: "Leave call" }));
  expect(hangup).toHaveBeenCalledOnce();
});

it("shows a failed notification and lets the user retry without leaving on failure", async () => {
  const { footerVm, rtcSession, vm } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  const client = rtcSession.room.client;
  vi.mocked(client.sendEvent).mockRejectedValueOnce(
    new Error("Network failure"),
  );
  rtcSession.room.getEventForTxnId = vi.fn().mockReturnValue(undefined);
  const onLeave = vi.fn();
  vm.leave$.subscribe(onLeave);
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <CallFooter
        vm={{ ...footerVm, reactionIdentifier$: constant(undefined) }}
      />
    </TooltipProvider>,
  );

  await user.click(screen.getByRole("button", { name: "End call" }));
  await user.click(screen.getByRole("menuitem", { name: "End for everyone" }));
  await user.click(
    screen.getByRole("menuitem", { name: "End call for 2 people?" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "End notification not sent",
  );
  expect(onLeave).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(client.sendEvent).toHaveBeenCalledTimes(2);
  expect(onLeave).toHaveBeenCalledExactlyOnceWith("user");
});

it("leaves only this device when the user abandons a failed notification", async () => {
  const { footerVm, rtcSession, vm } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  const user = userEvent.setup();
  const onLeave = vi.fn();
  vm.leave$.subscribe(onLeave);
  render(
    <TooltipProvider>
      <CallFooter
        vm={{
          ...footerVm,
          reactionIdentifier$: constant(undefined),
          terminationState$: constant("failed"),
        }}
      />
    </TooltipProvider>,
  );

  await user.click(screen.getByRole("button", { name: "Leave call" }));
  expect(onLeave).toHaveBeenCalledExactlyOnceWith("user");
  expect(rtcSession.room.client.sendEvent).not.toHaveBeenCalled();
});

it("keeps video-local actions out of the call toolbar", () => {
  const { footerVm } = getBasicCallViewModelEnvironment([local, alice]);
  render(
    <TooltipProvider>
      <CallFooter
        vm={{ ...footerVm, reactionIdentifier$: constant(undefined) }}
      />
    </TooltipProvider>,
  );
  expect(
    screen.getByRole("switch", { name: /microphone/i }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Screen share volume" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Enter fullscreen" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Expand" }),
  ).not.toBeInTheDocument();
});
