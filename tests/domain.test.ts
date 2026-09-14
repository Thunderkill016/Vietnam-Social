import { describe, expect, it } from "vitest";
import {
  boundsSchema,
  cityConfigSchema,
  createSignalSchema,
  distanceKm,
  filterSignals,
  HCMC_CITY,
  isWithinCity,
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

describe("city domain model & HCMC configuration", () => {
  it("validates canonical HCMC configuration", () => {
    expect(cityConfigSchema.safeParse(HCMC_CITY).success).toBe(true);
    expect(HCMC_CITY.id).toBe("hcm");
    expect(HCMC_CITY.slug).toBe("ho-chi-minh");
    expect(HCMC_CITY.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(HCMC_CITY.country_code).toBe("VN");
    expect(HCMC_CITY.active).toBe(true);
    expect(HCMC_CITY.launch_state).toBe("pilot");
  });

  it("checks coordinates against HCMC operational boundaries", () => {
    // Inside HCMC (Ben Thanh Q1, Go Vap, Can Gio)
    expect(isWithinCity([106.695, 10.776], HCMC_CITY)).toBe(true);
    expect(isWithinCity([106.675, 10.833], HCMC_CITY)).toBe(true);
    expect(isWithinCity([106.95, 10.45], HCMC_CITY)).toBe(true);

    // Outside HCMC (Hanoi, Da Nang, Singapore)
    expect(isWithinCity([105.85, 21.03], HCMC_CITY)).toBe(false);
    expect(isWithinCity([108.22, 16.07], HCMC_CITY)).toBe(false);
    expect(isWithinCity([103.85, 1.29], HCMC_CITY)).toBe(false);
  });

  it("accepts city_id in viewport bounds", () => {
    const valid = boundsSchema.safeParse({
      west: 106.66,
      south: 10.75,
      east: 106.72,
      north: 10.8,
      city_id: "hcm",
    });
    expect(valid.success).toBe(true);
  });
});

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
  it("uses explicit read-only demo without credentials", () => {
    const config = readPublicConfig({});
    expect(config.mode).toBe("demo");
    expect(config.env).toBe("demo");
  });

  it("fails on partial configuration instead of silently becoming demo", () =>
    expect(() =>
      readPublicConfig({ url: "https://example.supabase.co" }),
    ).toThrow("không đầy đủ"));

  it("rejects service-role and secret keys", () => {
    const jwt = `eyJ.${btoa(JSON.stringify({ role: "service_role" }))}.signature`;
    expect(() =>
      readPublicConfig({ url: "https://example.supabase.co", key: jwt }),
    ).toThrow("secret/service-role");
    expect(() =>
      readPublicConfig({
        url: "https://example.supabase.co",
        key: "sb_secret_no",
      }),
    ).toThrow("secret key");
  });

  it("allows local anon JWT", () => {
    const jwt = `eyJ.${btoa(JSON.stringify({ role: "anon" }))}.signature`;
    const config = readPublicConfig({
      url: "http://127.0.0.1:54321",
      key: jwt,
    });
    expect(config.mode).toBe("live");
    expect(config.env).toBe("local");
  });

  it("rejects insecure remote endpoints", () =>
    expect(() =>
      readPublicConfig({
        url: "http://example.com",
        key: "sb_publishable_test",
      }),
    ).toThrow("HTTPS hoặc địa chỉ local"));

  it("enforces HTTPS and non-localhost in production mode", () => {
    const anonJwt = `eyJ.${btoa(JSON.stringify({ role: "anon" }))}.signature`;
    expect(() =>
      readPublicConfig({
        url: "http://127.0.0.1:54321",
        key: anonJwt,
        appEnv: "production",
      }),
    ).toThrow("không được trỏ về địa chỉ localhost");

    const validProd = readPublicConfig({
      url: "https://project-id.supabase.co",
      key: anonJwt,
      appEnv: "production",
    });
    expect(validProd.mode).toBe("live");
    expect(validProd.env).toBe("production");
  });
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

describe("supply pilot domain contracts", () => {
  it("validates host invite schema", async () => {
    const { hostInviteSchema } = await import("../src/lib/domain");
    const valid = {
      id: "a0000000-0000-4000-8000-000000000001",
      status: "pending",
      expires_at: "2026-09-20T10:00:00+07:00",
      venue_id: "10000000-0000-4000-8000-000000000001",
      invited_email: "host@example.com",
    };
    expect(hostInviteSchema.safeParse(valid).success).toBe(true);
    expect(
      hostInviteSchema.safeParse({ ...valid, status: "unknown" }).success,
    ).toBe(false);
    expect(
      hostInviteSchema.safeParse({ ...valid, invited_email: "not-an-email" })
        .success,
    ).toBe(false);
  });

  it("validates activity template schema", async () => {
    const { activityTemplateSchema } = await import("../src/lib/domain");
    const valid = {
      id: "b0000000-0000-4000-8000-000000000001",
      place_id: "10000000-0000-4000-8000-000000000001",
      title: "Giao lưu cầu lông tối thứ 5",
      description: "Sân số 3, mang vợt cá nhân",
      category: "sport",
      duration_minutes: 120,
      capacity_note: "Còn 4 chỗ",
      created_at: "2026-09-14T10:00:00+07:00",
    };
    expect(activityTemplateSchema.safeParse(valid).success).toBe(true);
    expect(
      activityTemplateSchema.safeParse({ ...valid, category: "dining" })
        .success,
    ).toBe(false);
    expect(
      activityTemplateSchema.safeParse({ ...valid, place_id: "bad-uuid" })
        .success,
    ).toBe(false);
  });

  it("validates venue suggestion schema", async () => {
    const { venueSuggestionSchema } = await import("../src/lib/domain");
    const valid = {
      id: "c0000000-0000-4000-8000-000000000001",
      name: "Sân Cầu Lông Hồ Đắc Di",
      area: "Tân Phú",
      address: "123 Hồ Đắc Di, Tây Thạnh, Tân Phú",
      longitude: 106.63,
      latitude: 10.81,
      status: "pending",
    };
    expect(venueSuggestionSchema.safeParse(valid).success).toBe(true);
    expect(
      venueSuggestionSchema.safeParse({ ...valid, status: "rejected" }).success,
    ).toBe(true);
    expect(
      venueSuggestionSchema.safeParse({ ...valid, status: "invalid" }).success,
    ).toBe(false);
  });
});
