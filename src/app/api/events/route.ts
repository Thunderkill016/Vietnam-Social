import { failure, ok } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";
import {
  analyticsEventSchema,
  isClientObservationEvent,
} from "@/lib/analytics";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = analyticsEventSchema.safeParse(body);
    if (!parsed.success || !isClientObservationEvent(parsed.data)) {
      return failure("Dữ liệu sự kiện không hợp lệ.", 400);
    }

    const db = requestSupabase(request);
    if (!db) {
      return failure("Hệ thống ghi nhận sự kiện chưa sẵn sàng.", 503);
    }

    const { error } = await db.rpc("record_client_event", {
      p_event: parsed.data,
    });
    if (error) {
      return failure("Không thể ghi nhận sự kiện.", 503, {
        dbErrorCode: error.code,
        dbErrorMessage: error.message,
      });
    }

    return ok({ recorded: true });
  } catch {
    return failure("Không thể ghi nhận sự kiện.", 400);
  }
}
