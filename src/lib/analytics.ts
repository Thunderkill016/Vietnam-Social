import { z } from "zod";

/**
 * Task 002: Analytics Foundation.
 *
 * Epistemic & Privacy Invariant:
 * - NEVER send raw GPS coordinates (latitude, longitude, exact device location) to analytics.
 * - Coarse spatial context (city_id, coarse H3 resolution 6 parent, or public area label) is allowed.
 * - All product events are strictly typed.
 * - Adapter architecture is pluggable and replaceable.
 */

// Schema forbidding any coordinates
const rawCoordinateKeys = [
  "latitude",
  "longitude",
  "lat",
  "lng",
  "coords",
  "location",
] as const;

export const analyticsEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("map_opened"),
    city_id: z.string(),
    zoom: z.number().optional(),
    timestamp: z.number().default(() => Date.now()),
  }),
  z.object({
    type: z.literal("area_selected"),
    city_id: z.string(),
    area_name: z.string().optional(),
    coarse_h3: z.string().optional(),
    timestamp: z.number().default(() => Date.now()),
  }),
  z.object({
    type: z.literal("signal_impression"),
    signal_id: z.string(),
    city_id: z.string(),
    category: z.string(),
    timestamp: z.number().default(() => Date.now()),
  }),
  z.object({
    type: z.literal("signal_opened"),
    signal_id: z.string(),
    city_id: z.string(),
    category: z.string(),
    timestamp: z.number().default(() => Date.now()),
  }),
  z.object({
    type: z.literal("join_clicked"),
    signal_id: z.string(),
    city_id: z.string(),
    timestamp: z.number().default(() => Date.now()),
  }),
  z.object({
    type: z.literal("go_clicked"),
    signal_id: z.string(),
    city_id: z.string(),
    timestamp: z.number().default(() => Date.now()),
  }),
  z.object({
    type: z.literal("share_clicked"),
    signal_id: z.string(),
    city_id: z.string(),
    timestamp: z.number().default(() => Date.now()),
  }),
  z.object({
    type: z.literal("confirmation_submitted"),
    signal_id: z.string(),
    city_id: z.string(),
    timestamp: z.number().default(() => Date.now()),
  }),
  z.object({
    type: z.literal("not_there_submitted"),
    signal_id: z.string(),
    city_id: z.string(),
    timestamp: z.number().default(() => Date.now()),
  }),
  z.object({
    type: z.literal("signal_created"),
    signal_id: z.string(),
    city_id: z.string(),
    category: z.string(),
    timestamp: z.number().default(() => Date.now()),
  }),
  z.object({
    type: z.literal("signal_expired"),
    signal_id: z.string(),
    city_id: z.string(),
    timestamp: z.number().default(() => Date.now()),
  }),
  z.object({
    type: z.literal("report_submitted"),
    signal_id: z.string(),
    city_id: z.string(),
    reason_code: z.string().optional(),
    timestamp: z.number().default(() => Date.now()),
  }),
]);

export type AnalyticsEvent = z.output<typeof analyticsEventSchema>;
export type AnalyticsEventInput = z.input<typeof analyticsEventSchema>;
export type AnalyticsEventType = AnalyticsEvent["type"];

export interface AnalyticsAdapter {
  track(event: AnalyticsEvent): void;
}

/**
 * Memory analytics adapter for inspection in tests and development.
 */
export class MemoryAnalyticsAdapter implements AnalyticsAdapter {
  public events: AnalyticsEvent[] = [];

  track(event: AnalyticsEvent): void {
    assertNoRawCoordinates(event);
    this.events.push(event);
  }

  clear(): void {
    this.events = [];
  }
}

/**
 * Console analytics adapter for development environments.
 */
export class ConsoleAnalyticsAdapter implements AnalyticsAdapter {
  track(event: AnalyticsEvent): void {
    assertNoRawCoordinates(event);
    if (process.env.NODE_ENV === "development") {
      // Safe development logging of product events
      console.log(`[Analytics] ${event.type}:`, event);
    }
  }
}

/**
 * No-op analytics adapter for silent fallback when no external adapter is configured.
 */
export class NoopAnalyticsAdapter implements AnalyticsAdapter {
  track(event: AnalyticsEvent): void {
    assertNoRawCoordinates(event);
  }
}

function assertNoRawCoordinates(event: unknown): void {
  if (typeof event !== "object" || event === null) return;
  for (const key of Object.keys(event)) {
    if (rawCoordinateKeys.includes(key as (typeof rawCoordinateKeys)[number])) {
      throw new Error(
        `Privacy invariant violated: raw coordinate key '${key}' cannot be sent to analytics.`,
      );
    }
  }
}

let activeAdapter: AnalyticsAdapter = new ConsoleAnalyticsAdapter();

export function setAnalyticsAdapter(adapter: AnalyticsAdapter): void {
  activeAdapter = adapter;
}

export function getAnalyticsAdapter(): AnalyticsAdapter {
  return activeAdapter;
}

export function trackEvent(eventInput: AnalyticsEventInput): void {
  const parsed = analyticsEventSchema.safeParse(eventInput);
  if (!parsed.success) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Analytics] Invalid event payload:", parsed.error.issues);
    }
    return;
  }
  activeAdapter.track(parsed.data);
}
