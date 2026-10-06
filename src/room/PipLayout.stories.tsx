/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Meta, type StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@vector-im/compound-web";

import styles from "./InCallView.module.css";
import { RootElementProvider } from "../RootElementContext";
import { constant } from "../state/Behavior";
import { ObservableScope } from "../state/ObservableScope";
import { SpotlightTileViewModel } from "../state/TileViewModel";
import { E2eeType } from "../e2ee/e2eeType";
import { createBaseUserMedia } from "../state/media/UserMediaViewModel";
import { createLocalScreenShare } from "../state/media/LocalScreenShareViewModel";
import { SpotlightTile } from "../tile/SpotlightTile";

// Exercise the actual PiP tile and media wrappers without a Matrix backend.
// Playback is covered by the widget e2e test; these stories catch collapsed CSS.
function PipLayoutStory({ screenShare }: { screenShare: boolean }): ReactNode {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [vm, setVm] = useState<SpotlightTileViewModel | null>(null);
  const [small, setSmall] = useState(true);

  useEffect(() => {
    const scope = new ObservableScope();
    const inputs = {
      id: "preview",
      userId: "@presenter:example.org",
      displayName$: constant("Presenter"),
      mxcAvatarUrl$: constant(undefined),
      participant$: constant(null),
      livekitRoom$: constant(undefined),
      focusUrl$: constant(undefined),
      encryptionSystem: { kind: E2eeType.NONE } as const,
    };
    const media = screenShare
      ? createLocalScreenShare(scope, inputs)
      : {
          ...createBaseUserMedia(scope, {
            ...inputs,
            rtcBackendIdentity: "presenter",
            handRaised$: constant(null),
            reaction$: constant(null),
            statsType: "outbound-rtp",
          }),
          local: true as const,
          mirror$: constant(false),
          alwaysShow$: constant(false),
          setAlwaysShow: () => {},
          switchCamera$: constant(null),
        };
    setVm(
      new SpotlightTileViewModel(
        scope,
        constant([media]),
        constant(false),
        constant("transparent"),
      ),
    );
    return (): void => scope.end();
  }, [screenShare]);

  const size = small ? 300 : 600;
  return (
    <>
      <Button kind="secondary" onClick={() => setSmall(!small)}>
        {small ? "Enlarge container" : "Shrink container"}
      </Button>
      <div
        ref={setRoot}
        data-element-call-root
        data-layout="pip"
        className={`${styles.inRoom} cpd-theme-dark`}
        style={{ width: size, height: size, container: "element-call / size" }}
      >
        <RootElementProvider value={root}>
          <div className={styles.media}>
            {vm && (
              <SpotlightTile
                vm={vm}
                className={styles.tile}
                itemClassName={styles.spotlightItem}
                expanded
                onToggleExpanded={null}
                targetWidth={size}
                targetHeight={size}
                showIndicators={false}
                showNameTags={false}
                showRingingStatus={false}
                focusable
              />
            )}
          </div>
        </RootElementProvider>
      </div>
    </>
  );
}

const meta = {
  title: "Call/PiP layout",
  component: PipLayoutStory,
  args: { screenShare: false },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PipLayoutStory>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Camera: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tile = await canvas.findByTestId("videoTile");
    const expectSize = async (size: number): Promise<void> => {
      await waitFor(async () => {
        await expect(tile.getBoundingClientRect().width).toBe(size);
        await expect(tile.getBoundingClientRect().height).toBe(size);
      });
    };
    await expectSize(300);
    await userEvent.click(
      canvas.getByRole("button", { name: "Enlarge container" }),
    );
    await expectSize(600);
    await userEvent.click(
      canvas.getByRole("button", { name: "Shrink container" }),
    );
    await expectSize(300);
  },
};

export const ScreenShare: Story = {
  ...Camera,
  args: { screenShare: true },
};
