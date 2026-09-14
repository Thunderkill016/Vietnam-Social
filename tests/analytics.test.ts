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
});
