/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { SpaHelpers } from "./spa-helpers.ts";

test("closes the selected microphone and removes only that participant", async ({
  browser,
  page,
  browserName,
}) => {
  test.skip(
    browserName === "firefox",
    "The fake microphone requires Chromium here",
  );
  test.slow();
  await page.goto("/");
  await SpaHelpers.createCall(page, "Caller", "Participant controls", true);
  const invite = await SpaHelpers.getCallInviteLink(page);

  const guestContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    permissions: ["microphone", "camera"],
  });
  try {
    const guest = await guestContext.newPage();
    await SpaHelpers.joinCallFromInviteLink(guest, invite, "Guest");
    const guestMic = guest.getByTestId("incall_mute");
    if ((await guestMic.getAttribute("aria-checked")) !== "true") {
      await guest.locator("[data-layout]").hover();
      await guestMic.click();
    }
    await expect(guestMic).toHaveAttribute("aria-checked", "true");

    const guestTile = page
      .getByTestId("videoTile")
      .filter({ hasText: "Guest" });
    const options = guestTile.getByRole("button", { name: "Options" });
    await options.click();
    await page.getByRole("menuitem", { name: "Turn off microphone" }).click();
    await expect(guestMic).toHaveAttribute("aria-checked", "false");

    await options.click();
    await page.getByRole("menuitem", { name: "Remove from call" }).click();
    await page
      .getByRole("dialog", { name: "Remove Guest from this call?" })
      .getByRole("button", { name: "Remove from call" })
      .click();
    await expect(guest.locator("[data-layout]")).toHaveCount(0);
    await expect(guestTile).toHaveCount(0);
    await expect(page.locator("[data-layout]")).toBeVisible();
  } finally {
    await guestContext.close();
  }
});
