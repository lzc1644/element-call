/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, type CSSProperties } from "react";
import { useObservableEagerState } from "observable-hooks";

import { type CallLayout, arrangeTiles } from "./CallLayout";
import { type SpotlightPortraitLayout as SpotlightPortraitLayoutModel } from "../state/layout-types.ts";
import styles from "./SpotlightPortraitLayout.module.css";
import { useUpdateLayout, useVisibleTiles } from "./Grid";

interface GridCSSProperties extends CSSProperties {
  "--grid-gap": string;
  "--grid-tile-width": string;
  "--grid-tile-height": string;
}

/**
 * An implementation of the "spotlight portrait" layout, in which the spotlight
 * tile is shown across the top of the screen, and the grid of participants
 * scrolls behind it.
 */
export const makeSpotlightPortraitLayout: CallLayout<
  SpotlightPortraitLayoutModel
> = ({ minBounds$ }) => ({
  foreground: "fixed",

  fixed: function SpotlightPortraitLayoutFixed({
    ref,
    model,
    Slot,
  }): ReactNode {
    useUpdateLayout();
    useObservableEagerState(minBounds$);

    return (
      <div ref={ref} className={styles.layer}>
        <div className={styles.spotlight}>
          <Slot
            className={styles.slot}
            id="spotlight"
            model={model.spotlight}
          />
        </div>
      </div>
    );
  },

  scrolling: function SpotlightPortraitLayoutScrolling({
    ref,
    model,
    Slot,
  }): ReactNode {
    useUpdateLayout();
    useVisibleTiles(model.setVisibleTiles);
    const { width, height } = useObservableEagerState(minBounds$);
    const spotlightHeight = Math.min(width * (9 / 16), height * 0.45);
    const { gap, tileWidth, tileHeight } = arrangeTiles(
      width,
      height - spotlightHeight - 32,
      model.grid.length,
    );

    return (
      <div
        ref={ref}
        className={styles.grid}
        style={
          {
            "--grid-gap": `${gap}px`,
            "--grid-tile-width": `${Math.floor(tileWidth)}px`,
            "--grid-tile-height": `${Math.floor(tileHeight)}px`,
          } as GridCSSProperties
        }
      >
        {model.grid.map((m) => (
          <Slot key={m.id} className={styles.slot} id={m.id} model={m} />
        ))}
      </div>
    );
  },
});
