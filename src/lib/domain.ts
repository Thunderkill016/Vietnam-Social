import { z } from "zod";

export const CATEGORIES = {
  sport: { label: "Thể thao", color: "#d8f36a" },
  music: { label: "Âm nhạc", color: "#dabffb" },
  workshop: { label: "Workshop", color: "#ffcc9e" },
  community: { label: "Gặp gỡ", color: "#9be5d5" },
} as const;
export type Category = keyof typeof CATEGORIES;

/**
 * Task 002: City Domain Model.
 * Supports Ho Chi Minh City as first-class city, extensible to Hanoi, Da Nang, etc.
 * PostGIS is the geographic authority. Operational bounds define the technical coverage area.
 */
export const cityConfigSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  country_code: z.string().default("VN"),
  timezone: z.string().default("Asia/Ho_Chi_Minh"),
  default_center: z.tuple([z.number(), z.number()]),
  default_zoom: z.number().default(13),
  active: z.boolean().default(true),
  launch_state: z.enum(["pilot", "live", "inactive"]).default("live"),
  operational_bounds: z.object({
    west: z.number(),
    south: z.number(),
    east: z.number(),
    north: z.number(),
  }),
});
export type CityConfig = z.infer<typeof cityConfigSchema>;

export const HCMC_CITY: CityConfig = {
  id: "hcm",
  slug: "ho-chi-minh",
  name: "TP. Hồ Chí Minh",
  country_code: "VN",
  timezone: "Asia/Ho_Chi_Minh",
  default_center: [106.675, 10.815], // Central urban corridor of HCMC
  default_zoom: 13,
  active: true,
  launch_state: "pilot",
  // Simplified operational boundary covering HCMC mainland core, suburbs, and Can Gio
  operational_bounds: {
    west: 106.35,
    south: 10.35,
    east: 107.05,
    north: 11.2,
  },
};

export const SUPPORTED_CITIES: Record<string, CityConfig> = {
  hcm: HCMC_CITY,
};

export const DEFAULT_CITY = HCMC_CITY;
export const DEFAULT_CENTER: [number, number] = HCMC_CITY.default_center;
export const HCMC_BOUNDS = HCMC_CITY.operational_bounds;
export const PILOT = HCMC_BOUNDS; // Compatibility alias for previous callers

/** Stable local/CI fixture identities; names are deliberately not authoritative. */
export const FIXTURE_PLACE_IDS = new Set([
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
]);
export function isKnownFixturePlace(id: string): boolean {
  return FIXTURE_PLACE_IDS.has(id);
}

export const MAX_RESULTS = 100;
// A six-hour discovery window and 24-hour lifetime come from PRD sections 2/10.
export const DISCOVERY_HOURS = 6;
export const MAX_LIFETIME_HOURS = 24;
// Polling recovers missed broadcasts; server-side filtering owns validity.
export const REFRESH_MS = 15_000;
export const CONFIDENCE_LABELS = {
  unconfirmed: "Chưa xác nhận",
  likely: "Có xác nhận",
  verified: "Đã xác minh",
  questionable: "Cần kiểm tra",
} as const;

export const signalSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  category: z.enum(["sport", "music", "workshop", "community"]),
  place_id: z.uuid(),
  place_name: z.string(),
  area: z.string(),
  longitude: z.number(),
  latitude: z.number(),
  starts_at: z.iso.datetime({ offset: true }),
  expires_at: z.iso.datetime({ offset: true }),
  source_label: z.string(),
  confidence: z.enum(["unconfirmed", "likely", "verified", "questionable"]),
  confirmation_count: z.number(),
  capacity_note: z.string(),
  h3_parent: z.string(),
  is_demo: z.boolean().optional(),
});
export type Signal = z.infer<typeof signalSchema>;

export type Place = {
  id: string;
  city_id?: string;
  name: string;
  area: string;
  longitude: number;
  latitude: number;
  h3_parent: string;
  enabled?: boolean;
  data_origin?: "real" | "fixture";
};

export type Viewer = {
  id: string;
  role: "member" | "host" | "moderator";
  display_name: string;
  organizer_label?: string;
  bio?: string;
  contact_channel?: string;
  onboarded_at?: string | null;
};

export const hostInviteSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expires_at: z.string(),
  venue_id: z.string().uuid().nullable().optional(),
  venue_name: z.string().nullable().optional(),
  venue_area: z.string().nullable().optional(),
  invited_email: z.string().email().nullable().optional(),
});
export type HostInvite = z.infer<typeof hostInviteSchema>;

export const activityTemplateSchema = z.object({
  id: z.string().uuid(),
  place_id: z.string().uuid(),
  place_name: z.string().optional(),
  area: z.string().optional(),
  title: z.string().min(1).max(100),
  description: z.string().max(600).default(""),
  category: z.enum(["sport", "music", "workshop", "community"]),
  duration_minutes: z.number().default(120),
  capacity_note: z.string().max(100).default(""),
  created_at: z.string(),
});
export type ActivityTemplate = z.infer<typeof activityTemplateSchema>;

export const venueSuggestionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  area: z.string().min(1).max(100),
  address: z.string().min(1).max(200),
  longitude: z.number(),
  latitude: z.number(),
  status: z.enum(["pending", "approved", "rejected"]),
  rejection_reason: z.string().optional(),
});
export type VenueSuggestion = z.infer<typeof venueSuggestionSchema>;

export type EvidenceGateTarget = {
  actual: number;
  target: number;
  status: "NOT STARTED" | "IN PROGRESS" | "PASS";
};

export type OpsDashboardMetrics = {
  hosts: {
    invited: number;
    accepted: number;
    onboarded: number;
    published_at_least_one: number;
    published_again: number;
  };
  venues: {
    approved: number;
    fixture?: number;
    disabled: number;
    pending_review: number;
    host_linked: number;
  };
  supply: {
    signals_created_7d: number;
    signals_active_now: number;
    by_category: Record<string, number>;
    by_venue: Array<{ place_name: string; signal_count: number }>;
    by_host: Array<{ display_name: string; signal_count: number }>;
    by_day: Array<{ day: string; count: number }>;
    zero_qualified_opens: Array<{
      id: string;
      title: string;
      starts_at: string;
    }>;
  };
  demand: {
    users_exposed: number;
    confirmed_real_world_actions: number;
    returning_users: number;
  };
  evidence_gate: {
    definition?: "real_supply_v1";
    active_hosts?: EvidenceGateTarget;
    recurrent_hosts?: EvidenceGateTarget;
    active_venues?: EvidenceGateTarget;
    confirmed_actions?: EvidenceGateTarget;
    overall_status:
      "NOT STARTED" | "IN PROGRESS" | "PASS" | "FAIL / INSUFFICIENT EVIDENCE";
    host_target: EvidenceGateTarget;
    supply_target: EvidenceGateTarget;
    demand_target: EvidenceGateTarget;
    action_target: EvidenceGateTarget;
    return_target: EvidenceGateTarget;
  };
  moderation: {
    reports_count: number;
    not_there_count: number;
  };
};

export const boundsSchema = z
  .object({
    west: z.coerce.number().min(-180).max(180),
    south: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    city_id: z.string().optional(),
  })
  .refine(
    (b) =>
      b.east > b.west &&
      b.north > b.south &&
      b.east - b.west <= 0.25 &&
      b.north - b.south <= 0.25,
    "Vùng xem quá rộng hoặc không hợp lệ.",
  );
export type Bounds = z.infer<typeof boundsSchema>;

export const createSignalSchema = z
  .object({
    request_id: z.uuid(),
    title: z.string().trim().min(8).max(100),
    description: z.string().trim().max(600),
    category: z.enum(["sport", "music", "workshop", "community"]),
    place_id: z.uuid(),
    starts_at: z.iso.datetime({ offset: true }),
    expires_at: z.iso.datetime({ offset: true }),
    capacity_note: z.string().trim().max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    const duration = Date.parse(value.expires_at) - Date.parse(value.starts_at);
    if (duration <= 0 || duration > MAX_LIFETIME_HOURS * 3_600_000)
      ctx.addIssue({
        code: "custom",
        message: "Thời lượng phải lớn hơn 0 và không quá 24 giờ.",
        path: ["expires_at"],
      });
  });

export const actionSchema = z
  .object({
    action: z.enum([
      "join",
      "go",
      "confirm",
      "not_there",
      "report",
      "resolve",
      "remove",
    ]),
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

export function isWithinCity(
  coords: [number, number],
  city: CityConfig = HCMC_CITY,
): boolean {
  const [lng, lat] = coords;
  const { west, south, east, north } = city.operational_bounds;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

export function filterSignals(
  signals: Signal[],
  category: string,
  query: string,
) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .toLowerCase();
  const search = normalize(query.trim());
  return signals.filter(
    (s) =>
      (category === "all" || s.category === category) &&
      normalize(`${s.title} ${s.place_name} ${s.area}`).includes(search),
  );
}

export function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

export function distanceKm(from: [number, number], to: [number, number]) {
  const rad = Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = (to[1] - from[1]) * rad,
    dLng = (to[0] - from[0]) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from[1] * rad) * Math.cos(to[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
