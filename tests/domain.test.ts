import { describe, expect, it } from "vitest";
import {
  boundsSchema,
  createSignalSchema,
  distanceKm,
  filterSignals,
  signalSchema,
} from "../src/lib/domain";
import { demoSignals } from "../src/lib/demo";
import { readPublicConfig } from "../src/lib/env";
import { readBody } from "../src/lib/api";
const input = {
  request_id: "a0000000-0000-4000-8000-000000000001",
  title: "Cầu lông tối nay",
  description: "",
  category: "sport",
  place_id: "10000000-0000-4000-8000-000000000001",
  starts_at: "2026-09-14T18:00:00+07:00",
  expires_at: "2026-09-14T20:00:00+07:00",
  capacity_note: "Còn 2 chỗ",
};
describe("activity boundary", () => {
  it("accepts bounded venue-only activity", () =>
    expect(createSignalSchema.safeParse(input).success).toBe(true));
  it.each([
    { expires_at: input.starts_at },
    { expires_at: "2026-09-16T18:00:00+07:00" },
    { title: "    " },
    { category: "FOOD" },
    { latitude: 10.8 },
    { author_id: "attacker" },
    { confidence: "verified" },
    { starts_at: "not-a-date" },
    { place_id: "not-a-uuid" },
    { description: "x".repeat(601) },
  ])("rejects invalid or client-authoritative input %j", (patch) =>
    expect(createSignalSchema.safeParse({ ...input, ...patch }).success).toBe(
      false,
    ),
  );
  it.each([
    { west: 106, east: 110, south: 10, north: 11 },
    { west: 107, east: 106, south: 10, north: 10.1 },
    { west: NaN, east: 106.1, south: 10, north: 10.1 },
    { west: 200, east: 200.1, south: 10, north: 10.1 },
  ])("rejects unbounded viewport %j", (bounds) =>
    expect(boundsSchema.safeParse(bounds).success).toBe(false),
  );
  it("searches Vietnamese accents without requiring exact diacritics", () =>
    expect(filterSignals(demoSignals(), "all", "cau long")).toHaveLength(1));
  it("combines search and category", () =>
    expect(filterSignals(demoSignals(), "music", "cau long")).toHaveLength(0));
  it("does not fabricate endorsements in demo fixtures", () => {
    for (const signal of demoSignals()) {
      expect(signalSchema.safeParse(signal).success).toBe(true);
      expect(signal.is_demo).toBe(true);
      expect(signal.confirmation_count).toBe(0);
      expect(signal.confidence).toBe("unconfirmed");
    }
  });
  it("distance is symmetric and zero at same point", () => {
    expect(distanceKm([106, 10], [106, 10])).toBe(0);
    expect(distanceKm([106, 10], [107, 11])).toBeCloseTo(
      distanceKm([107, 11], [106, 10]),
    );
  });
});
describe("environment", () => {
  it("uses explicit read-only demo without credentials", () =>
    expect(readPublicConfig({}).mode).toBe("demo"));
  it("fails on partial configuration instead of silently becoming demo", () =>
    expect(() =>
      readPublicConfig({ url: "https://example.supabase.co" }),
    ).toThrow());
  it("rejects service-role and secret keys", () => {
    const jwt = `eyJ.${btoa(JSON.stringify({ role: "service_role" }))}.signature`;
    expect(() =>
      readPublicConfig({ url: "https://example.supabase.co", key: jwt }),
    ).toThrow();
    expect(() =>
      readPublicConfig({
        url: "https://example.supabase.co",
        key: "sb_secret_no",
      }),
    ).toThrow();
  });
  it("allows local anon JWT", () => {
    const jwt = `eyJ.${btoa(JSON.stringify({ role: "anon" }))}.signature`;
    expect(
      readPublicConfig({ url: "http://127.0.0.1:54321", key: jwt }).mode,
    ).toBe("live");
  });
  it("rejects insecure remote endpoints", () =>
    expect(() =>
      readPublicConfig({
        url: "http://example.com",
        key: "sb_publishable_test",
      }),
    ).toThrow());
});
describe("request bounds", () => {
  it("rejects malformed JSON", async () => {
    await expect(
      readBody(
        new Request("http://localhost", { method: "POST", body: "oops" }),
      ),
    ).rejects.toThrow("không hợp lệ");
  });
  it("bounds actual body bytes, not a client supplied header", async () => {
    await expect(
      readBody(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ value: "x".repeat(9000) }),
        }),
      ),
    ).rejects.toThrow("quá lớn");
  });
});
