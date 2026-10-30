/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, render } from "@testing-library/react";
import { afterAll, expect, test, vi } from "vitest";
import { BehaviorSubject } from "rxjs";

import { arrangeTiles, type CallLayout } from "./CallLayout";
import { makeGridLayout } from "./GridLayout";
import { makeSpotlightLandscapeLayout } from "./SpotlightLandscapeLayout";
import { makeSpotlightPortraitLayout } from "./SpotlightPortraitLayout";
import { type LayoutProps } from "./Grid";
import { constant } from "../state/Behavior";
import { ObservableScope } from "../state/ObservableScope";
import { type Alignment } from "../state/layout-types";
import { type UserMediaViewModel } from "../state/media/UserMediaViewModel";
import {
  GridTileViewModel,
  SpotlightTileViewModel,
  type TileViewModel,
} from "../state/TileViewModel";
import { makeOneOnOneMobileLayout } from "./OneOnOneMobileLayout";
import { makeSpotlightExpandedLayout } from "./SpotlightExpandedLayout";
import { makeOneOnOneDesktopLayout } from "./OneOnOneDesktopLayout";

// The layouts normally receive these hooks from Grid.
vi.mock("./Grid", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUpdateLayout: (): void => {},
  useVisibleTiles: (): void => {},
}));

const minBounds$ = constant({ width: 800, height: 800 });
const scope = new ObservableScope();
afterAll(() => scope.end());
const spotlight = {
  vm: new SpotlightTileViewModel(
    scope,
    constant([]),
    constant(false),
    constant("solid"),
  ),
  alignment$: constant<Alignment>({ inline: "end", block: "end" }),
  onDrag: () => {},
};
const grid = Array.from(
  { length: 3 },
  () => new GridTileViewModel(constant({} as UserMediaViewModel)),
);
const pip = {
  alignment$: constant<Alignment>({ inline: "end", block: "end" }),
  onDrag: () => {},
  vm: { id: "pip" } as GridTileViewModel,
  size$: constant("sm" as const),
};

const Slot: LayoutProps<unknown, TileViewModel, HTMLDivElement>["Slot"] = ({
  id,
  model,
  onDrag,
  children,
  ...props
}) => (
  <div data-testid={`slot-${id}`} {...props}>
    {children}
  </div>
);

test("grid layout", () =>
  snapshotLayout(makeGridLayout, {
    type: "grid",
    spotlight,
    grid,
    setVisibleTiles: () => {},
  }));

test("spotlight landscape layout", () =>
  snapshotLayout(makeSpotlightLandscapeLayout, {
    type: "spotlight-landscape",
    spotlight,
    grid,
    setVisibleTiles: () => {},
  }));

test("spotlight portrait layout", () =>
  snapshotLayout(makeSpotlightPortraitLayout, {
    type: "spotlight-portrait",
    spotlight,
    grid,
    setVisibleTiles: () => {},
  }));

test("spotlight expanded layout", () =>
  snapshotLayout(makeSpotlightExpandedLayout, {
    type: "spotlight-expanded",
    spotlight: spotlight.vm,
    pip,
  }));

test("one-on-one desktop layout", () =>
  snapshotLayout(makeOneOnOneDesktopLayout, {
    type: "one-on-one-desktop",
    spotlight: { id: "spotlight" } as GridTileViewModel,
    pip,
  }));

test("one-on-one mobile layout", () =>
  snapshotLayout(makeOneOnOneMobileLayout, {
    type: "one-on-one-mobile",
    spotlight: spotlight.vm,
    pip,
  }));

test("grid tiles follow changes to the host's available bounds", () => {
  const bounds$ = new BehaviorSubject({ width: 800, height: 600 });
  const { scrolling: Scrolling } = makeGridLayout({ minBounds$: bounds$ });
  const { getByTestId } = render(
    <Scrolling
      model={{ type: "grid", grid, setVisibleTiles: () => {} }}
      Slot={Slot}
    />,
  );
  const layer = getByTestId(`slot-${grid[0].id}`).parentElement!;
  expect(layer.style.width).toBe("800px");
  act(() => bounds$.next({ width: 400, height: 300 }));
  expect(layer.style.width).toBe("400px");
  expect(layer.style.getPropertyValue("--width")).toBe(
    `${Math.floor(arrangeTiles(400, 300, 3).tileWidth)}px`,
  );
});

test("portrait members stay below the fixed spotlight when the host resizes", () => {
  const bounds$ = new BehaviorSubject({ width: 300, height: 700 });
  const { scrolling: Scrolling } = makeSpotlightPortraitLayout({
    minBounds$: bounds$,
  });
  const { getByTestId } = render(
    <Scrolling
      model={{
        type: "spotlight-portrait",
        spotlight,
        grid,
        setVisibleTiles: () => {},
      }}
      Slot={Slot}
    />,
  );
  const layer = getByTestId(`slot-${grid[0].id}`).parentElement!;
  expect(layer.style.getPropertyValue("--grid-tile-width")).toBe(
    `${Math.floor(arrangeTiles(300, 700 - 300 * (9 / 16) - 32, 3).tileWidth)}px`,
  );
  act(() => bounds$.next({ width: 500, height: 700 }));
  expect(layer.style.getPropertyValue("--grid-tile-width")).toBe(
    `${Math.floor(arrangeTiles(500, 700 - 500 * (9 / 16) - 32, 3).tileWidth)}px`,
  );
});

function snapshotLayout<Model>(layout: CallLayout<Model>, model: Model): void {
  const {
    foreground,
    scrolling: Scrolling,
    fixed: Fixed,
  } = layout({ minBounds$ });
  const scrollingLayer = <Scrolling model={model} Slot={Slot} />;
  const fixedLayer = <Fixed model={model} Slot={Slot} />;
  const { container } = render(
    foreground === "fixed" ? (
      <>
        {scrollingLayer}
        {fixedLayer}
      </>
    ) : (
      <>
        {fixedLayer}
        {scrollingLayer}
      </>
    ),
  );
  expect(container).toMatchSnapshot();
}
