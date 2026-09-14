import { z } from "zod";
import { communitySchema } from "@/lib/community";
import { signalSchema } from "@/lib/domain";
import { localPostSchema } from "@/lib/social";

export const socialPlaceSchema = z.object({
  id: z.uuid(),
  city_id: z.string().min(1),
  name: z.string().min(1),
  area: z.string().trim().min(2).max(120),
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
  h3_parent: z.string(),
  follower_count: z.number().int().nonnegative(),
  area_follower_count: z.number().int().nonnegative(),
  viewer_follows: z.boolean(),
  viewer_follows_area: z.boolean(),
});
export type SocialPlace = z.infer<typeof socialPlaceSchema>;

export const placeSocialPageSchema = z.object({
  place: socialPlaceSchema,
  posts: localPostSchema.array(),
  activities: signalSchema.array(),
  communities: communitySchema.array(),
});
export type PlaceSocialPage = z.infer<typeof placeSocialPageSchema>;

export const placeFollowActionSchema = z
  .object({
    target: z.enum(["place", "area"]),
    follow: z.boolean(),
  })
  .strict();

export const localFollowPlaceSchema = z.object({
  id: z.uuid(),
  city_id: z.string().min(1),
  name: z.string().min(1),
  area: z.string().trim().min(2).max(120),
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
  follower_count: z.number().int().nonnegative(),
});

export const localFollowAreaSchema = z.object({
  city_name: z.string().min(1),
  city_id: z.string().min(1),
  area: z.string().trim().min(2).max(120),
  follower_count: z.number().int().nonnegative(),
});

export const localFollowsSchema = z.object({
  places: localFollowPlaceSchema.array(),
  areas: localFollowAreaSchema.array(),
});
export type LocalFollows = z.infer<typeof localFollowsSchema>;

export const areaQuerySchema = z
  .object({
    city_id: z.string().min(1).max(40),
    area: z.string().trim().min(2).max(120),
  })
  .strict();
export const areaSocialPageSchema = placeSocialPageSchema
  .omit({ place: true })
  .extend({
    city_id: z.string(),
    city_name: z.string(),
    area: z.string(),
    places: socialPlaceSchema.array(),
  });
export function areaHref(city_id: string, area: string) {
  return `/a?${new URLSearchParams({ city_id, area })}`;
}

// Authentication only returns to known local Place/Following routes, never an external URL.
export function localFollowReturnPath(value: string | null) {
  return value === "/following" || /^\/p\/[a-f0-9-]{36}$/i.test(value ?? "")
    ? value!
    : "/";
}
