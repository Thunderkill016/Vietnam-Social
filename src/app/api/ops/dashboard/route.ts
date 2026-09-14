import { failure, ok } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!request.headers.get("authorization")) {
    return failure("Yêu cầu quyền vận hành/moderator.", 401);
  }
  const db = requestSupabase(request);
  if (!db) {
    return failure("Cơ sở dữ liệu chưa sẵn sàng.", 503);
  }

  const { data, error } = await db.rpc("supply_dashboard_metrics");
  if (error) return failure(error.message, 403);

  return ok({ metrics: data, is_demo: false });
}
