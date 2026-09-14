import { failure, ok } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";
import { analyticsEventSchema } from "@/lib/analytics";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = analyticsEventSchema.safeParse(body);
    if (!parsed.success) {
      return failure("Dữ liệu sự kiện không hợp lệ.", 400);
    }

    const db = requestSupabase(request);
    if (db) {
      await db.rpc("record_client_event", {
        p_event: parsed.data,
      });
    }

    return ok({ recorded: true });
  } catch {
    return failure("Không thể ghi nhận sự kiện.", 400);
  }
}
