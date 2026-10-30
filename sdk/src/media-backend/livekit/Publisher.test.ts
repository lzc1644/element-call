/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventEmitter } from "events";
import {
  ConnectionState,
  LocalParticipant,
  type LocalTrack,
  type LocalTrackPublication,
  ParticipantEvent,
  type Room as LivekitRoom,
  Track,
} from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type PublishRequest } from "../../media-api";
import { flushPromises } from "../../utils/test";
import { type DesiredMedia, Publisher } from "./Publisher";

describe("Publisher", () => {
  describe("setAudioOutputDevice", () => {
    it("switches the room's output while the room is still connecting", async () => {
      const { room, switchActiveDevice } = fakeRoom(ConnectionState.Connecting);
      const publisher = new Publisher(room, new Map(), logger);

      await publisher.setAudioOutputDevice("speaker");
      expect(switchActiveDevice).toHaveBeenCalledWith("audiooutput", "speaker");
    });

    it("leaves a room alone that already plays on the device", async () => {
      const { room, switchActiveDevice } = fakeRoom(
        ConnectionState.Connected,
        "speaker",
      );
      const publisher = new Publisher(room, new Map(), logger);

      await publisher.setAudioOutputDevice("speaker");
      expect(switchActiveDevice).not.toHaveBeenCalled();
    });

    it("rejects where the room cannot switch", async () => {
      const { room, switchActiveDevice } = fakeRoom(ConnectionState.Connected);
      switchActiveDevice.mockRejectedValue(new Error("no setSinkId"));
      const publisher = new Publisher(room, new Map(), logger);

      await expect(publisher.setAudioOutputDevice("speaker")).rejects.toThrow(
        "no setSinkId",
      );
    });
  });

  // The publisher drives a real LocalParticipant, so that LiveKit's own
  // bookkeeping of pending publications is part of what is tested; only the
  // device access and the signalling are faked.
  describe("publishing", () => {
    let participant: LocalParticipant;
    let room: LivekitRoom;
    let desired: DesiredMedia;
    let publisher: Publisher;
    // Resolved by default; a test takes hold of it to stretch the track creation
    let createTracksLock: Promise<void>;

    const microphone: PublishRequest = { source: "microphone" };
    const camera: PublishRequest = { source: "camera" };

    function want(...requests: PublishRequest[]): void {
      for (const request of requests)
        desired.set(request.source, { request, enabled: true });
    }

    function track(source: Track.Source): LocalTrack | undefined {
      return participant.getTrackPublication(source)?.track;
    }

    beforeEach(() => {
      createTracksLock = Promise.resolve();
      participant = fakeLocalParticipant(async () => createTracksLock);
      room = {
        options: {},
        setE2EEEnabled: () => undefined,
        localParticipant: participant,
      } as unknown as LivekitRoom;
      desired = new Map();
      publisher = new Publisher(room, desired, logger);
    });

    afterEach(async () => {
      await publisher.destroy();
    });

    it("creates no tracks where everything starts muted, to spare the permission prompt", async () => {
      want(microphone, camera);
      desired.get("microphone")!.enabled = false;
      desired.get("camera")!.enabled = false;

      publisher.start();
      await flushPromises();

      expect(participant.createTracks).not.toHaveBeenCalled();
    });

    it("asks for the camera and the microphone in one call", async () => {
      const enableBoth = vi.spyOn(participant, "enableCameraAndMicrophone");
      want(microphone, camera);

      publisher.start();
      await flushPromises();

      expect(enableBoth).toHaveBeenCalledOnce();
      expect(participant.createTracks).toHaveBeenCalledOnce();
      expect(participant.createTracks).toHaveBeenCalledWith({
        audio: true,
        video: true,
      });
    });

    it.each([
      { enabled: microphone, muted: camera, options: { audio: true } },
      { enabled: camera, muted: microphone, options: { video: true } },
    ])(
      "creates only the $enabled.source where the $muted.source is muted",
      async ({ enabled, muted, options }) => {
        want(enabled, muted);
        desired.get(muted.source)!.enabled = false;

        publisher.start();
        await flushPromises();

        expect(participant.createTracks).toHaveBeenCalledOnce();
        expect(participant.createTracks).toHaveBeenCalledWith(options);
      },
    );

    it("starts again at most once", async () => {
      want(microphone);

      publisher.start();
      publisher.start();
      await flushPromises();

      expect(participant.createTracks).toHaveBeenCalledOnce();
    });

    it("resumes a track arriving during the initial publishing transition", async () => {
      want(microphone);
      void publisher.setPublishingEnabled(false);
      publisher.start();
      await publisher.startPublishing();
      await flushPromises();
      expect(track(Track.Source.Microphone)!.isUpstreamPaused).toBe(false);
    });

    it("keeps the upstream paused until the member publishes", async () => {
      want(microphone);

      publisher.start();
      await flushPromises();

      const microphoneTrack = track(Track.Source.Microphone);
      expect(microphoneTrack).toBeDefined();
      expect(microphoneTrack!.pauseUpstream).toHaveBeenCalled();
      expect(microphoneTrack!.isUpstreamPaused).toBe(true);
    });

    it("resumes the upstream once the member publishes", async () => {
      want(camera);
      publisher.start();
      await flushPromises();
      expect(track(Track.Source.Camera)!.isUpstreamPaused).toBe(true);

      await publisher.startPublishing();

      expect(track(Track.Source.Camera)!.isUpstreamPaused).toBe(false);
    });

    it("pauses the upstream again when the member stops publishing", async () => {
      want(camera);
      publisher.start();
      await flushPromises();
      await publisher.startPublishing();

      await publisher.stopPublishing();

      expect(track(Track.Source.Camera)!.isUpstreamPaused).toBe(true);
    });

    it("leaves a track published while it publishes, paused or not", async () => {
      want(microphone);
      await publisher.startPublishing();

      publisher.start();
      await flushPromises();

      expect(track(Track.Source.Microphone)!.isUpstreamPaused).toBe(false);
    });

    it.each([Track.Source.ScreenShare, Track.Source.ScreenShareAudio])(
      "restores %s together with the camera after a reconnect",
      async (source) => {
        await publisher.startPublishing();
        const cameraTrack = await publishTrack(Track.Source.Camera);
        const shareTrack = await publishTrack(source);
        await publisher.stopPublishing();
        expect(cameraTrack.isUpstreamPaused).toBe(true);
        expect(shareTrack.isUpstreamPaused).toBe(true);
        await publisher.startPublishing();
        expect(cameraTrack.isUpstreamPaused).toBe(false);
        expect(shareTrack.isUpstreamPaused).toBe(false);
      },
    );

    it("does not resume an upstream paused by another owner", async () => {
      const t = fakeLocalTrack(Track.Source.Camera);
      await t.pauseUpstream();
      await participant.publishTrack(t);
      await flushPromises();
      await publisher.startPublishing();
      expect(t.resumeUpstream).not.toHaveBeenCalled();
      expect(t.isUpstreamPaused).toBe(true);
    });

    it("resumes after reconnect races an asynchronous pause", async () => {
      await publisher.startPublishing();
      const t = await publishTrack(Track.Source.Camera);
      const pending = Promise.withResolvers<void>();
      const pause = vi.mocked(t.pauseUpstream).getMockImplementation()!;
      vi.mocked(t.pauseUpstream).mockImplementationOnce(async () => {
        await pending.promise;
        await pause();
      });
      const stopping = publisher.stopPublishing();
      await flushPromises();
      const starting = publisher.startPublishing();
      pending.resolve();
      await Promise.all([stopping, starting]);
      expect(t.isUpstreamPaused).toBe(false);
      expect(t.resumeUpstream).toHaveBeenCalledOnce();
    });

    it("pauses again when disconnect races an asynchronous resume", async () => {
      await publisher.startPublishing();
      const t = await publishTrack(Track.Source.Camera);
      await publisher.stopPublishing();
      const pending = Promise.withResolvers<void>();
      const resume = vi.mocked(t.resumeUpstream).getMockImplementation()!;
      vi.mocked(t.resumeUpstream).mockImplementationOnce(async () => {
        await pending.promise;
        await resume();
      });
      const starting = publisher.startPublishing();
      await flushPromises();
      const stopping = publisher.stopPublishing();
      pending.resolve();
      await Promise.all([starting, stopping]);
      expect(t.isUpstreamPaused).toBe(true);
      expect(publisher.shouldPublish).toBe(false);
    });

    it("resumes an owned replacement arriving while another track resumes", async () => {
      await publisher.startPublishing();
      const old = await publishTrack(Track.Source.Microphone);
      const cameraTrack = await publishTrack(Track.Source.Camera);
      await publisher.stopPublishing();
      const pending = Promise.withResolvers<void>();
      const resume = cameraTrack.resumeUpstream.bind(cameraTrack);
      vi.mocked(cameraTrack.resumeUpstream).mockImplementationOnce(async () => {
        await pending.promise;
        await resume();
      });
      const starting = publisher.startPublishing();
      await flushPromises();
      await participant.unpublishTrack(old);
      const replacement = await publishTrack(Track.Source.Microphone);
      expect(replacement.isUpstreamPaused).toBe(true);
      pending.resolve();
      await starting;
      expect(replacement.isUpstreamPaused).toBe(false);
      expect(replacement.resumeUpstream).toHaveBeenCalledOnce();
    });

    it("never resumes a retired replacement while another track resumes", async () => {
      await publisher.startPublishing();
      const cameraTrack = await publishTrack(Track.Source.Camera);
      await publisher.stopPublishing();
      const pending = Promise.withResolvers<void>();
      const resume = cameraTrack.resumeUpstream.bind(cameraTrack);
      vi.mocked(cameraTrack.resumeUpstream).mockImplementationOnce(async () => {
        await pending.promise;
        await resume();
      });
      const starting = publisher.startPublishing();
      await flushPromises();
      const replacement = await publishTrack(Track.Source.Microphone);
      await participant.unpublishTrack(replacement);
      pending.resolve();
      await starting;
      expect(replacement.resumeUpstream).not.toHaveBeenCalled();
    });

    it("continues pausing other tracks on failure and retries the failed pause", async () => {
      await publisher.startPublishing();
      const microphoneTrack = await publishTrack(Track.Source.Microphone);
      const cameraTrack = await publishTrack(Track.Source.Camera);
      const shareAudio = await publishTrack(Track.Source.ScreenShareAudio);
      vi.mocked(microphoneTrack.pauseUpstream).mockRejectedValueOnce(
        new Error("pause failed"),
      );
      await expect(publisher.stopPublishing()).rejects.toThrow("pause failed");
      expect(cameraTrack.isUpstreamPaused).toBe(true);
      expect(shareAudio.isUpstreamPaused).toBe(true);
      await publisher.stopPublishing();
      expect(microphoneTrack.isUpstreamPaused).toBe(true);
      expect(microphoneTrack.pauseUpstream).toHaveBeenCalledTimes(2);
    });

    it("continues resuming other tracks on failure and retries the failed resume", async () => {
      await publisher.startPublishing();
      const microphoneTrack = await publishTrack(Track.Source.Microphone);
      const cameraTrack = await publishTrack(Track.Source.Camera);
      await publisher.stopPublishing();
      vi.mocked(microphoneTrack.resumeUpstream).mockRejectedValueOnce(
        new Error("resume failed"),
      );
      await expect(publisher.startPublishing()).rejects.toThrow(
        "resume failed",
      );
      expect(cameraTrack.isUpstreamPaused).toBe(false);
      await publisher.startPublishing();
      expect(microphoneTrack.isUpstreamPaused).toBe(false);
      expect(microphoneTrack.resumeUpstream).toHaveBeenCalledTimes(2);
    });

    it("retries a failed new-track pause when disabled is requested again", async () => {
      const t = fakeLocalTrack(Track.Source.Microphone);
      vi.mocked(t.pauseUpstream).mockRejectedValueOnce(
        new Error("pause failed"),
      );
      await participant.publishTrack(t);
      await flushPromises();
      expect(t.isUpstreamPaused).toBe(false);
      await publisher.setPublishingEnabled(false);
      expect(t.isUpstreamPaused).toBe(true);
    });

    it.each(["destroy", "unpublish"])(
      "does not issue another pause after %s while a pause is pending",
      async (stop) => {
        await publisher.startPublishing();
        const t = await publishTrack(Track.Source.Camera);
        const pending = Promise.withResolvers<void>();
        const pause = vi.mocked(t.pauseUpstream).getMockImplementation()!;
        vi.mocked(t.pauseUpstream).mockImplementationOnce(async () => {
          await pending.promise;
          await pause();
        });
        const stopping = publisher.stopPublishing();
        await flushPromises();
        participant.emit(
          ParticipantEvent.LocalTrackPublished,
          participant.getTrackPublication(t.source)!,
        );
        await flushPromises();
        if (stop === "destroy") await publisher.destroy();
        else await participant.unpublishTrack(t);
        pending.resolve();
        await stopping;
        await flushPromises();
        expect(t.pauseUpstream).toHaveBeenCalledOnce();
      },
    );

    it("removes both publication listeners on destroy", async () => {
      await publisher.destroy();
      expect(
        participant.listenerCount(ParticipantEvent.LocalTrackPublished),
      ).toBe(0);
      expect(
        participant.listenerCount(ParticipantEvent.LocalTrackUnpublished),
      ).toBe(0);
    });

    async function publishTrack(source: Track.Source): Promise<LocalTrack> {
      const t = fakeLocalTrack(source);
      await participant.publishTrack(t);
      await flushPromises();
      return t;
    }

    it("mutes and unmutes a track", async () => {
      want(microphone);
      publisher.start();
      await flushPromises();
      await publisher.startPublishing();

      await expect(publisher.setEnabled("microphone", false)).resolves.toBe(
        false,
      );
      expect(track(Track.Source.Microphone)!.isMuted).toBe(true);

      await expect(publisher.setEnabled("microphone", true)).resolves.toBe(
        true,
      );
      expect(track(Track.Source.Microphone)!.isMuted).toBe(false);
    });

    it("keeps the upstream paused when a track is unmuted before the member publishes", async () => {
      want(microphone);
      publisher.start();
      await flushPromises();
      await publisher.setEnabled("microphone", false);

      await publisher.setEnabled("microphone", true);

      expect(track(Track.Source.Microphone)!.isUpstreamPaused).toBe(true);
    });

    it("reports the state LiveKit is left in where a mute fails", async () => {
      want(camera);
      publisher.start();
      await flushPromises();
      vi.spyOn(participant, "setCameraEnabled").mockRejectedValueOnce(
        new Error("device gone"),
      );

      await expect(publisher.setEnabled("camera", false)).resolves.toBe(true);
    });

    it("reports a screen share that was never published as muted", async () => {
      await expect(publisher.setEnabled("screenShare", true)).resolves.toBe(
        false,
      );
    });

    // Creating the tracks takes a while, and the host may mute in the
    // meantime: LiveKit's setMicrophoneEnabled(false) does not see a track
    // that is still pending, so the publisher has to apply the mute once the
    // track is published.
    it("mutes a track that was muted while it was being created", async () => {
      want(microphone);
      const lock = Promise.withResolvers<void>();
      createTracksLock = lock.promise;

      publisher.start();
      await publisher.startPublishing();
      desired.get("microphone")!.enabled = false;
      void publisher.setEnabled("microphone", false);
      await flushPromises();
      expect(track(Track.Source.Microphone)).toBeUndefined();

      lock.resolve();
      await flushPromises();
      await flushPromises();

      const microphoneTrack = track(Track.Source.Microphone);
      expect(microphoneTrack).toBeDefined();
      expect(microphoneTrack!.isMuted).toBe(true);
    });

    it("publishes a request on its own once started", async () => {
      want(microphone);
      publisher.start();
      await flushPromises();

      const publication = await publisher.publish(camera);

      expect(publication?.source).toBe(Track.Source.Camera);
      expect(track(Track.Source.Camera)!.isUpstreamPaused).toBe(true);
    });

    it("unpublishes a source and stops its track", async () => {
      want(microphone, camera);
      publisher.start();
      await flushPromises();
      const cameraTrack = track(Track.Source.Camera)!;

      await publisher.unpublish("camera");

      expect(participant.unpublishTrack).toHaveBeenCalledWith(
        cameraTrack,
        true,
      );
      expect(track(Track.Source.Camera)).toBeUndefined();
      expect(track(Track.Source.Microphone)).toBeDefined();
    });

    it("unpublishes a screen share through LiveKit, so that its audio goes with it", async () => {
      await publisher.unpublish("screenShare");
      expect(participant.setScreenShareEnabled).toHaveBeenCalledWith(false);
    });

    it("stops every track on destroy", async () => {
      want(microphone, camera);
      publisher.start();
      await flushPromises();
      const tracks = [
        track(Track.Source.Microphone),
        track(Track.Source.Camera),
      ];

      await publisher.destroy();

      for (const t of tracks)
        expect(participant.unpublishTrack).toHaveBeenCalledWith(t, true);
      expect(participant.trackPublications.size).toBe(0);
    });
  });
});

/** The slice of a LiveKit room the publisher touches at construction and for the output device. */
function fakeRoom(
  state: ConnectionState,
  activeOutput?: string,
): { room: LivekitRoom; switchActiveDevice: ReturnType<typeof vi.fn> } {
  const switchActiveDevice = vi.fn(async () => Promise.resolve(true));
  const room = {
    state,
    options: {},
    setE2EEEnabled: () => undefined,
    localParticipant: new EventEmitter(),
    getActiveDevice: () => activeOutput,
    switchActiveDevice,
  } as unknown as LivekitRoom;
  return { room, switchActiveDevice };
}

function fakeLocalTrack(source: Track.Source): LocalTrack {
  const state = { isMuted: false, isUpstreamPaused: false };
  const track = {
    source,
    get isMuted() {
      return state.isMuted;
    },
    get isUpstreamPaused() {
      return state.isUpstreamPaused;
    },
    stop: vi.fn(),
    mute: vi.fn(async () => {
      state.isMuted = true;
      return Promise.resolve(track);
    }),
    unmute: vi.fn(async () => {
      state.isMuted = false;
      return Promise.resolve(track);
    }),
    pauseUpstream: vi.fn(async () => {
      state.isUpstreamPaused = true;
      return Promise.resolve();
    }),
    resumeUpstream: vi.fn(async () => {
      state.isUpstreamPaused = false;
      return Promise.resolve();
    }),
  };
  return track as unknown as LocalTrack;
}

/**
 * A real LocalParticipant on a fake engine: the track creation, publication
 * and unpublication are replaced so that no device or signalling is touched,
 * while the enable/disable logic and the pending publications stay LiveKit's.
 */
function fakeLocalParticipant(
  createTracksLock: () => Promise<void>,
): LocalParticipant {
  const engine = {
    client: { sendUpdateLocalMetadata: vi.fn() },
    on: vi.fn().mockReturnThis(),
    sendDataPacket: vi.fn(),
  };
  const participant = new LocalParticipant(
    "local-sid",
    "local-identity",
    // @ts-expect-error - an engine that answers nothing is enough here
    engine,
    {
      adaptiveStream: true,
      dynacast: false,
      audioCaptureDefaults: {},
      videoCaptureDefaults: {},
      stopLocalTrackOnUnpublish: true,
      reconnectPolicy: "always",
      disconnectOnPageLeave: true,
    },
    new Map(),
    {},
    {},
    {},
  );
  let nextSid = 0;

  vi.spyOn(participant, "createTracks").mockImplementation(async (opts) => {
    const tracks: LocalTrack[] = [];
    if (opts?.audio) tracks.push(fakeLocalTrack(Track.Source.Microphone));
    if (opts?.video) tracks.push(fakeLocalTrack(Track.Source.Camera));
    await createTracksLock();
    return tracks;
  });

  vi.spyOn(participant, "publishTrack").mockImplementation(async (t) => {
    const track = t as LocalTrack;
    const publication = {
      track,
      source: track.source,
      trackSid: `TR_${nextSid++}`,
      get isMuted() {
        return track.isMuted;
      },
      mute: track.mute,
      unmute: track.unmute,
    } as Partial<LocalTrackPublication> as LocalTrackPublication;
    participant.trackPublications.set(publication.trackSid, publication);
    participant.emit(ParticipantEvent.LocalTrackPublished, publication);
    return Promise.resolve(publication);
  });

  vi.spyOn(participant, "unpublishTrack").mockImplementation(async (t) => {
    const publication = [...participant.trackPublications.values()].find(
      (p) => p.track === t,
    );
    if (publication === undefined) return undefined;
    participant.trackPublications.delete(publication.trackSid);
    participant.emit(ParticipantEvent.LocalTrackUnpublished, publication);
    return Promise.resolve(publication);
  });

  vi.spyOn(participant, "getTrackPublication").mockImplementation((source) =>
    [...participant.trackPublications.values()].find(
      (p) => p.source === source,
    ),
  );

  vi.spyOn(participant, "setScreenShareEnabled").mockResolvedValue(undefined);

  return participant;
}
