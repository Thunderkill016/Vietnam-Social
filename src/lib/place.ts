import { z } from "zod";
import { communitySchema } from "@/lib/community";
import { signalSchema } from "@/lib/domain";
import { localPostSchema } from "@/lib/social";

export const socialPlaceSchema = z.object({
  id: z.uuid(),
  city_id: z.string(),
  name: z.string(),
  area: z.string(),
  longitude: z.number(),
  latitude: z.number(),
  h3_parent: z.string(),
  follower_count: z.number(),
  area_follower_count: z.number(),
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
  city_id: z.string(),
  name: z.string(),
  area: z.string(),
  longitude: z.number(),
  latitude: z.number(),
  follower_count: z.number(),
});

export const localFollowAreaSchema = z.object({
  city_id: z.string(),
  area: z.string(),
  follower_count: z.number(),
});

export const localFollowsSchema = z.object({
  places: localFollowPlaceSchema.array(),
  areas: localFollowAreaSchema.array(),
});
export type LocalFollows = z.infer<typeof localFollowsSchema>;
