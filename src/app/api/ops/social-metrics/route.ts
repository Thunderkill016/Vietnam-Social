import { databaseFailure, failure, ok } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!request.headers.get("authorization")) {
    return failure("Bạn cần đăng nhập.", 401);
  }

  const db = requestSupabase(request);
  if (!db) return failure("Cần kết nối Supabase.", 503);

  const { data, error } = await db.rpc("social_metrics");
  if (error) return databaseFailure(error, { entity: "social_metrics" });
  return ok({ metrics: data });
}
