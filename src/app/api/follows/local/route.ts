import { failure, ok } from "@/lib/api";
import { localFollowsSchema } from "@/lib/place";
import { requestSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const db = requestSupabase(request);
  if (!db) return failure("Theo dõi địa phương chưa có trong bản xem thử.", 404);
  if (!request.headers.get("authorization"))
    return failure("Bạn cần đăng nhập.", 401);

  const { data, error } = await db.rpc("get_my_local_follows");
  if (error)
    return failure("Chưa tải được các địa điểm đang theo dõi.", 503, {
      dbError: error,
    });

  const parsed = localFollowsSchema.safeParse(data);
  if (!parsed.success)
    return failure("Dữ liệu theo dõi địa phương chưa đúng định dạng.", 502, {
      parseErrors: parsed.error.issues,
    });

  return ok(parsed.data);
}
