/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Meta, type StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { useEffect, useState, type ReactNode } from "react";

import { SpotlightTile } from "./SpotlightTile";
import styles from "./SpotlightTile.module.css";
import { RootElementProvider } from "../RootElementContext";
import { ObservableScope } from "../state/ObservableScope";
import { SpotlightTileViewModel } from "../state/TileViewModel";
import { constant } from "../state/Behavior";
import { createVolumeControls } from "../state/VolumeControls";
import { type RemoteScreenShareViewModel } from "../state/media/RemoteScreenShareViewModel";
import { type RemoteUserMediaViewModel } from "../state/media/RemoteUserMediaViewModel";

function SpotlightStory({
  audio,
  expanded,
  onToggleExpanded,
  cameraAndScreenShare,
}: {
  audio: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  cameraAndScreenShare: boolean;
}): ReactNode {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [vm, setVm] = useState<SpotlightTileViewModel | null>(null);
  useEffect(() => {
    const scope = new ObservableScope();
    const media = {
      id: "shared-screen",
      type: "screen share",
      local: false,
      userId: "@alice:example.org",
      displayName$: constant("Alice"),
      mxcAvatarUrl$: constant(undefined),
      video$: constant(undefined),
      videoEnabled$: constant(true),
      unencryptedWarning$: constant(false),
      focusUrl$: constant(undefined),
      audioEnabled$: constant(audio),
      ...createVolumeControls(scope, {
        pretendToBeDisconnected$: constant(false),
        sink$: constant(() => {}),
      }),
    } as RemoteScreenShareViewModel;
    setVm(
      new SpotlightTileViewModel(
        scope,
        constant(
          cameraAndScreenShare
            ? [media, remoteCamera("alice-camera")]
            : [media],
        ),
        constant(false),
        constant("solid"),
      ),
    );
    return (): void => scope.end();
  }, [audio, cameraAndScreenShare]);
  return (
    <div
      ref={setRoot}
      data-element-call-root
      className="cpd-theme-dark"
      style={{
        position: "relative",
        container: "element-call / size",
        height: 500,
      }}
    >
      <RootElementProvider value={root}>
        {vm && (
          <SpotlightTile
            vm={vm}
            expanded={expanded}
            onToggleExpanded={onToggleExpanded}
            onToggleFullscreen={fn()}
            targetWidth={700}
            targetHeight={300}
            showIndicators={cameraAndScreenShare}
            showNameTags
            showRingingStatus={false}
            focusable
            style={{ position: "relative", height: 300, margin: 20 }}
          />
        )}
      </RootElementProvider>
    </div>
  );
}

const meta = {
  component: SpotlightStory,
  parameters: { layout: "fullscreen" },
  args: {
    audio: true,
    expanded: false,
    onToggleExpanded: fn(),
    cameraAndScreenShare: false,
  },
} satisfies Meta<typeof SpotlightStory>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DesktopControls: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const controls = (
      await canvas.findByRole("button", { name: "Screen share volume" })
    ).parentElement!;
    const tile = controls.parentElement!;
    await expect(
      controls.getBoundingClientRect().top - tile.getBoundingClientRect().top,
    ).toBeLessThan(10);
    for (const button of within(controls).getAllByRole("button")) {
      await expect(getComputedStyle(button).opacity).toBe("1");
      await expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(
        44,
      );
      await expect(
        button.getBoundingClientRect().height,
      ).toBeGreaterThanOrEqual(44);
    }
    await userEvent.click(canvas.getByRole("button", { name: "Expand" }));
    await expect(args.onToggleExpanded).toHaveBeenCalled();
  },
};
export const NarrowControls: Story = {
  globals: { viewport: { value: "mobile2", isRotated: false } },
  play: async ({ canvasElement }) => {
    const button = await within(canvasElement).findByRole("button", {
      name: "Screen share volume",
    });
    const controls = button.parentElement!,
      tile = controls.parentElement!;
    await expect(
      tile.getBoundingClientRect().bottom -
        controls.getBoundingClientRect().bottom,
    ).toBeLessThan(10);
  },
};
export const ShareWithoutAudio: Story = {
  args: { audio: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Expand" });
    await expect(
      canvas.queryByRole("button", { name: "Screen share volume" }),
    ).not.toBeInTheDocument();
  },
};
export const MembersHidden: Story = { args: { expanded: true } };
export const VolumeMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Screen share volume" }),
    );
    const popup = canvas.getByRole("dialog", { name: "Screen share volume" });
    await expect(popup.closest("[data-element-call-root]")).not.toBeNull();
    const slider = within(popup).getByRole("slider", { name: "Volume" });
    const sliderRoot = slider.closest(`.${styles.volumeSlider}`)!;
    await expect(sliderRoot.getBoundingClientRect().width).toBeGreaterThan(100);
    const track = sliderRoot.firstElementChild!;
    await expect(track.firstElementChild!.getBoundingClientRect().height).toBe(
      track.getBoundingClientRect().height,
    );
    slider.focus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    await expect(slider).toHaveAttribute("aria-valuenow", "0.98");
    await userEvent.keyboard("{Escape}");
    await expect(popup).not.toBeInTheDocument();
  },
};

// Presentation coverage: CallViewModel candidate construction is covered by the
// VM tests and the widget screen-share e2e spec.
export const CameraAndScreenShare: Story = {
  args: { audio: false, cameraAndScreenShare: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Next" });
    const cameraItem = canvasElement.querySelector('[data-id="alice-camera"]');
    await expect(cameraItem).toHaveAttribute("aria-hidden", "true");

    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(cameraItem).not.toHaveAttribute("aria-hidden", "true");
  },
};

function remoteCamera(id: string): RemoteUserMediaViewModel {
  return {
    id,
    userId: "@alice:example.org",
    type: "user",
    local: false,
    displayName$: constant("Alice"),
    mxcAvatarUrl$: constant(undefined),
    video$: constant(undefined),
    focusUrl$: constant(undefined),
    unencryptedWarning$: constant(false),
    encryptionStatus$: constant(1),
    waitingForMedia$: constant(false),
    videoEnabled$: constant(true),
    speaking$: constant(false),
    audioEnabled$: constant(false),
    videoOrientation$: constant("landscape"),
    rtcBackendIdentity: "@alice:example.org:AAAA",
    handRaised$: constant(null),
    reaction$: constant(null),
    audioStreamStats$: constant(undefined),
    videoStreamStats$: constant(undefined),
    toggleCropVideo: () => {},
    setVideoAspectRatio: () => {},
  } as unknown as RemoteUserMediaViewModel;
}
