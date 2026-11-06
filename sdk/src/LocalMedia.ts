/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject, type Observable, of } from "rxjs";

import { MatrixRTCError } from "./errors";
import {
  type HandedOverTrack,
  type LocalAudioMediaTrack,
  type LocalMedia,
  type LocalVideoMediaTrack,
  type MediaSource,
  type MediaStreamStats,
  type PublishRequest,
  type VideoProcessor,
} from "./media-api";
import { constant } from "./reactive/Behavior";
import { inTurn } from "./utils/processorTurns";

type Source = "microphone" | "camera";
type Request = Extract<PublishRequest, { source: Source }>;
export type GetUserMedia = (
  constraints: MediaStreamConstraints,
) => Promise<MediaStream>;

/**
 * Local media on the browser's devices alone, for a lobby ahead of a join:
 * no backend is involved, so whichever backend joins can take the tracks
 * over. Activity and level are not measured; stats are none.
 */
export function createLocalMedia(
  getUserMedia: GetUserMedia = async (constraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
): LocalMedia {
  let generation = 0;
  const capturedTracks = new Map<Source, CapturedTrack>();
  const requests = new Map<Source, Request>();
  const tracks$ = new BehaviorSubject<
    (LocalAudioMediaTrack | LocalVideoMediaTrack)[]
  >([]);
  const publishCapturedTracks = (): void =>
    tracks$.next(
      [...capturedTracks.values()].map(({ mediaTrack }) => mediaTrack),
    );

  // A second identical capture while the first is open joins it: a host that
  // mounts twice (React's strict mode) must not open the devices twice and
  // replace the tracks it is already showing
  const pending = new Map<
    string,
    Promise<(LocalAudioMediaTrack | LocalVideoMediaTrack)[]>
  >();
  const capture = async (
    wanted: PublishRequest[],
  ): Promise<(LocalAudioMediaTrack | LocalVideoMediaTrack)[]> => {
    const key = JSON.stringify(
      wanted.map((request) => ({ ...request, processor: undefined })),
    );
    const running = pending.get(key);
    if (running) return running;
    const started = captureNow(wanted, generation).finally(() => {
      if (pending.get(key) === started) pending.delete(key);
    });
    pending.set(key, started);
    return started;
  };

  const captureNow = async (
    wanted: PublishRequest[],
    captureGeneration: number,
  ): Promise<(LocalAudioMediaTrack | LocalVideoMediaTrack)[]> => {
    const bySource = new Map<Source, Request>();
    for (const request of wanted) {
      if (request.source === "screenShare")
        throw new MatrixRTCError(
          "A screen share cannot be captured ahead of a join",
        );
      bySource.set(request.source, request);
    }
    const constraints: MediaStreamConstraints = {};
    for (const request of bySource.values())
      constraints[request.source === "microphone" ? "audio" : "video"] =
        trackConstraints(request);
    const stream = await getUserMedia(constraints);
    if (captureGeneration !== generation) {
      for (const track of stream.getTracks()) track.stop();
      return [];
    }
    const captured: CapturedTrack[] = [];
    for (const track of stream.getTracks()) {
      const source: Source = track.kind === "audio" ? "microphone" : "camera";
      const request = bySource.get(source)!;
      capturedTracks.get(source)?.stop();
      const captured_ = new CapturedTrack(
        source,
        track,
        trackConstraints(request),
        getUserMedia,
      );
      capturedTracks.set(source, captured_);
      requests.set(source, request);
      captured.push(captured_);
    }
    for (const captured_ of captured) {
      const request = bySource.get(captured_.source)!;
      if (request.source === "camera" && request.processor)
        await captured_.setProcessor(request.processor);
    }
    publishCapturedTracks();
    return captured
      .filter((track) => capturedTracks.get(track.source) === track)
      .map(({ mediaTrack }) => mediaTrack);
  };

  const release = (source: MediaSource): void => {
    if (source !== "microphone" && source !== "camera") return;
    capturedTracks.get(source)?.stop();
    capturedTracks.delete(source);
    publishCapturedTracks();
  };

  const stop = (): void => {
    // Permission prompts cannot be cancelled; discard their streams when they arrive.
    generation++;
    pending.clear();
    for (const track of capturedTracks.values()) track.stop();
    capturedTracks.clear();
    publishCapturedTracks();
  };

  const takeTracks = (): Map<Source, HandedOverTrack> => {
    generation++;
    pending.clear();
    const taken = new Map<Source, HandedOverTrack>();
    for (const [source, track] of capturedTracks)
      taken.set(source, track.handOver());
    capturedTracks.clear();
    publishCapturedTracks();
    return taken;
  };

  return {
    get requests(): PublishRequest[] {
      return [...requests.values()];
    },
    tracks$,
    capture,
    release,
    stop,
    takeTracks,
  };
}

/** The constraints a request means to the browser. */
function trackConstraints(request: Request): MediaTrackConstraints {
  const device = request.deviceId && { deviceId: request.deviceId };
  if (request.source === "microphone") return { ...device, ...request.capture };
  const resolution = request.capture?.resolution;
  return {
    ...device,
    ...(resolution && {
      width: resolution.width,
      height: resolution.height,
      frameRate: resolution.frameRate,
    }),
  };
}

/**
 * Internal Class that is the owner of the tracks.
 * Will get stored in `capturedTracks` of `createLocalMedia`.
 * To the outside this class will return the `LocalMedia` interface.
 */
class CapturedTrack {
  public readonly mediaTrack: LocalAudioMediaTrack | LocalVideoMediaTrack;
  private readonly muted$ = new BehaviorSubject(false);
  private readonly facingMode$: BehaviorSubject<
    "user" | "environment" | undefined
  >;
  private readonly elements = new Set<HTMLMediaElement>();
  private processor: HandedOverTrack["processor"];
  private pendingProcessor?: {
    processor: VideoProcessor;
    cancel: () => void;
    done: Promise<void>;
  };
  private handedOver = false;
  /** What the processor reads frames from; a processor needs a playing element. */
  private processorInput?: HTMLVideoElement;
  private finished = false;

  public constructor(
    public readonly source: Source,
    private track: MediaStreamTrack,
    private constraints: MediaTrackConstraints,
    private readonly getUserMedia: GetUserMedia,
  ) {
    this.facingMode$ = new BehaviorSubject(facingModeOf(track));
    this.mediaTrack = this.asMediaTrack();
  }

  public handOver(): HandedOverTrack {
    const processorToInitialize = this.pendingProcessor?.processor;
    this.cancelProcessorBuild();
    this.handedOver = true;
    const { track, processor } = this;
    this.processor = undefined;
    // The device actually in use, so that a backend asked for it again
    // recognises it rather than restarting the track
    const { deviceId } = track.getSettings();
    const constraints = { ...this.constraints, ...(deviceId && { deviceId }) };
    this.finish();
    return {
      track,
      constraints,
      muted: this.muted$.value,
      processor,
      ...(processorToInitialize && { processorToInitialize }),
    };
  }

  public stop(): void {
    this.cancelProcessorBuild();
    const { processor } = this;
    this.processor = undefined;
    if (processor)
      void inTurn(processor.processor, async () =>
        processor.processor.destroy(),
      );
    processor?.processedTrack.stop();
    this.track.stop();
    this.finish();
  }

  public async setProcessor(
    processor: VideoProcessor | undefined,
  ): Promise<void> {
    this.live();
    const pending = this.pendingProcessor;
    if (pending && pending.processor === processor) return pending.done;
    if (!pending && processor === this.processor?.processor) return;
    this.cancelProcessorBuild();
    const previous = this.processor?.processor;
    this.processor = undefined;
    const destroyed = previous
      ? inTurn(previous, async () => previous.destroy())
      : Promise.resolve();
    if (processor === undefined) {
      await destroyed;
      if (!this.finished) this.show();
      return;
    }
    return this.buildProcessor(processor, destroyed);
  }

  private async buildProcessor(
    processor: VideoProcessor,
    destroyed: Promise<void> = Promise.resolve(),
    restart = false,
  ): Promise<void> {
    let cancelled = false;
    let started = false;
    const cancel = (): void => {
      cancelled = true;
      if (started)
        // Queue teardown now, before a receiving backend can enqueue its own init.
        void inTurn(processor, async () => {
          await done.catch(() => undefined);
          await processor.destroy();
          if (this.finished && this.processorInput)
            this.processorInput.srcObject = null;
        });
    };
    const done = (async (): Promise<void> => {
      await destroyed;
      if (cancelled) return;
      started = true;
      const processedTrack = await inTurn(processor, async () =>
        restart
          ? processor.restart(this.track, this.input())
          : processor.init(this.track, this.input()),
      );
      if (cancelled) {
        if (processedTrack !== this.track || !this.handedOver)
          processedTrack.stop();
        return;
      }
      this.pendingProcessor = undefined;
      this.processor = { processor, processedTrack };
      this.show();
    })().finally(() => {
      if (this.pendingProcessor?.done === done)
        this.pendingProcessor = undefined;
    });
    this.pendingProcessor = { processor, cancel, done };
    return done;
  }

  private cancelProcessorBuild(): void {
    const pending = this.pendingProcessor;
    this.pendingProcessor = undefined;
    pending?.cancel();
  }

  private input(): HTMLVideoElement {
    this.processorInput ??= document.createElement("video");
    this.processorInput.muted = true;
    this.processorInput.playsInline = true;
    play(this.processorInput, this.track);
    return this.processorInput;
  }

  private finish(): void {
    this.finished = true;
    for (const element of this.elements) element.srcObject = null;
    this.elements.clear();
  }

  private live(): void {
    if (this.finished)
      throw new MatrixRTCError(
        `The ${this.source} was handed over to a participation`,
      );
  }

  private shown(): MediaStreamTrack {
    return this.processor?.processedTrack ?? this.track;
  }

  private show(): void {
    for (const element of this.elements) play(element, this.shown());
  }

  private async reacquire(constraints: MediaTrackConstraints): Promise<void> {
    this.live();
    this.constraints = { ...this.constraints, ...constraints };
    const stream = await this.getUserMedia({
      [this.track.kind]: this.constraints,
    });
    if (this.finished) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    this.track.stop();
    this.track = stream.getTracks()[0];
    this.track.enabled = !this.muted$.value;
    const processor =
      this.pendingProcessor?.processor ?? this.processor?.processor;
    const restart = this.processor !== undefined;
    this.cancelProcessorBuild();
    this.processor = undefined;
    if (processor) await this.buildProcessor(processor, undefined, restart);
    if (this.finished) return;
    this.facingMode$.next(facingModeOf(this.track));
    this.show();
  }

  private asMediaTrack(): LocalAudioMediaTrack | LocalVideoMediaTrack {
    const base = {
      source: this.source,
      id: this.track.id,
      muted$: this.muted$,
      // Nothing leaves the device before the track is published, so there is
      // nothing unencrypted to report
      encrypted: true,
      stats$: (): Observable<MediaStreamStats> => of(undefined),
      attach: (element: HTMLMediaElement): void => {
        this.live();
        this.elements.add(element);
        play(element, this.shown());
      },
      detach: (element: HTMLMediaElement): void => {
        if (this.elements.delete(element)) element.srcObject = null;
      },
      setEnabled: async (enabled: boolean): Promise<boolean> => {
        this.live();
        this.track.enabled = enabled;
        this.muted$.next(!enabled);
        return Promise.resolve(enabled);
      },
      setDevice: async (deviceId: string): Promise<void> => {
        if (this.track.getSettings().deviceId === deviceId) return;
        await this.reacquire({ deviceId });
      },
    };
    if (this.source === "microphone")
      return {
        ...base,
        kind: "audio",
        isActive$: constant(false),
        audioLevel$: constant(0),
        setAudioContext: () => {},
        setVolume: () => {},
      };
    return {
      ...base,
      kind: "video",
      facingMode$: this.facingMode$,
      switchFacingMode: async () => {
        const facingMode = this.facingMode$.value;
        if (facingMode === undefined) return;
        await this.reacquire({
          facingMode: facingMode === "user" ? "environment" : "user",
        });
        return this.track.getSettings().deviceId;
      },
      setProcessor: async (processor) => this.setProcessor(processor),
    };
  }
}

function play(element: HTMLMediaElement, track: MediaStreamTrack): void {
  element.srcObject = new MediaStream([track]);
  // Autoplay is not a given for a stream set after mount; a test DOM returns
  // nothing from play
  const playing = element.play() as Promise<void> | undefined;
  playing?.catch(() => undefined);
}

function facingModeOf(
  track: MediaStreamTrack,
): "user" | "environment" | undefined {
  const { facingMode } = track.getSettings();
  return facingMode === "user" || facingMode === "environment"
    ? facingMode
    : undefined;
}
