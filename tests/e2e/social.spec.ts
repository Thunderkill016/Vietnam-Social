import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const bootstrap = await request
    .get("/api/bootstrap")
    .then((response) => response.json())
    .catch(() => ({ mode: "unknown" }));
  test.skip(
    bootstrap.mode !== "demo",
    "Social demo assertions only run in demo mode.",
  );
});

test("root is the map-native social network and does not fabricate social activity", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ở đây đang có chuyện gì?" }),
  ).toBeVisible();
  await expect(
    page.getByText("Bản demo giữ bản đồ trống thay vì bịa", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Chưa có lớp xã hội nào ở vùng này."),
  ).toBeVisible();
  await expect(page.getByText("0 cộng đồng · 0 bài trong vùng bản đồ")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Xã hội", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Hoạt động", exact: false }).click();
  await expect(page).toHaveURL(/\/activities$/);
  await expect(
    page.getByRole("heading", { name: "Một cuộc hẹn ở ngay gần bạn." }),
  ).toBeVisible();
});

test("social homepage fits a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ở đây đang có chuyện gì?" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Đăng bài địa phương" }).click();
  await expect(
    page.getByText("Bản demo không có đăng nhập", { exact: false }),
  ).toBeVisible();
});
