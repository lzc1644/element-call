/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { Grid } from "./Grid";

const { useTransitionMock } = vi.hoisted(() => ({
  useTransitionMock: vi.fn(),
}));
vi.mock("@react-spring/web", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTransition: useTransitionMock,
}));

test("a layout update makes a present tile visible even if it supersedes entry", () => {
  useTransitionMock.mockReturnValue([
    () => null,
    { start: () => [], current: [] },
  ]);
  render(
    <Grid<null, unknown, HTMLDivElement, HTMLDivElement>
      model={null}
      Layout={({ ref }) => <div ref={ref} />}
      Tile={() => <div />}
    />,
  );
  const [, options] = useTransitionMock.mock.lastCall!;
  const tile = { id: "camera", x: 20, y: 30, width: 180, height: 135 };
  expect(options().update(tile)).toEqual({
    x: tile.x,
    y: tile.y,
    width: tile.width,
    height: tile.height,
    immediate: false,
    opacity: 1,
    scale: 1,
  });
});
