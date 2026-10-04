/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@vector-im/compound-web";

import { CallFooter } from "./CallFooter";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";
import { alice, local } from "../utils/test-fixtures";
import { constant } from "../state/Behavior";
import { initializeWidget } from "../widget";

initializeWidget();
vi.mock("livekit-client/e2ee-worker?worker");

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
