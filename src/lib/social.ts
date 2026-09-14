import { z } from "zod";

export const LOCAL_POST_TYPES = {
  question: "Hỏi quanh đây",
  update: "Cập nhật",
  recommendation: "Gợi ý",
} as const;

export type LocalPostType = keyof typeof LOCAL_POST_TYPES;

const localAuthorSchema = z.object({
  id: z.uuid(),
  display_name: z.string(),
  role: z.enum(["member", "host", "moderator"]),
  organizer_label: z.string().optional().default(""),
  bio: z.string().optional().default(""),
});

export const localPostSchema = z.object({
  id: z.uuid(),
  post_type: z.enum(["question", "update", "recommendation"]),
  body: z.string(),
  place_id: z.uuid().nullable(),
  place_name: z.string(),
  area: z.string(),
  longitude: z.number(),
  latitude: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  author: localAuthorSchema,
  reaction_count: z.number(),
  comment_count: z.number(),
  viewer_reacted: z.boolean(),
  viewer_reported: z.boolean(),
  viewer_is_author: z.boolean(),
});
export type LocalPost = z.infer<typeof localPostSchema>;

export const localCommentSchema = z.object({
  id: z.uuid(),
  post_id: z.uuid(),
  body: z.string(),
  created_at: z.string(),
  author: localAuthorSchema.pick({
    id: true,
    display_name: true,
    role: true,
    organizer_label: true,
  }),
});
export type LocalComment = z.infer<typeof localCommentSchema>;

export const createLocalPostSchema = z
  .object({
    request_id: z.uuid(),
    post_type: z.enum(["question", "update", "recommendation"]),
    body: z.string().trim().min(8).max(800),
    place_id: z.uuid().optional(),
    area: z.string().trim().min(2).max(120).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const targets =
      Number(Boolean(value.place_id)) + Number(Boolean(value.area));
    if (targets !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Chọn một địa điểm công cộng hoặc một khu vực.",
        path: ["place_id"],
      });
    }
  });

export const localPostActionSchema = z
  .object({
    action: z.enum(["react", "comment", "report"]),
    body: z.string().trim().max(500).optional(),
    reason: z.string().trim().max(300).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action === "comment" && (!value.body || value.body.length < 1)) {
      ctx.addIssue({
        code: "custom",
        message: "Bình luận không được để trống.",
        path: ["body"],
      });
    }
  });

export const publicProfileSchema = z.object({
  id: z.uuid(),
  display_name: z.string(),
  role: z.enum(["member", "host", "moderator"]),
  organizer_label: z.string(),
  bio: z.string(),
  follower_count: z.number(),
  following_count: z.number(),
  viewer_follows: z.boolean(),
  is_self: z.boolean(),
  contributions: localPostSchema.array(),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

export function localPostAge(iso: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(iso)) / 60_000),
  );
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}
