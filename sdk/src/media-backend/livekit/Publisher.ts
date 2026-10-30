/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type LocalTrack,
  type LocalTrackPublication,
  ParticipantEvent,
  type Room as LivekitRoom,
  type Track,
} from "livekit-client";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { type MediaSource, type PublishRequest } from "../../media-api";
import { livekitSources, mediaSources } from "./LivekitMediaTrack";
import {
  audioCaptureOptions,
  screenShareCaptureOptions,
  screenSharePublishOptions,
  videoCaptureOptions,
  videoPublishOptions,
} from "./publishOptions";

/** What the host asked to publish, kept across publishers for a reconnection. */
export interface DesiredPublication {
  request: PublishRequest;
  enabled: boolean;
}

export type DesiredMedia = Map<MediaSource, DesiredPublication>;

/**
 * Publishes the local media on one LiveKit room, following the host's
 * requests.
 *
 * LiveKit publishes a track the moment it is created, but a member must not be
 * heard before it has joined the MatrixRTC session, nor after it has left. The
 * tracks are therefore kept, and their upstream paused, while `shouldPublish`
 * is false: the local preview stays live while nothing reaches the room.
 */
export class Publisher {
  public shouldPublish = false;
  /** Whether the initial requests have been published; `publish` is immediate from then on. */
  public started = false;
  private readonly room: LivekitRoom;
  private publishingRequested = false;
  private publishingReconcile: Promise<void> | undefined;
  private publishingTransitionNeedsRetry = false;
  private destroyed = false;
  private readonly pausedUpstreams = new Set<LocalTrack>();
  private readonly upstreamOperations = new Map<LocalTrack, Promise<void>>();

  private readonly onLocalTrackUnpublished = (
    publication: LocalTrackPublication,
  ): void => {
    if (publication.track) this.pausedUpstreams.delete(publication.track);
  };

  public constructor(
    room: LivekitRoom,
    private readonly desired: DesiredMedia,
    private readonly logger: Logger,
  ) {
    this.room = room;
    room.setE2EEEnabled(room.options.e2ee !== undefined)?.catch((e: Error) => {
      this.logger.error("Failed to enable E2EE on the room", e);
    });
    this.onLocalTrackPublished = this.onLocalTrackPublished.bind(this);
    room.localParticipant.on(
      ParticipantEvent.LocalTrackPublished,
      this.onLocalTrackPublished,
    );
    room.localParticipant.on(
      ParticipantEvent.LocalTrackUnpublished,
      this.onLocalTrackUnpublished,
    );
  }

  public async destroy(): Promise<void> {
    this.destroyed = true;
    this.publishingRequested = false;
    this.shouldPublish = false;
    this.pausedUpstreams.clear();
    this.room.localParticipant.off(
      ParticipantEvent.LocalTrackUnpublished,
      this.onLocalTrackUnpublished,
    );
    this.room.localParticipant.off(
      ParticipantEvent.LocalTrackPublished,
      this.onLocalTrackPublished,
    );
    try {
      for (const { track } of this.publications())
        if (track) await this.room.localParticipant.unpublishTrack(track, true);
    } catch (e) {
      this.logger.error("Failed to stop the local tracks", e);
    }
  }

  /** Publishes what the host asked for, less what it has muted since. Safe to call more than once. */
  public start(): void {
    if (this.started || this.destroyed) return;
    this.started = true;
    const requests = [...this.desired.values()]
      .filter(({ enabled }) => enabled)
      .map(({ request }) => request);
    const sources = new Set(requests.map((request) => request.source));
    // Microphone and camera in one call so that the browser asks for
    // permission once; the room defaults carry their options. LiveKit
    // resolves these once the track is published, which may block on the
    // connection; LocalTrackPublished is what tells us a track exists.
    if (sources.has("microphone") && sources.has("camera"))
      void this.room.localParticipant.enableCameraAndMicrophone();
    for (const request of requests)
      if (
        request.source === "screenShare" ||
        !(sources.has("microphone") && sources.has("camera"))
      )
        this.publish(request).catch((e) => {
          this.logger.error(`Failed to publish the ${request.source}`, e);
        });
  }

  /** Publishes one request and resolves with its publication once LiveKit has it. */
  public async publish(
    request: PublishRequest,
  ): Promise<LocalTrackPublication | undefined> {
    const participant = this.room.localParticipant;
    let publication: LocalTrackPublication | undefined;
    if (request.source === "microphone")
      publication = await participant.setMicrophoneEnabled(
        true,
        audioCaptureOptions(request),
      );
    else if (request.source === "camera")
      publication = await participant.setCameraEnabled(
        true,
        videoCaptureOptions(request),
        videoPublishOptions(request.capture),
      );
    else
      publication = await participant.setScreenShareEnabled(
        true,
        screenShareCaptureOptions(request),
        screenSharePublishOptions(request.capture),
      );
    // Until the member has joined, the upstream has to stay paused
    if (
      (!this.publishingRequested || !this.shouldPublish) &&
      publication?.track
    )
      await this.pauseUpstream(publication.track);
    return publication;
  }

  public async unpublish(source: MediaSource): Promise<void> {
    const participant = this.room.localParticipant;
    // Takes the screen share audio with it
    if (source === "screenShare") {
      await participant.setScreenShareEnabled(false);
      return;
    }
    const track = participant.getTrackPublication(
      livekitSources[source],
    )?.track;
    if (track) await participant.unpublishTrack(track, true);
  }

  /**
   * Mutes or unmutes a source and reports what resulted: the request where
   * it succeeded, the state LiveKit is left in where it did not (a denied
   * permission, a missing device).
   */
  public async setEnabled(
    source: MediaSource,
    enabled: boolean,
  ): Promise<boolean> {
    const participant = this.room.localParticipant;
    const livekitSource = livekitSources[source];
    try {
      if (source === "microphone")
        await participant.setMicrophoneEnabled(enabled);
      else if (source === "camera") await participant.setCameraEnabled(enabled);
      else {
        const publication = participant.getTrackPublication(livekitSource);
        if (!publication) return false;
        if (enabled) await publication.unmute();
        else await publication.mute();
      }
      // Unmuting restarts the upstream; until the member has joined, it has
      // to stay paused
      const track = participant.getTrackPublication(livekitSource)?.track;
      if (
        enabled &&
        (!this.publishingRequested || !this.shouldPublish) &&
        track
      )
        await this.pauseUpstream(track);
      return enabled;
    } catch (e) {
      this.logger.error(`Failed to set ${source} enabled=${enabled}`, e);
      return !(participant.getTrackPublication(livekitSource)?.isMuted ?? true);
    }
  }

  public async startPublishing(): Promise<void> {
    await this.setPublishingEnabled(true);
  }

  public async stopPublishing(): Promise<void> {
    await this.setPublishingEnabled(false);
  }

  public async setPublishingEnabled(enabled: boolean): Promise<void> {
    if (this.destroyed) return;
    this.publishingRequested = enabled;
    if (this.publishingReconcile) return this.publishingReconcile;
    this.publishingReconcile = this.reconcilePublishing().then(
      async (): Promise<void> => {
        this.publishingReconcile = undefined;
        // A request can arrive after reconciliation resolves but before this cleanup.
        if (
          !this.destroyed &&
          !this.publishingSettled &&
          !this.publishingTransitionNeedsRetry
        )
          await this.setPublishingEnabled(this.publishingRequested);
      },
      (error: unknown) => {
        this.publishingReconcile = undefined;
        throw error;
      },
    );
    return this.publishingReconcile;
  }

  private get publishingSettled(): boolean {
    return (
      this.publishingRequested === this.shouldPublish &&
      (!this.publishingRequested || this.pausedUpstreams.size === 0)
    );
  }

  private async reconcilePublishing(): Promise<void> {
    let firstError: unknown;
    while (!this.destroyed) {
      const requested = this.publishingRequested;
      if (this.publishingSettled && !this.publishingTransitionNeedsRetry) break;
      this.publishingTransitionNeedsRetry = false;
      try {
        if (requested) {
          await this.resumeUpstreams();
          if (this.publishingRequested && !this.destroyed)
            this.shouldPublish = true;
        } else {
          this.shouldPublish = false;
          await this.pauseUpstreams();
        }
      } catch (error) {
        firstError ??= error;
        this.publishingTransitionNeedsRetry = true;
      }
      if (
        requested === this.publishingRequested &&
        this.publishingTransitionNeedsRetry
      )
        break;
    }
    if (firstError) throw firstError;
  }

  private onLocalTrackPublished(publication: LocalTrackPublication): void {
    if (this.destroyed) return;
    this.logger.info(`Local ${publication.source} track published`);
    if ((!this.publishingRequested || !this.shouldPublish) && publication.track)
      this.pauseUpstream(publication.track).catch((e) => {
        this.publishingTransitionNeedsRetry = true;
        this.logger.error("Failed to pause the upstream", e);
      });
    // The host may have changed its mind while the track was being created
    const source = mediaSources[publication.source as Track.Source];
    if (this.desired.get(source)?.enabled === false)
      void this.setEnabled(source, false);
  }

  private async pauseUpstreams(): Promise<void> {
    let firstError: unknown;
    for (const { track } of this.publications()) {
      if (!track) continue;
      try {
        await this.pauseUpstream(track);
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  }

  private async pauseUpstream(track: LocalTrack): Promise<void> {
    if (this.destroyed || !this.isCurrentTrack(track)) return;
    const pending = this.upstreamOperations.get(track);
    if (pending) {
      await pending;
      if (this.destroyed || !this.isCurrentTrack(track)) return;
      if (!track.isUpstreamPaused) await this.pauseUpstream(track);
      return;
    }
    // Never acquire a pause owned by another subsystem.
    if (track.isUpstreamPaused) return;
    this.pausedUpstreams.add(track);
    await this.trackOperation(track, track.pauseUpstream());
  }

  private async resumeUpstreams(): Promise<void> {
    let firstError: unknown;
    const attempted = new Set<LocalTrack>();
    while (!this.destroyed && this.publishingRequested) {
      const tracks = [...this.pausedUpstreams].filter((track) => {
        if (!this.isCurrentTrack(track)) {
          this.pausedUpstreams.delete(track);
          return false;
        }
        return !attempted.has(track);
      });
      if (tracks.length === 0) break;
      for (const track of tracks) {
        attempted.add(track);
        try {
          await this.resumeUpstream(track);
        } catch (error) {
          firstError ??= error;
        }
      }
    }
    if (firstError) throw firstError;
  }

  private async resumeUpstream(track: LocalTrack): Promise<void> {
    await this.upstreamOperations.get(track);
    if (
      this.destroyed ||
      !this.publishingRequested ||
      !this.pausedUpstreams.has(track) ||
      !this.isCurrentTrack(track)
    )
      return;
    await this.trackOperation(
      track,
      track.resumeUpstream().then(() => {
        this.pausedUpstreams.delete(track);
      }),
    );
    if (this.destroyed || !this.isCurrentTrack(track)) return;
    if (!this.publishingRequested && !track.isUpstreamPaused)
      await this.pauseUpstream(track);
  }

  private async trackOperation(
    track: LocalTrack,
    operation: Promise<void>,
  ): Promise<void> {
    this.upstreamOperations.set(track, operation);
    try {
      await operation;
    } finally {
      if (this.upstreamOperations.get(track) === operation)
        this.upstreamOperations.delete(track);
    }
  }

  private isCurrentTrack(track: LocalTrack): boolean {
    return (
      this.room.localParticipant.getTrackPublication(track.source)?.track ===
      track
    );
  }

  private publications(): LocalTrackPublication[] {
    return [...this.room.localParticipant.trackPublications.values()];
  }

  /**
   * Works on a room that is still connecting too: LiveKit keeps the device
   * in the room's options and gives it to every participant that arrives.
   */
  public async setAudioOutputDevice(deviceId: string): Promise<void> {
    if (this.room.getActiveDevice("audiooutput") === deviceId) return;
    await this.room.switchActiveDevice("audiooutput", deviceId);
  }
}
