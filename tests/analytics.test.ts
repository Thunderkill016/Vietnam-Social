import { beforeEach, describe, expect, it } from "vitest";
import {
  analyticsEventSchema,
  MemoryAnalyticsAdapter,
  setAnalyticsAdapter,
  trackEvent,
  type AnalyticsEvent,
} from "../src/lib/analytics";

describe("analytics foundation & privacy invariants", () => {
  let memoryAdapter: MemoryAnalyticsAdapter;

  beforeEach(() => {
    memoryAdapter = new MemoryAnalyticsAdapter();
    setAnalyticsAdapter(memoryAdapter);
  });

  it("validates all required event types", () => {
    const validEvents: AnalyticsEvent[] = [
      { type: "map_opened", city_id: "hcm", zoom: 13, timestamp: Date.now() },
      {
        type: "area_selected",
        city_id: "hcm",
        area_name: "Quận 1",
        timestamp: Date.now(),
      },
      {
        type: "signal_impression",
        signal_id: "s1",
        city_id: "hcm",
        category: "sport",
        timestamp: Date.now(),
      },
      {
        type: "signal_opened",
        signal_id: "s1",
        city_id: "hcm",
        category: "sport",
        timestamp: Date.now(),
      },
      {
        type: "join_clicked",
        signal_id: "s1",
        city_id: "hcm",
        timestamp: Date.now(),
      },
      {
        type: "go_clicked",
        signal_id: "s1",
        city_id: "hcm",
        timestamp: Date.now(),
      },
      {
        type: "share_clicked",
        signal_id: "s1",
        city_id: "hcm",
        timestamp: Date.now(),
      },
      {
        type: "confirmation_submitted",
        signal_id: "s1",
        city_id: "hcm",
        timestamp: Date.now(),
      },
      {
        type: "not_there_submitted",
        signal_id: "s1",
        city_id: "hcm",
        timestamp: Date.now(),
      },
      {
        type: "signal_created",
        signal_id: "s1",
        city_id: "hcm",
        category: "music",
        timestamp: Date.now(),
      },
      {
        type: "signal_expired",
        signal_id: "s1",
        city_id: "hcm",
        timestamp: Date.now(),
      },
      {
        type: "report_submitted",
        signal_id: "s1",
        city_id: "hcm",
        reason_code: "spam",
        timestamp: Date.now(),
      },
    ];

    for (const event of validEvents) {
      expect(analyticsEventSchema.safeParse(event).success).toBe(true);
      trackEvent(event);
    }
    expect(memoryAdapter.events).toHaveLength(validEvents.length);
  });

  it("strictly forbids raw GPS coordinates (latitude, longitude, lat, lng)", () => {
    expect(() => {
      memoryAdapter.track({
        type: "signal_opened",
        signal_id: "s1",
        city_id: "hcm",
        category: "sport",
        // @ts-expect-error - testing coordinate leakage rejection
        latitude: 10.776,
      });
    }).toThrow("raw coordinate key 'latitude' cannot be sent to analytics");

    expect(() => {
      memoryAdapter.track({
        type: "map_opened",
        city_id: "hcm",
        // @ts-expect-error - testing coordinate leakage rejection
        lng: 106.695,
      });
    }).toThrow("raw coordinate key 'lng' cannot be sent to analytics");
  });

  it("allows coarse spatial context such as city_id, coarse_h3, area_name", () => {
    trackEvent({
      type: "area_selected",
      city_id: "hcm",
      area_name: "Bến Thành",
      coarse_h3: "8665b5647ffffff",
    });

    expect(memoryAdapter.events).toHaveLength(1);
    expect(memoryAdapter.events[0]).toMatchObject({
      type: "area_selected",
      city_id: "hcm",
      area_name: "Bến Thành",
      coarse_h3: "8665b5647ffffff",
    });
  });

  it("determines qualified open deterministically (>=2000ms or explicit action)", async () => {
    const { isQualifiedOpen, QUALIFIED_OPEN_THRESHOLD_MS } =
      await import("../src/lib/analytics");
    expect(QUALIFIED_OPEN_THRESHOLD_MS).toBe(2000);
    expect(isQualifiedOpen(500, false)).toBe(false);
    expect(isQualifiedOpen(1999, false)).toBe(false);
    expect(isQualifiedOpen(2000, false)).toBe(true);
    expect(isQualifiedOpen(5000, false)).toBe(true);
    expect(isQualifiedOpen(200, true)).toBe(true);
    expect(isQualifiedOpen(0, true)).toBe(true);
  });

  it("supports supply pilot event properties (session_id, is_qualified, from_template)", () => {
    trackEvent({
      type: "signal_opened",
      signal_id: "sig-pilot-1",
      city_id: "hcm",
      category: "sport",
      session_id: "sess_custom_123",
      is_qualified: true,
      duration_ms: 2500,
    });

    trackEvent({
      type: "signal_created",
      signal_id: "sig-pilot-2",
      city_id: "hcm",
      category: "workshop",
      from_template: true,
      is_qualified: true,
    });

    expect(memoryAdapter.events).toHaveLength(2);
    expect(memoryAdapter.events[0]).toMatchObject({
      type: "signal_opened",
      session_id: "sess_custom_123",
      is_qualified: true,
      duration_ms: 2500,
    });
    expect(memoryAdapter.events[1]).toMatchObject({
      type: "signal_created",
      from_template: true,
      is_qualified: true,
    });
  });
});
