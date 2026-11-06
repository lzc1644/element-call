/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeAll, describe, expect, it, vi } from "vitest";

import { createLocalMedia, type GetUserMedia } from "./LocalMedia";
import { type LocalVideoMediaTrack, type VideoProcessor } from "./media-api";

describe("createLocalMedia", () => {
  it("opens the microphone and the camera in one request", async () => {
    const getUserMedia = fakeGetUserMedia();
    const media = createLocalMedia(getUserMedia);

    const tracks = await media.capture([
      { source: "microphone", deviceId: "mic" },
      {
        source: "camera",
        capture: { resolution: { width: 640, height: 480 } },
      },
    ]);

    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({
      audio: { deviceId: "mic" },
      video: { width: 640, height: 480, frameRate: undefined },
    });
    expect(tracks.map((t) => t.source)).toEqual(["microphone", "camera"]);
    expect(media.tracks$.value).toEqual(tracks);
    expect(media.requests.map((r) => r.source)).toEqual([
      "microphone",
      "camera",
    ]);
  });

  it("joins an identical capture still in flight rather than opening the devices again", async () => {
    const getUserMedia = fakeGetUserMedia();
    const media = createLocalMedia(getUserMedia);
    const requests = [{ source: "camera" as const }];

    const [first, second] = await Promise.all([
      media.capture(requests),
      media.capture(requests),
    ]);

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
    expect(media.tracks$.value).toEqual(first);
  });

  it("shows the processor's output, initialised once", async () => {
    const processor = fakeProcessor();
    const media = createLocalMedia(fakeGetUserMedia());
    const [camera] = await media.capture([{ source: "camera", processor }]);
    const element = document.createElement("video");

    camera.attach(element);

    expect(processor.init).toHaveBeenCalledOnce();
    expect(tracksOn(element)).toEqual([processor.output]);
  });

  it.each(["stop", "handOver"] as const)(
    "cleans up a processor initialised after %s",
    async (ending) => {
      const output = fakeTrack("video");
      const initialisation = Promise.withResolvers<MediaStreamTrack>();
      const processor = fakeProcessor();
      vi.mocked(processor.init).mockReturnValue(initialisation.promise);
      const media = createLocalMedia(fakeGetUserMedia());
      const capture = media.capture([{ source: "camera", processor }]);
      await vi.waitFor(() => expect(processor.init).toHaveBeenCalledOnce());
      const input = vi.mocked(processor.init).mock.calls[0][0];

      if (ending === "stop") media.stop();
      else {
        const handed = media.takeTracks().get("camera")!;
        expect(handed.track).toBe(input);
        expect(handed.processor).toBeUndefined();
        expect(handed.processorToInitialize).toBe(processor);
      }
      initialisation.resolve(output);
      await expect(capture).resolves.toEqual([]);
      await vi.waitFor(() => expect(processor.destroy).toHaveBeenCalledOnce());

      expect(output.stop).toHaveBeenCalledOnce();
      expect(input.stop).toHaveBeenCalledTimes(ending === "stop" ? 1 : 0);
      expect(media.tracks$.value).toEqual([]);
    },
  );

  it("hands the tracks over as they are: no second capture, no second init", async () => {
    const getUserMedia = fakeGetUserMedia();
    const processor = fakeProcessor();
    const media = createLocalMedia(getUserMedia);
    const [microphone, camera] = await media.capture([
      { source: "microphone" },
      { source: "camera", processor },
    ]);

    const taken = media.takeTracks();

    expect(taken.get("microphone")?.track).toBe(trackBehind(microphone));
    expect(taken.get("camera")).toEqual({
      track: trackBehind(camera),
      constraints: {},
      muted: false,
      processor: { processor, processedTrack: processor.output },
    });
    expect(media.tracks$.value).toEqual([]);
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(processor.init).toHaveBeenCalledOnce();
    expect(processor.destroy).not.toHaveBeenCalled();
    media.stop();
    expect(taken.get("camera")!.track.stop).not.toHaveBeenCalled();
  });

  it("finishes a handed-over track", async () => {
    const media = createLocalMedia(fakeGetUserMedia());
    const [camera] = await media.capture([{ source: "camera" }]);
    const element = document.createElement("video");
    camera.attach(element);

    media.takeTracks();

    expect(element.srcObject).toBeNull();
    await expect(camera.setEnabled(false)).rejects.toThrow("handed over");
    expect(() => camera.attach(element)).toThrow("handed over");
  });

  it("mutes by disabling the track and hands the mute over", async () => {
    const media = createLocalMedia(fakeGetUserMedia());
    const [microphone] = await media.capture([{ source: "microphone" }]);

    await expect(microphone.setEnabled(false)).resolves.toBe(false);

    expect(microphone.muted$.value).toBe(true);
    expect(trackBehind(microphone).enabled).toBe(false);
    expect(media.takeTracks().get("microphone")?.muted).toBe(true);
  });

  it("switches the device by opening it anew", async () => {
    const getUserMedia = fakeGetUserMedia();
    const processor = fakeProcessor();
    const media = createLocalMedia(getUserMedia);
    const [camera] = await media.capture([{ source: "camera", processor }]);
    const first = trackBehind(camera);
    const element = document.createElement("video");
    camera.attach(element);

    await camera.setDevice("other");

    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: { deviceId: "other" },
    });
    expect(first.stop).toHaveBeenCalled();
    expect(processor.restart).toHaveBeenCalledOnce();
    const [restartedOn, input] = vi.mocked(processor.restart).mock.calls[0];
    expect(restartedOn).not.toBe(first);
    expect(input).toBe(vi.mocked(processor.init).mock.calls[0][1]);
    expect(tracksOn(element)).toEqual([processor.output]);
    expect(media.takeTracks().get("camera")?.constraints).toEqual({
      deviceId: "other",
    });
  });

  it("stops a device switch granted after the track owner has stopped", async () => {
    const permission = Promise.withResolvers<MediaStream>();
    const original = fakeTrack("video", { deviceId: "first" });
    const getUserMedia = vi
      .fn<GetUserMedia>()
      .mockResolvedValueOnce(
        new FakeMediaStream([original]) as unknown as MediaStream,
      )
      .mockReturnValueOnce(permission.promise);
    const media = createLocalMedia(getUserMedia);
    const [camera] = await media.capture([{ source: "camera" }]);

    const switching = camera.setDevice("other");
    media.stop();
    const lateTracks = [fakeTrack("video"), fakeTrack("audio")];
    permission.resolve(
      new FakeMediaStream(lateTracks) as unknown as MediaStream,
    );
    await switching;

    for (const track of lateTracks) expect(track.stop).toHaveBeenCalledOnce();
    expect(original.stop).toHaveBeenCalledOnce();
    expect(media.tracks$.value).toEqual([]);
  });

  it.each(["stop", "handOver"] as const)(
    "cleans up a processor restarted after %s",
    async (ending) => {
      const output = fakeTrack("video");
      const restarting = Promise.withResolvers<MediaStreamTrack>();
      const processor = fakeProcessor();
      vi.mocked(processor.restart).mockReturnValue(restarting.promise);
      const media = createLocalMedia(fakeGetUserMedia());
      const [camera] = await media.capture([{ source: "camera", processor }]);
      const switching = camera.setDevice("other");
      await vi.waitFor(() => expect(processor.restart).toHaveBeenCalledOnce());

      if (ending === "stop") media.stop();
      else
        expect(media.takeTracks().get("camera")?.processorToInitialize).toBe(
          processor,
        );
      restarting.resolve(output);
      await switching;
      await vi.waitFor(() => expect(processor.destroy).toHaveBeenCalledOnce());

      expect(output.stop).toHaveBeenCalledOnce();
      expect(media.tracks$.value).toEqual([]);
    },
  );

  it("reports the facing mode and switches it", async () => {
    const getUserMedia = fakeGetUserMedia({ facingMode: "user" });
    const media = createLocalMedia(getUserMedia);
    const [camera] = (await media.capture([{ source: "camera" }])) as [
      LocalVideoMediaTrack,
    ];
    expect(camera.facingMode$.value).toBe("user");

    await camera.switchFacingMode();

    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: { facingMode: "environment" },
    });
  });

  it("releases one device and stops the rest", async () => {
    const media = createLocalMedia(fakeGetUserMedia());
    const [microphone, camera] = await media.capture([
      { source: "microphone" },
      { source: "camera" },
    ]);

    media.release("camera");
    expect(trackBehind(camera).stop).toHaveBeenCalled();
    expect(media.tracks$.value).toEqual([microphone]);

    media.stop();
    expect(trackBehind(microphone).stop).toHaveBeenCalled();
    expect(media.tracks$.value).toEqual([]);
  });

  it.each(["stop", "handOver"] as const)(
    "stops tracks granted after %s",
    async (ending) => {
      const permission = Promise.withResolvers<MediaStream>();
      const media = createLocalMedia(async () => permission.promise);
      const pending = media.capture([
        { source: "microphone" },
        { source: "camera" },
      ]);

      if (ending === "stop") media.stop();
      else expect(media.takeTracks().size).toBe(0);
      const tracks = [fakeTrack("audio"), fakeTrack("video")];
      permission.resolve(new FakeMediaStream(tracks) as unknown as MediaStream);

      await expect(pending).resolves.toEqual([]);
      for (const track of tracks) expect(track.stop).toHaveBeenCalledOnce();
      expect(media.tracks$.value).toEqual([]);
      expect(media.requests).toEqual([]);
    },
  );

  it.each(["stop", "handOver"] as const)(
    "starts a fresh capture after %s without joining or clearing the old request",
    async (ending) => {
      const firstPermission = Promise.withResolvers<MediaStream>();
      const nextPermission = Promise.withResolvers<MediaStream>();
      const getUserMedia = vi
        .fn<GetUserMedia>()
        .mockReturnValueOnce(firstPermission.promise)
        .mockReturnValueOnce(nextPermission.promise);
      const media = createLocalMedia(getUserMedia);
      const request = [{ source: "camera" as const }];
      const first = media.capture(request);
      if (ending === "stop") media.stop();
      else media.takeTracks();
      const second = media.capture(request);
      const oldTrack = fakeTrack("video");
      firstPermission.resolve(
        new FakeMediaStream([oldTrack]) as unknown as MediaStream,
      );
      await expect(first).resolves.toEqual([]);
      const duplicate = media.capture(request);

      const newTrack = fakeTrack("video");
      nextPermission.resolve(
        new FakeMediaStream([newTrack]) as unknown as MediaStream,
      );
      const [current, joined] = await Promise.all([second, duplicate]);

      expect(getUserMedia).toHaveBeenCalledTimes(2);
      expect(oldTrack.stop).toHaveBeenCalledOnce();
      expect(newTrack.stop).not.toHaveBeenCalled();
      expect(current[0].id).toBe(newTrack.id);
      expect(joined).toEqual(current);
      expect(media.tracks$.value).toEqual(current);
    },
  );

  it("refuses a screen share", async () => {
    const media = createLocalMedia(fakeGetUserMedia());
    await expect(media.capture([{ source: "screenShare" }])).rejects.toThrow(
      "screen share",
    );
  });
});

class FakeMediaStream {
  public constructor(private readonly tracks: MediaStreamTrack[]) {}
  public getTracks(): MediaStreamTrack[] {
    return this.tracks;
  }
}

beforeAll(() => {
  globalThis.MediaStream = FakeMediaStream as unknown as typeof MediaStream;
});

let nextId = 0;
const tracksById = new Map<string, MediaStreamTrack>();

function fakeTrack(
  kind: "audio" | "video",
  settings: MediaTrackSettings = {},
): MediaStreamTrack {
  const track = {
    kind,
    id: `${kind}-${nextId++}`,
    enabled: true,
    stop: vi.fn(),
    getSettings: () => settings,
  } as unknown as MediaStreamTrack;
  tracksById.set(track.id, track);
  return track;
}

function fakeGetUserMedia(videoSettings?: MediaTrackSettings): GetUserMedia {
  return vi.fn(async (constraints: MediaStreamConstraints) => {
    const tracks: MediaStreamTrack[] = [];
    if (constraints.audio) tracks.push(fakeTrack("audio"));
    if (constraints.video) tracks.push(fakeTrack("video", videoSettings));
    return Promise.resolve(
      new FakeMediaStream(tracks) as unknown as MediaStream,
    );
  });
}

function fakeProcessor(): VideoProcessor & { output: MediaStreamTrack } {
  const output = fakeTrack("video");
  return {
    name: "blur",
    output,
    init: vi.fn(async () => Promise.resolve(output)),
    restart: vi.fn(async () => Promise.resolve(output)),
    destroy: vi.fn(async () => Promise.resolve()),
  };
}

/** The device's track, which a media track was created on and keeps the id of. */
function trackBehind(mediaTrack: { id: string }): MediaStreamTrack {
  return tracksById.get(mediaTrack.id)!;
}

function tracksOn(element: HTMLMediaElement): MediaStreamTrack[] {
  return (element.srcObject as unknown as FakeMediaStream).getTracks();
}
