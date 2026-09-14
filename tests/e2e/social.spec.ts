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

test("root is one unified social map and keeps honest empty inventory", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ở đây đang có chuyện gì?" }),
  ).toBeVisible();
  await expect(
    page.getByText("Bản demo không bịa hoạt động xã hội", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Chưa có dữ liệu thật cho lớp này trong vùng bản đồ."),
  ).toBeVisible();
  await expect(
    page.getByText("0 bài · 0 cộng đồng · 0 hoạt động · 0 địa điểm"),
  ).toBeVisible();

  for (const label of [
    "Tất cả",
    "Bài địa phương (0)",
    "Cộng đồng (0)",
    "Hoạt động (0)",
    "Địa điểm (0)",
  ]) {
    await expect(page.getByRole("button", { name: label })).toBeVisible();
  }

  await page.getByRole("button", { name: "Cộng đồng (0)" }).click();
  await expect(page).toHaveURL(/layer=community/);
  await page.getByRole("button", { name: "Tất cả" }).click();
  await expect(page).not.toHaveURL(/layer=/);

  await page.getByRole("link", { name: "Hoạt động", exact: false }).click();
  await expect(page).toHaveURL(/\/activities$/);
  await expect(
    page.getByRole("heading", { name: "Một cuộc hẹn ở ngay gần bạn." }),
  ).toBeVisible();
});

test("social homepage fits a phone viewport and contribution flow remains reachable", async ({
  page,
}) => {
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

  await page.getByRole("link", { name: "Đóng góp", exact: false }).click();
  await expect(page).toHaveURL(/\/contribute$/);
  await page.getByRole("button", { name: "Đăng bài địa phương" }).click();
  await expect(
    page.getByText("Bản demo không có đăng nhập", { exact: false }),
  ).toBeVisible();
});
