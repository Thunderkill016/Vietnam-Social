import { failure, ok } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const db = requestSupabase(request);
  if (!db || !request.headers.get("authorization")) {
    return failure("Vui lòng đăng nhập trước khi nhận lời mời host.", 401);
  }
  try {
    const { token } = await request.json();
    if (!token) return failure("Thiếu mã lời mời.", 400);

    const { data, error } = await db.rpc("accept_host_invite", {
      p_token: token,
    });
    if (error) return failure(error.message, 400);
    return ok({ result: data });
  } catch {
    return failure("Yêu cầu không hợp lệ.", 400);
  }
}
