/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, expect, vi, onTestFinished } from "vitest";
import {
  act,
  fireEvent,
  isInaccessible,
  render,
  screen,
} from "@testing-library/react";
import { axe } from "vitest-axe";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@vector-im/compound-web";
import { BehaviorSubject } from "rxjs";

import { SpotlightTile } from "./SpotlightTile";
import {
  mockLocalParticipant,
  mockMediaDevices,
  mockRtcMembership,
  mockLocalMedia,
  mockRemoteMedia,
  mockRemoteParticipant,
  mockRemoteScreenShare,
  testScope,
} from "../utils/test";
import { SpotlightTileViewModel } from "../state/TileViewModel";
import { constant } from "../state/Behavior";
import { RootElementProvider } from "../RootElementContext";
import { type RemoteScreenShareViewModel } from "../state/media/RemoteScreenShareViewModel";
import {
  createRingingMedia,
  type RingingMediaViewModel,
} from "../state/media/RingingMediaViewModel";

global.IntersectionObserver = class MockIntersectionObserver {
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
} as unknown as typeof IntersectionObserver;

test("SpotlightTile is accessible", async () => {
  const vm1 = mockRemoteMedia(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      rawDisplayName: "Alice",
      getMxcAvatarUrl: () => "mxc://adfsg",
    },
    mockRemoteParticipant({}),
  );

  const vm2 = mockLocalMedia(
    mockRtcMembership("@bob:example.org", "BBBB"),
    {
      rawDisplayName: "Bob",
      getMxcAvatarUrl: () => "mxc://dlskf",
    },
    mockLocalParticipant({}),
    mockMediaDevices({}),
  );

  const user = userEvent.setup();
  const toggleExpanded = vi.fn();
  const { container } = render(
    <SpotlightTile
      vm={
        new SpotlightTileViewModel(
          testScope(),
          constant([vm1, vm2]),
          constant(false),
          constant("solid"),
        )
      }
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={toggleExpanded}
      showIndicators
      showNameTags
      showRingingStatus
      focusable={true}
    />,
  );

  expect(await axe(container)).toHaveNoViolations();
  // Alice should be in the spotlight, with her name and avatar on the
  // first page
  screen.getByText("Alice");
  const aliceAvatar = screen.getByRole("img");
  expect(screen.queryByRole("button", { name: "common.back" })).toBe(null);
  // Bob should be out of the spotlight, and therefore invisible
  expect(isInaccessible(screen.getByText("Bob"))).toBe(true);
  // Now navigate to Bob
  await user.click(screen.getByRole("button", { name: "Next" }));
  screen.getByText("Bob");
  expect(screen.getByRole("img")).not.toBe(aliceAvatar);
  expect(isInaccessible(screen.getByText("Alice"))).toBe(true);
  // Can toggle whether the tile is expanded
  await user.click(screen.getByRole("button", { name: "Expand" }));
  expect(toggleExpanded).toHaveBeenCalled();
});

test("Screen share volume UI is shown when screen share has audio", async () => {
  const vm = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {},
    mockRemoteParticipant({}),
  );

  vi.spyOn(vm, "audioEnabled$", "get").mockReturnValue(constant(true));

  const toggleExpanded = vi.fn();
  const { container } = render(
    <TooltipProvider>
      <SpotlightTile
        vm={
          new SpotlightTileViewModel(
            testScope(),
            constant([vm]),
            constant(false),
            constant("solid"),
          )
        }
        targetWidth={300}
        targetHeight={200}
        expanded={false}
        onToggleExpanded={toggleExpanded}
        showIndicators
        showNameTags
        showRingingStatus
        focusable
      />
    </TooltipProvider>,
  );

  expect(await axe(container)).toHaveNoViolations();

  // Volume menu button should exist
  expect(screen.queryByRole("button", { name: /volume/i })).toBeInTheDocument();
});

test("Screen share volume UI is hidden when screen share has no audio", async () => {
  const vm = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {},
    mockRemoteParticipant({}),
  );

  vi.spyOn(vm, "audioEnabled$", "get").mockReturnValue(constant(false));

  const toggleExpanded = vi.fn();
  const { container } = render(
    <SpotlightTile
      vm={
        new SpotlightTileViewModel(
          testScope(),
          constant([vm]),
          constant(false),
          constant("solid"),
        )
      }
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={toggleExpanded}
      showIndicators
      showNameTags
      showRingingStatus
      focusable
    />,
  );

  expect(await axe(container)).toHaveNoViolations();

  // Volume menu button should not exist
  expect(
    screen.queryByRole("button", { name: /volume/i }),
  ).not.toBeInTheDocument();
});

test("switching shares closes the old root-local popup and controls only the new share", () => {
  const alice = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "A"),
    {},
    mockRemoteParticipant({}),
  );
  const bob = mockRemoteScreenShare(
    mockRtcMembership("@bob:example.org", "B"),
    {},
    mockRemoteParticipant({}),
  );
  const bobAudio$ = new BehaviorSubject(true);
  vi.spyOn(alice, "audioEnabled$", "get").mockReturnValue(constant(true));
  vi.spyOn(bob, "audioEnabled$", "get").mockReturnValue(bobAudio$);
  const media$ = new BehaviorSubject([alice, bob]);
  const { spotlight, root } = renderSharingSpotlight(media$);
  fireEvent.click(screen.getByRole("button", { name: "Screen share volume" }));
  expect(root.contains(screen.getByRole("dialog"))).toBe(true);
  fireEvent.keyDown(screen.getByRole("slider", { name: "Volume" }), {
    key: "ArrowLeft",
  });
  expect(alice.playbackVolume$.value).toBe(0.99);
  act(() => spotlight.setVisibleMedia(bob.id));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Screen share volume" }));
  fireEvent.keyDown(screen.getByRole("slider", { name: "Volume" }), {
    key: "ArrowLeft",
  });
  expect(bob.playbackVolume$.value).toBe(0.99);
  fireEvent.click(screen.getByRole("button", { name: "Mute shared audio" }));
  expect(bob.playbackVolume$.value).toBe(0);
  expect(bob.playbackMuted$.value).toBe(true);
  expect(alice.playbackMuted$.value).toBe(false);
  act(() => bobAudio$.next(false));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Screen share volume" }),
  ).not.toBeInTheDocument();
  act(() => media$.next([alice]));
  expect(spotlight.selectedMedia$.value).toBe(alice);
  act(() => media$.next([]));
  expect(
    screen.queryByRole("button", { name: "Screen share volume" }),
  ).not.toBeInTheDocument();
});

test("the video-local popup stays usable past the footer timeout without a footer hold", () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const audio = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "A"),
    {},
    mockRemoteParticipant({}),
  );
  vi.spyOn(audio, "audioEnabled$", "get").mockReturnValue(constant(true));
  renderSharingSpotlight(new BehaviorSubject([audio]));
  fireEvent.click(screen.getByRole("button", { name: "Screen share volume" }));
  act(() => {
    vi.advanceTimersByTime(7000);
  });
  expect(screen.getByRole("dialog")).toBeVisible();
  const slider = screen.getByRole("slider", { name: "Volume" });
  act(() => slider.focus());
  fireEvent.keyDown(slider, { key: "ArrowLeft" });
  expect(audio.playbackVolume$.value).toBe(0.99);
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  fireEvent.keyDown(slider, { key: "ArrowLeft" });
  expect(audio.playbackVolume$.value).toBe(0.98);
  fireEvent.keyDown(slider, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("swiping selects the majority-visible share on the current spotlight model", () => {
  let notify: IntersectionObserverCallback;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      public constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        // LiveKit also creates an observer for video visibility.
        if (options?.root instanceof HTMLElement && options.threshold === 0.5)
          notify = callback;
      }
      public observe(): void {}
      public unobserve(): void {}
      public disconnect(): void {}
    },
  );
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  const alice = mockRemoteScreenShare(
    mockRtcMembership("@alice:example.org", "A"),
    { rawDisplayName: "Alice" },
    mockRemoteParticipant({}),
  );
  const bob = mockRemoteScreenShare(
    mockRtcMembership("@bob:example.org", "B"),
    { rawDisplayName: "Bob" },
    mockRemoteParticipant({}),
  );
  const previous = new SpotlightTileViewModel(
    testScope(),
    constant([alice, bob]),
    constant(false),
    constant("solid"),
  );
  const current = new SpotlightTileViewModel(
    testScope(),
    constant([alice, bob]),
    constant(false),
    constant("solid"),
  );
  const props = {
    targetWidth: 300,
    targetHeight: 200,
    expanded: false,
    onToggleExpanded: null,
    showTileControls: false,
    showIndicators: true,
    showNameTags: true,
    showRingingStatus: false,
    focusable: true,
  };
  const { rerender } = render(<SpotlightTile {...props} vm={previous} />);
  const entries = [
    {
      target: screen.getByText("Alice").closest("[data-id]")!,
      isIntersecting: true,
      intersectionRatio: 0.4,
    },
    {
      target: screen.getByText("Bob").closest("[data-id]")!,
      isIntersecting: true,
      intersectionRatio: 0.6,
    },
  ] as IntersectionObserverEntry[];
  expect(entries[1].target.getAttribute("data-id")).toBe(bob.id);
  act(() => notify(entries, {} as IntersectionObserver));
  expect(previous.selectedMedia$.value).toBe(bob);
  act(() => previous.setVisibleMedia(alice.id));
  // React can reuse the animated spotlight node after the old tile was retired.
  rerender(<SpotlightTile {...props} vm={current} />);
  act(() => notify(entries, {} as IntersectionObserver));
  expect(current.selectedMedia$.value).toBe(bob);
  expect(previous.selectedMedia$.value).toBe(alice);
});

test("SpotlightTile displays ringing media", async () => {
  const pickupState$ = new BehaviorSubject<
    RingingMediaViewModel["pickupState$"]["value"]
  >("ringing");
  const vm = createRingingMedia({
    pickupState$,
    id: "test",
    intent: "audio",
    userId: "@alice:example.org",
    displayName$: constant("Alice"),
    mxcAvatarUrl$: constant(undefined),
  });

  const toggleExpanded = vi.fn();
  const { container } = render(
    <SpotlightTile
      vm={
        new SpotlightTileViewModel(
          testScope(),
          constant([vm]),
          constant(false),
          constant("solid"),
        )
      }
      targetWidth={300}
      targetHeight={200}
      expanded={false}
      onToggleExpanded={toggleExpanded}
      showIndicators
      showNameTags
      showRingingStatus
      focusable={true}
    />,
  );

  expect(await axe(container)).toHaveNoViolations();
  // Alice should be in the spotlight with the right status
  screen.getByText("Alice");
  screen.getByText("Calling…");

  // Now we time out ringing to Alice
  act(() => pickupState$.next("timeout"));
  screen.getByText("Call ended");
});

function renderSharingSpotlight(
  media$: BehaviorSubject<RemoteScreenShareViewModel[]>,
): { spotlight: SpotlightTileViewModel; root: HTMLDivElement } {
  const spotlight = new SpotlightTileViewModel(
    testScope(),
    media$,
    constant(false),
    constant("solid"),
  );
  const root = document.createElement("div");
  document.body.append(root);
  onTestFinished(() => root.remove());
  render(
    <RootElementProvider value={root}>
      <TooltipProvider>
        <SpotlightTile
          vm={spotlight}
          targetWidth={300}
          targetHeight={200}
          expanded={false}
          onToggleExpanded={null}
          showIndicators
          showNameTags
          showRingingStatus={false}
          focusable
        />
      </TooltipProvider>
    </RootElementProvider>,
    { container: root },
  );
  return { spotlight, root };
}
