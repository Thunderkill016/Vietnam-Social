import { z } from "zod";
import { communitySchema } from "@/lib/community";
import { signalSchema } from "@/lib/domain";
import { localPostSchema } from "@/lib/social";

export const SOCIAL_MAP_FILTERS = [
  "all",
  "local_post",
  "community",
  "activity",
  "place",
] as const;
export type SocialMapFilter = (typeof SOCIAL_MAP_FILTERS)[number];

export const socialMapEntitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["local_post", "community", "activity", "place"]),
  title: z.string(),
  subtitle: z.string(),
  area: z.string(),
  longitude: z.number(),
  latitude: z.number(),
  href: z.string(),
  freshness: z.string().nullable(),
  trust_state: z.string().nullable(),
});
export type SocialMapEntity = z.infer<typeof socialMapEntitySchema>;

export const socialMapPlaceSchema = z.object({
  id: z.uuid(),
  city_id: z.string(),
  name: z.string(),
  area: z.string(),
  longitude: z.number(),
  latitude: z.number(),
  h3_parent: z.string(),
  data_origin: z.enum(["real", "fixture"]).optional().default("real"),
});
export type SocialMapPlace = z.infer<typeof socialMapPlaceSchema>;

export const unifiedSocialMapResponseSchema = z.object({
  mode: z.enum(["demo", "live"]),
  posts: localPostSchema.array(),
  communities: communitySchema.array(),
  activities: signalSchema.array(),
  places: socialMapPlaceSchema.array(),
  entities: socialMapEntitySchema.array(),
  counts: z.object({
    local_post: z.number(),
    community: z.number(),
    activity: z.number(),
    place: z.number(),
  }),
});
export type UnifiedSocialMapResponse = z.infer<
  typeof unifiedSocialMapResponseSchema
>;
