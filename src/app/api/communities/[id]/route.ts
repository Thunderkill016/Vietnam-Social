import { z } from "zod";
import { databaseFailure, failure, ok, readBody } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";
import {
  communityActionSchema,
  communityDetailSchema,
  communitySchema,
} from "@/lib/community";
import { localPostSchema } from "@/lib/social";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return failure("Không tìm thấy cộng đồng.", 404);
  const db = requestSupabase(request);
  if (!db) return failure("Cộng đồng chưa có trong bản xem thử.", 404);

  const [communityResult, postsResult] = await Promise.all([
    db.rpc("get_community", { p_id: id }),
    db.rpc("get_community_posts", { p_id: id }),
  ]);
  if (communityResult.error)
    return failure("Chưa tải được cộng đồng.", 503, {
      dbError: communityResult.error,
    });
  if (!communityResult.data) return failure("Không tìm thấy cộng đồng.", 404);
  if (postsResult.error)
    return failure("Chưa tải được bài trong cộng đồng.", 503, {
      dbError: postsResult.error,
    });

  const parsedCommunity = communitySchema.safeParse(communityResult.data);
  const parsedPosts = localPostSchema.array().safeParse(postsResult.data);
  if (!parsedCommunity.success || !parsedPosts.success) {
    return failure("Dữ liệu cộng đồng chưa đúng định dạng.", 502);
  }
  const detail = communityDetailSchema.parse({
    community: parsedCommunity.data,
    posts: parsedPosts.data,
  });
  return ok(detail);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return failure("Không tìm thấy cộng đồng.", 404);
  const db = requestSupabase(request);
  if (!db) return failure("Bản xem thử không lưu thành viên.", 503);
  if (!request.headers.get("authorization"))
    return failure("Bạn cần đăng nhập.", 401);

  let body: unknown;
  try {
    body = await readBody(request);
  } catch (error) {
    return failure((error as Error).message);
  }
  const parsed = communityActionSchema.safeParse(body);
  if (!parsed.success) return failure("Thao tác cộng đồng không hợp lệ.");
  const joining = parsed.data.action === "join";
  const { data, error } = await db.rpc("set_community_membership", {
    p_id: id,
    p_join: joining,
  });
  if (error)
    return databaseFailure(error, {
      entity: "community",
      action: joining ? "join" : "leave",
    });
  return ok(data);
}
