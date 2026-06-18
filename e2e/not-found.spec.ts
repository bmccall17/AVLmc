import { test, expect } from "@playwright/test";

/**
 * The 404 detour renders its serving content (apology + feedback form + ways onward) across engines,
 * and stays resilient when events can't load (the shows section just hides). DB-free: the e2e server
 * has no real database, so this also proves the `pickShows` try/catch fallback.
 */
test("the 404 detour renders the apology, feedback form, and a path back", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist-404-detour");
  // Next serves the custom not-found with a 404 status.
  expect(response?.status()).toBe(404);

  await expect(page.getByRole("heading", { name: /missed that connection/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /what you were looking for/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /send feedback/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /back to the board/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /skip & go home/i })).toBeVisible();
});
