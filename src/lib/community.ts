import { z } from "zod";
import { localPostSchema } from "@/lib/social";

export const COMMUNITY_CATEGORIES = {
  neighborhood: "Khu vực",
  sport: "Thể thao",
  hobby: "Sở thích",
  learning: "Học tập",
  professional: "Nghề nghiệp",
  culture: "Văn hoá",
  volunteer: "Tình nguyện",
  other: "Khác",
} as const;

export type CommunityCategory = keyof typeof COMMUNITY_CATEGORIES;

const communityCreatorSchema = z.object({
  id: z.uuid(),
  display_name: z.string(),
  role: z.enum(["member", "host", "moderator"]),
  organizer_label: z.string().optional().default(""),
});

export const communitySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  category: z.enum([
    "neighborhood",
    "sport",
    "hobby",
    "learning",
    "professional",
    "culture",
    "volunteer",
    "other",
  ]),
  place_id: z.uuid().nullable(),
  place_name: z.string(),
  area: z.string(),
  longitude: z.number(),
  latitude: z.number(),
  created_at: z.string(),
  member_count: z.number(),
  viewer_is_member: z.boolean(),
  viewer_role: z.enum(["owner", "admin", "member"]).nullable(),
  creator: communityCreatorSchema,
});
export type Community = z.infer<typeof communitySchema>;

export const createCommunitySchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().max(600).default(""),
    category: communitySchema.shape.category,
    place_id: z.uuid().optional(),
    area: z.string().trim().min(2).max(120).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const targets = Number(Boolean(value.place_id)) + Number(Boolean(value.area));
    if (targets !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Chọn một địa điểm công cộng hoặc một khu vực.",
        path: ["place_id"],
      });
    }
  });

export const communityActionSchema = z
  .object({ action: z.enum(["join", "leave"]) })
  .strict();

export const communityDetailSchema = z.object({
  community: communitySchema,
  posts: localPostSchema.array(),
});
export type CommunityDetail = z.infer<typeof communityDetailSchema>;
