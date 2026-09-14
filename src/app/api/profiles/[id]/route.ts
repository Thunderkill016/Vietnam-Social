import { z } from "zod";
import { databaseFailure, failure, ok, readBody } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";
import { publicProfileSchema } from "@/lib/social";

const followSchema = z.object({ follow: z.boolean() }).strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return failure("Không tìm thấy hồ sơ.", 404);
  const db = requestSupabase(request);
  if (!db) return failure("Hồ sơ xã hội chưa có trong bản xem thử.", 404);
  const { data, error } = await db.rpc("get_public_profile", { p_user_id: id });
  if (error) return failure("Chưa tải được hồ sơ.", 503, { dbError: error });
  if (!data) return failure("Không tìm thấy hồ sơ.", 404);
  const parsed = publicProfileSchema.safeParse(data);
  if (!parsed.success)
    return failure("Dữ liệu hồ sơ chưa đúng định dạng.", 502, {
      parseErrors: parsed.error.issues,
    });
  return ok({ profile: parsed.data });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return failure("Không tìm thấy hồ sơ.", 404);
  const db = requestSupabase(request);
  if (!db) return failure("Bản xem thử không lưu lượt theo dõi.", 503);
  if (!request.headers.get("authorization"))
    return failure("Bạn cần đăng nhập.", 401);
  let body: unknown;
  try {
    body = await readBody(request);
  } catch (error) {
    return failure((error as Error).message);
  }
  const parsed = followSchema.safeParse(body);
  if (!parsed.success) return failure("Thao tác theo dõi không hợp lệ.");
  const { data, error } = await db.rpc("set_follow", {
    p_user_id: id,
    p_follow: parsed.data.follow,
  });
  if (error)
    return databaseFailure(error, {
      entity: "profile",
      action: parsed.data.follow ? "follow" : "unfollow",
    });
  return ok(data);
}
