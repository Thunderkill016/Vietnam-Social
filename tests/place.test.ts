import { describe, expect, it } from "vitest";
import {
  localFollowReturnPath,
  areaHref,
  areaQuerySchema,
  areaSocialPageSchema,
  localFollowsSchema,
  placeFollowActionSchema,
  placeSocialPageSchema,
  socialPlaceSchema,
} from "../src/lib/place";

const place = {
  id: "10000000-0000-4000-8000-000000000401",
  city_id: "hcm",
  name: "Địa điểm kiểm thử",
  area: "Quận 1",
  longitude: 106.7,
  latitude: 10.78,
  h3_parent: "8665b5647ffffff",
  follower_count: 0,
  area_follower_count: 0,
  viewer_follows: false,
  viewer_follows_area: false,
};
describe("Place and area contracts", () => {
  it("accepts public venue coordinates and honest empty social context", () => {
    expect(socialPlaceSchema.safeParse(place).success).toBe(true);
    expect(
      placeSocialPageSchema.safeParse({
        place,
        posts: [],
        activities: [],
        communities: [],
      }).success,
    ).toBe(true);
    expect(
      placeSocialPageSchema.safeParse({
        place,
        posts: [null],
        activities: [],
        communities: [],
      }).success,
    ).toBe(false);
    expect(
      socialPlaceSchema.safeParse({ ...place, follower_count: -1 }).success,
    ).toBe(false);
    expect(
      socialPlaceSchema.safeParse({ ...place, latitude: 91 }).success,
    ).toBe(false);
  });
  it.each(["place", "area"])(
    "requires explicit boolean intent for %s",
    (target) => {
      for (const follow of [true, false])
        expect(
          placeFollowActionSchema.safeParse({ target, follow }).success,
        ).toBe(true);
      for (const follow of [null, "true", 1, undefined])
        expect(
          placeFollowActionSchema.safeParse({ target, follow }).success,
        ).toBe(false);
      for (const key of [
        "latitude",
        "longitude",
        "gps",
        "coordinates",
        "user_id",
        "city_id",
        "area",
        "location",
      ]) {
        expect(
          placeFollowActionSchema.safeParse({
            target,
            follow: true,
            [key]: "injected",
          }).success,
        ).toBe(false);
      }
    },
  );
  it("parses only complete local collection projections", () => {
    expect(
      localFollowsSchema.parse({
        places: [place],
        areas: [
          {
            city_id: "hcm",
            city_name: "TP. Hồ Chí Minh",
            area: "Quận 1",
            follower_count: 0,
          },
        ],
      }).areas[0],
    ).not.toHaveProperty("latitude");
    expect(
      localFollowsSchema.safeParse({ places: [], areas: [{ area: "Quận 1" }] })
        .success,
    ).toBe(false);
    expect(localFollowsSchema.parse({ places: [], areas: [] })).toEqual({
      places: [],
      areas: [],
    });
  });
  it("encodes area return links and rejects arbitrary location fields", () => {
    const url = new URL(areaHref("hcm", "Quận 1 & 2"), "https://example.com");
    expect(url.searchParams.get("area")).toBe("Quận 1 & 2");
    expect(
      areaQuerySchema.parse({ city_id: "hcm", area: " Quận 1 " }).area,
    ).toBe("Quận 1");
    expect(
      areaQuerySchema.safeParse({ city_id: "hcm", area: "Quận 1", gps: [1, 2] })
        .success,
    ).toBe(false);
    expect(
      areaSocialPageSchema.safeParse({
        city_id: "hcm",
        city_name: "TP. Hồ Chí Minh",
        area: "Quận 1",
        places: [place],
        posts: [],
        activities: [],
        communities: [],
      }).success,
    ).toBe(true);
  });
});

it("OAuth return only accepts known local social routes", () => {
  expect(localFollowReturnPath("/following")).toBe("/following");
  expect(localFollowReturnPath(`/p/${place.id}`)).toBe(`/p/${place.id}`);
  for (const value of [
    null,
    "https://example.com",
    "//example.com",
    "/\\evil",
    "/following?next=https://evil",
    "/p/not-an-id",
  ])
    expect(localFollowReturnPath(value)).toBe("/");
});
