/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { BehaviorSubject } from "rxjs";
import { type JSX, type ReactNode, useMemo, useState } from "react";
import { animated } from "@react-spring/web";
import useMeasure from "react-use-measure";
import { Link } from "@vector-im/compound-web";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { CallFooter, type FooterSnapshot } from "./CallFooter";
import inCallViewStyles from "../room/InCallView.module.css";
import { useStaticViewModel } from "../state/ViewModel";
import { ReactionsSenderContext } from "../reactions/useReactionsSender";
import { type ReactionOption } from "../reactions";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { MediaDevices } from "../state/MediaDevices";
import { globalScope } from "../state/ObservableScope";
import { constant } from "../state/Behavior";
import { type LayoutMode } from "../state/LayoutSwitchViewModel";
import { RootElementProvider } from "../RootElementContext";
import { Grid, type TileProps } from "../grid/Grid";
import { makeGridLayout } from "../grid/GridLayout";
import { type Alignment, type GridLayout } from "../state/layout-types";
import { GridTileViewModel, type TileViewModel } from "../state/TileViewModel";
import { createBaseUserMedia } from "../state/media/UserMediaViewModel";
import { E2eeType } from "../e2ee/e2eeType";

// consts for tests
const reactionIdentifier = "@user:example.com:DEVICE";
const reactionData = {
  handsRaised$: new BehaviorSubject({}),
  reactions$: new BehaviorSubject({}),
};

const mediaDevices = new MediaDevices(globalScope, {
  controlledAudioDevices: false,
});

/**
 * A wrapper component that is used for:
 *  - exposing the snapshot via props so the storybook documents the snapshot properties (basically unpack them form the vm)
 *  - constructing the layout switch view model
 *  - Add additional react context
 * The paraeters are all params from the FooterSnapshot,
 * the Snapshot of the vm, the wrapper will create a mocked vm from it and pass it to the CallFooter.
 * `children` is used for the "Back to Recents" button in the lobby stories, but can be used for anything really.
 * @returns A component that renders the CallFooter based on primitive snapshot params (not a view model). Which is what we want for storybook.
 */
function CallFooterStoryWrapper({
  children,
  layout,
  setLayout,
  theme,
  height = 600,
  width,
  platform = "desktop",
  participantGrid = false,
  ...vmSnapshot
}: Omit<FooterSnapshot, "layoutSwitchVm"> & {
  children?: false | JSX.Element | JSX.Element[] | undefined;
  layout: LayoutMode | null;
  setLayout: (value: LayoutMode) => void;
  theme: "light" | "dark";
  height?: number;
  width?: number;
  platform?: "desktop" | "android" | "ios";
  participantGrid?: boolean;
}): ReactNode {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [footerRef, footerBounds] = useMeasure();
  const vm = useStaticViewModel({
    ...vmSnapshot,
    showFooter: vmSnapshot.showFooter && !controlsHidden,
    layoutSwitchVm: layout && { layout$: constant(layout), setLayout },
  });
  return (
    <MediaDevicesContext value={mediaDevices}>
      {participantGrid && (
        <button onClick={() => setControlsHidden(!controlsHidden)}>
          Toggle controls
        </button>
      )}
      <div
        ref={setRoot}
        data-element-call-root
        data-platform={platform}
        style={{ height, width, container: "element-call / size" }}
        className={`${inCallViewStyles.inRoom} cpd-theme-${theme}`}
      >
        <RootElementProvider value={root}>
          <ReactionsSenderContext
            value={{
              supportsReactions: false,
              toggleRaisedHand: async () => Promise.resolve(),
              sendReaction: async (reaction: ReactionOption) =>
                Promise.resolve(),
            }}
          >
            {participantGrid ? (
              <div
                className={`${inCallViewStyles.inRoom} ${inCallViewStyles.overflowing}`}
                data-testid="grid-call"
              >
                <div
                  className={inCallViewStyles.media}
                  style={{
                    "--call-footer-height": `${footerBounds.height}px`,
                  }}
                >
                  <ParticipantGrid width={width ?? 390} height={height} />
                </div>
                <CallFooter
                  vm={vm}
                  ref={footerRef}
                  className={inCallViewStyles.footer}
                />
              </div>
            ) : (
              <CallFooter vm={vm} />
            )}
          </ReactionsSenderContext>
        </RootElementProvider>
      </div>
    </MediaDevicesContext>
  );
}

const fnArgType = {
  control: { type: "select" as const },
  options: ["MockedCallback", "undefined"],
  mapping: { MockedCallback: fn(), undefined: undefined },
};

const meta = {
  component: CallFooterStoryWrapper,
  argTypes: {
    layout: {
      control: "radio",
      options: ["grid", "spotlight"] satisfies LayoutMode[],
    },
    audioOutputSwitcher: {
      control: "select",
      options: ["NoOutputCallback", "speaker", "earpiece"],
      table: { defaultValue: { summary: "NoOutputCallback" } },
      mapping: {
        NoOutputCallback: undefined,
        // This is inverersed (speaker<->earpice) because the switcher object stores the target output, not the current one.
        speaker: { targetOutput: "earpiece", switch: fn() },
        earpiece: { targetOutput: "speaker", switch: fn() },
      },
    },
    toggleScreenSharing: fnArgType,
    openSettings: fnArgType,
    toggleAudio: fnArgType,
    toggleVideo: fnArgType,
    hangup: fnArgType,
    terminateCall: fnArgType,
    theme: {
      control: "radio",
      options: ["light", "dark"],
    },
  },
} satisfies Meta<typeof CallFooterStoryWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    layout: "grid",
    setLayout: fn(),
    audioEnabled: true,
    audioBusy: false,
    videoEnabled: true,
    videoBusy: false,
    openSettings: fn(),
    toggleAudio: fn(),
    toggleVideo: fn(),
    toggleScreenSharing: fn(),
    toggleBlur: fn(),
    videoBlurEnabled: true,
    hangup: fn(),
    terminateCall: fn(),
    terminationState: "idle",
    notifyControlInteraction: undefined,
    participantCount: 3,
    theme: "dark",
    buttonSize: "lg",
    showLogo: false,
    showFooter: true,
    hideControls: false,
    asOverlay: false,
    showModals: true,
    sharingScreen: false,
    audioOutputSwitcher: undefined,
    reactionIdentifier: undefined,
    reactionData: undefined,
    debugTileLayout: false,
    tileStoreGeneration: undefined,
    audioOptions: [],
    videoOptions: [],
    selectedAudio: undefined,
    selectedVideo: undefined,
    selectAudioButtonOption: undefined,
    selectVideoButtonOption: undefined,
  },
  parameters: {
    layout: "fullscreen",
  },
};

export const WithAudioAndVideoOptions: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioEnabled: false,
    videoEnabled: true,
    audioOptions: [
      { label: { type: "name", name: "Microphone 1" }, id: "1" },
      { label: { type: "name", name: "Microphone 2" }, id: "2" },
    ],
    videoOptions: [
      { label: { type: "name", name: "Camera 1" }, id: "1" },
      { label: { type: "name", name: "Camera 2" }, id: "2" },
    ],
    selectedAudio: "2",
    selectedVideo: "1",
  },
};

export const AudioBusy: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioEnabled: true,
    audioBusy: true,
    videoEnabled: true,
  },
};

export const VideoBusy: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioEnabled: true,
    videoEnabled: true,
    videoBusy: true,
  },
};
export const AudioVideoEnabled: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioEnabled: true,
    videoEnabled: true,
    terminateCall: undefined,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    const spotlightRadio = canvas.getByRole("radio", { name: "Spotlight" });
    await userEvent.click(spotlightRadio);
    await expect(args.setLayout).toHaveBeenCalledWith("spotlight");

    const micButtonMute = canvas.getByRole("switch", {
      name: "Mute microphone",
    });
    await userEvent.click(micButtonMute);
    await expect(args.toggleAudio).toHaveBeenCalled();

    const videoMuteButton = canvas.getByRole("switch", {
      name: "Stop video",
    });
    await userEvent.click(videoMuteButton);
    await expect(args.toggleVideo).toHaveBeenCalled();
    const screenShare = canvas.getByRole("switch", {
      name: "Share screen",
    });
    await userEvent.click(screenShare);
    await expect(args.toggleScreenSharing).toHaveBeenCalled();
    const endCall = canvas.getByRole("button", {
      name: "End call",
    });
    await userEvent.click(endCall);
    await expect(args.hangup).toHaveBeenCalled();
  },
};

/** used to test switching to grid mode */
export const SpotlightMode: Story = {
  ...Default,
  args: {
    ...Default.args,
    layout: "spotlight",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    const spotlightRadio = canvas.getByRole("radio", { name: "Grid" });
    await userEvent.click(spotlightRadio);
    await expect(args.setLayout).toHaveBeenCalledWith("grid");
  },
};

export const WithAudioOutputSpeaker: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioOutputSwitcher: { targetOutput: "earpiece", switch: fn() },
  },
};

export const WithAudioOutputEarpiece: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioOutputSwitcher: { targetOutput: "speaker", switch: fn() },
  },
};
export const WithReactions: Story = {
  ...Default,
  args: {
    ...Default.args,
    reactionIdentifier,
    reactionData,
  },
};
export const Pip: Story = {
  ...Default,
  args: {
    ...Default.args,
    buttonSize: "md",
    layout: null,
    terminateCall: undefined,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.queryByRole("radio", { name: "Spotlight" }),
    ).not.toBeInTheDocument();

    const micButtonMute = canvas.getByRole("switch", {
      name: "Mute microphone",
    });
    await userEvent.click(micButtonMute);
    await expect(args.toggleAudio).toHaveBeenCalled();

    const videoMuteButton = canvas.getByRole("switch", {
      name: "Stop video",
    });
    await userEvent.click(videoMuteButton);
    await expect(args.toggleVideo).toHaveBeenCalled();
    const screenShare = canvas.getByRole("switch", {
      name: "Share screen",
    });
    await userEvent.click(screenShare);
    await expect(args.toggleScreenSharing).toHaveBeenCalled();
    const endCall = canvas.getByRole("button", {
      name: "End call",
    });
    await userEvent.click(endCall);
    await expect(args.hangup).toHaveBeenCalled();
  },
};
export const NoControls: Story = {
  ...Default,
  args: {
    ...Default.args,
    hideControls: true,
  },
};

export const DebugData: Story = {
  ...Default,
  args: {
    ...Default.args,
    debugTileLayout: true,
    tileStoreGeneration: 74,
  },
};

export const UnavailableMediaDevices: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioEnabled: false,
    videoEnabled: false,
    toggleAudio: undefined,
    toggleVideo: undefined,
    audioOutputSwitcher: undefined,
  },
};

export const MobileLayout: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioOutputSwitcher: { targetOutput: "speaker", switch: fn() },
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    ...Default.parameters,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const footer = canvas.getByTestId("footer-container");
    const toolbar = footer.firstElementChild;

    await expect(toolbar).not.toBeNull();
    await expect(toolbar!.getBoundingClientRect().width).toBeLessThanOrEqual(
      footer.getBoundingClientRect().width,
    );
    for (const button of within(toolbar as HTMLElement).getAllByRole(
      "button",
    )) {
      if (button.hasAttribute("data-size"))
        await expect(button).toHaveAttribute("data-size", "lg");
    }
  },
};

export const LightThemeOverlay: Story = {
  ...Default,
  args: {
    ...Default.args,
    asOverlay: true,
    theme: "light",
  },
  play: async ({ canvasElement }) => {
    const toolbar = within(canvasElement).getByTestId("footer-container")
      .firstElementChild as HTMLElement;
    const toolbarBackground = getComputedStyle(toolbar).getPropertyValue(
      "--call-footer-toolbar-background",
    );
    const canvasBackground = getComputedStyle(toolbar)
      .getPropertyValue("--cpd-color-bg-canvas-default")
      .trim();

    await expect(toolbarBackground).toContain(canvasBackground);
  },
};

export const Lobby: Story = {
  ...Default,
  args: {
    ...Default.args,
    openSettings: undefined,
    layout: null,
    toggleScreenSharing: undefined,
  },
  parameters: {
    ...Default.parameters,
  },
};

export const LobbyMobile: Story = {
  ...Default,
  args: {
    ...Default.args,
    layout: null,
    toggleScreenSharing: undefined,
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    ...Default.parameters,
  },
};

export const LobbyRecentButton: Story = {
  ...Default,
  args: {
    ...Default.args,
    children: <Link>Back To Recents</Link>,
    layout: null,
    toggleScreenSharing: undefined,
  },
  parameters: {
    ...Default.parameters,
  },
};

export const LobbyRecentButtonMobile: Story = {
  ...Default,
  args: {
    ...Default.args,
    children: <Link>Back To Recents</Link>,
    layout: null,
    toggleScreenSharing: undefined,
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    ...Default.parameters,
  },
};

export const DesktopOverlay: Story = {
  ...Default,
  args: { ...Default.args, asOverlay: true },
  play: async ({ canvasElement }) => {
    const footer = within(canvasElement).getByTestId("footer-container");
    const toolbar = footer.firstElementChild as HTMLElement;
    await expect(getComputedStyle(footer).position).toBe("absolute");
    await expect(getComputedStyle(toolbar).backgroundImage).toContain(
      "linear-gradient",
    );
    await expect(getComputedStyle(toolbar).boxShadow).not.toBe("none");
  },
};

export const AndroidFloatingGrid: Story = {
  ...Default,
  args: {
    ...Default.args,
    asOverlay: true,
    platform: "android",
    participantGrid: true,
    width: 390,
    height: 700,
    toggleScreenSharing: undefined,
    audioOutputSwitcher: { targetOutput: "speaker", switch: fn() },
  },
  play: assertFloatingGrid,
};

export const IOSFloatingGrid: Story = {
  ...AndroidFloatingGrid,
  args: { ...AndroidFloatingGrid.args, platform: "ios" },
};

export const ShortNarrowFloatingGrid: Story = {
  ...AndroidFloatingGrid,
  args: { ...AndroidFloatingGrid.args, width: 320, height: 380 },
};

async function assertFloatingGrid({
  canvasElement,
}: {
  canvasElement: HTMLElement;
}): Promise<void> {
  const canvas = within(canvasElement);
  const call = canvas.getByTestId("grid-call");
  const footer = canvas.getByTestId("footer-container");
  const toolbar = footer.firstElementChild as HTMLElement;
  const grid = call.querySelector('[data-scrollable="true"]') as HTMLElement;
  const bottom = call.getBoundingClientRect().bottom;
  await waitFor(async () => {
    await expect(grid.getBoundingClientRect().bottom).toBe(bottom);
    await expect(grid.scrollHeight).toBeGreaterThan(grid.clientHeight);
  });
  await expect(getComputedStyle(footer).position).toBe("absolute");
  await expect(getComputedStyle(footer).backgroundImage).toBe("none");
  await expect(getComputedStyle(footer).backgroundColor).toBe(
    "rgba(0, 0, 0, 0)",
  );
  const toolbarStyle = getComputedStyle(toolbar);
  await expect(toolbarStyle.backgroundImage).toContain("linear-gradient");
  await expect(toolbarStyle.borderTopStyle).toBe("solid");
  await expect(Number.parseFloat(toolbarStyle.borderTopWidth)).toBeGreaterThan(
    0,
  );
  await expect(toolbarStyle.boxShadow).not.toBe("none");
  await expect(toolbarStyle.backdropFilter).toContain("blur(");
  await expect(Number.parseFloat(toolbarStyle.paddingTop)).toBeGreaterThan(0);
  await expect(Number.parseFloat(toolbarStyle.paddingLeft)).toBeGreaterThan(0);
  const mic = canvas.getByRole("switch", { name: "Mute microphone" });
  await expect(getComputedStyle(mic).backgroundColor).not.toBe(
    "rgba(0, 0, 0, 0)",
  );
  await expect(toolbar.getBoundingClientRect().right).toBeLessThanOrEqual(
    call.getBoundingClientRect().right,
  );
  const visibleHeight = grid.clientHeight;
  const visibleScrollHeight = grid.scrollHeight;
  grid.scrollTop = grid.scrollHeight;
  await waitFor(async () => {
    const last = canvas.getAllByTestId("participant").at(-1)!;
    await expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      toolbar.getBoundingClientRect().top,
    );
  });
  await userEvent.click(
    canvas.getByRole("button", { name: "Toggle controls" }),
  );
  await waitFor(async () => {
    await expect(footer).toHaveAttribute("data-controls-visible", "false");
    await expect(
      getComputedStyle(grid).getPropertyValue("--call-footer-clearance").trim(),
    ).toBe("0px");
    await expect(grid.clientHeight).toBe(visibleHeight);
    await expect(grid.scrollHeight).toBeLessThan(visibleScrollHeight);
  });
  // Keyboard-revealed controls need the same final-row clearance as visible ones.
  mic.focus();
  await waitFor(async () => {
    await expect(getComputedStyle(toolbar).opacity).toBe("1");
    await expect(grid.scrollHeight).toBe(visibleScrollHeight);
  });
  grid.scrollTop = grid.scrollHeight;
  await waitFor(async () => {
    const last = canvas.getAllByTestId("participant").at(-1)!;
    await expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      toolbar.getBoundingClientRect().top,
    );
  });
  mic.blur();
  await userEvent.click(
    canvas.getByRole("button", { name: "Toggle controls" }),
  );
  await waitFor(async () => {
    await expect(grid.scrollHeight).toBe(visibleScrollHeight);
    await expect(grid.getBoundingClientRect().bottom).toBe(bottom);
  });
}

function ParticipantGrid({
  width,
  height,
}: {
  width: number;
  height: number;
}): ReactNode {
  const model = useMemo<GridLayout>(
    () => ({
      type: "grid",
      grid: Array.from(
        { length: 20 },
        (_, i) =>
          new GridTileViewModel(
            constant({
              ...createBaseUserMedia(globalScope, {
                id: String(i),
                userId: `@participant${i}:example.org`,
                displayName$: constant(`Participant ${i + 1}`),
                mxcAvatarUrl$: constant(undefined),
                participant$: constant(null),
                livekitRoom$: constant(undefined),
                focusUrl$: constant(undefined),
                encryptionSystem: { kind: E2eeType.NONE },
                rtcBackendIdentity: String(i),
                handRaised$: constant(null),
                reaction$: constant(null),
                statsType: "outbound-rtp",
              }),
              local: true as const,
              mirror$: constant(false),
              alwaysShow$: constant(false),
              setAlwaysShow: fn(),
              switchCamera$: constant(null),
            }),
          ),
      ),
      spotlightAlignment$: new BehaviorSubject<Alignment>({
        block: "end",
        inline: "end",
      }),
      setVisibleTiles: fn(),
    }),
    [],
  );
  const layout = useMemo(
    () => makeGridLayout({ minBounds$: constant({ width, height }) }),
    [width, height],
  );
  return (
    <Grid
      model={model}
      Layout={layout.scrolling}
      Tile={ParticipantTile}
      scrolling
      className={inCallViewStyles.scrollingGrid}
    />
  );
}

function ParticipantTile({
  ref,
  style,
  model,
  className,
}: TileProps<TileViewModel, HTMLDivElement>): ReactNode {
  return (
    <animated.div
      ref={ref}
      style={{ ...style, background: "var(--cpd-color-bg-subtle-secondary)" }}
      data-testid="participant"
      className={`${className ?? ""} ${inCallViewStyles.tile}`}
    >
      {model instanceof GridTileViewModel
        ? model.media$.value.displayName$.value
        : null}
    </animated.div>
  );
}
