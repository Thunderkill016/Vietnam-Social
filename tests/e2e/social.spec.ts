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

test("root stays useful while keeping empty inventory honest", async ({
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

  const starter = page.getByRole("region", { name: "Bắt đầu khu vực này" });
  await expect(starter).toBeVisible();
  await expect(
    starter.getByText("Khu vực này đang chờ người mở lời."),
  ).toBeVisible();
  await expect(
    starter.getByRole("link", { name: /Chia sẻ điều bạn biết/ }),
  ).toHaveAttribute("href", "/contribute");
  await expect(
    starter.getByRole("link", { name: /Tổ chức một cuộc gặp/ }),
  ).toHaveAttribute("href", "/activities/manage");

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
  await expect(page.getByRole("button", { name: /^Quanh đây/ })).toBeVisible();
  await expect(
    page.getByPlaceholder("Tìm bài viết, cộng đồng, hoạt động, khu vực..."),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Bắt đầu khu vực này" }),
  ).toBeVisible();
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
