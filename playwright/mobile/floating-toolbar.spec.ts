/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { withScreenShareParticipants } from "../fixtures/screen-share-participants";

for (const device of ["Pixel 7", "iPhone 13"] as const) {
  test(`floating controls over a long mobile grid: ${device}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);
    await withScreenShareParticipants(
      browser,
      testInfo,
      device,
      async ({ desktopPage, viewerPage, inviteLink }) => {
        await desktopPage.locator("[data-element-call-root]").hover();
        await desktopPage.getByTestId("incall_screenshare").click();
        const guests = [];
        try {
          for (let i = 0; i < 6; i++) {
            const context = await browser.newContext({
              ignoreHTTPSErrors: true,
              permissions: ["microphone", "camera"],
              reducedMotion: "reduce",
            });
            guests.push(context);
            const page = await context.newPage();
            await page.goto(inviteLink);
            await page
              .getByTestId("joincall_displayName")
              .fill(`Participant ${i}`);
            await page.getByTestId("joincall_joincall").click();
            await page.getByTestId("lobby_joinCall").click();
          }
          const call = viewerPage.locator('[data-layout="grid"]');
          await expect(call).toBeVisible({ timeout: 30_000 });
          const grid = call.locator('[data-scrollable="true"]');
          await expect(grid.getByTestId("videoTile")).toHaveCount(8);
          const footer = viewerPage.getByTestId("footer-container");
          const toolbar = footer.locator(":scope > div").first();
          const callBox = (await call.boundingBox())!;
          const tapBackground = async (): Promise<void> => {
            await viewerPage.touchscreen.tap(
              callBox.x + 2,
              callBox.y + callBox.height / 2,
            );
          };
          if (
            await toolbar.evaluate(
              (el) => getComputedStyle(el).pointerEvents === "none",
            )
          )
            await tapBackground();
          await expect(toolbar).toHaveCSS("opacity", "1");
          await expect(footer).toHaveCSS("position", "absolute");
          await expect(footer).toHaveCSS("background-image", "none");
          await expect(footer).toHaveCSS(
            "background-color",
            "rgba(0, 0, 0, 0)",
          );
          await expect(toolbar).toHaveCSS(
            "background-image",
            /linear-gradient/,
          );
          await expect(toolbar).toHaveCSS("border-top-style", "solid");
          await expect(toolbar).not.toHaveCSS("border-top-width", "0px");
          await expect(toolbar).not.toHaveCSS("box-shadow", "none");
          await expect(toolbar).toHaveCSS("backdrop-filter", /blur\(/);
          await expect(toolbar).not.toHaveCSS("padding-top", "0px");
          await expect(toolbar).not.toHaveCSS("padding-left", "0px");
          const height = await grid.evaluate((el) => el.clientHeight);
          await expect
            .poll(
              async () =>
                await grid.evaluate((el) => el.scrollHeight > el.clientHeight),
            )
            .toBe(true);
          await expect
            .poll(async () =>
              Math.abs(
                (await grid.boundingBox())!.y +
                  height -
                  callBox.y -
                  callBox.height,
              ),
            )
            .toBeLessThanOrEqual(1);
          await grid.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
          });
          // Every participant, including the final row, can clear the controls.
          await expect
            .poll(async () => {
              const bottom = await grid
                .getByTestId("videoTile")
                .evaluateAll((tiles) =>
                  Math.max(
                    ...tiles.map((el) => el.getBoundingClientRect().bottom),
                  ),
                );
              return bottom - (await toolbar.boundingBox())!.y;
            })
            .toBeLessThanOrEqual(1);
          await tapBackground();
          await expect(toolbar).toHaveCSS("opacity", "0");
          await expect
            .poll(async () => await grid.evaluate((el) => el.clientHeight))
            .toBe(height);
          await expect(footer).toHaveCSS("background-image", "none");
        } finally {
          await Promise.all(
            guests.map(async (context) => await context.close()),
          );
        }
      },
    );
  });
}
