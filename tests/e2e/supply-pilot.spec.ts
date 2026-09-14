import { expect, test } from "@playwright/test";

test("invite landing page handles invalid or expired token gracefully", async ({ page }) => {
  await page.goto("/invite/invalid-nonexistent-token");
  await expect(page.getByRole("heading", { name: "Lời mời Trở thành Host" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lời mời không khả dụng" })).toBeVisible();
  await page.getByRole("link", { name: "Về trang bản đồ" }).click();
  await expect(page).toHaveURL("/");
});

test("supply pilot UI elements exist in explore view", async ({ page }) => {
  await page.goto("/activities");
  await expect(page.getByText("TP. Hồ Chí Minh").first()).toBeVisible();
  const signalCard = page.getByRole("button", { name: /Thể thao.*Cầu lông tối nay/ });
  if (await signalCard.isVisible()) {
    await signalCard.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Chia sẻ" })).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("create modal supports quick slots and templates", async ({ page }) => {
  await page.goto("/activities");
  await page.getByRole("button", { name: "Đăng hoạt động", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rủ mọi người cùng tham gia." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tối nay 18:00 - 20:00" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tối mai 18:00 - 20:00" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cuối tuần 09:00 - 11:00" })).toBeVisible();
  await page.getByRole("button", { name: "Tối mai 18:00 - 20:00" }).click();
  expect(await page.locator('input[name="starts_at"]').inputValue()).toContain("T18:00");
  expect(await page.locator('input[name="expires_at"]').inputValue()).toContain("T20:00");
  await page.keyboard.press("Escape");
});
