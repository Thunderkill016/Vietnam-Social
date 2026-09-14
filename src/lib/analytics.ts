import { z } from "zod";

/**
 * Analytics is observational. Durable product facts are recorded by database mutations.
 * Privacy invariant: client telemetry never contains raw GPS coordinates.
 * Evidence classification (real/test/demo) is server-owned and therefore absent here.
 */
const subjectFields = {
  subject_type: z
    .enum(["local_post", "person", "community", "activity", "place", "area"])
    .optional(),
  subject_id: z.string().min(1).max(200).optional(),
};

const baseEventFields = {
  session_id: z.string().max(64).optional(),
  is_qualified: z.boolean().optional(),
  timestamp: z.number().default(() => Date.now()),
  ...subjectFields,
};

const strict = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

export const analyticsEventSchema = z.discriminatedUnion("type", [
  strict({
    type: z.literal("map_opened"),
    city_id: z.string(),
    ...baseEventFields,
    zoom: z.number().optional(),
  }),
  strict({
    type: z.literal("map_viewport_changed"),
    city_id: z.string(),
    ...baseEventFields,
  }),
  strict({
    type: z.literal("map_filter_changed"),
    city_id: z.string(),
    ...baseEventFields,
    filter: z.enum(["all", "local_post", "community", "activity", "place"]),
  }),
  strict({
    type: z.literal("map_entity_impression"),
    city_id: z.string(),
    ...baseEventFields,
    subject_type: z.enum(["local_post", "community", "activity", "place"]),
    subject_id: z.string().min(1).max(200),
  }),
  strict({
    type: z.literal("map_entity_opened"),
    city_id: z.string(),
    ...baseEventFields,
    subject_type: z.enum(["local_post", "community", "activity", "place"]),
    subject_id: z.string().min(1).max(200),
  }),
  strict({
    type: z.literal("area_selected"),
    city_id: z.string(),
    ...baseEventFields,
    area_name: z.string().optional(),
    coarse_h3: z.string().optional(),
  }),
  strict({
    type: z.literal("signal_impression"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
    category: z.string(),
  }),
  strict({
    type: z.literal("signal_opened"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
    category: z.string(),
    duration_ms: z.number().optional(),
  }),
  strict({
    type: z.literal("join_clicked"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
  }),
  strict({
    type: z.literal("go_clicked"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
  }),
  strict({
    type: z.literal("share_clicked"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
  }),
  strict({
    type: z.literal("confirmation_submitted"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
  }),
  strict({
    type: z.literal("not_there_submitted"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
  }),
  strict({
    type: z.literal("report_submitted"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
    reason_code: z.string().optional(),
  }),
  strict({
    type: z.literal("local_post_opened"),
    city_id: z.string(),
    ...baseEventFields,
    subject_type: z.literal("local_post"),
    subject_id: z.string().min(1).max(200),
  }),
  strict({
    type: z.literal("profile_opened"),
    city_id: z.string(),
    ...baseEventFields,
    subject_type: z.literal("person"),
    subject_id: z.string().min(1).max(200),
  }),
  strict({
    type: z.literal("community_opened"),
    city_id: z.string(),
    ...baseEventFields,
    subject_type: z.literal("community"),
    subject_id: z.string().min(1).max(200),
  }),
  strict({
    type: z.literal("place_opened"),
    city_id: z.string(),
    ...baseEventFields,
    subject_type: z.literal("place"),
    subject_id: z.string().min(1).max(200),
  }),
  strict({
    type: z.literal("area_opened"),
    city_id: z.string(),
    ...baseEventFields,
    subject_type: z.literal("area"),
    subject_id: z.string().min(1).max(200),
  }),
  // Server/development-only compatibility events. /api/events rejects these.
  strict({
    type: z.literal("signal_created"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
    category: z.string(),
    from_template: z.boolean().optional(),
  }),
  strict({
    type: z.literal("signal_expired"),
    signal_id: z.string(),
    city_id: z.string(),
    ...baseEventFields,
  }),
]);

const CLIENT_OBSERVATION_TYPES = new Set([
  "map_opened",
  "map_viewport_changed",
  "map_filter_changed",
  "map_entity_impression",
  "map_entity_opened",
  "area_selected",
  "signal_impression",
  "signal_opened",
  "join_clicked",
  "go_clicked",
  "share_clicked",
  "confirmation_submitted",
  "not_there_submitted",
  "report_submitted",
  "local_post_opened",
  "profile_opened",
  "community_opened",
  "place_opened",
  "area_opened",
]);

export function isClientObservationEvent(event: AnalyticsEvent): boolean {
  return CLIENT_OBSERVATION_TYPES.has(event.type);
}

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

export class ConsoleAnalyticsAdapter implements AnalyticsAdapter {
  track(event: AnalyticsEvent): void {
    assertNoRawCoordinates(event);
    if (process.env.NODE_ENV === "development") {
      console.log(`[Analytics] ${event.type}:`, event);
    }
  }
}

export class NoopAnalyticsAdapter implements AnalyticsAdapter {
  track(event: AnalyticsEvent): void {
    assertNoRawCoordinates(event);
  }
}

const rawCoordinateKeys = [
  "latitude",
  "longitude",
  "lat",
  "lng",
  "coords",
  "location",
] as const;

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

  assertNoRawCoordinates(parsed.data);
  activeAdapter.track(parsed.data);

  if (
    typeof window !== "undefined" &&
    typeof fetch === "function" &&
    isClientObservationEvent(parsed.data)
  ) {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    }).catch(() => {
      // Telemetry failure must never block the product interaction.
    });
  }
}
