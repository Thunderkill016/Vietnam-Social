import { z } from "zod";

export const CATEGORIES = {
  sport: { label: "Thể thao", color: "#d8f36a" },
  music: { label: "Âm nhạc", color: "#dabffb" },
  workshop: { label: "Workshop", color: "#ffcc9e" },
  community: { label: "Gặp gỡ", color: "#9be5d5" },
} as const;
export type Category = keyof typeof CATEGORIES;
export const PILOT = {
  west: 106.62,
  south: 10.785,
  east: 106.705,
  north: 10.855,
};
export const DEFAULT_CENTER: [number, number] = [106.666, 10.817];
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
  name: string;
  area: string;
  longitude: number;
  latitude: number;
  h3_parent: string;
};
export type Viewer = {
  id: string;
  role: "member" | "host" | "moderator";
  display_name: string;
};
export const boundsSchema = z
  .object({
    west: z.coerce.number().min(-180).max(180),
    south: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
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
