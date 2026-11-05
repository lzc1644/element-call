/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, render, waitFor } from "@testing-library/react";
import { type JSX } from "react";
import { NEVER } from "rxjs";
import { expect, test, vi } from "vitest";
import { createLocalMedia, type LocalMedia } from "@element-hq/matrixrtc-sdk";

import { MediaDevicesContext } from "../MediaDevicesContext";
import { MuteStates } from "../state/MuteStates";
import { constant } from "../state/Behavior";
import { nullHostBridge } from "../HostBridge";
import { flushPromises, mockMediaDevices, testScope } from "../utils/test";
import { usePrejoinMedia } from "./usePrejoinMedia";

const effects$ = constant({ supported: false, processor: undefined });
vi.mock("../tracks/BackgroundEffectsContext", () => ({
  useBackgroundEffectsState$: () => effects$,
}));
vi.mock("./InCallView", () => ({ captureSettings: () => ({}) }));

const mediaCombinations = [
  { name: "audio and video muted", audio: false, video: false },
  { name: "video only", audio: false, video: true },
  { name: "audio only", audio: true, video: false },
  { name: "audio and video enabled", audio: true, video: true },
] as const;

test.each(mediaCombinations)(
  "prepares only enabled devices through the lobby model ($name)",
  async ({ audio, video }) => {
    const rendered = renderPrejoinMedia(audio, video);
    if (!audio && !video) {
      await waitFor(() =>
        expect(rendered.getByTestId("ready")).toHaveTextContent("ready"),
      );
      expect(rendered.getUserMedia).not.toHaveBeenCalled();
      return;
    }

    await waitFor(() => expect(rendered.getUserMedia).toHaveBeenCalledOnce());
    expect(rendered.getUserMedia).toHaveBeenCalledWith({
      ...(audio && { audio: { deviceId: "microphone" } }),
      ...(video && { video: { deviceId: "camera" } }),
    });
    expect(rendered.getByTestId("ready")).toHaveTextContent("pending");

    const tracks = [
      ...(audio ? [rawTrack("audio")] : []),
      ...(video ? [rawTrack("video")] : []),
    ];
    await act(async () => {
      rendered.permission.resolve(streamOf(tracks));
      await flushPromises();
    });

    await waitFor(() =>
      expect(rendered.getByTestId("ready")).toHaveTextContent("ready"),
    );
    const handed = [...rendered.media.takeTracks().values()];
    expect(handed.map(({ track }) => track)).toEqual(tracks);
    expect(rendered.getUserMedia).toHaveBeenCalledOnce();
  },
);

test.each(mediaCombinations.filter(({ audio, video }) => audio || video))(
  "joins muted after a denied capture without retrying ($name)",
  async ({ audio, video }) => {
    const rendered = renderPrejoinMedia(audio, video);
    await waitFor(() => expect(rendered.getUserMedia).toHaveBeenCalledOnce());

    await act(async () => {
      rendered.permission.reject(new Error("Permission denied"));
      await flushPromises();
    });

    await waitFor(() =>
      expect(rendered.getByTestId("ready")).toHaveTextContent("ready"),
    );
    expect(rendered.muteStates.audio.enabled$.value).toBe(false);
    expect(rendered.muteStates.video.enabled$.value).toBe(false);
    expect(rendered.getUserMedia).toHaveBeenCalledOnce();
  },
);

test("does not change mute switches when a denied permission arrives after unmount", async () => {
  const rendered = renderPrejoinMedia(true, true);
  await waitFor(() => expect(rendered.getUserMedia).toHaveBeenCalledOnce());
  rendered.unmount();

  await act(async () => {
    rendered.permission.reject(new Error("Permission denied"));
    await flushPromises();
  });

  expect(rendered.muteStates.audio.enabled$.value).toBe(true);
  expect(rendered.muteStates.video.enabled$.value).toBe(true);
});

function renderPrejoinMedia(audioEnabled: boolean, videoEnabled: boolean) {
  const permission = Promise.withResolvers<MediaStream>();
  const getUserMedia = vi.fn(async () => permission.promise);
  const media = createLocalMedia(getUserMedia);
  const mediaDevices = mockMediaDevices({
    audioInput: {
      available$: constant(
        new Map([
          ["microphone", { type: "name" as const, name: "Microphone" }],
        ]),
      ),
      selected$: constant({ id: "microphone", hardwareDeviceChange$: NEVER }),
      select: vi.fn(),
    },
    videoInput: {
      available$: constant(
        new Map([["camera", { type: "name" as const, name: "Camera" }]]),
      ),
      selected$: constant({ id: "camera" }),
      select: vi.fn(),
    },
  });
  const muteStates = new MuteStates(
    testScope(),
    mediaDevices,
    { audioEnabled, videoEnabled },
    nullHostBridge,
  );
  return {
    ...render(
      <MediaDevicesContext value={mediaDevices}>
        <PrejoinMediaHarness muteStates={muteStates} media={media} />
      </MediaDevicesContext>,
    ),
    media,
    muteStates,
    getUserMedia,
    permission,
  };
}

function PrejoinMediaHarness({
  muteStates,
  media,
}: {
  muteStates: MuteStates;
  media: LocalMedia;
}): JSX.Element {
  const { ready } = usePrejoinMedia(muteStates, media);
  return <output data-testid="ready">{ready ? "ready" : "pending"}</output>;
}

function rawTrack(kind: "audio" | "video"): MediaStreamTrack {
  return {
    kind,
    id: `${kind}-track`,
    getSettings: () => ({
      deviceId: kind === "audio" ? "microphone" : "camera",
    }),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function streamOf(tracks: MediaStreamTrack[]): MediaStream {
  return { getTracks: () => tracks } as unknown as MediaStream;
}
