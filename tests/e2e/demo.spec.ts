import { expect, test } from "@playwright/test";
test.skip(
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  "Read-only demo tests only run without Supabase configuration.",
);
test("browse, search, inspect details, share and refuse fake participation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Một cuộc hẹn ở ngay gần bạn." }),
  ).toBeVisible();
  await expect(
    page.getByText("Địa điểm và hoạt động là minh họa", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Tìm hoạt động hoặc địa điểm" })
    .fill("cau long");
  await expect(
    page.getByRole("heading", { name: "1 hoạt động mẫu" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Thể thao.*Cầu lông tối nay/ })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tôi muốn tham gia" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Đây là hoạt động mẫu.", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Xóa tìm kiếm" }).click();
  await page.getByRole("button", { name: "Workshop", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "1 hoạt động mẫu" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Tìm hoạt động hoặc địa điểm" })
    .fill("khong-co-ket-qua");
  await expect(
    page.getByRole("heading", { name: "Chưa có cuộc hẹn phù hợp" }),
  ).toBeVisible();
});
test("mobile fits screen, supports list fallback and keyboard dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Thể thao.*Cầu lông tối nay/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Xem bản đồ", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Xem danh sách", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("share route supplies item-specific metadata and desktop artifact", async ({
  page,
}) => {
  await page.goto("/s/00000000-0000-4000-8000-000000000001");
  await expect(page).toHaveTitle(/Cầu lông tối nay, còn 2 chỗ/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
});
