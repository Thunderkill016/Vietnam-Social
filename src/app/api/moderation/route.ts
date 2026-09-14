import { databaseFailure, failure, ok } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";
export async function GET(request: Request) {
  const db = requestSupabase(request);
  if (!db || !request.headers.get("authorization"))
    return failure("Bạn cần đăng nhập.", 401);
  const { data, error } = await db.rpc("moderation_queue");
  if (error) return databaseFailure(error);
  return ok({ reports: data });
}
