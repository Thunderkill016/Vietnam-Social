import { failure, ok } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";
export async function GET(request: Request) {
  const db = requestSupabase(request);
  if (!db || !request.headers.get("authorization")) return ok({ viewer: null });
  const { data, error } = await db.rpc("viewer_profile");
  if (error)
    return failure("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.", 401);
  return ok({ viewer: data });
}
