import { expect, test } from "@playwright/test";
test.beforeEach(async ({ request }) => {
  const bootstrap = await request
    .get("/api/bootstrap")
    .then((r) => r.json())
    .catch(() => ({ mode: "unknown" }));
  test.skip(
    bootstrap.mode !== "demo",
    "Read-only demo tests only run when server is in demo mode.",
  );
});
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
  await expect(page.getByText("TP. Hồ Chí Minh")).toBeVisible();
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
  await page
    .getByRole("button", { name: "Đăng hoạt động", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Rủ mọi người cùng tham gia." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
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

test("map worker processes data without a third-party network dependency", async ({
  page,
}) => {
  await page.route("https://tiles.openfreemap.org/**", async (route) => {
    await route.fulfill({
      json: {
        version: 8,
        sources: {
          fixture: {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: [106.675, 10.815] },
                },
              ],
            },
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#eef2e8" },
          },
          {
            id: "fixture",
            type: "circle",
            source: "fixture",
            paint: { "circle-radius": 8, "circle-color": "#19221f" },
          },
        ],
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-state",
    "ready",
    { timeout: 15_000 },
  );
  await expect(
    page.getByRole("button", {
      name: "Xem Cầu lông tối nay, còn 2 chỗ",
      exact: true,
    }),
  ).toBeAttached();
});

test("publishing form exposes unambiguous category and venue labels", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Đăng hoạt động", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Loại hoạt động", exact: true })
    .selectOption("sport");
  await page
    .getByLabel("Địa điểm công cộng", { exact: true })
    .selectOption("10000000-0000-4000-8000-000000000001");
  await expect(
    page.getByLabel("Địa điểm công cộng", { exact: true }),
  ).toHaveValue("10000000-0000-4000-8000-000000000001");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Đăng hoạt động", exact: true }),
  ).toBeDisabled();
});

test("displays honest empty state when viewport has no active signals", async ({
  page,
}) => {
  await page.goto("/?west=106.90&south=10.40&east=106.95&north=10.45");
  await expect(
    page.getByRole("heading", {
      name: "Chưa có hoạt động đang diễn ra trong khu vực này.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Về trung tâm TP. Hồ Chí Minh/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Về trung tâm TP. Hồ Chí Minh/ })
    .click();
  await expect(
    page.getByRole("button", { name: /Thể thao.*Cầu lông tối nay/ }),
  ).toBeVisible({ timeout: 10_000 });
});
