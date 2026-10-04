/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";

import { type Behavior } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";
import { type MediaViewModel } from "./media/MediaViewModel";
import { type RingingMediaViewModel } from "./media/RingingMediaViewModel";
import { type UserMediaViewModel } from "./media/UserMediaViewModel";

let nextId = 0;
function createId(): string {
  return (nextId++).toString();
}

export class GridTileViewModel {
  public readonly id = createId();
  private readonly _showOutline$ = new BehaviorSubject(false);
  public readonly showOutline$: Behavior<boolean> = this._showOutline$;

  public constructor(
    public readonly media$: Behavior<
      UserMediaViewModel | RingingMediaViewModel
    >,
  ) {}

  public setShowOutline(value: boolean): void {
    this._showOutline$.next(value);
  }
}

export class SpotlightTileViewModel {
  private readonly _selectedMedia$ = new BehaviorSubject<
    MediaViewModel | undefined
  >(undefined);
  public readonly selectedMedia$: Behavior<MediaViewModel | undefined> =
    this._selectedMedia$;

  public constructor(
    scope: ObservableScope,
    public readonly media$: Behavior<MediaViewModel[]>,
    public readonly maximised$: Behavior<boolean>,
    public readonly background$: Behavior<"solid" | "transparent">,
  ) {
    media$.pipe(scope.bind()).subscribe((media) => {
      const selected =
        media.find((m) => m.id === this._selectedMedia$.value?.id) ?? media[0];
      this._selectedMedia$.next(selected);
    });
  }

  public setVisibleMedia = (id: string): void => {
    const media = this.media$.value.find((m) => m.id === id);
    // Observer entries can arrive just after a sharing participant has left.
    if (media !== undefined) this._selectedMedia$.next(media);
  };
}

export type TileViewModel = GridTileViewModel | SpotlightTileViewModel;
