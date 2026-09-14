import { failure, ok } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const db = requestSupabase(request);
  if (!db || !request.headers.get("authorization")) {
    return failure("Yêu cầu quyền vận hành/moderator.", 401);
  }
  try {
    const body = await request.json();
    const { data, error } = await db.rpc("create_host_invite", {
      p_input: body,
    });
    if (error) return failure(error.message, 400);
    return ok({ invite: data });
  } catch {
    return failure("Yêu cầu không hợp lệ.", 400);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return failure("Thiếu mã lời mời.", 400);

  const db = requestSupabase(request);
  if (!db) {
    return ok({
      invite: {
        id: "demo-invite",
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        venue_id: "10000000-0000-4000-8000-000000000001",
        venue_name: "Sân thử nghiệm Phú Nhuận",
        venue_area: "Phú Nhuận",
      },
    });
  }

  const { data, error } = await db.rpc("inspect_host_invite", {
    p_token: token,
  });
  if (error) return failure(error.message, 404);
  return ok({ invite: data });
}
