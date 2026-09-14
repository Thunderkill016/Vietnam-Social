import { expect, test } from "@playwright/test";

test("anonymous Following explains sign-in and preserves return navigation", async ({
  page,
}) => {
  await page.goto("/following");
  await expect(
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Đăng nhập để xem các địa điểm", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Bản đồ xã hội" }).click();
  await expect(
    page.getByRole("heading", { name: "Khám phá quanh đây" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Đang theo dõi", exact: true }),
  ).toBeVisible();
});

test("Place renders honest empty context on mobile using an isolated response fixture", async ({
  page,
}) => {
  const id = "10000000-0000-4000-8000-000000000401";
  await page.route(`**/api/places/${id}`, (route) =>
    route.fulfill({
      json: {
        place: {
          id,
          city_id: "hcm",
          name: "Địa điểm kiểm thử trên giao diện",
          area: "Khu thử nghiệm",
          longitude: 106.7,
          latitude: 10.78,
          h3_parent: "8665b5647ffffff",
          follower_count: 0,
          area_follower_count: 0,
          viewer_follows: false,
          viewer_follows_area: false,
        },
        posts: [],
        activities: [],
        communities: [],
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/p/${id}`);
  await expect(
    page.getByRole("heading", { name: "Địa điểm kiểm thử trên giao diện" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Theo dõi địa điểm", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bài địa phương", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cộng đồng tại đây", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator('a[href^="/a?"]')).toBeVisible();
  await page.screenshot({ path: "artifacts/place-mobile-fixture.png" });
});

test("invalid place and arbitrary area have safe empty states", async ({
  page,
}) => {
  await page.goto("/p/not-a-place");
  await expect(
    page.getByRole("heading", { name: "Không tìm thấy địa điểm" }),
  ).toBeVisible();
  await page.goto("/a?city_id=hcm&area=unknown&latitude=10.78");
  await expect(
    page.getByRole("heading", { name: "Không tìm thấy khu vực" }),
  ).toBeVisible();
});
