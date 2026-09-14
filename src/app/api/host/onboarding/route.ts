import { failure, ok } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const db = requestSupabase(request);
  if (!db || !request.headers.get("authorization")) {
    return failure("Yêu cầu quyền host để hoàn tất onboarding.", 401);
  }
  try {
    const body = await request.json();
    const { data, error } = await db.rpc("complete_host_onboarding", {
      p_input: body,
    });
    if (error) return failure(error.message, 400);
    return ok({ profile: data });
  } catch {
    return failure("Dữ liệu onboarding không hợp lệ.", 400);
  }
}
