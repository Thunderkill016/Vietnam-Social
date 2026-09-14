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

const baseEventFields = {
  session_id: z.string().optional(),
  is_qualified: z.boolean().optional(),
  is_demo: z.boolean().optional(),
  is_test: z.boolean().optional(),
  timestamp: z.number().default(() => Date.now()),
};

export const analyticsEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("map_opened"),
    city_id: z.string(),
    zoom: z.number().optional(),
    ...baseEventFields,
  }),
  z.object({
    type: z.literal("area_selected"),
    city_id: z.string(),
    area_name: z.string().optional(),
    coarse_h3: z.string().optional(),
    ...baseEventFields,
  }),
  z.object({
    type: z.literal("signal_impression"),
    signal_id: z.string(),
    city_id: z.string(),
    category: z.string(),
    ...baseEventFields,
  }),
  z.object({
    type: z.literal("signal_opened"),
    signal_id: z.string(),
    city_id: z.string(),
    category: z.string(),
    duration_ms: z.number().optional(),
    ...baseEventFields,
  }),
  z.object({
    type: z.literal("join_clicked"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
  }),
  z.object({
    type: z.literal("go_clicked"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
  }),
  z.object({
    type: z.literal("share_clicked"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
  }),
  z.object({
    type: z.literal("confirmation_submitted"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
  }),
  z.object({
    type: z.literal("not_there_submitted"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
  }),
  z.object({
    type: z.literal("signal_created"),
    signal_id: z.string(),
    city_id: z.string(),
    category: z.string(),
    from_template: z.boolean().optional(),
    ...baseEventFields,
  }),
  z.object({
    type: z.literal("signal_expired"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
  }),
  z.object({
    type: z.literal("report_submitted"),
    signal_id: z.string(),
    city_id: z.string(),
    reason_code: z.string().optional(),
    ...baseEventFields,
  }),
]);

/**
 * Deterministic Qualified Open Definition:
 * A signal detail view is qualified when:
 * 1. The modal is intentionally opened (not a map pan or hover).
 * 2. AND either:
 *    a) The detail view remains open for >= 2,000ms without being dismissed.
 *    OR
 *    b) The user performs an explicit interaction (join, go, share, or expand venue).
 */
export const QUALIFIED_OPEN_THRESHOLD_MS = 2000;

export function isQualifiedOpen(
  durationMs: number,
  hadExplicitInteraction: boolean = false,
): boolean {
  return hadExplicitInteraction || durationMs >= QUALIFIED_OPEN_THRESHOLD_MS;
}

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

function getClientSessionId(): string | undefined {
  if (typeof window === "undefined" || !window.sessionStorage) return undefined;
  try {
    let sid = window.sessionStorage.getItem("vs_session_id");
    if (!sid) {
      sid =
        "sess_" +
        Math.random().toString(36).substring(2, 11) +
        "_" +
        Date.now().toString(36);
      window.sessionStorage.setItem("vs_session_id", sid);
    }
    return sid;
  } catch {
    return undefined;
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
  const payload = {
    ...eventInput,
    session_id: eventInput.session_id ?? getClientSessionId(),
  };
  const parsed = analyticsEventSchema.safeParse(payload);
  if (!parsed.success) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Analytics] Invalid event payload:", parsed.error.issues);
    }
    return;
  }
  activeAdapter.track(parsed.data);

  if (typeof window !== "undefined" && typeof fetch === "function") {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    }).catch(() => {
      // silently ignore telemetry send errors
    });
  }
}
