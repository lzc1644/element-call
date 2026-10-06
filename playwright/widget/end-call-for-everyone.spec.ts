/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user";
import { TestHelpers } from "./test-helpers";

// Group calls do not auto-leave just because one participant hangs up. This
// proves the notification actually closes the receiving call, not only a menu.
for (const sender of ["brooks", "whistler"] as const) {
  widgetTest(
    `End an encrypted group call from ${sender} for both widgets`,
    async ({ asWidget }) => {
      widgetTest.slow();
      const { brooks, whistler } = asWidget;
      await TestHelpers.startCallInCurrentRoom(brooks.page);
      await brooks.page
        .getByRole("dialog", { name: "Approve widget permissions" })
        .getByRole("button", { name: "Approve", exact: true })
        .click();
      await TestHelpers.joinCallFromLobby(brooks.page);
      await TestHelpers.joinCallInCurrentRoom(whistler.page);
      await whistler.page
        .getByRole("dialog", { name: "Approve widget permissions" })
        .getByRole("button", { name: "Approve", exact: true })
        .click();

      for (const user of [brooks, whistler]) {
        const frame = user.page
          .locator('iframe[title="Element Call"]')
          .contentFrame();
        await expect(frame.getByTestId("videoTile")).toHaveCount(2, {
          timeout: 15_000,
        });
        await expect(frame.getByText("Waiting for media...")).toBeHidden();
      }

      const frame = asWidget[sender].page
        .locator('iframe[title="Element Call"]')
        .contentFrame();
      await frame
        .locator("[data-layout]")
        .dispatchEvent("pointermove", { pointerType: "mouse" });
      await frame.getByRole("button", { name: "End call" }).click();
      await frame.getByRole("menuitem", { name: "End for everyone" }).click();
      await frame
        .getByRole("menuitem", { name: "End call for 2 people?" })
        .click();

      for (const user of [brooks, whistler]) {
        await expect(
          user.page.locator('iframe[title="Element Call"]'),
        ).toBeHidden({ timeout: 15_000 });
        await expect(
          user.page.locator(".mx_BasicMessageComposer"),
        ).toBeVisible();
        await expect
          .poll(
            async () =>
              user.clientHandle.evaluate((client) => {
                const room = client
                  .getRooms()
                  .find((room) => room.name === "Welcome Room")!;
                return client.matrixRTC.getRoomSession(room).memberships.length;
              }),
            { timeout: 15_000 },
          )
          .toBe(0);
      }
    },
  );
}
