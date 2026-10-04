/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Meta, type StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { animated } from "@react-spring/web";
import { BehaviorSubject } from "rxjs";
import { Button } from "@vector-im/compound-web";

import styles from "./InCallView.module.css";
import { CallFooter, type FooterSnapshot } from "../components/CallFooter";
import { Grid, type TileProps } from "../grid/Grid";
import { makeSpotlightExpandedLayout } from "../grid/SpotlightExpandedLayout";
import { RootElementProvider } from "../RootElementContext";
import { constant } from "../state/Behavior";
import { ObservableScope } from "../state/ObservableScope";
import {
  GridTileViewModel,
  SpotlightTileViewModel,
  type TileViewModel,
} from "../state/TileViewModel";
import {
  type Alignment,
  type SpotlightExpandedLayout,
} from "../state/layout-types";
import { createRingingMedia } from "../state/media/RingingMediaViewModel";
import { useStaticViewModel } from "../state/ViewModel";
import { useBehavior } from "../useBehavior";

const layers = makeSpotlightExpandedLayout({
  minBounds$: constant({ width: 800, height: 500 }),
});

function MemberVisibilityStory({
  initiallyHidden,
  toolbarVisible = true,
  overflowing = false,
}: {
  initiallyHidden: boolean;
  toolbarVisible?: boolean;
  overflowing?: boolean;
}): ReactNode {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [model, setModel] = useState<SpotlightExpandedLayout | null>(null);
  const [hidden, setHidden] = useState(initiallyHidden);
  const vm = useStaticViewModel({ membersHidden: hidden });
  const membersHidden = useBehavior(vm.membersHidden$);
  const footerVm = useStaticViewModel<FooterSnapshot>({
    asOverlay: true,
    showFooter: toolbarVisible,
    hideControls: false,
    showModals: true,
    buttonSize: "lg",
    showLogo: false,
    audioEnabled: false,
    videoEnabled: false,
    audioBusy: false,
    videoBusy: false,
    videoBlurEnabled: false,
    toggleAudio: undefined,
    toggleVideo: undefined,
    toggleBlur: undefined,
    toggleScreenSharing: undefined,
    openSettings: undefined,
    hangup: undefined,
    terminateCall: undefined,
    notifyControlInteraction: undefined,
    layoutSwitchVm: null,
    sharingScreen: false,
    audioOutputSwitcher: undefined,
    reactionIdentifier: undefined,
    reactionData: undefined,
    participantCount: 2,
    debugTileLayout: false,
    tileStoreGeneration: undefined,
    audioOptions: [],
    videoOptions: [],
    selectedAudio: undefined,
    selectedVideo: undefined,
    selectAudioButtonOption: undefined,
    selectVideoButtonOption: undefined,
  });

  useEffect(() => {
    const scope = new ObservableScope();
    setModel({
      type: "spotlight-expanded",
      spotlight: new SpotlightTileViewModel(
        scope,
        constant([]),
        constant(true),
        constant("transparent"),
      ),
      pip: new GridTileViewModel(
        constant(
          createRingingMedia({
            id: "preview",
            userId: "@presenter:example.org",
            displayName$: constant("Presenter"),
            mxcAvatarUrl$: constant(undefined),
            pickupState$: constant("ringing"),
            intent: "video",
          }),
        ),
      ),
      pipAlignment$: new BehaviorSubject<Alignment>({
        block: "start",
        inline: "end",
      }),
    });
    return (): void => scope.end();
  }, []);

  return (
    <>
      <Button kind="secondary" onClick={() => setHidden(!hidden)}>
        {membersHidden ? "Show members" : "Hide members"}
      </Button>
      <div
        ref={setRoot}
        data-element-call-root
        data-layout="spotlight-expanded"
        data-members-hidden={membersHidden}
        className={`${styles.inRoom} ${overflowing ? styles.overflowing : ""} cpd-theme-dark`}
        style={{ height: 500, container: "element-call / size" }}
      >
        <RootElementProvider value={root}>
          <div className={styles.media}>
            {model && (
              <>
                <Grid
                  className={styles.fixedGrid}
                  model={model}
                  Layout={layers.fixed}
                  Tile={PreviewTile}
                />
                <Grid
                  className={styles.scrollingGrid}
                  model={model}
                  Layout={layers.scrolling}
                  Tile={PreviewTile}
                />
              </>
            )}
          </div>
          <CallFooter className={styles.footer} vm={footerVm} />
        </RootElementProvider>
      </div>
    </>
  );
}

// Synthetic streams exercise video-element lifetime without a Matrix backend.
function PreviewTile({
  ref,
  model,
  style,
  className,
}: TileProps<TileViewModel, HTMLDivElement>): ReactNode {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camera = model instanceof GridTileViewModel;
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d")!;
    context.fillStyle = camera ? "#314c78" : "#176a5a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const stream = canvas.captureStream();
    videoRef.current!.srcObject = stream;
    return (): void => stream.getTracks().forEach((track) => track.stop());
  }, [camera]);
  return (
    <animated.div
      ref={ref}
      className={`${className} ${styles.tile}`}
      style={style}
      data-maximised={!camera}
    >
      <video
        ref={videoRef}
        className={camera ? undefined : styles.spotlightItem}
        data-background="transparent"
        data-video-enabled="true"
        aria-hidden="false"
        data-testid={camera ? "camera-preview" : "shared-screen"}
        autoPlay
        muted
        playsInline
        style={{ width: "100%", height: "100%" }}
      />
      {camera && (
        <Button
          kind="secondary"
          style={{ position: "absolute", bottom: 0 }}
          aria-label="Camera options"
        >
          Options
        </Button>
      )}
    </animated.div>
  );
}

const meta = {
  title: "Call/Member visibility",
  component: MemberVisibilityStory,
  args: { initiallyHidden: false },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof MemberVisibilityStory>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MembersVisible: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const main = await canvas.findByTestId("shared-screen");
    const camera = await canvas.findByTestId("camera-preview");
    await waitFor(async () => {
      await expect(
        (main as HTMLVideoElement).readyState,
      ).toBeGreaterThanOrEqual(2);
      await expect(
        (camera as HTMLVideoElement).readyState,
      ).toBeGreaterThanOrEqual(2);
    });
    const footer = canvas.getByTestId("footer-container");
    await expect(getComputedStyle(footer).backgroundImage).toContain(
      "linear-gradient",
    );
    const stream = (main as HTMLVideoElement).srcObject;
    const cameraStream = (camera as HTMLVideoElement).srcObject;
    for (let cycle = 0; cycle < 2; cycle++) {
      await userEvent.click(
        canvas.getByRole("button", { name: "Hide members" }),
      );
      await expect(camera).not.toBeVisible();
      await expect(main).toBeVisible();
      await expect(getComputedStyle(footer).backgroundImage).toBe("none");
      await expect(
        canvas.queryByRole("button", { name: "Camera options" }),
      ).not.toBeInTheDocument();
      await expect(canvas.getByTestId("camera-preview")).toBe(camera);
      await expect((main as HTMLVideoElement).srcObject).toBe(stream);
      await expect((camera as HTMLVideoElement).srcObject).toBe(cameraStream);
      await userEvent.click(
        canvas.getByRole("button", { name: "Show members" }),
      );
      await expect(camera).toBeVisible();
      await expect(getComputedStyle(footer).backgroundImage).toContain(
        "linear-gradient",
      );
    }
  },
};

export const MembersHidden: Story = {
  args: { initiallyHidden: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const camera = await canvas.findByTestId("camera-preview");
    const main = await canvas.findByTestId("shared-screen");
    await waitFor(async () => {
      await expect(main).toBeVisible();
    });
    await expect(camera).not.toBeVisible();
    const footer = canvas.getByTestId("footer-container");
    await expect(getComputedStyle(footer).backgroundImage).toBe("none");
    await userEvent.click(canvas.getByRole("button", { name: "Show members" }));
    await expect(camera).toBeVisible();
  },
};

export const PortraitMembersHidden: Story = {
  ...MembersHidden,
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const MembersAndToolbarHidden: Story = {
  ...MembersHidden,
  args: { initiallyHidden: true, toolbarVisible: false },
};

export const OverflowingMembersHidden: Story = {
  ...MembersHidden,
  args: { initiallyHidden: true, overflowing: true },
};
