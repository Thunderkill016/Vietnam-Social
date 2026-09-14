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

test("root feels like one local social network and keeps honest empty inventory", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Khám phá quanh đây" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Bản xem trước không tạo người, bài viết hay hoạt động giả",
      {
        exact: false,
      },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Chưa có câu chuyện nào ở vùng này."),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("Tìm bài viết, cộng đồng, hoạt động, khu vực..."),
  ).toBeVisible();

  for (const label of [
    /^Quanh đây/,
    /^Bài viết/,
    /^Cộng đồng/,
    /^Hoạt động/,
    /^Địa điểm/,
  ]) {
    await expect(page.getByRole("button", { name: label })).toBeVisible();
  }

  await page.getByRole("button", { name: /^Cộng đồng/ }).click();
  await expect(page).toHaveURL(/layer=community/);
  await page.getByRole("button", { name: /^Quanh đây/ }).click();
  await expect(page).not.toHaveURL(/layer=/);

  await page.goto("/activities");
  await expect(
    page.getByRole("heading", { name: "Khám phá quanh đây" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Hoạt động/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("social homepage fits a phone viewport and contribution flow remains reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Vietnam Social" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Quanh đây/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page
    .getByRole("link", { name: /Chia sẻ/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/contribute$/);
  await page.getByRole("button", { name: "Đăng bài địa phương" }).click();
  await expect(
    page.getByText("Bản demo không có đăng nhập", { exact: false }),
  ).toBeVisible();
});
